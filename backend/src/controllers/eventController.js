import { getPool, sql } from '../db.js'
import { generateRecurringCopies } from '../utils/recurringUtils.js';

/**
 * Tạo event mới.
 */



export async function createEvent(req, res) {
  try {
    const user_uuid = req.user.uuid;
    const {
      title,
      start_time,
      end_time,
      meeting_link = '',
      location = '',
      description = '',
      recurring_rule = 'none'
    } = req.body;

    // Validate input
    if (!title || !start_time || !end_time) {
      return res.status(400).json({ error: 'Missing required fields: title, start_time, end_time' });
    }

    if (new Date(start_time) >= new Date(end_time)) {
      return res.status(400).json({ error: 'start_time must be before end_time' });
    }

    const allowedRules = ['none', 'daily', 'weekly', 'monthly'];
    if (!allowedRules.includes(recurring_rule)) {
      return res.status(400).json({ error: 'Giá trị lặp lại không hợp lệ' });
    }

    const pool = await getPool();

    // Câu truy vấn tạo event gốc
    const insertOriginalSql = `
      INSERT INTO events
        (user_uuid, title, description, start_time, end_time, recurring_rule, location, meeting_link, created_at, updated_at)
      OUTPUT INSERTED.*
      VALUES
        (@user_uuid, @title, @description, @start_time, @end_time, @recurring_rule, @location, @meeting_link, SYSUTCDATETIME(), SYSUTCDATETIME())
    `;

    // Tạo event gốc
    const originalResult = await pool.request()
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .input('title', sql.NVarChar, title)
      .input('start_time', sql.DateTimeOffset, start_time)
      .input('end_time', sql.DateTimeOffset, end_time)
      .input('meeting_link', sql.NVarChar, meeting_link)
      .input('location', sql.NVarChar, location)
      .input('description', sql.NVarChar, description)
      .input('recurring_rule', sql.NVarChar, recurring_rule)
      .query(insertOriginalSql);

    const originalEvent = originalResult.recordset[0];

    // Nếu không có lặp, trả luôn kết quả
    if (recurring_rule === 'none') {
      return res.status(201).json(originalEvent);
    }

    // Nếu có lặp: tạo 7 bản sao
    const parentId = originalEvent.id;
    const start = new Date(start_time);
    const end = new Date(end_time);
    const copyCount = 7;

    const copySql = `
      INSERT INTO events
        (user_uuid, title, description, start_time, end_time, recurring_rule, location, meeting_link, parent_event_id, created_at, updated_at)
      VALUES
        (@user_uuid, @title, @description, @start_time, @end_time, 'none', @location, @meeting_link, @parent_event_id, SYSUTCDATETIME(), SYSUTCDATETIME())
    `;

    const copyPromises = [];

    for (let i = 1; i <= copyCount; i++) {
      const nextStart = new Date(start);
      const nextEnd = new Date(end);

      switch (recurring_rule) {
        case 'daily':
          nextStart.setDate(nextStart.getDate() + i);
          nextEnd.setDate(nextEnd.getDate() + i);
          break;
        case 'weekly':
          nextStart.setDate(nextStart.getDate() + 7 * i);
          nextEnd.setDate(nextEnd.getDate() + 7 * i);
          break;
        case 'monthly':
          nextStart.setMonth(nextStart.getMonth() + i);
          nextEnd.setMonth(nextEnd.getMonth() + i);
          break;
      }

      copyPromises.push(
        pool.request()
          .input('user_uuid', sql.UniqueIdentifier, user_uuid)
          .input('title', sql.NVarChar, title)
          .input('start_time', sql.DateTimeOffset, nextStart)
          .input('end_time', sql.DateTimeOffset, nextEnd)
          .input('meeting_link', sql.NVarChar, meeting_link)
          .input('location', sql.NVarChar, location)
          .input('description', sql.NVarChar, description)
          .input('parent_event_id', sql.Int, parentId)
          .query(copySql)
      );
    }

    await Promise.all(copyPromises);
    return res.status(201).json(originalEvent);

  } catch (e) {
    console.error('createEvent error:', e);
    res.status(500).json({ error: 'Failed to create event' });
  }
}


/**
 * Lấy events giao với window [from, to)
 */
export async function listEvents(req, res) {
  try {
    const user_uuid = req.user.uuid;
    const { from, to } = req.query;

    // parse guard: nếu thiếu thì dùng mặc định
    const fromDt = from ? new Date(from) : new Date(0);
    const toDt = to ? new Date(to) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const pool = await getPool();
    const result = await pool.request()
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .input('from', sql.DateTimeOffset, fromDt)
      .input('to', sql.DateTimeOffset, toDt)
      .query(`
        SELECT *
        FROM events
        WHERE user_uuid = @user_uuid
          AND start_time < @to
          AND end_time > @from
        ORDER BY start_time
      `);
    res.json(result.recordset);
  } catch (e) {
    console.error('listEvents error:', e);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
}

/**
 * Cập nhật event (partial)
 */
export async function updateEvent(req, res) {
  try {
    const user_uuid = req.user.uuid;
    const eventId = parseInt(req.params.id, 10);
    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const {
      title,
      start_time,
      end_time,
      meeting_link = '',
      location = '',
      description = '',
      recurring_rule = ''
    } = req.body;

    const pool = await getPool();

    // Lấy recurring_rule cũ
    const oldEventResult = await pool.request()
      .input('id', sql.Int, eventId)
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .query(`
        SELECT * FROM events
        WHERE id = @id AND user_uuid = @user_uuid AND parent_event_id IS NULL
      `);

    const oldEvent = oldEventResult.recordset[0];
    if (!oldEvent) {
      return res.status(404).json({ error: 'Event not found or not owned' });
    }

    const oldRule = oldEvent.recurring_rule || '';

    // Cập nhật sự kiện gốc
    await pool.request()
      .input('id', sql.Int, eventId)
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .input('title', sql.NVarChar, title)
      .input('start_time', sql.DateTimeOffset, start_time)
      .input('end_time', sql.DateTimeOffset, end_time)
      .input('meeting_link', sql.NVarChar, meeting_link)
      .input('location', sql.NVarChar, location)
      .input('description', sql.NVarChar, description)
      .input('recurring_rule', sql.NVarChar, recurring_rule)
      .query(`
        UPDATE events
        SET title = @title,
            start_time = @start_time,
            end_time = @end_time,
            meeting_link = @meeting_link,
            location = @location,
            description = @description,
            recurring_rule = @recurring_rule
        WHERE id = @id AND user_uuid = @user_uuid
      `);

    // Nếu recurring_rule thay đổi, tạo lại bản sao
    if ((oldRule || '') !== (recurring_rule || '')) {
      await generateRecurringCopies({
        id: eventId,
        start_time,
        end_time,
        recurring_rule,
        user_uuid,
        title,
        description,
        location,
        meeting_link
      });
    }

    res.status(200).json({ message: 'Event updated successfully' });
  } catch (e) {
    console.error('updateEvent error:', e);
    res.status(500).json({ error: 'Failed to update event' });
  }
}



/**
 * Xoá event
 */
export async function deleteEvent(req, res) {
  try {
    const user_uuid = req.user?.uuid;
    const eventId = parseInt(req.params.id, 10);

    if (!user_uuid || isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid request: missing user or event ID' });
    }

    const pool = await getPool();
    const request = pool.request()
      .input('id', sql.Int, eventId)
      .input('user_uuid', sql.UniqueIdentifier, user_uuid);

    // Xóa sự kiện (trigger sẽ lo xóa các bản sao nếu có)
    const result = await request.query(`
      DELETE FROM events
      WHERE id = @id AND user_uuid = @user_uuid;

      SELECT @@ROWCOUNT AS affected;
    `);

    const affected = result.recordset[0]?.affected;

    if (!affected) {
      return res.status(404).json({ error: 'Event not found or you do not have permission to delete it' });
    }

    return res.status(204).send(); // Xóa thành công, không trả về nội dung
  } catch (error) {
    console.error('deleteEvent error:', error);
    return res.status(500).json({ error: 'Failed to delete event' });
  }
}
