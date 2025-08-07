import { google } from 'googleapis';
import dotenv from 'dotenv';
import { getPool, sql } from '../db.js';
import { generateJWT } from './jwt.js';

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Lấy URL OAuth2
export function getAuthURL() {
  return oauth2Client.generateAuthUrl({
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    prompt: 'consent',
    access_type: 'offline' // để có refresh token
  });
}

// Xử lý callback: trả về token JWT và lưu/ cập nhật integration_tokens
export async function handleOAuthCallback(code) {
  const pool = await getPool();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens) throw new Error('Không lấy được token từ Google');

    oauth2Client.setCredentials(tokens);

    // Lấy user info
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });
    const userInfoResp = await oauth2.userinfo.get();
    const email = userInfoResp.data?.email;
    const name = userInfoResp.data?.name || null;

    if (!email) {
      throw new Error('Không lấy được email từ Google. Hãy đảm bảo bạn đã cấp quyền email.');
    }

    // Upsert user
    let userUuid;
    const existingUser = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT * FROM users WHERE email = @email');

    if (existingUser.recordset.length === 0) {
      const insertUser = await pool.request()
        .input('email', sql.NVarChar, email)
        .input('name', sql.NVarChar, name)
        .query(`
          INSERT INTO users (email, name, preferences, created_at, updated_at)
          OUTPUT INSERTED.uuid
          VALUES (@email, @name, '{}', SYSUTCDATETIME(), SYSUTCDATETIME())
        `);
      userUuid = insertUser.recordset[0].uuid;
    } else {
      userUuid = existingUser.recordset[0].uuid;
      // (Có thể cập nhật tên nếu thay đổi)
      await pool.request()
        .input('uuid', sql.UniqueIdentifier, userUuid)
        .input('name', sql.NVarChar, name)
        .query(`
          UPDATE users
          SET name = @name, updated_at = SYSUTCDATETIME()
          WHERE uuid = @uuid
        `);
    }

    // Upsert integration token (lưu access & refresh)
    // Chọn kiểu cập nhật: nếu đã có, ghi đè; nếu không có thì insert
    await pool.request()
      .input('user_uuid', sql.UniqueIdentifier, userUuid)
      .input('provider', sql.NVarChar, 'google')
      .input('access_token', sql.NVarChar(sql.MAX), tokens.access_token || '')
      .input('refresh_token', sql.NVarChar(sql.MAX), tokens.refresh_token || '')
      .input('expiry', sql.DateTime2, tokens.expiry_date ? new Date(tokens.expiry_date) : null)
      .input('scopes', sql.NVarChar(sql.MAX), tokens.scope || '')
      .query(`
        MERGE integration_tokens AS target
        USING (SELECT @user_uuid AS user_uuid, @provider AS provider) AS source
          ON target.user_uuid = source.user_uuid AND target.provider = source.provider
        WHEN MATCHED THEN
          UPDATE SET access_token = @access_token,
                     refresh_token = @refresh_token,
                     expiry = @expiry,
                     scopes = @scopes,
                     updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (user_uuid, provider, access_token, refresh_token, expiry, scopes, created_at, updated_at)
          VALUES (@user_uuid, @provider, @access_token, @refresh_token, @expiry, @scopes, SYSUTCDATETIME(), SYSUTCDATETIME());
      `);

    const jwtToken = generateJWT({ uuid: userUuid, email });

    return { token: jwtToken, user_uuid: userUuid };
  } catch (err) {
    console.error('OAuth callback error:', err);
    throw err; // caller xử lý, có thể trả 4xx/5xx phù hợp
  }
}
