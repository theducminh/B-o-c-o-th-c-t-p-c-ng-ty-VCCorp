// jobs/retryNotifications.js
import { getPool, sql } from '../db.js';

const MAX_RETRY = 5;
const STATUS = {
  PENDING: 'todo',
  SENT: 'sent',
  FAILED: 'failed'
};

export async function processPendingNotifications() {
  const pool = await getPool();
  const now = new Date();

  try {
    // Lấy các thông báo pending đã đến hạn gửi
    const res = await pool.request()
      .input('status', sql.NVarChar, STATUS.PENDING)
      .input('now', sql.DateTime2, now)
      .query(`
        SELECT *
        FROM notifications
        WHERE status = @status
          AND scheduled_time <= @now
      `);

    const records = res.recordset.slice(0, 50); // giới hạn 50 bản ghi/lần

    for (const n of records) {
      try {
        await sendNotification(n);

        // Gửi thành công → cập nhật trạng thái
        await pool.request()
          .input('id', sql.Int, n.id)
          .input('status', sql.NVarChar, STATUS.SENT)
          .query(`
            UPDATE notifications
            SET status = @status,
                sent_time = SYSUTCDATETIME(),
                updated_at = SYSUTCDATETIME()
            WHERE id = @id
          `);

      } catch (err) {
        // Retry nếu lỗi
        const currentRetry = n.retry_count || 0; // Nếu bảng chưa có cột này, bạn cần thêm
        const newRetry = currentRetry + 1;
        const backoffMinutes = Math.min(Math.pow(2, newRetry), 60);
        const nextSchedule = new Date();
        nextSchedule.setMinutes(nextSchedule.getMinutes() + backoffMinutes);

        if (newRetry >= MAX_RETRY) {
          await pool.request()
            .input('id', sql.Int, n.id)
            .input('status', sql.NVarChar, STATUS.FAILED)
            .input('err', sql.NVarChar, err.message)
            .query(`
              UPDATE notifications
              SET status = @status,
                  updated_at = SYSUTCDATETIME(),
                  payload = JSON_MODIFY(payload, '$.error', @err)
              WHERE id = @id
            `);
        } else {
          await pool.request()
            .input('id', sql.Int, n.id)
            .input('next', sql.DateTime2, nextSchedule)
            .input('err', sql.NVarChar, err.message)
            .query(`
              UPDATE notifications
              SET scheduled_time = @next,
                  updated_at = SYSUTCDATETIME(),
                  payload = JSON_MODIFY(payload, '$.error', @err)
              WHERE id = @id
            `);
        }
      }
    }
  } catch (outerErr) {
    console.error('processPendingNotifications failed:', outerErr);
  }
}

// Hàm gửi thông báo tùy kênh
async function sendNotification(n) {
  if (n.channel === 'email') {
    // TODO: Gửi email từ template/payload
  } else if (n.channel === 'app') {
    // TODO: Push in-app notification
  } else if (n.channel === 'push') {
    // TODO: Push qua FCM/APNS
  } else {
    throw new Error(`Unknown channel ${n.channel}`);
  }
}
