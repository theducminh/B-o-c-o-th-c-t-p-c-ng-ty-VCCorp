//taskController.js
import { getPool, sql } from '../db.js';
//import { suggestTimeSlot } from '../services/suggestionService.js';

const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const VALID_STATUSES = ['todo', 'done'];

function validateTaskInput(input) {
  const errors = [];
  if (!input.title) errors.push('Title required');
  if (!input.deadline) errors.push('Deadline required');
  else if (isNaN(new Date(input.deadline))) errors.push('Invalid deadline');
  if (input.priority && !VALID_PRIORITIES.includes(input.priority)) errors.push('Invalid priority');
  if (input.status && !VALID_STATUSES.includes(input.status)) errors.push('Invalid status');
  return errors;
}

export async function createTask(req, res) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    const {
      title,
      description = '',
      deadline,
      priority = '',
      estimated_duration = 60,
      status = 'todo',
      notifications
    } = req.body;
    const user_uuid = req.user.uuid;

    const errors = validateTaskInput({ title, deadline, priority, status, notifications });
    if (errors.length) return res.status(400).json({ errors });

    // Gợi ý slot trước deadline
    //const suggestion = await suggestTimeSlot(user_uuid, estimated_duration, new Date(deadline));
   // let assigned_event_id = null;

    try{
      await transaction.begin();
    }
    catch (err) {
      console.error('Transaction begin error:', err);
      return res.status(500).json({ error: 'Failed to start transaction' });
    }

    /*if (suggestion) {
      const eventRequest = new sql.Request(transaction);
      const insertEvtRes = await eventRequest
        .input('user_uuid', sql.UniqueIdentifier, user_uuid)
        .input('title', sql.NVarChar, `Suggested: ${title}`)
        .input('description', sql.NVarChar, '')
        .input('start_time', sql.DateTime2, suggestion.start)
        .input('end_time', sql.DateTime2, suggestion.end)
        .input('recurring_rule', sql.NVarChar, null)
        .input('location', sql.NVarChar, '')
        .input('meeting_link', sql.NVarChar, '')
        .input('source', sql.NVarChar, 'suggested_task')
        .query(`
          INSERT INTO events 
            (user_uuid,title,description,start_time,end_time,recurring_rule,location,meeting_link,source,created_at,updated_at)
          OUTPUT INSERTED.id
          VALUES 
            (@user_uuid,@title,@description,@start_time,@end_time,@recurring_rule,@location,@meeting_link,@source,SYSUTCDATETIME(),SYSUTCDATETIME())
        `);
      assigned_event_id = insertEvtRes.recordset[0].id;
    }*/

    // Tạo task
    const taskRequest = new sql.Request(transaction);
    const insertTaskRes = await taskRequest
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, description)
      .input('deadline', sql.DateTime2, deadline)
      .input('priority', sql.NVarChar, priority)
      .input('estimated_duration', sql.Int, estimated_duration)
      .input('status', sql.NVarChar, status)
      //.input('assigned_event_id', sql.Int, assigned_event_id)
      .query(`
        INSERT INTO tasks
          (user_uuid,title,description,deadline,priority,estimated_duration,status,created_at,updated_at)
        OUTPUT INSERTED.*
        VALUES
          (@user_uuid,@title,@description,@deadline,@priority,@estimated_duration,@status,SYSUTCDATETIME(),SYSUTCDATETIME())
      `);

    const createdTask = insertTaskRes.recordset[0];

    //Notification
    const notifReq = new sql.Request(transaction);

    // Reminder 1h trước deadline (nếu deadline còn cách >1h)
    const reminderTime = new Date(deadline);
    reminderTime.setHours(reminderTime.getHours() - 1);

    if (reminderTime > new Date()) {
      await notifReq
        .input('user_uuid', sql.UniqueIdentifier, user_uuid)
        .input('task_id', sql.Int, createdTask.id)
        .input('type', sql.NVarChar, 'reminder')
        .input('channel', sql.NVarChar, 'app')
        .input('scheduled_time', sql.DateTime2, reminderTime)
        .input('payload', sql.NVarChar, JSON.stringify({
          message: `Task "${title}" sắp đến hạn vào ${deadline}`
        }))
        .query(`
          INSERT INTO notifications (user_uuid, task_id, type, channel, scheduled_time, status, payload, created_at, updated_at)
          VALUES (@user_uuid, @task_id, @type, @channel, @scheduled_time, 'pending', @payload, SYSUTCDATETIME(), SYSUTCDATETIME())
        `);
    }

    // Overdue (đúng deadline)
    await notifReq
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .input('task_id', sql.Int, createdTask.id)
      .input('type', sql.NVarChar, 'overdue')
      .input('channel', sql.NVarChar, 'app')
      .input('scheduled_time', sql.DateTime2, deadline)
      .input('payload', sql.NVarChar, JSON.stringify({
        message: `Task "${title}" đã đến hạn!`
      }))
      .query(`
        INSERT INTO notifications (user_uuid, task_id, type, channel, scheduled_time, status, payload, created_at, updated_at)
        VALUES (@user_uuid, @task_id, @type, @channel, @scheduled_time, 'pending', @payload, SYSUTCDATETIME(), SYSUTCDATETIME())
      `);

    // Insert notifications (nếu có)
    if(notifications){
      const channels = [];
      if (notifications.email) channels.push('email');
      if (notifications.push) channels.push('push');

      for (const ch of channels) {
        await transaction.request()
          .input('user_uuid', sql.UniqueIdentifier, user_uuid)
          .input('task_id', sql.Int, createdTask.id)
          .input('channel', sql.NVarChar, ch)
          .input('scheduled_time', sql.DateTime2, deadline) // ví dụ: nhắc vào deadline
          .query(`
            INSERT INTO notifications (user_uuid, task_id, channel, scheduled_time, status, created_at, updated_at)
            VALUES (@user_uuid, @task_id, @channel, @scheduled_time, 'pending', SYSUTCDATETIME(), SYSUTCDATETIME())
          `);
      }
    }


    await transaction.commit();

    /*res.status(201).json({
      task: createdTask,
      suggestion: suggestion
        ? { start: suggestion.start.toISOString(), end: suggestion.end.toISOString() }
        : null,
      assigned_event_id
    });*/
    res.status(201).json({
      task: createdTask,
    });
  } catch (err) {
    if (transaction._aborted === false) {
  await transaction.rollback();
}

    console.error('createTask error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}

export async function listTasks(req, res) {
  try {
    const user_uuid = req.user.uuid;
    const { status, priority, limit = 50, offset = 0 } = req.query;

    const filters = ['user_uuid = @user_uuid'];
    const request = (await getPool()).request()
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .input('offset', sql.Int, parseInt(offset, 10))
      .input('limit', sql.Int, parseInt(limit, 10));

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
      filters.push('status = @status');
      request.input('status', sql.NVarChar, status);
    }

    if (priority) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: 'Invalid priority filter' });
      }
      filters.push('priority = @priority');
      request.input('priority', sql.NVarChar, priority);
    }

    const q = `
      SELECT * FROM tasks
      WHERE ${filters.join(' AND ')}
      ORDER BY deadline ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const result = await request.query(q);
    res.json(result.recordset);
  } catch (e) {
    console.error('listTasks error:', e);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
}

export async function updateTask(req, res) {
  const txPool = await getPool();
  const transaction = new sql.Transaction(txPool);

  try {
    const { id } = req.params;
    const {
      title,
      description = '',
      deadline,
      priority,
      status = 'todo',
      // hỗ trợ cả 2 kiểu payload từ frontend
      notifications           // { app: true/false, email: ..., push: ... }
    } = req.body;

    const user_uuid = req.user.uuid;

    // validate cơ bản cho fields chính
    const errors = validateTaskInput({ title, deadline, priority, status });
    if (errors.length) return res.status(400).json({ errors });


    await transaction.begin();

    // 1) Update task
    const updRes = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, description)
      .input('deadline', sql.DateTime2, deadline)
      .input('priority', sql.NVarChar, priority)
      .input('status', sql.NVarChar, status)
      .query(`
        UPDATE tasks
        SET title = @title,
            description = @description,
            deadline = @deadline,
            priority = @priority,
            status = @status,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND user_uuid = @user_uuid;

        SELECT @@ROWCOUNT AS affected;
      `);

    if (!updRes.recordset?.[0]?.affected) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Task not found or not authorized' });
    }

    // 2) Lấy các notifications hiện có của task
    const existingRes = await new sql.Request(transaction)
      .input('task_id', sql.Int, id)
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .query(`
        SELECT id, channel, status
        FROM notifications
        WHERE task_id = @task_id AND user_uuid = @user_uuid
      `);

    const existing = existingRes.recordset || [];
    const existingSet = new Set(existing.map(r => r.channel));
let desiredChannels = [];
if (notifications) {
  if (notifications.email) desiredChannels.push('email');
  if (notifications.push) desiredChannels.push('push');
}

    // 3) Xoá các kênh bị bỏ chọn (chỉ xoá bản ghi còn chờ gửi)
    for (const ch of existingSet) {
      if (!desiredChannels.includes(ch)) {
        await new sql.Request(transaction)
          .input('task_id', sql.Int, id)
          .input('user_uuid', sql.UniqueIdentifier, user_uuid)
          .input('channel', sql.NVarChar, ch)
          .query(`
            DELETE FROM notifications
            WHERE task_id = @task_id
              AND user_uuid = @user_uuid
              AND channel = @channel
          `);
      }
    }

    // 4) Thêm mới hoặc cập nhật scheduled_time cho kênh còn giữ
    for (const ch of desiredChannels) {
      if (!existingSet.has(ch)) {
        // thêm mới
        await new sql.Request(transaction)
          .input('user_uuid', sql.UniqueIdentifier, user_uuid)
          .input('task_id', sql.Int, id)
          .input('channel', sql.NVarChar, ch)
          .input('scheduled_time', sql.DateTime2, deadline)
          .query(`
            INSERT INTO notifications
              (user_uuid, task_id, channel, scheduled_time, status, payload, created_at, updated_at)
            VALUES
              (@user_uuid, @task_id, @channel, @scheduled_time, 'todo',
               JSON_QUERY(CONCAT('{"type":"task","taskId":', @task_id, '}')),
               SYSUTCDATETIME(), SYSUTCDATETIME())
          `);
      } else {
        // cập nhật thời điểm gửi cho bản ghi còn chờ
        await new sql.Request(transaction)
          .input('task_id', sql.Int, id)
          .input('user_uuid', sql.UniqueIdentifier, user_uuid)
          .input('channel', sql.NVarChar, ch)
          .input('scheduled_time', sql.DateTime2, deadline)
          .query(`
            UPDATE notifications
            SET scheduled_time = @scheduled_time,
                updated_at = SYSUTCDATETIME()
            WHERE task_id = @task_id
              AND user_uuid = @user_uuid
              AND channel = @channel
              AND status IN ('todo')
          `);
      }
    }

    await transaction.commit();
    return res.json({ message: 'Task updated' });
  } catch (err) {
    if (transaction._aborted === false) {
      try { await transaction.rollback(); } catch {}
    }
    console.error('updateTask error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}


export async function deleteTask(req, res) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    const { id } = req.params;
    const user_uuid = req.user.uuid;

    await transaction.begin();

    // 1) Xoá notifications trước
    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .query(`
        DELETE FROM notifications
        WHERE task_id = @id AND user_uuid = @user_uuid
      `);

    // 2) Xoá task
    const result = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .query(`
        DELETE FROM tasks
        WHERE id = @id AND user_uuid = @user_uuid
      `);

    if (result.rowsAffected[0] === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Task not found or not authorized' });
    }

    await transaction.commit();
    return res.status(204).send();
  } catch (err) {
    if (transaction._aborted === false) {
      try { await transaction.rollback(); } catch {}
    }
    console.error('deleteTask error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}


export async function getTaskById(req, res) {
  try {
    const { id } = req.params;
    const user_uuid = req.user.uuid;

    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .query(`SELECT * FROM tasks WHERE id = @id AND user_uuid = @user_uuid`);

    if (!result.recordset.length) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = result.recordset[0];
    // Lấy notifications
    const notifRes = await pool.request()
      .input('task_id', sql.Int, id)
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .query(`SELECT channel FROM notifications WHERE task_id = @task_id AND user_uuid = @user_uuid`);

    const notifications = {
      app: notifRes.recordset.some(n => n.channel === 'app'),
      email: notifRes.recordset.some(n => n.channel === 'email'),
      push: notifRes.recordset.some(n => n.channel === 'push'),
    };

    res.json({ ...task, notifications });
  } catch (err) {
    console.error('getTaskById error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}

export async function updateTaskStatus(req, res) {
  const { status } = req.body;
  const { id } = req.params;
  const user_uuid = req.user.uuid;

  if (!['todo', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const pool = await getPool();
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin();

    // 1. Update task
    const updateRes = await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .input('status', sql.NVarChar, status)
      .query(`
        UPDATE tasks
        SET status = @status, updated_at = SYSUTCDATETIME()
        WHERE id = @id AND user_uuid = @user_uuid;
      `);

    // MSSQL driver không trả @@ROWCOUNT → dùng rowsAffected
    if (updateRes.rowsAffected[0] === 0) {
      throw new Error('Task not found or permission denied');
    }

    // 2. Nếu done → freeze
    if (status === 'done') {
      await new sql.Request(tx)
        .input('task_id', sql.Int, id)
        .input('user_uuid', sql.UniqueIdentifier, user_uuid)
        .query(`
          UPDATE notifications
          SET status = 'frozen', updated_at = SYSUTCDATETIME()
          WHERE task_id = @task_id
            AND user_uuid = @user_uuid
            AND status = 'pending';
        `);
    }

    // 3. Nếu todo → revive
    if (status === 'todo') {
      await new sql.Request(tx)
        .input('task_id', sql.Int, id)
        .input('user_uuid', sql.UniqueIdentifier, user_uuid)
        .query(`
          UPDATE notifications
          SET status = 'pending', updated_at = SYSUTCDATETIME()
          WHERE task_id = @task_id
            AND user_uuid = @user_uuid
            AND status = 'frozen'
            AND scheduled_time > SYSUTCDATETIME();
        `);
    }

    await tx.commit();
    res.json({ success: true, status });
  } catch (err) {
    if (tx._aborted === false) await tx.rollback();
    console.error('updateTaskStatus error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}

