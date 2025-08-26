// routes/suggestions.js
import express from 'express';
import { getPool, sql } from '../db.js';
import { requireAuth } from '../auth/jwt.js';

const router = express.Router();

// Badge
router.get('/count', requireAuth, async (req,res)=>{
  const pool = await getPool();
  const rs = await pool.request()
    .input('user_uuid', sql.UniqueIdentifier, req.user.uuid)
    .query(`SELECT COUNT(*) AS c FROM email_suggestions WHERE user_uuid=@user_uuid AND status='pending'`);
  res.json({ count: rs.recordset[0].c });
});

// Danh sách suggestion (ép start_time/end_time sang ISO string có offset)
router.get('/', requireAuth, async (req,res)=>{
  const pool = await getPool();
  const rs = await pool.request()
    .input('user_uuid', sql.UniqueIdentifier, req.user.uuid)
    .query(`
      SELECT 
        id,
        subject,
        snippet,
        meeting_link,
        CONVERT(varchar(50), start_time, 127) AS start_time,
        CONVERT(varchar(50), end_time, 127)   AS end_time,
        status,
        created_at
      FROM email_suggestions
      WHERE user_uuid=@user_uuid AND status='pending'
      ORDER BY created_at DESC
    `);
  res.json(rs.recordset);
});

// Accept → tạo event + log
router.post('/:id/accept', requireAuth, async (req,res)=>{
  const pool = await getPool();
  const { id } = req.params;

  // Lấy suggestion, trả start/end như ISO string
  const sug = await pool.request()
    .input('id', sql.Int, id)
    .input('user_uuid', sql.UniqueIdentifier, req.user.uuid)
    .query(`
      SELECT id, subject, snippet, meeting_link,
             CONVERT(varchar(50), start_time, 127) AS start_time,
             CONVERT(varchar(50), end_time, 127)   AS end_time
      FROM email_suggestions
      WHERE id=@id AND user_uuid=@user_uuid
    `);

  if (!sug.recordset.length) return res.status(404).json({error:'Not found'});
  const s = sug.recordset[0];
 console.log('Accepting suggestion:', s.subject);
  // Tạo event: convert lại string -> datetimeoffset trong SQL (safe)
  const ev = await pool.request()
    .input('user_uuid', sql.UniqueIdentifier, req.user.uuid)
    .input('title', sql.NVarChar, s.subject || 'Không có tiêu đề')
    .input('description', sql.NVarChar, s.snippet)
    .input('start_time', sql.NVarChar, s.start_time)
    .input('end_time', sql.NVarChar, s.end_time)
    .input('meeting_link', sql.NVarChar, s.meeting_link)
    .input('suggestion_id', sql.Int, s.id)
    .query(`
      INSERT INTO events(user_uuid,title,description,start_time,end_time,meeting_link,suggestion_id,created_at)
      OUTPUT INSERTED.*
      VALUES(
        @user_uuid,
        @title,
        @description,
        CONVERT(datetimeoffset, @start_time),
        CONVERT(datetimeoffset, @end_time),
        @meeting_link,
        @suggestion_id,
        SYSUTCDATETIME()
      )
    `);

  await pool.request().input('id', sql.Int, id)
    .query(`UPDATE email_suggestions SET status='accepted', updated_at=SYSUTCDATETIME() WHERE id=@id`);

  await pool.request()
    .input('suggestion_id', sql.Int, id)
    .input('action', sql.NVarChar, 'accept')
    .input('log_message', sql.NVarChar, 'Người dùng đã chấp nhận')
    .query(`INSERT INTO email_logs(suggestion_id,action,log_message) VALUES(@suggestion_id,@action,@log_message)`);

  res.json({ event: ev.recordset[0] });
});

// Dismiss
router.post('/:id/dismiss', requireAuth, async (req,res)=>{
  const pool=await getPool();
  const { id } = req.params;
  await pool.request().input('id',sql.Int,id)
    .query(`UPDATE email_suggestions SET status='dismissed', updated_at=SYSUTCDATETIME() WHERE id=@id`);
  await pool.request()
    .input('suggestion_id', sql.Int, id)
    .input('action', sql.NVarChar, 'dismiss')
    .input('log_message', sql.NVarChar, 'Người dùng bỏ qua')
    .query(`INSERT INTO email_logs(suggestion_id,action,log_message) VALUES(@suggestion_id,@action,@log_message)`);
  res.json({ok:true});
});

export default router;
