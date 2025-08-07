import { LRUCache } from 'lru-cache';
import { google } from 'googleapis';
import { getPool, sql } from '../db.js';
import dotenv from 'dotenv';

dotenv.config();

const freeBusyCache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 5 // 5 phút
});

async function getOAuthClientForUser(user_uuid) {
  const pool = await getPool();
  const tokenRes = await pool.request()
    .input('user_uuid', sql.UniqueIdentifier, user_uuid)
    .input('provider', sql.NVarChar, 'google')
    .query('SELECT * FROM integration_tokens WHERE user_uuid=@user_uuid AND provider=@provider');

  if (tokenRes.recordset.length === 0) throw new Error('No google token');

  const row = tokenRes.recordset[0];
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oAuth2Client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.expiry ? new Date(row.expiry).getTime() : undefined
  });

  oAuth2Client.on('tokens', async (tokens) => {
    try {
      // chỉ cập nhật nếu có sự khác biệt
      const updatedAccess = tokens.access_token || row.access_token;
      const updatedRefresh = tokens.refresh_token || row.refresh_token;
      const updatedExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : row.expiry;

      await pool.request()
        .input('user_uuid', sql.UniqueIdentifier, user_uuid)
        .input('provider', sql.NVarChar, 'google')
        .input('access_token', sql.NVarChar(sql.MAX), updatedAccess)
        .input('refresh_token', sql.NVarChar(sql.MAX), updatedRefresh)
        .input('expiry', sql.DateTime2, updatedExpiry)
        .query(`
          UPDATE integration_tokens
          SET access_token = @access_token,
              refresh_token = @refresh_token,
              expiry = @expiry,
              updated_at = SYSUTCDATETIME()
          WHERE user_uuid=@user_uuid AND provider=@provider
        `);
    } catch (err) {
      console.error(`Failed to persist refreshed Google tokens for user ${user_uuid}:`, err);
    }
  });

  return oAuth2Client;
}

export async function getFreeBusy(user_uuid, timeMin, timeMax) {
  const normalizedMin = new Date(timeMin).toISOString();
  const normalizedMax = new Date(timeMax).toISOString();
  const key = `${user_uuid}:${normalizedMin}:${normalizedMax}`;
  if (freeBusyCache.has(key)) return freeBusyCache.get(key);

  let oAuth2Client;
  try {
    oAuth2Client = await getOAuthClientForUser(user_uuid);
  } catch (err) {
    console.error(`getOAuthClientForUser failed for ${user_uuid}:`, err);
    throw err; // caller quyết định: reauth hay lỗi
  }

  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  // retry lên tới 3 lần nếu lỗi tạm thời
  let busy;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await calendar.freebusy.query({
        requestBody: {
          timeMin: normalizedMin,
          timeMax: normalizedMax,
          items: [{ id: 'primary' }]
        }
      });
      busy = res.data.calendars?.primary?.busy || [];
      freeBusyCache.set(key, busy);
      return busy;
    } catch (err) {
      console.warn(`FreeBusy query attempt ${attempt} failed for user ${user_uuid}:`, err);
      if (attempt === 3) {
        throw new Error('Failed to fetch free/busy after retries');
      }
      // backoff nhỏ
      await new Promise(r => setTimeout(r, 200 * attempt));
    }
  }
}
