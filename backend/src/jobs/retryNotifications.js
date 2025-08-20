// jobs/retryNotifications.js
import { getPool, sql } from '../db.js';
import { sendSSEMessage } from '../routes/notifications.js';
import nodemailer from 'nodemailer';

const MAX_RETRY = 5;
const STATUS = {
  PENDING: 'pending',   // đang chờ
  SENT: 'sent',      // đã gửi và task đã hoàn thành
  FAILED: 'failed'   // gửi lỗi
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
        SELECT TOP (50) n.*, 
       t.status AS task_status,
       t.title  AS task_title
      FROM notifications n WITH (ROWLOCK, UPDLOCK)
      JOIN tasks t ON n.task_id = t.id
       WHERE n.status = @status
       AND n.scheduled_time <= @now
       ORDER BY n.scheduled_time ASC

      `);

    for (const n of res.recordset) {
      try {
        await sendNotification(n);

        if (n.task_status === 'todo') {
  // Task chưa xong -> dời lịch sang 8h sáng ngày mai
  const nextDay = new Date();
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  nextDay.setUTCHours(8, 0, 0, 0); // 8h sáng UTC (tùy múi giờ có thể chỉnh)

  await pool.request()
    .input('id', sql.Int, n.id)
    .input('next', sql.DateTime2, nextDay)
    .query(`
      UPDATE notifications
      SET updated_at = SYSUTCDATETIME(),
          retry_count = ISNULL(retry_count, 0),
          scheduled_time = @next
      WHERE id = @id
    `);

  console.log(`[Reminder] Task ${n.task_id} chưa xong -> sẽ nhắc lại lúc ${nextDay}`);
}

else {
  // Task đã hoàn thành -> đánh dấu notification đã sent
  await pool.request()
    .input('id', sql.Int, n.id)
    .input('status', sql.NVarChar, STATUS.SENT)
    .query(`
      UPDATE notifications
      SET status = @status,
          sent_time = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME(),
          retry_count = ISNULL(retry_count, 0)
      WHERE id = @id
    `);

  console.log(`[Done] Task ${n.task_id} đã hoàn thành -> notification sent`);
}


      } catch (err) {
        const currentRetry = n.retry_count || 0;
        const newRetry = currentRetry + 1;
        const backoffMinutes = Math.min(Math.pow(2, newRetry), 60);
        const nextSchedule = new Date();
        nextSchedule.setMinutes(nextSchedule.getMinutes() + backoffMinutes);

        if (newRetry >= MAX_RETRY) {
          // Quá số lần retry -> FAIL
          await pool.request()
            .input('id', sql.Int, n.id)
            .input('status', sql.NVarChar, STATUS.FAILED)
            .input('retry', sql.Int, newRetry)
            .input('err', sql.NVarChar, err.message)
            .query(`
              UPDATE notifications
              SET status = @status,
                  updated_at = SYSUTCDATETIME(),
                  retry_count = @retry,
                  payload = JSON_MODIFY(payload, '$.error', @err)
              WHERE id = @id
            `);
        } else {
          // Lên lịch retry tiếp
          await pool.request()
            .input('id', sql.Int, n.id)
            .input('next', sql.DateTime2, nextSchedule)
            .input('err', sql.NVarChar, err.message)
            .query(`
              UPDATE notifications
              SET scheduled_time = @next,
                  updated_at = SYSUTCDATETIME(),
                  retry_count = ISNULL(retry_count, 0) + 1,
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

// --- Retry helper ---
async function handleRetry(pool, n, err) {
  const currentRetry = n.retry_count || 0;
  const newRetry = currentRetry + 1;
  const backoffMinutes = Math.min(Math.pow(2, newRetry), 60);
  const nextSchedule = new Date();
  nextSchedule.setMinutes(nextSchedule.getMinutes() + backoffMinutes);

  if (newRetry >= MAX_RETRY) {
    await pool.request()
      .input('id', sql.Int, n.id)
      .input('status', sql.NVarChar, STATUS.FAILED)
      .input('retry', sql.Int, newRetry)
      .input('err', sql.NVarChar, err.message)
      .query(`
        UPDATE notifications
        SET status = @status,
            updated_at = SYSUTCDATETIME(),
            retry_count = @retry,
            payload = JSON_MODIFY(payload, '$.error', @err)
        WHERE id = @id
      `);

    console.error(`[FAIL] Notification ${n.id} -> ${err.message}`);
  } else {
    await pool.request()
      .input('id', sql.Int, n.id)
      .input('next', sql.DateTime2, nextSchedule)
      .input('err', sql.NVarChar, err.message)
      .query(`
        UPDATE notifications
        SET scheduled_time = @next,
            updated_at = SYSUTCDATETIME(),
            retry_count = ISNULL(retry_count, 0) + 1,
            payload = JSON_MODIFY(payload, '$.error', @err)
        WHERE id = @id
      `);

    console.warn(`[Retry] Notification ${n.id} -> retry ${newRetry}, next at ${nextSchedule}`);
  }
}
// Config email
const transporter = nodemailer.createTransport({
  service: 'gmail', // hoặc dùng SMTP server riêng
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
    id: n.id,
    task_id: n.task_id,
    channel: n.channel,
    title: n.title || n.task_title || 'Thông báo',
    payload: { 
      message: n.payload?.message || `Task "${n.task_title}" sắp đến hạn`
    }
  });
  console.log(`[App] In-app notification sent`);
} else if (n.channel === 'push') {
    // TODO: tích hợp FCM/APNS
    console.log(`[Push] Push notification sent`);

  } else {
    throw new Error(`Unknown channel ${n.channel}`);
  }
}
