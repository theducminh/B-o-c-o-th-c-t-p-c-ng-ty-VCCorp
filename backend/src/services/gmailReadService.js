// service/gmailReadService.js

import { google } from 'googleapis';
import { getPool, sql } from '../db.js';
import { getOAuth2Client } from './gmailService.js'; // bạn đã có

// Regex link họp
const MEET_PATTERNS = [
  /https?:\/\/meet\.google\.com\/[a-z0-9-]+/ig,
  /https?:\/\/.*zoom\.us\/j\/\d+(\?[^ \n\r"]*)?/ig,
  /https?:\/\/teams\.microsoft\.com\/.*meetup-join.*/ig,
  /https?:\/\/.*webex\.com\/meet\/[^\s"']+/ig
];

export function extractMeetingLinks(text='') {
  const links = new Set();
  MEET_PATTERNS.forEach(rx => (text.match(rx) || []).forEach(l => links.add(l)));
  return [...links];
}

function decodeBase64Url(b64url) {
  return Buffer.from(b64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// Parse thời gian “tự do ngôn ngữ” (vi/en) – fallback khi không có ICS
import * as chrono from 'chrono-node';
export function parseDatesFromText(text, refDate) {
  const results = chrono.parse(text, refDate, { forwardDate: true });
  if (!results.length) return null;

  // Lấy cái có độ tin cậy cao nhất
  const best = results[0];
  const start = best.date(); // JS Date
  // Nếu không có end → mặc định 60’
  const end = best.end ? best.end.date() : new Date(start.getTime() + 60*60000);
  return { start, end };
}

export async function pollGmailForUser(user_uuid) {
  const pool = await getPool();
  const auth = await getOAuth2Client(user_uuid);
  const gmail = google.gmail({ version: 'v1', auth });

  const q = '(has:attachment filename:ics) OR ("Google Meet" OR zoom OR teams OR họp OR meeting) newer_than:7d';
  const list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 30 });
  const msgIds = (list.data.messages || []).map(m => m.id);

  for (const id of msgIds) {
    const exists = await pool.request()
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .input('email_id', sql.NVarChar, id)
      .query(`SELECT id FROM email_suggestions WHERE user_uuid=@user_uuid AND email_id=@email_id`);
    if (exists.recordset.length) continue;

    try {
      const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      const payload = msg.data.payload || {};
      const headers = (payload.headers || []).reduce((acc,h)=>{ acc[h.name.toLowerCase()] = h.value; return acc; }, {});
      const subject = headers['subject'] || '';
      const from = headers['from'] || '';
      const to = headers['to'] || '';
      const cc = headers['cc'] || '';
      const internalDate = msg.data.internalDate ? new Date(Number(msg.data.internalDate)) : new Date();

      // body
      const parts=[]; const stack=[payload];
      while (stack.length) {
        const p = stack.pop();
        if (p?.parts) stack.push(...p.parts);
        if (p?.body?.data && (p.mimeType?.includes('text/plain') || p.mimeType?.includes('text/html'))) {
          parts.push(decodeBase64Url(p.body.data));
        }
      }
      const bodyText = parts.join('\n');

      // parse ICS nếu có
      let start=null,end=null,meeting_link=null,attendees=[];
      let hasICS=false;
      const attachments=[];
      (function find(p){
        if (!p) return;
        if (p.parts) p.parts.forEach(find);
        if (p.filename && /(\.ics|text\/calendar)$/i.test(p.mimeType||p.filename)) {
          hasICS=true;
          if (p.body?.attachmentId) attachments.push(p.body.attachmentId);
        }
      })(payload);

      if (hasICS && attachments.length) {
        const { data } = await gmail.users.messages.attachments.get({ userId:'me', messageId:id, id:attachments[0] });
        const ical = await import('node-ical');
        const parsed = ical.sync.parseICS(decodeBase64Url(data.data));
        for (const k in parsed) {
          const ev = parsed[k];
          if (ev.type==='VEVENT') {
            start=ev.start; end=ev.end || new Date(ev.start.getTime()+3600000);
            const links = extractMeetingLinks([ev.url, ev.description, bodyText].filter(Boolean).join('\n'));
            meeting_link=links[0]||null;
            attendees=(Array.isArray(ev.attendee)?ev.attendee:[ev.attendee]).filter(Boolean).map(a=>typeof a==='string'?a:(a.email||a.val));
            break;
          }
        }
      }
      if (!start) {
        const dt=parseDatesFromText(subject+'\n'+bodyText, internalDate);
        if (dt){ start=dt.start; end=dt.end; }
        const links=extractMeetingLinks(subject+'\n'+bodyText);
        meeting_link=links[0]||null;
      }

      // Lưu vào email_suggestions (schema mới)
      await pool.request()
        .input('user_uuid', sql.UniqueIdentifier, user_uuid)
        .input('email_id', sql.NVarChar, id)
        .input('subject', sql.NVarChar, subject)
        .input('snippet', sql.NVarChar, msg.data.snippet || null)
        .input('start_time', sql.DateTime2, start)
        .input('end_time', sql.DateTime2, end)
        .input('meeting_link', sql.NVarChar, meeting_link)
        .input('sender', sql.NVarChar, from)
        .input('attendees', sql.NVarChar, JSON.stringify(attendees||[]))
        .query(`
          INSERT INTO email_suggestions(user_uuid,email_id,subject,snippet,start_time,end_time,meeting_link,sender,attendees)
          VALUES(@user_uuid,@email_id,@subject,@snippet,@start_time,@end_time,@meeting_link,@sender,@attendees)
        `);

    } catch(err) {
      console.error('[pollGmailForUser] error:', err.message);
    }
  }
}
