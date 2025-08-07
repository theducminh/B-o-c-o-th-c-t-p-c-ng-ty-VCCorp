import { google } from 'googleapis';
import dotenv from 'dotenv';
import { getPool, sql } from '../db.js';
import { getOAuthClientForUser } from './googleAuth.js';

dotenv.config();

export async function fetchAndSyncCalendar(user_uuid) {
  const oAuth2Client = await getOAuthClientForUser(user_uuid);
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  // window: từ giờ tới 30 ngày sau
  const now = new Date();
  const timeMin = now.toISOString();
  const future = new Date(now);
  future.setDate(future.getDate() + 30);
  const timeMax = future.toISOString();

  const pool = await getPool();

  let pageToken = undefined;
  const summary = {
    pulled: 0,
    created_local: 0,
    updated_local: 0,
    errors: []
  };

  do {
    try {
      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        pageToken
      });

      const items = res.data.items || [];
      summary.pulled += items.length;

      for (const ev of items) {
        try {
          // Normalize start/end to full ISO strings, handle all-day
          const startRaw = ev.start?.dateTime || ev.start?.date;
          const endRaw = ev.end?.dateTime || ev.end?.date;
          if (!startRaw || !endRaw) continue; // skip malformed

          // For all-day events (date), convert to ISO at start of day (could be adjusted per requirement)
          const start = ev.start.dateTime
            ? new Date(ev.start.dateTime).toISOString()
            : new Date(ev.start.date + 'T00:00:00Z').toISOString();
          const end = ev.end.dateTime
            ? new Date(ev.end.dateTime).toISOString()
            : new Date(ev.end.date + 'T00:00:00Z').toISOString();

          // Merge into local DB
          const mergeQuery = `
            MERGE events AS target
            USING (SELECT @user_uuid AS user_uuid, @google_event_id AS google_event_id) AS source
              ON target.user_uuid=source.user_uuid AND target.google_event_id=source.google_event_id
            WHEN MATCHED THEN 
              UPDATE SET title=@title,
                         description=@description,
                         start_time=@start_time,
                         end_time=@end_time,
                         recurring_rule=@recurring_rule,
                         location=@location,
                         meeting_link=@meeting_link,
                         updated_at=SYSUTCDATETIME()
            WHEN NOT MATCHED THEN
              INSERT (user_uuid,title,description,start_time,end_time,recurring_rule,location,meeting_link,source,google_event_id,created_at,updated_at)
              VALUES (@user_uuid,@title,@description,@start_time,@end_time,@recurring_rule,@location,@meeting_link,@source,@google_event_id,SYSUTCDATETIME(),SYSUTCDATETIME());
          `;

          const result = await pool.request()
            .input('user_uuid', sql.UniqueIdentifier, user_uuid)
            .input('title', sql.NVarChar, ev.summary || '(No title)')
            .input('description', sql.NVarChar, ev.description || '')
            .input('start_time', sql.DateTime2, start)
            .input('end_time', sql.DateTime2, end)
            .input('recurring_rule', sql.NVarChar, ev.recurrence ? ev.recurrence.join(';') : null)
            .input('location', sql.NVarChar, ev.location || '')
            .input('meeting_link', sql.NVarChar, ev.hangoutLink || '')
            .input('source', sql.NVarChar, 'google')
            .input('google_event_id', sql.NVarChar, ev.id)
            .query(mergeQuery);

          // Tùy: xác định là created hay updated dựa trên ảnh trả về có thể cần thêm logic
          // (Ví dụ: nếu matched thì update_local++, else created_local++)
          // Dễ nhất là query lại trước/sau hoặc dùng OUTPUT clause nâng cao.

        } catch (innerErr) {
          console.warn(`Failed to upsert event ${ev.id} for user ${user_uuid}:`, innerErr);
          summary.errors.push({ eventId: ev.id, error: innerErr.message });
        }
      }

      pageToken = res.data.nextPageToken;
    } catch (pageErr) {
      console.error(`Error fetching calendar page for user ${user_uuid}:`, pageErr);
      summary.errors.push({ pageError: pageErr.message });
      break; // có thể quyết định retry logic ở đây nếu muốn
    }
  } while (pageToken);

  return summary;
}
