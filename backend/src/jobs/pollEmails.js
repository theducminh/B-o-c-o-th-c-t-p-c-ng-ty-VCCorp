//jobs//pollEmails.js


import { getPool } from '../db.js';
import { pollGmailForUser } from '../services/gmailReadService.js';

export async function pollEmailsJob() {
  const pool = await getPool();
  const users = await pool.request()
    .query(`SELECT DISTINCT user_uuid FROM integration_tokens WHERE provider='google'`);
  for (const { user_uuid } of users.recordset) {
    await pollGmailForUser(user_uuid).catch(e=>console.error('poll user', user_uuid, e.message));
  }
}
