// â”€â”€â”€ STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const API = '/api';
let token = localStorage.getItem('cr_token') || '';
let currentUser = null;
let allReferrals = [], allArchive = [], allUsers = [];
let dropdowns = {};
let calDate = new Date();
let EVENTS = [];
let editingReferralId = null;
let editingUserId = null;
let statusChart, servicesChart, svcChart, funnelChart;
let pdfFieldDefs = [];
let selectedPdfFields = [];
let emailSettingsCache = {};
let emailRepliesCache = { items: [] };
let commentTemplates = [];
let intermediaryMappings = [];
let editingIntermediaryMappingKey = null;
let intermediaryGroups = [];
let followUpPreviewData = null;
let referralViewMode = 'all';
let intermediaryPreviewOpen = {};
let pendingChecklistFiles = {};
let pendingChecklistRemovals = {};
let isPreviewMode = false;

// â”€â”€â”€ AUTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

async function doLogin() {
  const username = document.getElementById('l-user').value.trim();
  const password = document.getElementById('l-pass').value;
  const err = document.getElementById('login-err');
  err.style.display = 'none';
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({username, password})
    });
    if (!res.ok) { const d = await res.json(); err.textContent = d.detail || 'Login failed'; err.style.display='block'; return; }
    const data = await res.json();
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('cr_token', token);
    initApp();
  } catch(e) { err.textContent = 'Cannot connect to server. Make sure Python server is running.'; err.style.display='block'; }
}

function doLogout() {
  token = ''; currentUser = null;
  localStorage.removeItem('cr_token');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
}

async function tryAutoLogin() {
  if (!token) return false;
  try {
    const res = await fetch(`${API}/auth/me`, { headers: authHeaders() });
    if (!res.ok) return false;
    currentUser = await res.json();
    return true;
  } catch { return false; }
}

async function initApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';
  document.getElementById('sidebar-uname').textContent = currentUser.full_name || currentUser.username;
  document.getElementById('sidebar-urole').textContent = currentUser.role;
  // Show admin nav if allowed
  if (currentUser.permissions.can_manage_users || currentUser.permissions.can_manage_dropdowns) {
    document.getElementById('admin-nav').style.display = 'block';
  }
  if (!currentUser.permissions.can_create_referral) {
    document.getElementById('btn-new-referral').style.display = 'none';
  }
  await loadDropdowns();
  populateStatusFilter();
  showTab('dashboard');
}

// â”€â”€â”€ DROPDOWNS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function loadDropdowns() {
  try {
    const res = await fetch(`${API}/dropdowns/public`);
    dropdowns = await res.json();
    commentTemplates = getDefaultCommentTemplates();
    // Load assigned-to users (requires auth)
    try {
      const userRes = await fetch(`${API}/users/assigned-to`, { headers: authHeaders() });
      if (userRes.ok) {
        const users = await userRes.json();
        dropdowns['assigned_to'] = users;
      }
    } catch { /* Users might not be available */ }
    try {
      const commentTemplateRes = await fetch(`${API}/settings/comment-templates/public`, { headers: authHeaders() });
      if (commentTemplateRes.ok) {
        const data = await commentTemplateRes.json();
        commentTemplates = (data.templates || []).length ? data.templates : getDefaultCommentTemplates();
      }
    } catch { /* fallback defaults already set */ }
    // Load workflow stages
    try {
      await loadWorkflowStages();
    } catch { /* fallback to empty stages */ }
    try {
      const mappingsRes = await fetch(`${API}/intermediary-mapping`, { headers: authHeaders() });
      if (mappingsRes.ok) {
        intermediaryMappings = await mappingsRes.json();
      }
    } catch {
      intermediaryMappings = [];
    }
  } catch { dropdowns = {}; }
}

function ddOptions(cat, selectedVal = '') {
  const opts = dropdowns[cat] || [];
  return opts.map(o => `<option value="${o.value}" ${o.value === selectedVal ? 'selected' : ''}>${o.label}</option>`).join('');
}

function intermediaryOptions(selectedVal = '') {
  const set = new Set();
  (intermediaryMappings || []).forEach(m => {
    const value = (m?.intermediary || '').trim();
    if (value) set.add(value);
  });
  if (!set.size) {
    (dropdowns.intermediary || []).forEach(o => {
      const value = (o?.value || '').trim();
      if (value) set.add(value);
    });
  }
  const values = Array.from(set).sort((a, b) => a.localeCompare(b));
  if (selectedVal && !values.includes(selectedVal)) {
    values.push(selectedVal);
  }
  return values.map(value => `<option value="${value}" ${value === selectedVal ? 'selected' : ''}>${value}</option>`).join('');
}

function referralTypeOptions(selectedVal = '') {
  const fromDropdown = dropdowns.referral_type || [];
  const fallback = ['General Referral', 'Hospital Referral', 'Physician Referral', 'Self Referral'];
  const opts = fromDropdown.length
    ? fromDropdown.map(o => ({ value: o.value, label: o.label }))
    : fallback.map(v => ({ value: v, label: v }));
  return opts.map(o => `<option value="${o.value}" ${o.value === selectedVal ? 'selected' : ''}>${o.label}</option>`).join('');
}

function desiredCaregiverOptions(selectedVal = '') {
  const fromDropdown = dropdowns.desired_caregiver || [];
  const opts = fromDropdown.map(o => ({ value: o.value, label: o.label }));
  if (selectedVal && !opts.some(o => o.value === selectedVal)) {
    opts.push({ value: selectedVal, label: selectedVal });
  }
  return opts.map(o => `<option value="${o.value}" ${o.value === selectedVal ? 'selected' : ''}>${o.label}</option>`).join('');
}

function referralStatusOptions(selectedVal = '') {
  const fromDropdown = dropdowns.status || [];
  const opts = fromDropdown.map(o => ({ value: o.value, label: o.label }));
  if (!opts.some(o => o.value === 'New')) {
    opts.unshift({ value: 'New', label: 'New' });
  }
  if (selectedVal && !opts.some(o => o.value === selectedVal)) {
    opts.push({ value: selectedVal, label: selectedVal });
  }
  return opts.map(o => `<option value="${o.value}" ${o.value === selectedVal ? 'selected' : ''}>${o.label}</option>`).join('');
}

function populateStatusFilter() {
  const sel = document.getElementById('status-filter');
  sel.innerHTML = '<option value="">All statuses</option>';
  (dropdowns.status || []).forEach(s => {
    sel.innerHTML += `<option value="${s.value}">${s.label}</option>`;
  });
  // Archive reason filter
  const asel = document.getElementById('archive-reason-filter');
  if (asel) {
    asel.innerHTML = '<option value="">All reasons</option>';
    (dropdowns.archive_reason || []).forEach(s => {
      asel.innerHTML += `<option value="${s.value}">${s.label}</option>`;
    });
  }
}

function getArchiveReasonDisplay(ref) {
  return (ref?.archiveReason || ref?.status || '').trim();
}

// â”€â”€â”€ TOAST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _toastTimer = null;

function hideToast() {
  const t = document.getElementById('toast');
  if (!t) return;
  if (_toastTimer) {
    clearTimeout(_toastTimer);
    _toastTimer = null;
  }
  t.style.display = 'none';
}

function showToast(msg, type='success', durationMs=3000) {
  const t = document.getElementById('toast');
  if (!t) return;
  if (_toastTimer) {
    clearTimeout(_toastTimer);
    _toastTimer = null;
  }

  const palette = {
    success: '#0F766E',
    error: '#B91C1C',
    info: '#B91C1C',
    warning: '#B45309'
  };

  t.textContent = msg;
  t.style.display = 'block';
  t.style.background = palette[type] || palette.success;

  if (durationMs > 0) {
    _toastTimer = setTimeout(() => {
      t.style.display = 'none';
      _toastTimer = null;
    }, durationMs);
  }
}

// â”€â”€â”€ TABS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', (el.getAttribute('onclick')||'').includes(`'${tab}'`));
  });
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  const titles = {dashboard:'Dashboard','referral-list':'Referral List',schedule:'Schedule',logs:'System Logs',archive:'Archive',users:'User Management','admin-panel':'Admin Settings'};
  document.getElementById('page-title').textContent = titles[tab] || tab;
  const showCSV = ['referral-list','archive'].includes(tab) && currentUser?.permissions?.can_export;
  document.getElementById('btn-export-csv').style.display = showCSV ? 'inline-flex' : 'none';
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'referral-list') { setReferralView(referralViewMode); refreshReferralList(); }
  if (tab === 'schedule') { loadScheduleView(); }
  if (tab === 'logs') { loadLogs(); }
  if (tab === 'archive') loadArchive();
  if (tab === 'users') loadUsers();
  if (tab === 'admin-panel') loadAdminDropdowns();
}

