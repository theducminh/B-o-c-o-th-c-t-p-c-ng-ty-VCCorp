// routes/notifications.js
import express from 'express';
import { getPool, sql } from '../db.js';
import { requireAuth } from '../auth/jwt.js';

const router = express.Router();
let clients = [];

// SSE: realtime stream
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  res.setHeader('Access-Control-Allow-Origin', 'null');
  res.setHeader("Access-Control-Allow-Credentials", "true");

  res.flushHeaders();

  clients.push(res);

  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});


// Lấy các notification quá hạn trong NGÀY HIỆN TẠI
router.get('/', requireAuth, async (req, res) => {
  try {
    const pool = await getPool();
    const now = new Date();

    // Cuối ngày hôm nay
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await pool.request()
      .input('user_uuid', sql.UniqueIdentifier, req.user.uuid)
      .input('end', sql.DateTime2, endOfDay)
      .query(`
        SELECT *
        FROM notifications
        WHERE user_uuid = @user_uuid
          AND status = 'pending'
          AND scheduled_time <= @end
        ORDER BY scheduled_time DESC
      `);

    res.json(result.recordset);

  } catch (err) {
    console.error('GET /notifications error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Lấy các notification trong ngày hiện tại
router.get('/today', requireAuth, async (req, res) => {
  try {
    const pool = await getPool();
    const now = new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await pool.request()
      .input('user_uuid', sql.UniqueIdentifier, req.user.uuid)
      .input('start', sql.DateTime2, startOfDay)
      .input('end', sql.DateTime2, endOfDay)
      .query(`
        SELECT *
        FROM notifications
        WHERE user_uuid = @user_uuid
          AND scheduled_time BETWEEN @start AND @end
        ORDER BY scheduled_time DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('GET /notifications/today error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

export function sendSSEMessage(data) {
  console.log("[SSE] Sending:", data);
  clients.forEach(res => res.write(`data: ${JSON.stringify(data)}\n\n`));
}


export default router;
