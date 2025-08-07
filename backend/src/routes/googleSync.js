import express from 'express';
import { requireAuth } from '../auth/jwt.js'; // hoặc authenticateJWT nếu chưa đổi
import { fetchAndSyncCalendar } from '../services/calendarService.js';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// Optional: simple in-memory debounce per user to avoid spamming sync
const lastSyncMap = new Map();
const SYNC_COOLDOWN_MS = 10 * 1000; // 10 giây

router.post('/sync', requireAuth, async (req, res) => {
  const user_uuid = req.user.uuid;

  // throttle cơ bản
  const last = lastSyncMap.get(user_uuid);
  const now = Date.now();
  if (last && now - last < SYNC_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Đồng bộ quá nhanh, thử lại sau', retry_after_ms: SYNC_COOLDOWN_MS - (now - last) });
  }
  lastSyncMap.set(user_uuid, now);

  try {
    const summary = await fetchAndSyncCalendar(user_uuid);
    // Summary nên bao gồm: pulled, pushed, skipped, errors (nếu có)
    res.json({
      message: 'Đồng bộ hoàn tất',
      summary
    });
  } catch (e) {
    console.error('Google sync error:', e);
    // Tránh leak secret, nhưng có thể trả chi tiết cấu trúc nếu môi trường dev
    res.status(500).json({
      error: 'Sync failed',
      details: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }
});

export default router;
