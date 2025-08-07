import { getPool } from '../db.js';
import sql from 'mssql';

// Utility: clone 1 date
function cloneDate(d) {
  return new Date(d.getTime());
}

export async function generateRecurringCopies(event) {
  const {
    id,
    start_time,
    end_time,
    recurring_rule,
    user_uuid,
    title,
    description,
    location,
    meeting_link
  } = event;

  if (!recurring_rule) return;

  const pool = await getPool();
  const copies = [];

  const start = new Date(start_time); // UTC
  const end = new Date(end_time);

  const maxCopies = 10;

  for (let i = 1; i <= maxCopies; i++) {
    let startCopy = cloneDate(start);
    let endCopy = cloneDate(end);

    switch (recurring_rule) {
      case 'daily':
        startCopy.setUTCDate(startCopy.getUTCDate() + i);
        endCopy.setUTCDate(endCopy.getUTCDate() + i);
        break;
      case 'weekly':
        startCopy.setUTCDate(startCopy.getUTCDate() + i * 7);
        endCopy.setUTCDate(endCopy.getUTCDate() + i * 7);
        break;
      case 'monthly':
        startCopy.setUTCMonth(startCopy.getUTCMonth() + i);
        endCopy.setUTCMonth(endCopy.getUTCMonth() + i);
        break;
      default:
        return;
    }

    copies.push({ start_time: startCopy, end_time: endCopy });
  }

  for (const copy of copies) {
    await pool.request()
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .input('title', sql.NVarChar, title)
      .input('start_time', sql.DateTimeOffset, copy.start_time) 
      .input('end_time', sql.DateTimeOffset, copy.end_time)
      .input('meeting_link', sql.NVarChar, meeting_link)
      .input('location', sql.NVarChar, location)
      .input('description', sql.NVarChar, description)
      .input('parent_event_id', sql.Int, id)
      .input('recurring_rule', sql.NVarChar, null)
      .query(`
        INSERT INTO events (
          user_uuid, title, start_time, end_time,
          meeting_link, location, description,
          parent_event_id, recurring_rule
        )
        VALUES (
          @user_uuid, @title, @start_time, @end_time,
          @meeting_link, @location, @description,
          @parent_event_id, @recurring_rule
        )
      `);
  }
}
