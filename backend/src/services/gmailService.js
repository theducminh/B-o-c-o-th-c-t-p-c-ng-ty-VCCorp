// service/gmailService.js
import { google } from "googleapis";
import { getPool, sql } from "../db.js";

/**
 * Lấy OAuth2 client đã set credentials cho user
 */
export async function getOAuth2Client(userUuid) {
  const pool = await getPool();

  const tokenResult = await pool.request()
    .input("user_uuid", sql.UniqueIdentifier, userUuid)
    .input("provider", sql.NVarChar, "google")
    .query(`
      SELECT access_token, refresh_token, expiry
      FROM integration_tokens
      WHERE user_uuid = @user_uuid AND provider = @provider
    `);

  if (tokenResult.recordset.length === 0) {
    throw new Error("Không tìm thấy Google token cho user");
  }

  const { access_token, refresh_token, expiry } = tokenResult.recordset[0];

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  // Cập nhật token mới nếu Google trả về
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token || tokens.refresh_token) {
      await pool.request()
        .input("user_uuid", sql.UniqueIdentifier, userUuid)
        .input("provider", sql.NVarChar, "google")
        .input("access_token", sql.NVarChar, tokens.access_token || access_token)
        .input("refresh_token", sql.NVarChar, tokens.refresh_token || refresh_token)
        .input("expiry", sql.DateTime2, tokens.expiry_date ? new Date(tokens.expiry_date) : null)
        .query(`
          UPDATE integration_tokens
          SET access_token = @access_token,
              refresh_token = @refresh_token,
              expiry = @expiry,
              updated_at = SYSUTCDATETIME()
          WHERE user_uuid = @user_uuid AND provider = @provider
        `);
    }
  });

  oauth2Client.setCredentials({
    access_token,
    refresh_token,
    expiry_date: expiry ? new Date(expiry).getTime() : null,
  });

  return oauth2Client;
}

/**
 * Tạo MIME message để gửi Gmail
 */
function makeEmailMessage(to, subject, body) {
  const utf8Subject =
    "=?UTF-8?B?" + Buffer.from(subject).toString("base64") + "?=";

  const str = [
    `To: ${to}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${utf8Subject}`,
    "",
    body,
  ].join("\n");

  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Gửi email qua Gmail API
 */
export async function sendEmailReminder(userUuid, taskId, toEmail, subject, body) {
  const oauth2Client = await getOAuth2Client(userUuid);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const rawMessage = makeEmailMessage(toEmail, subject, body);

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: rawMessage,
    },
  });
  const tomorrow9AM = new Date();
tomorrow9AM.setDate(tomorrow9AM.getDate() + 1);
tomorrow9AM.setHours(8, 0, 0, 0);

  // Sau khi gửi mail thì insert vào notifications
  const pool = await getPool();
  await pool.request()
    .input("user_uuid", sql.UniqueIdentifier, userUuid)
    .input("task_id", sql.Int, taskId)
    .input("channel", sql.NVarChar, "email")
    .input("type", sql.NVarChar, "reminder")
    .input("status", sql.NVarChar, "sent")
    .input("scheduled_time", sql.DateTime2, tomorrow9AM)
    .query(`
      INSERT INTO notifications (user_uuid, task_id, channel, type, status, created_at, sent_time, scheduled_time)
      VALUES (@user_uuid, @task_id, @channel, @type, @status, SYSUTCDATETIME(), SYSUTCDATETIME(), @scheduled_time)
    `);

  return result.data;
}

