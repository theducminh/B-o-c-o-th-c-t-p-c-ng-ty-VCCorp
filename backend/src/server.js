// server.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import cron from 'node-cron';
import tasksRoute from './routes/tasks.js';
import eventsRoute from './routes/events.js';
import authRoute from './routes/auth.js';
import googleSyncRoute from './routes/googleSync.js';

import { getPool, healthCheck } from './db.js';
import { processPendingNotifications } from './jobs/retryNotifications.js';
import { fetchAndSyncCalendar } from './services/calendarService.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
app.use('/api/auth', authRoute);
app.use('/api/tasks', tasksRoute);
app.use('/api/events', eventsRoute);
app.use('/api/google', googleSyncRoute);

app.get('/', (req, res) => res.send('Smart Schedule API running'));

// Health check endpoint (dùng cho monitoring)
app.get('/health', async (req, res) => {
  const ok = await healthCheck();
  res.status(ok ? 200 : 500).json({ status: ok ? 'ok' : 'error' });
});

// Background Jobs với cron
function startJobs() {
  // Retry Notifications mỗi phút
  cron.schedule('* * * * *', async () => {
    console.log('[Job] Running notification retry...');
    try {
      await processPendingNotifications();
    } catch (e) {
      console.error('[Job] Notification retry error:', e);
    }
  });

  // Sync Calendar mỗi 5 phút
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Job] Running calendar sync...');
    try {
      const pool = await getPool();
      const users = await pool.request()
        .query(`SELECT DISTINCT user_uuid FROM integration_tokens WHERE provider='google'`);

      for (const { user_uuid } of users.recordset) {
        await fetchAndSyncCalendar(user_uuid)
          .catch(err => console.error(`[Job] Calendar sync error for ${user_uuid}:`, err));
      }
    } catch (e) {
      console.error('[Job] Calendar sync loop error:', e);
    }
  });
}
// Start server
(async () => {
  try {
    await getPool(); // Ensure DB connection
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
    });
    startJobs();
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down server...');
  process.exit(0);
});
