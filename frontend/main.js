const API_BASE = 'http://localhost:4000';
const API_PREFIX = API_BASE + '/api';

function getJWT() {
  return localStorage.getItem('jwt');
}

function authHeaders() {
  const t = getJWT();
  return t ? { Authorization: 'Bearer ' + t } : {};
}



// Week calculation
function getStartOfWeek(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - day);
  dt.setHours(0,0,0,0);
  return dt;
}
let weekStart = getStartOfWeek(new Date());
function formatWeekLabel(start) {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts = { day: '2-digit', month: 'short' };
  return `${start.toLocaleDateString('vi-VN', opts)} – ${end.toLocaleDateString('vi-VN', opts)}`;
}
function updateWeekLabel() {
  document.getElementById('week-label').textContent = formatWeekLabel(weekStart);
}

// Populate hours
function renderHours() {
  const container = document.getElementById('hours-container');
  container.innerHTML = '';
  for (let i=0;i<24;i++) {
    const div = document.createElement('div');
    div.className = 'hour-row text-[10px] flex items-start justify-end pr-1 border-b';
    div.textContent = `${i}:00`;
    container.appendChild(div);
  }
}

// Calendar events fetch
async function fetchWeekEvents() {
  if (!getJWT()) return;
  updateWeekLabel();

  // clear previous events
  document.querySelectorAll('[data-day-offset]').forEach(c => {
    c.querySelectorAll('.event-block, .suggestion-badge').forEach(n => n.remove());
  });

  const from = weekStart.toISOString();
  const toD = new Date(weekStart);
  toD.setDate(toD.getDate() + 7);

  try {
    const res = await fetch(`${API_PREFIX}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(toD.toISOString())}`, {
      headers: { ...authHeaders() }
    });

    if (!res.ok) throw new Error('Failed events');
    const events = await res.json();

    const headerHeight = 20; // px, chiều cao header ngày
    const hourHeight = 50;   // px / 1h
    const calendarStartHour = 0; // nếu muốn bỏ giờ ban đêm thì đổi số này

    events.forEach(ev => {
      const start = new Date(ev.start_time);
      const end = new Date(ev.end_time);
      const dayIdx = Math.floor((start - weekStart) / (1000 * 60 * 60 * 24));
      if (dayIdx < 0 || dayIdx > 6) return;

      const cell = document.querySelector(`[data-day-offset="${dayIdx}"]`);
      if (!cell) return;

      const startHour = start.getHours() + start.getMinutes() / 60;
      const durationH = (end - start) / (1000 * 60 * 60);

      // tính top và height, cộng headerHeight để event nằm dưới header
      const topPx = headerHeight + (startHour - calendarStartHour) * hourHeight;
      const heightPx = Math.max(durationH * hourHeight, 30);

      const evDiv = document.createElement('div');
      evDiv.className = 'event-block bg-indigo-500 text-white cursor-pointer absolute left-0 right-0';
      evDiv.style.top = `${topPx}px`;
      evDiv.style.height = `${heightPx - 2}px`;
      evDiv.innerHTML = `
        <div class="font-semibold truncate">${ev.title}</div>
        <div class="text-[9px]">
          ${start.getHours()}:${String(start.getMinutes()).padStart(2,'0')} - 
          ${end.getHours()}:${String(end.getMinutes()).padStart(2,'0')}
        </div>
      `;

      evDiv.addEventListener('click', () => openEditEventPanel(ev));
      cell.appendChild(evDiv);
    });
  } catch (e) {
    console.error(e);
  }
}


// Create event
document.getElementById('create-event')?.addEventListener('click', async () => {
  const title = document.getElementById('event-title').value.trim();
  const start = document.getElementById('event-start').value;
  const end = document.getElementById('event-end').value;
  const description = document.getElementById('event-description').value.trim();
  const location = document.getElementById('event-location').value.trim();
  const link = document.getElementById('event-link').value.trim();
  const recurring_rule = document.getElementById('event-recurring').value;
  const feedback = document.getElementById('event-feedback');
  feedback.textContent = '';
  if (!title || !start || !end) {
    feedback.textContent = 'Tiêu đề, thời gian bắt đầu và thời gian kết thúc là bắt buộc.';
    return;
  }
  try {
    const payload = {
      title,
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      meeting_link: link,
      location,
      description,
      recurring_rule,
    };
    const res = await fetch(`${API_PREFIX}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      feedback.textContent = (data.errors || data.error || 'Tạo thất bại').toString();
      showToast('Tạo sự kiện thất bại 1', 'error');
      return;
    }
    showToast('Tạo sự kiện thành công', 'success');
    document.getElementById('event-panel').classList.add('hidden');
    fetchWeekEvents();
    resetEventPanel();
  } catch (e) {
    console.error(e);
    feedback.textContent = 'Lỗi kết nối';
  }
});

//Update event

async function saveEvent() {
  const eventId = document.getElementById('event-id').value;
  const title = document.getElementById('event-title').value.trim();
  const start = document.getElementById('event-start').value;
  const end = document.getElementById('event-end').value;
  const description = document.getElementById('event-description').value.trim();
  const location = document.getElementById('event-location').value.trim();
  const link = document.getElementById('event-link').value.trim();
  const recurring_rule = document.getElementById('event-recurring').value;
  const feedback = document.getElementById('event-feedback');
  feedback.textContent = '';
  if (!title || !start || !end) {
    feedback.textContent = 'Tiêu đề, thời gian bắt đầu và thời gian kết thúc là bắt buộc.';
    return;
  }
  if(!eventId) {
    feedback.textContent = 'Không có ID sự kiện để cập nhật.';
    showToast('Không có ID sự kiện để cập nhật', 'error');
    return;
  }

  try {
    const payload = {
      title,
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      meeting_link: link,
      location,
      description,
      recurring_rule,
    };
    console.log('Saving event', payload);

    const res = await fetch(`${API_PREFIX}/events/${eventId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      feedback.textContent = (data.errors || data.error || 'Cập nhật thất bại').toString();
      showToast('Cập nhật sự kiện thất bại', 'error');
      return;
    }
    showToast('Cập nhật sự kiện thành công', 'success');
    document.getElementById('event-panel').classList.add('hidden');
    fetchWeekEvents();
    resetEventPanel();
  } catch (e) {
    console.error(e);
    feedback.textContent = 'Lỗi kết nối';
  }
};

// Delete event
async function deleteEvent() {
  const eventId = document.getElementById('event-id').value;
  if (!eventId) {
    document.getElementById('event-feedback').textContent = 'Không có ID sự kiện để xoá.';
    showToast('Không có ID sự kiện để xoá', 'error'); 
    return;
  } 
  try {
    const res = await fetch(`${API_PREFIX}/events/${eventId}`, {
      method: 'DELETE',
      headers: { ...authHeaders() }
    });
    if (!res.ok) {
      const data = await res.json();
      document.getElementById('event-feedback').textContent = (data.errors || data.error || 'Xoá thất bại').toString();
      showToast('Xoá sự kiện thất bại', 'error');
      return;
    }
    showToast('Xoá sự kiện thành công', 'success');
    document.getElementById('event-panel').classList.add('hidden');
    fetchWeekEvents();
    resetEventPanel();
  } catch (e) {
    console.error(e);
    document.getElementById('event-feedback').textContent = 'Lỗi kết nối';
  }
}

// Show edit event panel
function openEditEventPanel(event) {
  document.getElementById('event-panel').classList.remove('hidden');
  document.getElementById('event-id').value = event.id || '';
  document.getElementById('event-title').value = event.title;
  document.getElementById('event-start').value = event.start_time.slice(0,16);
  document.getElementById('event-end').value = event.end_time.slice(0,16);
  document.getElementById('event-link').value = event.meeting_link || '';
  document.getElementById('event-location').value = event.location || '';
  document.getElementById('event-description').value = event.description || '';
  document.getElementById('event-recurring').value = event.recurring_rule || 'none';

  document.getElementById('save-event').classList.remove('hidden');
  document.getElementById('delete-event').classList.remove('hidden');
  document.getElementById('create-event').classList.add('hidden');

  document.getElementById('e-event').textContent = 'Sửa sự kiện';

  document.getElementById('event-feedback').textContent = '';
};


function resetEventPanel() {
  document.getElementById('event-id').value = '';
  document.getElementById('event-title').value = '';
  document.getElementById('event-start').value = '';
  document.getElementById('event-end').value = '';
  document.getElementById('event-location').value = '';
  document.getElementById('event-link').value = '';
  document.getElementById('event-description').value = '';

  document.getElementById('save-event').classList.add('hidden');
  document.getElementById('delete-event').classList.add('hidden');
  document.getElementById('create-event').classList.remove('hidden');

  document.getElementById('event-feedback').textContent = '';
}

function resetTaskPanel() {
  document.getElementById('task-id').value = '';
  document.getElementById('task-title').value = '';
  document.getElementById('task-description').value = ''; 
  document.getElementById('task-deadline').value = '';
  document.getElementById('task-priority').value = 'normal';
  document.getElementById('notify-app').checked = true;
  document.getElementById('notify-email').checked = false;  
  document.getElementById('notify-push').checked = false;
  document.getElementById('task-feedback').textContent = '';
  document.getElementById('task-panel')?.classList.add('hidden');

   // Hiện lại nút tạo, ẩn nút lưu
  document.getElementById('create-task').classList.remove('hidden');
  document.getElementById('save-task').classList.add('hidden');

  // Bỏ gán sự kiện cũ nếu có
  document.getElementById('save-task').onclick = null;
}


async function fetchTasks() {
  if (!getJWT()) return;
  const status = document.getElementById('filter-status').value;
  const priority = document.getElementById('filter-priority').value;
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (priority) params.append('priority', priority);

  try {
    const res = await fetch(`${API_PREFIX}/tasks?${params.toString()}`, {
      headers: { ...authHeaders() }
    });
    if (!res.ok) throw new Error('failed tasks');
    const tasks = await res.json();

    const list = document.getElementById('task-list');
    list.innerHTML = '';
    document.querySelectorAll('.task-block').forEach(el => el.remove());

    if (Array.isArray(tasks) && tasks.length) {
      tasks.forEach(t => {
        // ===== Hiển thị ở sidebar =====
        const d = document.createElement('div');
        d.className = 'border rounded p-2 flex justify-between bg-gray-50 items-start gap-2';
        d.innerHTML = `
          <div class="flex-1">
            <div class="font-medium">${t.title}</div>
            <div class="text-[10px] text-gray-600">Deadline: ${new Date(t.deadline).toLocaleString()}</div>
            <div class="text-[10px] mt-1"><span class="px-2 py-0.5 bg-yellow-100 rounded">${t.priority}</span></div>
            <div class="text-[9px] text-red-500 mt-0.5 italic">
      ${t.urgency === 'urgent' ? 'Khẩn cấp' : 'Không khẩn cấp'} · 
      ${t.importance === 'important' ? ' Quan trọng' : 'Không quan trọng'}
    </div>
          </div>
          <div class="flex flex-col gap-1 text-xs">
            <button class="edit-task text-blue-600 underline" data-id="${t.id}">Sửa</button>
            <button class="delete-task text-red-600 underline" data-id="${t.id}">Xoá</button>
            <button class="toggle-complete underline" data-id="${t.id}" data-status="${t.status}">
  ${t.status === 'done' 
    ? '<span class="text-green-600">Đã hoàn thành</span>' 
    : '<span class="text-gray-600">Chưa hoàn thành</span>'}
</button>
          </div>
        `;
        list.appendChild(d);

        // ===== Auto dán lên lịch nếu trong tuần =====
        const deadline = new Date(t.deadline);
        const weekStartDate = new Date(weekStart);
        const weekEndDate = new Date(weekStart);
        weekEndDate.setDate(weekEndDate.getDate() + 7);

        if (deadline >= weekStartDate && deadline < weekEndDate) {
          const dayIdx = Math.floor((deadline - weekStartDate) / (1000 * 60 * 60 * 24));
          const cell = document.querySelector(`[data-day-offset="${dayIdx}"]`);
          if (cell) {
            cell.style.position = 'relative';
            const startHour = deadline.getHours() + deadline.getMinutes() / 60;
            const topPx = startHour * 50; // 50px/h
            const heightPx = 50;

            const taskDiv = document.createElement('div');
            taskDiv.className = 'task-block bg-yellow-400 text-black cursor-pointer border border-yellow-500 rounded absolute left-[2px] right-[2px]';
            taskDiv.dataset.taskId = t.id;
            taskDiv.style.top = `${topPx}px`;
            taskDiv.style.height = `${heightPx - 2}px`;
            taskDiv.innerHTML = `
              <div class="font-semibold truncate">${t.title}</div>
              <div class="text-[9px]">Deadline: ${deadline.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            `;
            cell.appendChild(taskDiv);
          }
        }
      });

      // ===== Sửa =====
      document.querySelectorAll('.edit-task').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          await loadTaskForEdit(e.target.dataset.id);
        });
      });

      // ===== Xoá =====
      document.querySelectorAll('.delete-task').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const taskId = e.target.dataset.id;
          if (confirm('Bạn có chắc muốn xoá task này?')) {
            await deleteTask(taskId);
            document.querySelectorAll(`.task-block[data-task-id="${taskId}"]`).forEach(el => el.remove());
            fetchTasks();
          }
        });
      });

      // ===== Toggle hoàn thành =====
document.querySelectorAll('.toggle-complete').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const taskId = e.target.closest('button').dataset.id;
    const currentStatus = e.target.closest('button').dataset.status;
    const newStatus = currentStatus === 'done' ? 'todo' : 'done';

    try {
      const res = await fetch(`${API_PREFIX}/tasks/${taskId}/status`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error('Failed to update task status');
      showToast(
        newStatus === 'done' ? 'Đã đánh dấu hoàn thành' : 'Đã chuyển về chưa hoàn thành',
        'success'
      );
      fetchTasks();
    } catch (err) {
      console.error(err);
      showToast('Có lỗi khi cập nhật task', 'error');
    }
  });
});


    } else {
      list.innerHTML = '<div class="text-gray-500 text-xs">Không có task</div>';
    }
  } catch (e) {
    console.error(e);
  }
}

async function pasteTaskToCalendar(taskId) {
  try {
    const res = await fetch(`${API_PREFIX}/tasks/${taskId}`, {
      headers: { ...authHeaders() }
    });
    if (!res.ok) throw new Error('Không lấy được task');
    const task = await res.json();

    const deadline = new Date(task.deadline);
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekStart);
    weekEndDate.setDate(weekEndDate.getDate() + 7);

    if (deadline < weekStartDate || deadline >= weekEndDate) {
      console.warn(`Task ${taskId} không nằm trong tuần hiện tại`);
      return;
    }

    const dayIdx = Math.floor((deadline - weekStartDate) / (1000 * 60 * 60 * 24));
    const cell = document.querySelector(`[data-day-offset="${dayIdx}"]`);
    if (!cell) return;

    cell.style.position = 'relative';
    const startHour = deadline.getHours() + deadline.getMinutes() / 60;
    const topPx = startHour * 50; // 50px/h
    const heightPx = 50;

    // Xoá block cũ
    document.querySelectorAll(`.task-block[data-task-id="${taskId}"]`).forEach(el => el.remove());

    const taskDiv = document.createElement('div');
    taskDiv.className = 'task-block bg-yellow-400 text-black cursor-pointer border border-yellow-500 rounded absolute left-[2px] right-[2px]';
    taskDiv.dataset.taskId = task.id;
    taskDiv.style.top = `${topPx}px`;
    taskDiv.style.height = `${heightPx - 2}px`;
    taskDiv.innerHTML = `
      <div class="font-semibold truncate">${task.title}</div>
      <div class="text-[9px]">Deadline: ${deadline.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
    `;
    cell.appendChild(taskDiv);

  } catch (err) {
    console.error(err);
    showToast('Lỗi khi dán task vào lịch', 'error');
  }
}







// Create task
document.getElementById('create-task')?.addEventListener('click', async () => {
  const title = document.getElementById('task-title').value.trim();
  const description = document.getElementById('task-description').value.trim();
  const deadline = document.getElementById('task-deadline').value;
  const priority = document.getElementById('task-priority').value;
  const notifyApp = document.getElementById('notify-app').checked;
  const notifyEmail = document.getElementById('notify-email').checked;
  const notifyPush = document.getElementById('notify-push').checked;
  const feedback = document.getElementById('task-feedback');
  feedback.textContent = '';
  if (!title || !deadline) {
    feedback.textContent = 'Tiêu đề và deadline là bắt buộc.';
    return;
  }
  try {
    const payload = {
      title,
      description: '',
      deadline: new Date(deadline).toISOString(),
      priority,
      estimated_duration: 60,
      status: 'todo',
      notifications: { app: notifyApp, email: notifyEmail, push: notifyPush }
    };
    const res = await fetch(`${API_PREFIX}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      feedback.textContent = (data.errors || data.error || 'Tạo thất bại').toString();
      showToast('Tạo task thất bại', 'error');
      return;
    }
    showToast('Tạo task thành công', 'success');

    if (data.suggestion) {
      document.getElementById('suggestion-box').classList.remove('hidden');
      document.getElementById('suggestion-content').textContent =
        `${new Date(data.suggestion.start).toLocaleString()} → ${new Date(data.suggestion.end).toLocaleString()}`;
      document.getElementById('apply-suggestion').onclick = async () => {
          if (data.assigned_event_id) {
          showToast('Slot gợi ý đã được tạo vào lịch', 'success');
          fetchWeekEvents();
        }
      };
    }
    
    fetchTasks();
    resetTaskPanel();
  } catch (e) {
    console.error(e);
    feedback.textContent = 'Lỗi kết nối';
  }
});

async function loadTaskForEdit(taskId) {
  try {
    const res = await fetch(`${API_PREFIX}/tasks/${taskId}`, {
      headers: { ...authHeaders() }
    });
    if (!res.ok) throw new Error('Không lấy được dữ liệu task');
    const task = await res.json();

    // Đổ dữ liệu lên form
    document.getElementById('task-id').value = task.id;
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-description').value = task.description;
    document.getElementById('task-deadline').value = task.deadline?.slice(0, 16);
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('notify-app').checked = task.notifications?.app || false;
    document.getElementById('notify-email').checked = task.notifications?.email || false;
    document.getElementById('notify-push').checked = task.notifications?.push || false;

    // Mở panel nếu đang ẩn
    document.getElementById('task-panel')?.classList.remove('hidden');

    // Cập nhật lại nút tạo thành nút "Cập nhật"
    const ttitle = document.getElementById('t-title');
    ttitle.textContent = 'Cập nhật Task';

    const saveBtn = document.getElementById('save-task');
    saveBtn.classList.remove('hidden');
    document.getElementById('create-task').classList.add('hidden');

    saveBtn.onclick = async () => {
      await updateTask(taskId);
    };

  } catch (e) {
    console.error(e);
    showToast('Không thể tải task để sửa', 'error');
  }
}

async function deleteTask(taskId) {
  try {
    const res = await fetch(`${API_PREFIX}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { ...authHeaders() }
    });
    if (!res.ok) {
      showToast('Xoá task thất bại', 'error');
    } else {
      showToast('Xoá task thành công', 'success');
    }
  } catch (e) {
    console.error(e);
    showToast('Lỗi kết nối khi xoá task', 'error');
  }
}

async function updateTask(taskId) {
  const title = document.getElementById('task-title').value.trim();
  const description = document.getElementById('task-description').value.trim();
  const deadline = document.getElementById('task-deadline').value;
  const priority = document.getElementById('task-priority').value;
  const notifyApp = document.getElementById('notify-app').checked;
  const notifyEmail = document.getElementById('notify-email').checked;
  const notifyPush = document.getElementById('notify-push').checked;
  const feedback = document.getElementById('task-feedback');
  feedback.textContent = '';

  if (!title || !deadline) {
    feedback.textContent = 'Tiêu đề và deadline là bắt buộc.';
    return;
  }

  try {
    const payload = {
      title,
      description,
      deadline: new Date(deadline).toISOString(),
      priority,
      notifications: { app: notifyApp, email: notifyEmail, push: notifyPush }
    };
    const res = await fetch(`${API_PREFIX}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error('Update failed', res.status, res.statusText);
      showToast('Cập nhật task thất bại', 'error');
      return;
    }
    showToast('Cập nhật task thành công', 'success');
    fetchTasks();
    resetTaskPanel();
  } catch (e) {
    console.error(e);
    showToast('Lỗi khi cập nhật task', 'error');
  }
}

function showToast(msg, type='info') {
  const colors = {
    info: 'bg-blue-100 border-blue-500 text-blue-800',
    success: 'bg-green-100 border-green-500 text-green-800',
    error: 'bg-red-100 border-red-500 text-red-800'
  };
  let container = document.getElementById('toast-container');

  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed top-4 right-4 space-y-2 z-50';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = `border-l-4 p-3 rounded shadow flex justify-between items-center ${colors[type]}`;
  el.innerHTML = `<div class="text-sm">${msg}</div><button class="ml-2 font-bold">&times;</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

async function fetchHistory() {
  const listEl = document.getElementById("historyList");
  listEl.innerHTML = "";
  if (notificationHistory.length === 0) {
    listEl.innerHTML = `<p class="text-gray-500 text-sm">Chưa có thông báo</p>`;
    return;
  }

  notificationHistory.forEach(h => {
    const item = document.createElement("div");
    item.className = "p-2 border rounded-lg bg-gray-50";
    item.innerHTML = `<div class="text-sm">${h.msg}</div><div class="text-xs text-gray-400">${h.time}</div>`;
    listEl.appendChild(item);
  });
}


async function fetchTodayNotifications() {
  try {
    const res = await fetch(`${API_PREFIX}/notifications/today`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error("Fetch today notifications failed");

    const notis = await res.json();
    if (!Array.isArray(notis) || notis.length === 0) return;

    // Hiển thị từng notification trong ngày
    notis.forEach(showInAppNotification);

  } catch (err) {
    console.error("fetchTodayNotifications error:", err);
  }
}


function saveHistory() {
  try {
    localStorage.setItem('notificationHistory', JSON.stringify(notificationHistory));
  } catch {}
}


function loadHistory() {
  const saved = localStorage.getItem("notificationHistory");
  if (saved) {
    notificationHistory.splice(0, notificationHistory.length, ...JSON.parse(saved));
  }
}
const notificationHistory = (() => {
  try {
    const saved = localStorage.getItem('notificationHistory');
    const arr = saved ? JSON.parse(saved) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
})();


function showInAppNotification(n) {
  const channel = n.channel || "app";
  const title = n.title || "Thông báo";
  const message = parsePayload(n.payload);

  const msg = `[${channel}] ${title}: ${message}`;
  showToast(msg, "info");

  // lưu lịch sử
  notificationHistory.unshift({
    time: new Date().toLocaleString(),
    msg
  });
  saveHistory();
}


// ---- Notifications helpers ----
function parsePayload(payload) {
  if (typeof payload === "string") {
    try { const p = JSON.parse(payload); return p.message || payload; } catch { return payload; }
  }
  if (payload && typeof payload === "object") return payload.message || "";
  return "";
}

let evtSource;
function connectSSE() {
  if (evtSource || !getJWT()) return;
  evtSource = new EventSource(`${API_PREFIX}/notifications/stream`, { withCredentials: true });
  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("SSE event received:", data);
      showInAppNotification(data);
    } catch (e) {
      console.warn("Bad SSE payload", e);
    }
  };
}
// DOM events
const modal = document.getElementById("historyModal");
const openBtn = document.getElementById("openHistoryBtn");
const closeBtn = document.getElementById("closeHistoryBtn");

openBtn?.addEventListener("click", () => {
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  fetchHistory(); // load lịch sử khi mở
});

closeBtn?.addEventListener("click", () => {
  modal.classList.add("hidden");
  modal.classList.remove("flex");
});


// OAuth login
document.getElementById('btn-google-login').addEventListener('click', () => {
  const w=600,h=700,left=(screen.width-w)/2,top=(screen.height-h)/2;
  const win = window.open(`${API_PREFIX}/auth/google`, 'oauth', `width=${w},height=${h},top=${top},left=${left}`);
  const handler = (e) => {
    if (e.data?.token) {
      localStorage.setItem('jwt', e.data.token);
      localStorage.setItem('user_uuid', e.data.user_uuid);
      if(e.data.email) {
        localStorage.setItem('google_email', e.data.email);
        document.getElementById('user-email').textContent = e.data.email;
      }
      document.getElementById('btn-google-login').classList.add('hidden');
      document.getElementById('user-menu').classList.remove('hidden');
      document.getElementById('btn-logout').classList.remove('hidden');
      showToast('Đăng nhập thành công', 'success');
      // auto sync
      fetch(`${API_PREFIX}/google/sync`, { method: 'POST', headers: { ...authHeaders() } })
        .then(r => {
          if (r.ok) document.getElementById('sync-status').textContent = 'Đã đồng bộ';
        });
      fetchTasks();
      fetchWeekEvents();
      window.removeEventListener('message', handler);
    }
  };
  window.addEventListener('message', handler);
});
// Event listeners for saving and deleting events
document.getElementById('save-event').addEventListener('click', saveEvent);
document.getElementById('delete-event').addEventListener('click', deleteEvent);

// Logout
document.getElementById('btn-logout').addEventListener('click', () => {
  localStorage.removeItem('jwt');
  localStorage.removeItem('user_uuid');
  localStorage.removeItem('google_email');

  // Reset UI
  document.getElementById('btn-google-login').classList.remove('hidden');
  document.getElementById('user-badge').classList.add('hidden');
  document.getElementById('btn-logout').classList.add('hidden');
  document.getElementById('sync-status').textContent = '';

  showToast('Đã đăng xuất', 'info');
});

// Toggle dropdown khi bấm vào user-badge
document.getElementById('user-badge').addEventListener('click', () => {
  document.getElementById('dropdown-menu').classList.toggle('hidden');
});

// Nếu click ra ngoài thì ẩn dropdown



// Navigation
document.getElementById('today-btn').addEventListener('click', () => {
  weekStart = getStartOfWeek(new Date());
  updateWeekLabel();
  fetchWeekEvents();
  fetchTasks();
});
document.getElementById('prev-week').addEventListener('click', () => {
  weekStart.setDate(weekStart.getDate() - 7);
  updateWeekLabel();
  fetchWeekEvents();
  fetchTasks();
});
document.getElementById('next-week').addEventListener('click', () => {
  weekStart.setDate(weekStart.getDate() + 7);
  updateWeekLabel();
  fetchWeekEvents();
  fetchTasks();
});
document.getElementById('apply-filters').addEventListener('click', fetchTasks);
document.getElementById('open-task').addEventListener('click', () => {
  document.getElementById('task-panel').classList.remove('hidden');
  document.getElementById('t-title').textContent = 'Tạo Task';
  document.getElementById('create-task').classList.remove('hidden');
  document.getElementById('save-task').classList.add('hidden');
  
});
document.getElementById('open-event').addEventListener('click', () => {
  document.getElementById('event-panel').classList.remove('hidden');
  document.getElementById('e-event').textContent= 'Tạo Sự Kiện';
});
document.getElementById('close-task').addEventListener('click', () => {
  document.getElementById('task-panel').classList.add('hidden');
});
document.getElementById('close-event').addEventListener('click', () => {
  document.getElementById('event-panel').classList.add('hidden'); 
  resetEventPanel();
  document.getElementById('event-feedback').textContent = '';
});



document.getElementById('btn-sync-calendar').addEventListener('click', async () => {
  if (!getJWT()) {
    showToast('Bạn cần đăng nhập trước', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_PREFIX}/google/sync`, {
      method: 'POST',
      headers: { ...authHeaders() }
    });

    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || 'Đồng bộ thất bại', 'error');
      return;
    }

    showToast('Đồng bộ thành công', 'success');
    document.getElementById('sync-status').textContent = 'Đã đồng bộ';
    fetchWeekEvents(); // refresh lịch
  } catch (err) {
    console.error(err);
    showToast('Lỗi kết nối đến server', 'error');
  }
});

document.querySelectorAll('[data-day-offset]').forEach(dayCol => {
  dayCol.addEventListener('click', (e) => {
    const rect = dayCol.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const hour = Math.floor(offsetY / 50 - 17); // 50px per hour

    const dayOffset = parseInt(dayCol.dataset.dayOffset, 10);
    const start = new Date(weekStart);
    start.setDate(start.getDate() + dayOffset + 1);
    start.setHours(hour, 0, 0, 0);

    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    // Hiển thị form
    document.getElementById('event-panel').classList.remove('hidden');
    document.getElementById('event-title').focus();

    // Điền sẵn giờ bắt đầu/kết thúc
    document.getElementById('event-start').value = start.toISOString().slice(0,16);
    document.getElementById('event-end').value = end.toISOString().slice(0,16);
  });
});

async function refreshSuggestionBadge() {
  if (!getJWT()) return;
  const res = await fetch(`${API_PREFIX}/suggestions/count`, { headers: authHeaders() });
  if (!res.ok) return;
  const { count } = await res.json();
  const badge = document.getElementById('suggest-badge');
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}
// gọi khi login xong và set interval mỗi 10s
setInterval(refreshSuggestionBadge, 5000);

document.getElementById('open-suggestions').addEventListener('click', async ()=>{
  if (!getJWT()) return showToast('Cần đăng nhập', 'error');
  const p = document.getElementById('suggestions-panel');
  p.classList.remove('hidden');
  await loadSuggestions();
});

document.getElementById('close-suggestions').addEventListener('click', ()=>{
  document.getElementById('suggestions-panel').classList.add('hidden');
});

function safeUrl(u) {
  try {
    if (!u) return null;
    // loại bỏ ngoặc kép cong + khoảng trắng/ký tự rác cuối
    const cleaned = String(u).trim().replace(/[“”]/g, '"').replace(/["'<>\s]+$/g, '');
    const url = new URL(cleaned);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {}
  return null;
}

async function loadSuggestions() {
  const res = await fetch(`${API_PREFIX}/suggestions`, { headers: authHeaders() });
  const list = await res.json();
  console.log('Loaded suggestions', list);

  const container = document.getElementById('suggestions-list');
  container.textContent = '';                       
  const frag = document.createDocumentFragment();

  list.forEach((s, i) => {
    try {
      console.log('Render suggestion', i, s);
      console.log('Safe meeting link:', safeUrl(s.meeting_link));
      const card = document.createElement('div');
      card.className = 'border rounded p-3 space-y-2';

      const title = document.createElement('div');
      title.className = 'font-medium';
      title.textContent = s.subject || '(Không tiêu đề)';
      card.appendChild(title);

      const time = document.createElement('div');
      time.className = 'text-sm text-gray-600';
      const startStr = s.start_time ? formatDateTimeLocal(s.start_time) : 'Chưa rõ thời gian';
      const endStr = s.end_time ? ' — ' + formatDateTimeLocal(s.end_time) : '';
      time.textContent = `${startStr}${endStr}`;
      card.appendChild(time);

      const meeting = safeUrl(s.meeting_link);
      if (meeting) {
        const a = document.createElement('a');
        a.className = 'text-blue-600 underline text-sm';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.href = meeting;
        a.textContent = 'Tham gia họp';
        card.appendChild(a);
      }

      const snippet = document.createElement('div');
      snippet.className = 'mt-2 text-sm text-gray-700 line-clamp-3';
      snippet.textContent = s.snippet || '';
      card.appendChild(snippet);

      const actions = document.createElement('div');
      actions.className = 'flex gap-2 mt-2';

      const btnAccept = document.createElement('button');
      btnAccept.dataset.id = s.id;
      btnAccept.dataset.act = 'accept';
      btnAccept.className = 'px-2 py-1 bg-green-500 text-white rounded';
      btnAccept.textContent = 'Chấp nhận';

      const btnDismiss = document.createElement('button');
      btnDismiss.dataset.id = s.id;
      btnDismiss.dataset.act = 'dismiss';
      btnDismiss.className = 'px-2 py-1 bg-gray-400 text-white rounded';
      btnDismiss.textContent = 'Bỏ qua';

      actions.append(btnAccept, btnDismiss);
      card.appendChild(actions);

      frag.appendChild(card);
    } catch (err) {
      console.error('Lỗi render suggestion', i, s, err);
    }
  });

  container.appendChild(frag);

  // Event delegation giữ nguyên
  container.onclick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    if (act === 'accept') {
      const r = await fetch(`${API_PREFIX}/suggestions/${id}/accept`, { method:'POST', headers: authHeaders() });
      if (r.ok) { showToast('Đã tạo sự kiện', 'success'); loadSuggestions(); refreshSuggestionBadge(); fetchWeekEvents(); }
      else showToast('Tạo sự kiện thất bại', 'error');
    } else if (act === 'dismiss') {
      const r = await fetch(`${API_PREFIX}/suggestions/${id}/dismiss`, { method:'POST', headers: authHeaders() });
      if (r.ok) { showToast('Đã bỏ qua', 'info'); loadSuggestions(); refreshSuggestionBadge(); }
    } 
  };
}


function formatDateTimeLocal(dt) {
  if (!dt) return '';
  if (typeof dt === 'number') return new Date(dt).toLocaleString('vi-VN');
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/[“”]/g, "&quot;");
}

document.addEventListener('DOMContentLoaded', () => {
  renderHours();
  updateWeekLabel();

  const token = getJWT();
  const email = localStorage.getItem('google_email');

  if (token) {
    // Ẩn nút login
    document.getElementById('btn-google-login').classList.add('hidden');

    // Hiện user menu + email
    const userMenu = document.getElementById('user-menu');
    const userEmail = document.getElementById('user-email');
    if (email) userEmail.textContent = email;
    userMenu.classList.remove('hidden');

    // Tải dữ liệu
    fetchTasks();
    fetchWeekEvents();
    connectSSE();
    fetchTodayNotifications();
  }
});


