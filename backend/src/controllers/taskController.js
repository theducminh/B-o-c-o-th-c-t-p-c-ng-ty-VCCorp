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
      status = 'todo'
    } = req.body;
    const user_uuid = req.user.uuid;

    const errors = validateTaskInput({ title, deadline, priority, status });
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
    await transaction.rollback();
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
  try {
    const { id } = req.params;
    const { title, description, deadline, priority, status } = req.body;
    const user_uuid = req.user.uuid;

    const errors = validateTaskInput({ title, description, deadline, priority, status });
    if (errors.length) return res.status(400).json({ errors });

    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, description || '')
      .input('deadline', sql.DateTime2, deadline)
      .input('priority', sql.NVarChar, priority)
      .input('status', sql.NVarChar, status)
      .query(`
        UPDATE tasks
        SET title=@title, description=@description, deadline=@deadline,
            priority=@priority, status=@status, updated_at=GETUTCDATE()
        WHERE id=@id AND user_uuid=@user_uuid
      `);

    res.json({ message: 'Task updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
}

export async function deleteTask(req, res) {
  try {
    const { id } = req.params;
    const user_uuid = req.user.uuid;

    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('user_uuid', sql.UniqueIdentifier, user_uuid)
      .query(`DELETE FROM tasks WHERE id = @id AND user_uuid = @user_uuid`);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Task not found or not authorized' });
    }

    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('deleteTask error:', err);
    res.status(500).json({ error: 'Internal error' });
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

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('getTaskById error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
