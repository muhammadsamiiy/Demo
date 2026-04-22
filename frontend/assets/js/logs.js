// â”€â”€â”€ LOGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let allLogs = [];

async function loadLogs() {
  try {
    const res = await fetch(`${API}/logs`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to load logs');
    allLogs = await res.json();
    populateLogUserFilter();
    renderLogsTable(allLogs);
  } catch { showToast('Could not load logs','error'); }
}

function populateLogUserFilter() {
  const users = [...new Set(allLogs.map(l => l.user))].sort();
  const sel = document.getElementById('log-user-filter');
  sel.innerHTML = '<option value="">All users</option>';
  users.forEach(u => {
    sel.innerHTML += `<option value="${u}">${u}</option>`;
  });
}

function renderLogsTable(logs) {
  const c = document.getElementById('logs-table-container');
  const datetimems = new Date().toLocaleString('sv-SE').replace(' ', ' ') + ':' + String(new Date().getMilliseconds()).padStart(3,'0');
  if (!logs.length) { c.innerHTML = '<div class="loading">No logs found.</div>'; return; }

  c.innerHTML = `<table><thead><tr>
    <th>Timestamp</th><th>User</th><th>Action</th><th>Resource</th><th>Details</th>
  </tr></thead><tbody>${logs.map(l => `
    <tr>
      <td>${datetimems}</td>
      <td>${l.user}</td>
      <td><span class="status-badge badge-new">${l.action}</span></td>
      <td>${l.resourceType} ${l.resourceId || ''}</td>
      <td>${l.details || ''}</td>
    </tr>
  `).join('')}</tbody></table>`;
}

function filterLogs() {
  const user = document.getElementById('log-user-filter').value;
  const search = document.getElementById('log-search').value.toLowerCase();

  let filtered = allLogs;
  if (user) filtered = filtered.filter(l => l.user === user);
  if (search) {
    filtered = filtered.filter(l =>
      l.action.toLowerCase().includes(search) ||
      l.details?.toLowerCase().includes(search) ||
      l.resourceType?.toLowerCase().includes(search) ||
      l.resourceId?.toLowerCase().includes(search)
    );
  }

  renderLogsTable(filtered);
}

