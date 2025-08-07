import { getPool, sql } from '../db.js';

const MAX_RETRY = 5;
const STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed'
};

/**
 * Giả định: đã mở rộng bảng notifications để có:
 *   retry_count INT DEFAULT 0,
 *   last_error NVARCHAR(MAX),
 *   channel (app/email/push) và payload/template
 */

export async function processPendingNotifications() {
  const pool = await getPool();
  const now = new Date();

  try {
    const res = await pool.request()
      .input('now', sql.DateTime2, now)
      .query(`
        SELECT *
        FROM notifications
        WHERE status = @status AND scheduled_time <= @now
      `, {
        // some libs accept params here; with mssql we bind below
      });
    
    // Nếu nhiều bản ghi, giới hạn xử lý (ví dụ 50/lần)
    const records = res.recordset.slice(0, 50);

    for (const n of records) {
      try {
        // 1. Gửi notification thực tế theo kênh
        // Ví dụ: await notificationSender.send(n);
        // Giả sử send trả true/throw nếu thất bại

        // TODO: implement actual send logic
        await sendNotification(n); // bạn phải cài cái này ở chỗ khác

        // 2. Cập nhật thành sent
        await pool.request()
          .input('id', sql.Int, n.id)
          .query(`
            UPDATE notifications
            SET status = @status, sent_time = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
            WHERE id = @id
          `, {
            // binding in mssql library is via .input above
          })
          .input('status', sql.NVarChar, STATUS.SENT);
      } catch (err) {
        // Retry/backoff
        const currentRetry = n.retry_count || 0;
        const newRetry = currentRetry + 1;
        const backoffMinutes = Math.min(Math.pow(2, newRetry), 60); // giới hạn tối đa
        const nextSchedule = new Date();
        nextSchedule.setMinutes(nextSchedule.getMinutes() + backoffMinutes);

        if (newRetry >= MAX_RETRY) {
          await pool.request()
            .input('id', sql.Int, n.id)
            .input('err', sql.NVarChar, err.message)
            .query(`
              UPDATE notifications
              SET status = @failed, last_error = @err, updated_at = SYSUTCDATETIME()
              WHERE id = @id
            `)
            .input('failed', sql.NVarChar, STATUS.FAILED);
        } else {
          await pool.request()
            .input('id', sql.Int, n.id)
            .input('next', sql.DateTime2, nextSchedule)
            .input('retry_count', sql.Int, newRetry)
            .input('err', sql.NVarChar, err.message)
            .query(`
              UPDATE notifications
              SET scheduled_time = @next,
                  retry_count = @retry_count,
                  last_error = @err,
                  updated_at = SYSUTCDATETIME()
              WHERE id = @id
            `);
        }
      }
    }
  } catch (outerErr) {
    console.error('processPendingNotifications failed:', outerErr);
    // Tuỳ: có thể report lỗi (sentry, email admin, etc.)
  }
}

/**
 * Placeholder: implement gửi actual notification (app/email/push) ở module riêng.
 */
async function sendNotification(n) {
  // Example stub: switch on channel
  if (n.channel === 'email') {
    // gọi service email
  } else if (n.channel === 'app') {
    // push vào in-app queue
  } else if (n.channel === 'push') {
    // push notification
  } else {
    throw new Error(`Unknown channel ${n.channel}`);
  }
  // nếu thành công thì return; nếu lỗi thì throw
}
