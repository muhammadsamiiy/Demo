// â”€â”€â”€ ADMIN DROPDOWNS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function adminTab(tab, btn) {
  document.querySelectorAll('.tab-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('admin-dropdowns').style.display = tab === 'dropdowns' ? 'block' : 'none';
  document.getElementById('admin-pdf-settings').style.display = tab === 'pdf-settings' ? 'block' : 'none';
  document.getElementById('admin-comment-templates').style.display = tab === 'comment-templates' ? 'block' : 'none';
  document.getElementById('admin-stage-mappings').style.display = tab === 'stage-mappings' ? 'block' : 'none';
  document.getElementById('admin-email-settings').style.display = tab === 'email-settings' ? 'block' : 'none';
  document.getElementById('admin-email-replies').style.display = tab === 'email-replies' ? 'block' : 'none';
  
  // Load stage mappings when that tab is clicked
  if (tab === 'stage-mappings') {
    loadStageMappings();
  }

  if (tab !== 'email-replies' && emailRepliesRefreshMode === 'auto') {
    stopEmailRepliesAutoRefresh();
    updateEmailRepliesRefreshStatus();
  } else if (tab === 'email-replies' && emailRepliesRefreshMode === 'auto') {
    startEmailRepliesAutoRefresh();
    updateEmailRepliesRefreshStatus();
  }

  if (tab === 'email-replies') {
    syncEmailRepliesDateControls();
    syncEmailRepliesRefreshTabs();
    refreshEmailRepliesBox(true);
  }
}

let emailRepliesRefreshMode = 'manual';
let emailRepliesAutoIntervalSeconds = 120;
let emailRepliesAutoTimer = null;
let emailRepliesLastRefreshAt = null;

function getTodayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function syncEmailRepliesDateControls() {
  const fromEl = document.getElementById('email-replies-from-date');
  const toEl = document.getElementById('email-replies-to-date');
  if (!fromEl || !toEl) return;

  const today = getTodayIsoDate();
  toEl.value = today;
  toEl.max = today;
  if (!fromEl.value) {
    fromEl.value = today;
  }
  fromEl.max = today;
}

function getEmailRepliesFromDate() {
  const fromEl = document.getElementById('email-replies-from-date');
  const value = (fromEl?.value || '').trim();
  return value || getTodayIsoDate();
}

function onEmailRepliesDateChange() {
  syncEmailRepliesDateControls();
  refreshEmailRepliesBox(true);
}

async function loadAdminDropdowns() {
  try {
    const [ddRes, pdfRes, commentTemplatesRes, emailSettingsRes, mappingsRes] = await Promise.all([
      fetch(`${API}/dropdowns`, { headers: authHeaders() }),
      fetch(`${API}/settings/pdf-fields`, { headers: authHeaders() }),
      fetch(`${API}/settings/comment-templates`, { headers: authHeaders() }),
      fetch(`${API}/email-settings`, { headers: authHeaders() }),
      fetch(`${API}/intermediary-mapping`, { headers: authHeaders() })
    ]);
    const data = await ddRes.json();
    renderDropdownGrid(data);
    if (pdfRes.ok) {
      const pdfData = await pdfRes.json();
      pdfFieldDefs = pdfData.available || [];
      selectedPdfFields = pdfData.selected || [];
      renderPdfSettings();
    }
    if (commentTemplatesRes.ok) {
      const commentData = await commentTemplatesRes.json();
      commentTemplates = (commentData.templates || []).length ? commentData.templates : getDefaultCommentTemplates();
      renderCommentTemplates();
    }
    if (emailSettingsRes.ok) {
      emailSettingsCache = await emailSettingsRes.json();
      renderEmailSettings();
    }
    if (mappingsRes.ok) {
      intermediaryMappings = await mappingsRes.json();
      renderIntermediaryMappings();
    }
    syncEmailRepliesDateControls();
    syncEmailRepliesRefreshTabs();
    updateEmailRepliesRefreshStatus();
    // Replies fetch is intentionally non-blocking so IMAP slowness does not block all settings UI.
    refreshEmailRepliesBox(true);
  } catch { showToast('Cannot load dropdowns','error'); }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailReplyFrameDoc(reply) {
  const htmlBody = String(reply?.body_html || '').trim();
  const textBody = String(reply?.body_text || '').trim();
  const fallbackText = textBody || reply?.snippet || 'No body available.';
  const content = htmlBody || `<pre class="email-reply-pre">${escapeHtml(fallbackText)}</pre>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 18px;
        font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
        font-size: 14px;
        color: #1f2937;
        background: #f8fafc;
      }
      .email-reply-wrap {
        background: #ffffff;
        border: 1px solid #dbe3ee;
        border-radius: 12px;
        padding: 16px;
        overflow-x: auto;
      }
      .email-reply-wrap table {
        border-collapse: collapse;
        width: 100%;
        min-width: 520px;
      }
      .email-reply-wrap th,
      .email-reply-wrap td {
        border: 1px solid #dbe3ee;
        padding: 8px 10px;
        vertical-align: top;
      }
      .email-reply-wrap img { max-width: 100%; height: auto; }
      .email-reply-wrap a { color: #0f766e; }
      .email-reply-pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: Consolas, 'Courier New', monospace;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 12px;
      }
    </style>
  </head>
  <body>
    <div class="email-reply-wrap">${content}</div>
  </body>
</html>`;
}

function openEmailReplyModal(index) {
  const payload = emailRepliesCache || { items: [] };
  const items = Array.isArray(payload.items) ? payload.items : [];
  const reply = items[index];
  if (!reply) {
    showToast('Could not open email reply', 'error');
    return;
  }

  const overlay = document.getElementById('email-reply-modal');
  const titleEl = document.getElementById('email-reply-modal-title');
  const metaEl = document.getElementById('email-reply-modal-meta');
  const frame = document.getElementById('email-reply-frame');
  if (!overlay || !titleEl || !metaEl || !frame) return;

  titleEl.textContent = reply.subject || '(No subject)';
  metaEl.textContent = `From: ${reply.from || '-'} | Date: ${reply.date || '-'}`;
  frame.srcdoc = buildEmailReplyFrameDoc(reply);
  overlay.classList.add('open');
}

function closeEmailReplyModal() {
  const overlay = document.getElementById('email-reply-modal');
  const frame = document.getElementById('email-reply-frame');
  if (frame) frame.srcdoc = '';
  if (overlay) overlay.classList.remove('open');
}

function syncEmailRepliesRefreshTabs() {
  const tabs = document.querySelectorAll('#email-replies-refresh-tabs .tab-pill');
  tabs.forEach((tab) => {
    const mode = tab.getAttribute('data-mode');
    tab.classList.toggle('active', mode === emailRepliesRefreshMode);
  });

  const autoControls = document.getElementById('email-replies-auto-controls');
  if (autoControls) {
    autoControls.classList.toggle('is-hidden', emailRepliesRefreshMode !== 'auto');
  }

  const intervalSelect = document.getElementById('email-replies-interval');
  if (intervalSelect) {
    intervalSelect.value = String(emailRepliesAutoIntervalSeconds);
  }
}

function updateEmailRepliesRefreshStatus() {
  const statusEl = document.getElementById('email-replies-refresh-status');
  if (!statusEl) return;

  if (emailRepliesRefreshMode !== 'auto') {
    const last = emailRepliesLastRefreshAt ? ` | Last refreshed: ${emailRepliesLastRefreshAt}` : '';
    statusEl.textContent = `Mode: Manual | Date: ${getEmailRepliesFromDate()} to ${getTodayIsoDate()}${last}`;
    return;
  }

  const timer = emailRepliesAutoIntervalSeconds >= 60
    ? `${Math.round(emailRepliesAutoIntervalSeconds / 60)} min`
    : `${emailRepliesAutoIntervalSeconds} sec`;
  const last = emailRepliesLastRefreshAt ? ` | Last refreshed: ${emailRepliesLastRefreshAt}` : '';
  statusEl.textContent = `Mode: Auto (${timer}) | Date: ${getEmailRepliesFromDate()} to ${getTodayIsoDate()}${last}`;
}

function stopEmailRepliesAutoRefresh() {
  if (emailRepliesAutoTimer) {
    clearInterval(emailRepliesAutoTimer);
    emailRepliesAutoTimer = null;
  }
}

function startEmailRepliesAutoRefresh() {
  stopEmailRepliesAutoRefresh();
  emailRepliesAutoTimer = setInterval(() => {
    refreshEmailRepliesBox(true);
  }, emailRepliesAutoIntervalSeconds * 1000);
}

function setEmailRepliesRefreshMode(mode) {
  if (!['manual', 'auto'].includes(mode)) return;
  emailRepliesRefreshMode = mode;
  syncEmailRepliesRefreshTabs();

  if (mode === 'auto') {
    startEmailRepliesAutoRefresh();
    refreshEmailRepliesBox(true);
  } else {
    stopEmailRepliesAutoRefresh();
  }
  updateEmailRepliesRefreshStatus();
}

function setEmailRepliesAutoInterval() {
  const intervalSelect = document.getElementById('email-replies-interval');
  const nextValue = Number(intervalSelect?.value || 120);
  emailRepliesAutoIntervalSeconds = Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 120;
  if (emailRepliesRefreshMode === 'auto') {
    startEmailRepliesAutoRefresh();
  }
  updateEmailRepliesRefreshStatus();
}

function renderEmailReplies() {
  const box = document.getElementById('email-replies-box');
  if (!box) return;
  const payload = emailRepliesCache || { items: [] };
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    const note = payload.error ? `<div class="form-hint" style="color:var(--danger);">${payload.error}</div>` : '<div class="loading">No matching replies found.</div>';
    box.innerHTML = note;
    return;
  }
  box.innerHTML = `
    <div class="email-replies-table-wrap">
      <table class="email-replies-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>From</th>
            <th>Date</th>
            <th>Preview</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((r, idx) => `
            <tr>
              <td>
                <button class="email-subject-btn" type="button" onclick="openEmailReplyModal(${idx})" title="Open full email">
                  ${escapeHtml(r.subject || '(No subject)')}
                </button>
              </td>
              <td>${escapeHtml(r.from || '-')}</td>
              <td>${escapeHtml(r.date || '-')}</td>
              <td class="email-reply-snippet">${escapeHtml(r.snippet || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function refreshEmailRepliesBox(silent = false) {
  try {
    const fromDate = getEmailRepliesFromDate();
    const qp = new URLSearchParams();
    qp.set('from_date', fromDate);
    const res = await fetch(`${API}/email-replies?${qp.toString()}`, { headers: authHeaders() });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      if (!silent) showToast(e.detail || 'Could not load email replies', 'error');
      return;
    }
    emailRepliesCache = await res.json();
    renderEmailReplies();
    emailRepliesLastRefreshAt = new Date().toLocaleTimeString();
    updateEmailRepliesRefreshStatus();
    if (!silent) showToast('Replies refreshed');
  } catch {
    if (!silent) showToast('Could not load email replies', 'error');
  }
}

function renderEmailSettings() {
  const normalizedFollowUpFrequency = ['daily', 'weekly', 'monthly'].includes((emailSettingsCache.follow_up_frequency || '').toLowerCase())
    ? (emailSettingsCache.follow_up_frequency || '').toLowerCase()
    : 'weekly';
  const includeReferralContact = String(emailSettingsCache.email_include_referral_contact ?? 'true').toLowerCase() !== 'false';
  const includeSenderAccount = String(emailSettingsCache.email_include_sender_account ?? 'true').toLowerCase() !== 'false';
  document.getElementById('email-smtp-host').value = emailSettingsCache.email_smtp_host || '';
  document.getElementById('email-smtp-port').value = emailSettingsCache.email_smtp_port || '';
  document.getElementById('email-smtp-user').value = emailSettingsCache.email_smtp_user || '';
  document.getElementById('email-template-to').value = emailSettingsCache.email_template_to || '';
  document.getElementById('email-template-cc').value = emailSettingsCache.email_template_cc || '';
  document.getElementById('email-subject-template').value = emailSettingsCache.email_subject_template || 'Patient Referral:';
  document.getElementById('email-body-template').value = emailSettingsCache.email_body_template || 'Please find attached the referral for patient';
  document.getElementById('email-include-referral-contact').value = includeReferralContact ? 'true' : 'false';
  document.getElementById('email-include-sender-account').value = includeSenderAccount ? 'true' : 'false';
  document.getElementById('followup-frequency').value = normalizedFollowUpFrequency;
  document.getElementById('followup-send-time').value = emailSettingsCache.follow_up_send_time || '09:00';
  document.getElementById('followup-to').value = emailSettingsCache.follow_up_to || '';
  document.getElementById('followup-cc').value = emailSettingsCache.follow_up_cc || '';
  document.getElementById('followup-subject-template').value = emailSettingsCache.follow_up_subject_template || 'Follow-Up Summary:';
  document.getElementById('followup-body-template').value = emailSettingsCache.follow_up_body_template || 'Please review the active referral follow-up list below.';
}

async function saveEmailSettings() {
  const templateToValue = document.getElementById('email-template-to').value.trim();
  const includeReferralContact = document.getElementById('email-include-referral-contact').value === 'true';
  const includeSenderAccount = document.getElementById('email-include-sender-account').value === 'true';
  if (!templateToValue && !includeReferralContact && !includeSenderAccount) {
    showToast('Template TO can be blank only when Referral Contact Email or Sender Account Email is enabled', 'error');
    return;
  }

  const payload = {
    smtp_host: document.getElementById('email-smtp-host').value.trim() || null,
    smtp_port: Number(document.getElementById('email-smtp-port').value) || null,
    smtp_user: document.getElementById('email-smtp-user').value.trim() || null,
    smtp_password: document.getElementById('email-smtp-password').value.trim() || null,
    template_to: templateToValue,
    template_cc: document.getElementById('email-template-cc').value.trim(),
    subject_template: document.getElementById('email-subject-template').value.trim() || null,
    body_template: document.getElementById('email-body-template').value.trim() || null,
    include_referral_contact: includeReferralContact,
    include_sender_account: includeSenderAccount,
    follow_up_frequency: document.getElementById('followup-frequency').value || 'weekly',
    follow_up_send_time: document.getElementById('followup-send-time').value || '09:00',
    follow_up_to: document.getElementById('followup-to').value.trim(),
    follow_up_cc: document.getElementById('followup-cc').value.trim(),
    follow_up_subject_template: document.getElementById('followup-subject-template').value.trim() || null,
    follow_up_body_template: document.getElementById('followup-body-template').value.trim() || null,
  };

  try {
    const res = await fetch(`${API}/email-settings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const e = await res.json();
      showToast(e.detail || 'Could not save email settings', 'error');
      return;
    }
    showToast('Email settings saved');
    await loadAdminDropdowns();
  } catch {
    showToast('Could not save email settings', 'error');
  }
}

function renderIntermediaryMappings() {
  const container = document.getElementById('intermediary-mapping-list');
  if (!container) return;
  if (!Array.isArray(intermediaryMappings) || !intermediaryMappings.length) {
    container.innerHTML = '<div class="loading">No mappings configured yet.</div>';
    return;
  }
  container.innerHTML = `<table><thead><tr><th>Intermediary ID</th><th>Intermediary Name</th><th>Intermediary Email</th><th>Action</th></tr></thead><tbody>
    ${intermediaryMappings.map((m, idx) => `<tr>
      <td>${m.intermediary_id || '-'}</td>
      <td>
        <div>${m.intermediary || '-'}</div>
        <div style="font-size:11px;color:var(--text-muted);">${m.township || '-'} | ${m.postal_code || '-'} | ${m.form_type || '-'}</div>
      </td>
      <td>${m.email || '-'}</td>
      <td style="white-space:nowrap;">
        <div style="display:flex;gap:6px;justify-content:flex-end;">
          <button class="btn btn-sm" type="button" onclick="editIntermediaryMapping(${idx})">Edit</button>
          <button class="btn btn-sm btn-danger" type="button" onclick="deleteIntermediaryMapping(${idx})">Delete</button>
        </div>
      </td>
    </tr>`).join('')}
  </tbody></table>`;
}

function cancelIntermediaryMappingEdit() {
  editingIntermediaryMappingKey = null;
  document.getElementById('map-township').value = '';
  document.getElementById('map-postal-code').value = '';
  document.getElementById('map-form-type').value = '';
  document.getElementById('map-intermediary').value = '';
  document.getElementById('map-email').value = '';
  const saveBtn = document.getElementById('map-save-btn');
  const cancelBtn = document.getElementById('map-cancel-btn');
  if (saveBtn) saveBtn.textContent = 'Add Mapping';
  if (cancelBtn) cancelBtn.style.display = 'none';
}

function editIntermediaryMapping(index) {
  const item = intermediaryMappings[index];
  if (!item || !item.key) {
    showToast('Could not load mapping for edit', 'error');
    return;
  }
  editingIntermediaryMappingKey = item.key;
  document.getElementById('map-township').value = item.township || '';
  document.getElementById('map-postal-code').value = item.postal_code || '';
  document.getElementById('map-form-type').value = item.form_type || '';
  document.getElementById('map-intermediary').value = item.intermediary || '';
  document.getElementById('map-email').value = item.email || '';
  const saveBtn = document.getElementById('map-save-btn');
  const cancelBtn = document.getElementById('map-cancel-btn');
  if (saveBtn) saveBtn.textContent = 'Update Mapping';
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
}

async function deleteIntermediaryMapping(index) {
  const item = intermediaryMappings[index];
  if (!item || !item.key) {
    showToast('Could not delete mapping', 'error');
    return;
  }
  if (!confirm('Delete this intermediary mapping?')) return;

  try {
    const res = await fetch(`${API}/intermediary-mapping/${encodeURIComponent(item.key)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const e = await res.json();
      showToast(e.detail || 'Could not delete mapping', 'error');
      return;
    }
    showToast('Intermediary mapping deleted');
    if (editingIntermediaryMappingKey === item.key) {
      cancelIntermediaryMappingEdit();
    }
    await loadAdminDropdowns();
  } catch {
    showToast('Could not delete mapping', 'error');
  }
}

async function saveIntermediaryMapping() {
  const township = document.getElementById('map-township').value.trim();
  const postal_code = document.getElementById('map-postal-code').value.trim();
  const form_type = document.getElementById('map-form-type').value.trim();
  const intermediary = document.getElementById('map-intermediary').value.trim();
  const email = document.getElementById('map-email').value.trim();

  if (!township || !postal_code || !form_type || !intermediary || !email) {
    showToast('Township, postal code, form type, intermediary, and email are required', 'error');
    return;
  }

  try {
    const isEditMode = !!editingIntermediaryMappingKey;
    const endpoint = isEditMode
      ? `${API}/intermediary-mapping/${encodeURIComponent(editingIntermediaryMappingKey)}`
      : `${API}/intermediary-mapping`;
    const payload = {
      // canonical keys
      township,
      postal_code,
      form_type,
      intermediary,
      email,
      // compatibility keys for older/newer backend parsers
      postalCode: postal_code,
      formType: form_type,
      intermediaryName: intermediary,
      intermediaryEmail: email,
      mapping: {
        township,
        postal_code,
        form_type,
        intermediary,
        email,
      },
    };
    const res = await fetch(endpoint, {
      method: isEditMode ? 'PUT' : 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      let detail = 'Could not save mapping';
      try {
        const e = await res.json();
        detail = e?.detail || detail;
      } catch {
        try {
          detail = await res.text() || detail;
        } catch {
          // keep default detail
        }
      }
      showToast(detail, 'error');
      return;
    }
    showToast(isEditMode ? 'Intermediary mapping updated' : 'Intermediary mapping saved');
    cancelIntermediaryMappingEdit();
    await loadAdminDropdowns();
  } catch {
    showToast('Could not save mapping', 'error');
  }
}

async function downloadReferralTemplateCSV() {
  try {
    const res = await fetch(`${API}/settings/referrals/template-csv`, { headers: authHeaders() });
    if (!res.ok) {
      const e = await res.json();
      showToast(e.detail || 'Could not download template', 'error');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'referral_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Template downloaded');
  } catch {
    showToast('Could not download template', 'error');
  }
}

async function importReferralTemplateCSV() {
  const fileInput = document.getElementById('settings-referral-import-file');
  const file = fileInput?.files?.[0];
  if (!file) {
    showToast('Please choose a CSV file first', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API}/settings/referrals/import-csv`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.detail || 'CSV import failed', 'error');
      return;
    }

    const inserted = data.inserted || 0;
    const skipped = data.skipped || 0;
    const totalErrors = data.total_errors || 0;
    showToast(`Import complete: ${inserted} added, ${skipped} skipped, ${totalErrors} errors`);

    if (fileInput) fileInput.value = '';
    await refreshReferralList();
    await loadDashboard();
  } catch {
    showToast('CSV import failed', 'error');
  }
}

function renderDropdownGrid(data) {
  const grid = document.getElementById('dropdown-grid');
  grid.innerHTML = Object.entries(data)
    .filter(([cat]) => cat !== 'intermediary')
    .map(([cat, opts]) => `
    <div class="admin-card">
      <div class="admin-card-title">${cat.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())}</div>
      ${opts.map(o => `
        <div class="dd-item">
          <span class="dd-label" style="${!o.is_active?'text-decoration:line-through;color:var(--text-muted)':''}">${o.label}</span>
          <button class="btn btn-sm" onclick="toggleDropdown(${o.id}, ${!o.is_active})">${o.is_active?'Disable':'Enable'}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteDropdown(${o.id})">Delete</button>
        </div>`).join('')}
    </div>`).join('');
}

async function toggleDropdown(id, active) {
  await fetch(`${API}/dropdowns/${id}`, { method:'PUT', headers: authHeaders(), body: JSON.stringify({is_active: active}) });
  loadAdminDropdowns();
}

async function deleteDropdown(id) {
  if (!confirm('Delete this option?')) return;
  const res = await fetch(`${API}/dropdowns/${id}`, { method:'DELETE', headers: authHeaders() });
  if (res.ok) { showToast('Deleted'); loadAdminDropdowns(); loadDropdowns(); }
}

async function addDropdownOption() {
  const cat = document.getElementById('new-dd-cat').value;
  const val = document.getElementById('new-dd-val').value.trim();
  const email = document.getElementById('new-dd-email')?.value.trim() || '';
  if (!val) { showToast('Enter a value','error'); return; }
  if (cat === 'intermediary' && !email) { showToast('Intermediary email is required','error'); return; }
  const payload = {category:cat, value:val, label:val};
  if (cat === 'intermediary') payload.intermediary_email = email;
  const res = await fetch(`${API}/dropdowns`, { method:'POST', headers: authHeaders(), body: JSON.stringify(payload) });
  if (res.ok) {
    showToast('Option added');
    document.getElementById('new-dd-val').value='';
    if (document.getElementById('new-dd-email')) document.getElementById('new-dd-email').value='';
    loadAdminDropdowns();
    loadDropdowns();
  }
  else { const e = await res.json(); showToast(e.detail||'Error','error'); }
}

function toggleNewDropdownEmailField() {
  const cat = document.getElementById('new-dd-cat')?.value;
  const wrap = document.getElementById('new-dd-email-wrap');
  const input = document.getElementById('new-dd-email');
  const isIntermediary = cat === 'intermediary';
  if (wrap) wrap.style.display = isIntermediary ? 'flex' : 'none';
  if (input) {
    input.required = isIntermediary;
    if (!isIntermediary) input.value = '';
  }
}

function renderPdfSettings() {
  const container = document.getElementById('pdf-settings-grid');
  if (!container) return;
  if (!pdfFieldDefs.length) {
    container.innerHTML = '<div class="loading">No PDF fields available.</div>';
    return;
  }
  const grouped = {};
  pdfFieldDefs.forEach(f => {
    const section = f.section || 'Other';
    if (!grouped[section]) grouped[section] = [];
    grouped[section].push(f);
  });
  container.innerHTML = Object.entries(grouped).map(([section, fields]) => `
    <div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px;background:var(--surface-2);">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px;">${section}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px 14px;">
        ${fields.map(f => `
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" class="pdf-field-check" value="${f.key}" ${selectedPdfFields.includes(f.key) ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent);">
            <span>${f.label}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function selectAllPdfFields() {
  document.querySelectorAll('.pdf-field-check').forEach(el => { el.checked = true; });
}

function clearPdfFields() {
  document.querySelectorAll('.pdf-field-check').forEach(el => { el.checked = false; });
}

async function savePdfSettings() {
  const selected = Array.from(document.querySelectorAll('.pdf-field-check:checked')).map(el => el.value);
  try {
    const res = await fetch(`${API}/settings/pdf-fields`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ fields: selected })
    });
    if (!res.ok) {
      const e = await res.json();
      showToast(e.detail || 'Could not save PDF settings', 'error');
      return;
    }
    const data = await res.json();
    selectedPdfFields = data.selected || selected;
    renderPdfSettings();
    showToast('PDF settings saved');
  } catch {
    showToast('Could not save PDF settings', 'error');
  }
}

function renderCommentTemplates() {
  const container = document.getElementById('comment-template-list');
  if (!container) return;
  const templates = Array.isArray(commentTemplates) && commentTemplates.length ? commentTemplates : getDefaultCommentTemplates();
  container.innerHTML = templates.map((template, idx) => `
    <div class="comment-template-row" style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--surface-2);margin-bottom:12px;" data-key="${escapeAttr(template.key || '')}">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Comment Type Label</label><input class="form-input comment-template-label" value="${escapeAttr(template.label || '')}" placeholder="e.g. Outreach"></div>
        <div class="form-group"><label class="form-label">Active</label><select class="form-select comment-template-active"><option value="true" ${template.is_active !== false ? 'selected' : ''}>Yes</option><option value="false" ${template.is_active === false ? 'selected' : ''}>No</option></select></div>
        <div class="form-group"><label class="form-label">Order</label><input class="form-input comment-template-order" type="number" value="${template.sort_order ?? idx}" min="0"></div>
      </div>
      <div class="form-row-full">
        <div class="form-group"><label class="form-label">Template Text</label><textarea class="form-textarea comment-template-text" placeholder="Template text shown when this type is selected">${escapeHtml(template.template || '')}</textarea></div>
      </div>
      <button class="btn btn-sm btn-danger" type="button" onclick="this.closest('.comment-template-row').remove()">Remove Template</button>
    </div>
  `).join('');
}

function addCommentTemplateRow() {
  const container = document.getElementById('comment-template-list');
  if (!container) return;
  if (container.querySelector('.loading')) container.innerHTML = '';
  const nextIndex = container.querySelectorAll('.comment-template-row').length;
  container.insertAdjacentHTML('beforeend', `
    <div class="comment-template-row" style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--surface-2);margin-bottom:12px;" data-key="">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Comment Type Label</label><input class="form-input comment-template-label" placeholder="e.g. Outreach"></div>
        <div class="form-group"><label class="form-label">Active</label><select class="form-select comment-template-active"><option value="true" selected>Yes</option><option value="false">No</option></select></div>
        <div class="form-group"><label class="form-label">Order</label><input class="form-input comment-template-order" type="number" value="${nextIndex}" min="0"></div>
      </div>
      <div class="form-row-full">
        <div class="form-group"><label class="form-label">Template Text</label><textarea class="form-textarea comment-template-text" placeholder="Template text shown when this type is selected"></textarea></div>
      </div>
      <button class="btn btn-sm btn-danger" type="button" onclick="this.closest('.comment-template-row').remove()">Remove Template</button>
    </div>
  `);
}

function slugifyCommentTemplateKey(value, fallback) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || fallback;
}

async function saveCommentTemplates() {
  const templates = Array.from(document.querySelectorAll('.comment-template-row')).map((row, idx) => {
    const label = (row.querySelector('.comment-template-label')?.value || '').trim();
    return {
      key: slugifyCommentTemplateKey(row.dataset.key || label, `comment_type_${idx + 1}`),
      label,
      template: (row.querySelector('.comment-template-text')?.value || '').trim(),
      is_active: (row.querySelector('.comment-template-active')?.value || 'true') === 'true',
      sort_order: Number(row.querySelector('.comment-template-order')?.value || idx) || 0
    };
  }).filter(t => t.label);
  if (!templates.length) {
    showToast('Add at least one comment template', 'error');
    return;
  }
  try {
    const res = await fetch(`${API}/settings/comment-templates`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ templates })
    });
    if (!res.ok) {
      const e = await res.json();
      showToast(e.detail || 'Could not save comment templates', 'error');
      return;
    }
    const data = await res.json();
    commentTemplates = data.templates || templates;
    renderCommentTemplates();
    showToast('Comment templates saved');
  } catch {
    showToast('Could not save comment templates', 'error');
  }
}

// â”€â”€â”€ STAGE-COMMENT MAPPING FUNCTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let workflowStages = [];
let stageMappings = [];

async function loadWorkflowStages() {
  try {
    const res = await fetch(`${API}/settings/workflow-stages`, { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      workflowStages = data.stages || [];
    }
  } catch {
    workflowStages = [];
  }
}

async function loadStageMappings() {
  try {
    const res = await fetch(`${API}/settings/stage-comment-mappings`, { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      stageMappings = data.mappings || [];
      renderStageMappings();
    }
  } catch {
    showToast('Could not load stage mappings', 'error');
  }
}

function renderStageMappings() {
  const list = document.getElementById('stage-mapping-list');
  if (!list) return;
  if (!stageMappings.length) {
    list.innerHTML = '<div class="form-hint">No stage-comment mappings configured yet. Create one to link workflow stages with comment types.</div>';
    return;
  }
  let html = '<table class="mapping-table"><thead><tr><th>Stage</th><th>Comment Type</th><th>Description</th><th>Actions</th></tr></thead><tbody>';
  for (const m of stageMappings) {
    const stageLabel = (workflowStages.find(s => s.key === m.stage_key) || {}).label || m.stage_key;
    const commentLabel = getCommentTypeLabel(m.comment_type_key, m.comment_type_key);
    html += `<tr class="stage-mapping-row" data-id="${m.id}">
      <td>${stageLabel}</td>
      <td>${commentLabel}</td>
      <td>${m.description || 'â€”'}</td>
      <td class="td-actions"><button class="mapping-table btn-del" onclick="deleteStageMappingRow(${m.id})">Remove</button></td>
    </tr>`;
  }
  html += '</tbody></table>';
  list.innerHTML = html;
}

function addStageMappingRow() {
  const list = document.getElementById('stage-mapping-list');
  if (!list) return;
  const container = document.createElement('div');
  container.className = 'stage-mapping-new-row';
  container.style.marginTop = '14px';
  container.style.padding = '14px';
  container.style.background = 'var(--surface)';
  container.style.border = '1px solid var(--accent-light)';
  container.style.borderRadius = '12px';
  
  const stageOptions = workflowStages.map(s => `<option value="${s.key}">${s.label}</option>`).join('');
  const commentOptions = getActiveCommentTemplates().map(t => `<option value="${t.key}">${t.label}</option>`).join('');
  
  container.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Workflow Stage</label>
        <select class="form-select new-mapping-stage">${stageOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Comment Type</label>
        <select class="form-select new-mapping-comment">${commentOptions}</select>
      </div>
    </div>
    <div class="form-row-full">
      <div class="form-group">
        <label class="form-label">Description (Optional)</label>
        <input class="form-input new-mapping-desc" placeholder="e.g., Outreach during intake phase">
      </div>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-sm btn-primary" type="button" onclick="saveStageMappingRow(this)">Add Mapping</button>
      <button class="btn btn-sm" type="button" onclick="this.closest('.stage-mapping-new-row').remove()">Cancel</button>
    </div>
  `;
  list.appendChild(container);
}

async function saveStageMappingRow(btn) {
  const container = btn.closest('.stage-mapping-new-row');
  const stageKey = container.querySelector('.new-mapping-stage')?.value;
  const commentKey = container.querySelector('.new-mapping-comment')?.value;
  const desc = container.querySelector('.new-mapping-desc')?.value || '';
  
  if (!stageKey || !commentKey) {
    showToast('Please select both stage and comment type', 'error');
    return;
  }
  
  try {
    const res = await fetch(`${API}/settings/stage-comment-mappings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        stage_key: stageKey,
        comment_type_key: commentKey,
        description: desc,
        is_active: true,
        sort_order: 0
      })
    });
    if (!res.ok) {
      const e = await res.json();
      showToast(e.detail || 'Could not save mapping', 'error');
      return;
    }
    showToast('Mapping added');
    container.remove();
    loadStageMappings();
  } catch {
    showToast('Could not save mapping', 'error');
  }
}

async function deleteStageMappingRow(id) {
  if (!confirm('Remove this stage-comment mapping?')) return;
  try {
    const res = await fetch(`${API}/settings/stage-comment-mappings/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) {
      showToast('Could not delete mapping', 'error');
      return;
    }
    showToast('Mapping deleted');
    loadStageMappings();
  } catch {
    showToast('Could not delete mapping', 'error');
  }
}

async function saveStageMappings() {
  showToast('Stage mappings are saved individually. Use Add Mapping to create new ones.');
}

// â”€â”€â”€ EMAIL FUNCTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function sendEmail(id) {
  try {
    // Get current referral for confirmation
    const referral = allReferrals.find(r => r.id === id);
    if (!referral) { showToast('Referral not found', 'error'); return { ok: false, error: 'Referral not found' }; }
    
    // Verify IDOA type
    if (!window.ReferralService?.isIdoaReferral(referral)) {
      showToast('Only IDOA referrals can be emailed', 'error');
      return { ok: false, error: 'Only IDOA referrals can be emailed' };
    }
    
    const includeReferralContact = String(emailSettingsCache?.email_include_referral_contact ?? 'true').toLowerCase() !== 'false';
    const includeSenderAccount = String(emailSettingsCache?.email_include_sender_account ?? 'true').toLowerCase() !== 'false';
    const ccTargets = [];
    if (includeReferralContact) ccTargets.push(`referral contact (${referral.primaryContact?.email || 'no email'})`);
    if (includeSenderAccount) ccTargets.push(`sender account (${currentUser?.email || 'no email'})`);
    const ccSummary = ccTargets.length ? `\n\nCC: ${ccTargets.join(', ')}` : '';

    // Confirm before sending
    if (!confirm(`Send referral PDF to ${referral.referral?.intermediary || 'intermediary'}?${ccSummary}`)) {
      return { ok: false, cancelled: true, error: 'Cancelled by user' };
    }
    
    showToast('Sending email...', 'info', 0);
    
    const payload = { referral_id: id, pdf_fields: selectedPdfFields };
    if (typeof window.buildPreviewPdfPayloadForReferral === 'function') {
      const previewPayload = await window.buildPreviewPdfPayloadForReferral(id);
      payload.preview_pdf_base64 = previewPayload.preview_pdf_base64;
      payload.preview_pdf_filename = previewPayload.preview_pdf_filename;
    }

    const res = await apiFetch(`${API}/referral/${id}/send-email`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const e = await res.json();
      const errorMsg = e.detail || 'Could not send email';
      showToast(errorMsg, 'error');
      return { ok: false, error: errorMsg };
    }
    
    const data = await res.json();
    showToast(`Email sent to ${data.email_result.recipients?.join(', ') || 'intermediary'}`);
    
    // Reload referrals to get updated email_sent_date
    await refreshReferralList();
    filterTable();
    return { ok: true, data };
  } catch(e) {
    const errorMsg = 'Email error: ' + e.message;
    showToast(errorMsg, 'error');
    return { ok: false, error: errorMsg };
  }
}

async function sendCurrentEmail() {
  if (editingReferralId) {
    await sendEmail(editingReferralId);
    // Optionally close modal after sending
    // closeModal();
  }
}

async function loadEmailHistory(referralId) {
  try {
    const res = await fetch(`${API}/referral/${referralId}/email-history`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return {
      email_sent_date: data.email_sent_date,
      email_recipient: data.email_recipient,
      history: data.history || []
    };
  } catch { return null; }
}

function renderEmailHistory(emailData) {
  if (!emailData || !emailData.history || emailData.history.length === 0) {
    return '<div style="color:var(--text-muted);font-size:12px;">No emails sent yet</div>';
  }
  
  let html = '<div style="display:flex;flex-direction:column;gap:12px;">';
  emailData.history.forEach(record => {
    const sentDate = new Date(record.sent_at).toLocaleString();
    const cc = record.cc_recipients?.join(', ') || 'none';
    html += `
      <div style="padding:12px;background:var(--surface-2);border-radius:10px;font-size:12px;">
        <div><strong>Sent:</strong> ${sentDate}</div>
        <div><strong>Recipient:</strong> ${record.recipient}</div>
        <div><strong>CC:</strong> ${cc}</div>
        <div><strong>By:</strong> ${record.sent_by}</div>
        <div><strong>Status:</strong> <span style="color:var(--accent);font-weight:600;">${record.status}</span></div>
      </div>
    `;
  });
  html += '</div>';
  return html;
}

async function previewFollowUpEmails() {
  try {
    const intermediary = (document.getElementById('intermediary-filter')?.value || '').trim();
    const qs = intermediary ? `?intermediary=${encodeURIComponent(intermediary)}` : '';
    const res = await fetch(`${API}/follow-up/preview${qs}`, { headers: authHeaders() });
    if (!res.ok) {
      const e = await res.json();
      showToast(e.detail || 'Could not preview follow-up emails', 'error');
      return;
    }
    followUpPreviewData = await res.json();
    const groups = followUpPreviewData.groups || [];
    const content = document.getElementById('followup-preview-content');
    if (!groups.length) {
      content.innerHTML = '<div class="loading">No follow-up emails to send right now.</div>';
    } else {
      content.innerHTML = groups.map(g => `
        <div style="border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:12px;">
          <div style="font-weight:700;font-size:14px;">${g.intermediary}</div>
          <div style="font-size:12px;color:var(--text-muted);margin:4px 0 8px;">To: ${g.email || 'No mapped email'} | Referrals: ${g.referral_count}</div>
          <div style="font-size:12px;margin-bottom:6px;"><strong>Subject:</strong> ${g.subject}</div>
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:10px;max-height:240px;overflow:auto;">${g.body}</div>
        </div>
      `).join('');
    }
    document.getElementById('followup-preview-modal').classList.add('open');
  } catch {
    showToast('Could not preview follow-up emails', 'error');
  }
}

function closeFollowUpPreview() {
  document.getElementById('followup-preview-modal').classList.remove('open');
}

async function sendFollowUpNow() {
  const btn = document.getElementById('btn-followup-send-now');
  const originalLabel = btn?.textContent || 'Send Now';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending...';
  }
  try {
    const intermediary = (document.getElementById('intermediary-filter')?.value || '').trim();
    const qs = intermediary ? `?intermediary=${encodeURIComponent(intermediary)}` : '';
    const res = await fetch(`${API}/follow-up/send${qs}`, { method: 'POST', headers: authHeaders() });
    let data = {};
    try {
      data = await res.json();
    } catch {}
    if (!res.ok) {
      showToast(data.detail || 'Could not send follow-up emails', 'error');
      return;
    }

    const sentGroups = Number(data.sent_groups || 0);
    const skipped = Array.isArray(data.skipped) ? data.skipped : [];
    if (sentGroups === 0) {
      const firstReason = skipped[0]?.reason || 'No eligible groups found to send.';
      showToast(firstReason, 'error');
      return;
    }

    if (skipped.length) {
      showToast(`Follow-up sent to ${sentGroups} group(s). ${skipped.length} skipped.`);
    } else {
      showToast(`Follow-up sent to ${sentGroups} intermediary group(s)`);
    }
    closeFollowUpPreview();
    await refreshReferralList();
    await loadLogs();
  } catch {
    showToast('Could not send follow-up emails', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }
}

// â”€â”€â”€ STARTUP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(async () => {
  toggleNewDropdownEmailField();
  if (token) {
    const ok = await tryAutoLogin();
    if (ok) { initApp(); return; }
  }
  document.getElementById('login-screen').style.display = 'flex';
})();
