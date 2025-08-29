// services/suggestionService.js
import { getPool, sql } from '../db.js';

/**
 * Gộp các khoảng busy chồng lấp nhau thành danh sách không chồng
 */
function mergeIntervals(intervals) {
  if (!Array.isArray(intervals)) return [];
  const sorted = intervals
    .map(i => ({ start: new Date(i.start), end: new Date(i.end) }))
    .filter(i => i.start < i.end)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const cur of sorted) {
    if (merged.length === 0) {
      merged.push(cur);
    } else {
      const last = merged[merged.length - 1];
      if (cur.start <= last.end) {
        last.end = new Date(Math.max(last.end.getTime(), cur.end.getTime()));
      } else {
        merged.push(cur);
      }
    }
  }
  return merged;
}

/**
 * Làm tròn lên tới bước minutes (mặc định 15 phút)
 */
function roundUp(date, minutes = 15) {
  const ms = 1000 * 60 * minutes;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

/**
 * Gợi ý slot rảnh từ DB (tasks + events)
 * @param {string} user_uuid
 * @param {number} durationMinutes
 * @param {number} maxWindowDays
 */
export async function suggestTimeSlotFromDB(user_uuid, durationMinutes = 60, maxWindowDays = 7) {
  const pool = await getPool();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + maxWindowDays * 24 * 60 * 60 * 1000);
  const durationMs = durationMinutes * 60 * 1000;

  // Lấy tất cả events
  const eventsRes = await pool.request()
    .input('user_uuid', sql.UniqueIdentifier, user_uuid)
    .input('windowEnd', sql.DateTime2, windowEnd)
    .query(`
      SELECT start_time, end_time FROM events
      WHERE user_uuid = @user_uuid
        AND start_time < @windowEnd
        AND end_time > GETUTCDATE()
    `);

  // Lấy tất cả tasks còn pending
  const tasksRes = await pool.request()
    .input('user_uuid', sql.UniqueIdentifier, user_uuid)
    .input('windowEnd', sql.DateTime2, windowEnd)
    .query(`
      SELECT deadline, estimated_duration FROM tasks
      WHERE user_uuid = @user_uuid
        AND status = 'todo'
        AND deadline > GETUTCDATE()
        AND deadline < @windowEnd
    `);

  // Chuyển tasks thành intervals
  const taskIntervals = tasksRes.recordset.map(t => ({
    start: new Date(t.deadline.getTime() - t.estimated_duration * 60 * 1000),
    end: new Date(t.deadline.getTime())
  }));

  const allBusy = [
    ...eventsRes.recordset.map(e => ({ start: e.start_time, end: e.end_time })),
    ...taskIntervals
  ];

  const busyIntervals = mergeIntervals(allBusy);

  // Tìm các slot rảnh
  const suggestedSlots = [];
  let cursor = roundUp(now, 15);

  for (const interval of busyIntervals) {
    if (interval.start.getTime() - cursor.getTime() >= durationMs) {
      suggestedSlots.push({ start: cursor.toISOString(), end: new Date(cursor.getTime() + durationMs).toISOString() });
    }
    if (interval.end > cursor) {
      cursor = roundUp(interval.end, 15);
    }
  }

  // Cuối cùng: sau busy cuối cùng
  while (cursor.getTime() + durationMs <= windowEnd.getTime()) {
    suggestedSlots.push({ start: cursor.toISOString(), end: new Date(cursor.getTime() + durationMs).toISOString() });
    cursor = new Date(cursor.getTime() + durationMs); // step tiếp theo
  }

  return suggestedSlots.slice(0, 5); // trả tối đa 5 gợi ý
}
