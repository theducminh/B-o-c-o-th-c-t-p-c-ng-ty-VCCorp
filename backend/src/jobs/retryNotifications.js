// jobs/retryNotifications.js
import { getPool, sql } from '../db.js';
import { sendSSEMessage } from '../routes/notifications.js';
import nodemailer from 'nodemailer';

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

        // Gửi thành công và cập nhật trạng thái
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

// Config email
const transporter = nodemailer.createTransport({
  service: 'gmail', // hoặc SMTP provider khác
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendNotification(n) {
  if (n.channel === 'email') {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: n.payload?.email,
      subject: n.title || 'Nhắc việc',
      html: `<p>${n.payload?.message || ''}</p>`
    });
    console.log(`[Email] Sent to ${n.payload?.email}`);

  } else if (n.channel === 'app') {
    sendSSEMessage({
      title: n.title || 'Thông báo',
      message: n.payload?.message || ''
    });
    console.log(`[App] In-app notification sent`);

  } else if (n.channel === 'push') {
    // TODO: Tích hợp FCM/APNS ở đây
    console.log(`[Push] Push notification sent`);

  } else {
    throw new Error(`Unknown channel ${n.channel}`);
  }
}

