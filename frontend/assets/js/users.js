// USERS --------------------------------------------------------------------
async function loadUsers() {
  try {
    const res = await fetch(`${API}/users`, { headers: authHeaders() });
    allUsers = await res.json();
    renderUsersTable();
  } catch { showToast('Cannot load users','error'); }
}

function renderUsersTable() {
  const c = document.getElementById('users-table-container');
  c.innerHTML = `<table><thead><tr>
    <th>Username</th><th>Full Name</th><th>Email</th><th>Role</th><th>Home Visit Status</th>
    <th>Create</th><th>Edit</th><th>Delete</th><th>Export</th><th>Manage Users</th><th>Dropdowns</th><th>Archive</th><th>Email</th>
    <th>Actions</th>
  </tr></thead><tbody>${allUsers.map(u => `
    <tr>
      <td><strong>${u.username}</strong></td>
      <td>${u.full_name||'-'}</td>
      <td>${u.email}</td>
      <td><span class="status-badge ${u.role==='admin'?'badge-completed':u.role==='manager'?'badge-scheduled':'badge-new'}">${u.role}</span></td>
      <td>${u.is_active ? '&#x2705; Active' : '&#x274C; Inactive'}</td>
      ${['can_create_referral','can_edit_referral','can_delete_referral','can_export','can_manage_users','can_manage_dropdowns','can_archive','can_send_emails']
        .map(p => `<td style="text-align:center;">${u.permissions[p]?'&#x2705;':'-'}</td>`).join('')}
      <td style="white-space:nowrap;">
        <button class="btn btn-sm" onclick="openUserModal(${u.id})">Edit</button>
        ${u.username!=='admin'?`<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">Delete</button>`:''}
      </td>
    </tr>`).join('')}</tbody></table>`;
}

function buildUserForm(u={}) {
  const p = u.permissions || {};
  const perm = (key, label) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
    <input type="checkbox" id="p-${key}" ${p[key]||u.role==='admin'?'checked':''} style="width:18px;height:18px;accent-color:var(--accent);">
    <label for="p-${key}" style="font-size:13px;">${label}</label>
  </div>`;
  return `
  <div class="form-row">
    <div class="form-group"><label class="form-label">Username ${!u.id?'<span class="required-star">*</span>':''}</label><input class="form-input" id="u-username" value="${u.username||''}" ${u.id?'readonly style="background:#F1F4F9"':''}></div>
    <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="u-fullname" value="${u.full_name||''}"></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Email <span class="required-star">*</span></label><input class="form-input" id="u-email" type="email" value="${u.email||''}"></div>
    <div class="form-group"><label class="form-label">Password ${u.id?'(leave blank = no change)':'<span class="required-star">*</span>'}</label><input class="form-input" id="u-password" type="password" placeholder="********"></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Role</label>
      <select class="form-select" id="u-role">
        <option value="staff" ${u.role==='staff'?'selected':''}>Staff</option>
        <option value="manager" ${u.role==='manager'?'selected':''}>Manager</option>
        <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Status</label>
      <select class="form-select" id="u-active">
        <option value="true" ${u.is_active!==false?'selected':''}>Active</option>
        <option value="false" ${u.is_active===false?'selected':''}>Inactive</option>
      </select>
    </div>
  </div>
  <div class="form-section-title" style="margin-top:16px;">Permissions</div>
  ${perm('can_create_referral','Create Referrals')}
  ${perm('can_edit_referral','Edit Referrals')}
  ${perm('can_delete_referral','Delete Referrals')}
  ${perm('can_export','Export PDF & CSV')}
  ${perm('can_archive','Archive / Restore Records')}
  ${perm('can_manage_users','Manage Users')}
  ${perm('can_manage_dropdowns','Manage Dropdown Options')}
  ${perm('can_send_emails','Send Referral Emails')}`;
}

function openUserModal(id = null) {
  editingUserId = id;
  document.getElementById('user-modal-title').textContent = id ? 'Edit User' : 'New User';
  const u = id ? allUsers.find(x => x.id === id) : {};
  document.getElementById('user-modal-body').innerHTML = buildUserForm(u || {});
  document.getElementById('user-modal').classList.add('open');
}

async function saveUser() {
  const gv = id => document.getElementById(id)?.value || '';
  const gck = id => document.getElementById(id)?.checked || false;
  const data = {
    email: gv('u-email'), full_name: gv('u-fullname'),
    role: gv('u-role'), is_active: gv('u-active') === 'true',
    can_create_referral: gck('p-can_create_referral'),
    can_edit_referral: gck('p-can_edit_referral'),
    can_delete_referral: gck('p-can_delete_referral'),
    can_export: gck('p-can_export'),
    can_archive: gck('p-can_archive'),
    can_manage_users: gck('p-can_manage_users'),
    can_manage_dropdowns: gck('p-can_manage_dropdowns'),
    can_send_emails: gck('p-can_send_emails'),
  };
  const pw = gv('u-password');
  if (pw) data.password = pw;
  if (!editingUserId) {
    data.username = gv('u-username');
    if (!data.password) { showToast('Password required for new user','error'); return; }
  }
  const url = editingUserId ? `${API}/users/${editingUserId}` : `${API}/users`;
  const method = editingUserId ? 'PUT' : 'POST';
  try {
    const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(data) });
    if (!res.ok) { const e = await res.json(); showToast(e.detail||'Error','error'); return; }
    showToast(editingUserId ? 'User updated' : 'User created');
    document.getElementById('user-modal').classList.remove('open');
    loadUsers();
  } catch { showToast('Server error','error'); }
}

async function deleteUser(id) {
  if (!confirm('Delete this user permanently?')) return;
  const res = await fetch(`${API}/users/${id}`, { method:'DELETE', headers: authHeaders() });
  if (res.ok) { showToast('User deleted'); loadUsers(); }
  else showToast('Error deleting','error');
}

