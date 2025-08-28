//services/suggestionService.js

import { getPool, sql } from '../db.js';
import { getFreeBusy } from './cacheService.js';

/**
 * Gộp các khoảng busy chồng lấp nhau thành danh sách không chồng.
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
        // overlap
        last.end = new Date(Math.max(last.end.getTime(), cur.end.getTime()));
      } else {
        merged.push(cur);
      }
    }
  }
  return merged;
}

/**
 * Làm tròn lên tới bước minutes (ví dụ 15) để slot bắt đầu đẹp hơn.
 */
function roundUp(date, minutes = 15) {
  const ms = 1000 * 60 * minutes;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

/**
 * Trả về một slot rảnh có độ dài durationMinutes, trước deadline (nếu có).
 * @param {string} user_uuid
 * @param {number} durationMinutes
 * @param {Date} [deadline] nếu không cung cấp thì giới hạn trong 7 ngày từ now
 */
export async function suggestTimeSlot(user_uuid, durationMinutes, deadline = null) {
  const now = new Date();
  const windowEnd = deadline
    ? new Date(Math.min(new Date(now).setDate(now.getDate() + 7), new Date(deadline).getTime()))
    : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const durationMs = durationMinutes * 60 * 1000;

  // Lấy busy và merge để chắc chắn không chồng
  const busyRaw = await getFreeBusy(user_uuid, now.toISOString(), windowEnd.toISOString());
  const busyIntervals = mergeIntervals(busyRaw);

  // Bắt đầu từ now làm tròn lên (ví dụ 15 phút)
  let cursor = roundUp(now, 15);

  // Nếu có deadline nhỏ hơn cursor thì không có slot
  if (deadline && cursor.getTime() + durationMs > new Date(deadline).getTime()) {
    return null;
  }

  for (const interval of busyIntervals) {
    // Nếu slot hiện tại (cursor) + duration trước khi busy bắt đầu
    if (interval.start.getTime() - cursor.getTime() >= durationMs) {
      // đảm bảo trước deadline
      const endCandidate = new Date(cursor.getTime() + durationMs);
      if (deadline && endCandidate.getTime() > new Date(deadline).getTime()) break;
      return { start: cursor.toISOString(), end: endCandidate.toISOString() };
    }
    // di chuyển cursor sau busy nếu nó nằm trong hoặc trước interval
    if (interval.end > cursor) {
      cursor = roundUp(interval.end, 15);
    }
    // check deadline again
    if (deadline && cursor.getTime() + durationMs > new Date(deadline).getTime()) {
      break;
    }
  }

  // Cuối cùng: xem còn slot sau busy cuối cùng đến windowEnd / deadline không
  if (cursor.getTime() + durationMs <= windowEnd.getTime()) {
    const endCandidate = new Date(cursor.getTime() + durationMs);
    if (!deadline || endCandidate.getTime() <= new Date(deadline).getTime()) {
      return { start: cursor.toISOString(), end: endCandidate.toISOString() };
    }
  }

  return null;
}
