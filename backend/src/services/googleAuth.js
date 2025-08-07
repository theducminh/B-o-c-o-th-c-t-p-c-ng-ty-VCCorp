import { google } from 'googleapis';
import { getPool, sql } from '../db.js';
import dotenv from 'dotenv';
dotenv.config();

export async function getOAuthClientForUser(user_uuid) {
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
    expiry_date: row.expiry ? new Date(row.expiry).getTime() : null
  });

  // Auto refresh token & update DB
  oAuth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token || tokens.refresh_token) {
      await pool.request()
        .input('user_uuid', sql.UniqueIdentifier, user_uuid)
        .input('provider', sql.NVarChar, 'google')
        .input('access_token', sql.NVarChar, tokens.access_token || row.access_token)
        .input('refresh_token', sql.NVarChar, tokens.refresh_token || row.refresh_token)
        .input('expiry', sql.DateTime2, tokens.expiry_date ? new Date(tokens.expiry_date) : null)
        .query(`
          UPDATE integration_tokens
          SET access_token=@access_token, refresh_token=@refresh_token, expiry=@expiry, updated_at=GETUTCDATE()
          WHERE user_uuid=@user_uuid AND provider=@provider
        `);
    }
  });

  return oAuth2Client;
}
