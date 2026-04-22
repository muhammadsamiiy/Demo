// â”€â”€â”€ PDF / CSV EXPORT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function exportPDF(id) {
  try {
    const res = await fetch(`${API}/referrals/${id}/pdf`, { headers: authHeaders() });
    if (!res.ok) { showToast('Could not export PDF','error'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `referral_${id}.pdf`; a.click();
    URL.revokeObjectURL(url);
  } catch { showToast('PDF export error','error'); }
}

async function exportCurrentPDF() {
  if (editingReferralId) await exportPDF(editingReferralId);
}

async function openMediumForm() {
  if (!editingReferralId) return;
  try {
    const res = await fetch(`${API}/referrals/${editingReferralId}`, { headers: authHeaders() });
    if (!res.ok) { showToast('Could not load referral data', 'error'); return; }
    const data = await res.json();
    const p = data.patient || {};
    const addr = data.address || {};
    const ref = data.referral || {};
    const pc = data.primaryContact || {};
    const services = (data.servicesRequired || []).map(s => s.toLowerCase());

    const esc = v => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const chk = (name, val) => val ? `checked` : '';
    const svcChecked = label => services.some(s => s.includes(label.toLowerCase())) ? 'checked' : '';
    const veteranYes = (p.veteranStatus || '').toLowerCase() === 'yes';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Client Demographics Form</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#f4f1ec;--surface:#ffffff;--border:#c8c2b8;--border-focus:#2a5298;--text:#1a1a1a;--muted:#6b6560;--accent:#2a5298;--accent-light:#e8edf8;--row-gap:1.4rem;--section-gap:2.2rem}
    body{font-family:'IBM Plex Sans',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:2rem 1rem}
    .page-wrap{max-width:860px;margin:0 auto}
    .form-header{background:var(--accent);color:#fff;padding:1.6rem 2rem;border-radius:10px 10px 0 0}
    .form-header h1{font-size:1.5rem;font-weight:600;letter-spacing:.02em}
    .form-header p{font-size:.82rem;opacity:.8;margin-top:.3rem;font-family:'IBM Plex Mono',monospace}
    .form-card{background:var(--surface);border:1px solid var(--border);border-radius:0 0 10px 10px;padding:2rem}
    .section{margin-bottom:var(--section-gap)}
    .section-title{font-size:.72rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);border-bottom:2px solid var(--accent);padding-bottom:.4rem;margin-bottom:1.2rem}
    .row{display:flex;gap:1.2rem;margin-bottom:var(--row-gap);flex-wrap:wrap}
    .col{flex:1;min-width:140px}.col-sm{flex:0 0 90px}.col-md{flex:0 0 180px}.col-lg{flex:2}
    label{display:block;font-size:.75rem;font-weight:500;color:var(--muted);letter-spacing:.04em;margin-bottom:.35rem;text-transform:uppercase}
    input[type=text],input[type=date],input[type=tel],select{width:100%;padding:.55rem .8rem;border:1.5px solid var(--border);border-radius:6px;font-family:'IBM Plex Sans',sans-serif;font-size:.9rem;color:var(--text);background:#fafafa;outline:none}
    .check-group{display:flex;gap:1.2rem;align-items:center;flex-wrap:wrap;margin-top:.2rem}
    .check-group label{display:flex;align-items:center;gap:.35rem;text-transform:none;letter-spacing:0;font-size:.88rem;color:var(--text);font-weight:400;cursor:pointer;margin-bottom:0}
    input[type=radio],input[type=checkbox]{width:auto;accent-color:var(--accent);cursor:pointer}
    .services-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.6rem}
    .service-item{display:flex;align-items:center;gap:.5rem;padding:.55rem .8rem;border:1.5px solid var(--border);border-radius:6px;background:#fafafa;font-size:.85rem;cursor:pointer}
    .service-item input{margin:0}
    hr{border:none;border-top:1px solid var(--border);margin:var(--section-gap) 0}
    .form-footer{display:flex;justify-content:flex-end;gap:1rem;margin-top:2rem;padding-top:1.4rem;border-top:1px solid var(--border)}
    .btn{padding:.6rem 1.6rem;border-radius:6px;font-family:'IBM Plex Sans',sans-serif;font-size:.9rem;font-weight:500;cursor:pointer;border:none}
    .btn-primary{background:var(--accent);color:#fff}
    .btn-outline{background:transparent;border:1.5px solid var(--border);color:var(--muted)}
    @media print{.form-footer{display:none}}
  </style>
</head>
<body>
<div class="page-wrap">
  <div class="form-header">
    <h1>Client Demographics</h1>
    <p>Umbrella Client Information â€” Medium Form</p>
  </div>
  <form class="form-card">
    <div class="section">
      <div class="section-title">Patient Information</div>
      <div class="row">
        <div class="col-md"><label>Date</label><input type="text" value="${esc(ref.referralDate)}"/></div>
      </div>
      <div class="row">
        <div class="col"><label>Last Name</label><input type="text" value="${esc(p.lastName)}"/></div>
        <div class="col"><label>First Name</label><input type="text" value="${esc(p.firstName)}"/></div>
        <div class="col-sm"><label>MI</label><input type="text" placeholder="MI" maxlength="2"/></div>
      </div>
      <div class="row">
        <div class="col-md"><label>Date of Birth</label><input type="text" value="${esc(p.dob)}"/></div>
        <div class="col"><label>SSN</label><input type="text" value="${esc(p.ssn_Last)}" maxlength="11"/></div>
      </div>
      <div class="row">
        <div class="col"><label>Gender</label><input type="text" value="${esc(p.gender)}"/></div>
        <div class="col"><label>Race</label><input type="text" placeholder="Race"/></div>
        <div class="col"><label>Marital Status</label><input type="text" placeholder="Marital Status"/></div>
      </div>
      <div class="row">
        <div class="col-md"><label>Language</label><input type="text" placeholder="Primary language"/></div>
      </div>
      <div class="row">
        <div class="col">
          <label>Limited English</label>
          <div class="check-group">
            <label><input type="checkbox"/> Yes</label>
            <label><input type="checkbox"/> No</label>
          </div>
        </div>
        <div class="col">
          <label>Disabled</label>
          <div class="check-group">
            <label><input type="checkbox"/> Yes</label>
            <label><input type="checkbox"/> No</label>
          </div>
        </div>
        <div class="col">
          <label>Veteran</label>
          <div class="check-group">
            <label><input type="checkbox" ${veteranYes ? 'checked' : ''}/> Yes</label>
            <label><input type="checkbox" ${!veteranYes && p.veteranStatus ? 'checked' : ''}/> No</label>
          </div>
        </div>
      </div>
    </div>
    <hr/>
    <div class="section">
      <div class="section-title">Address &amp; Contact</div>
      <div class="row">
        <div class="col-lg"><label>Street Address</label><input type="text" value="${esc(addr.line1)}${addr.line2 ? ' ' + esc(addr.line2) : ''}"/></div>
      </div>
      <div class="row">
        <div class="col-lg"><label>City</label><input type="text" value="${esc(addr.city)}"/></div>
        <div class="col-md"><label>State</label><input type="text" value="${esc(addr.state)}" maxlength="2"/></div>
        <div class="col-sm"><label>ZIP</label><input type="text" value="${esc(addr.postalCode)}" maxlength="10"/></div>
      </div>
      <div class="row">
        <div class="col"><label>Home Phone</label><input type="tel" value="${esc(pc.phone)}"/></div>
      </div>
      <div class="row">
        <div class="col"><label>Emergency Contact Name</label><input type="text" value="${esc(pc.name)}"/></div>
        <div class="col"><label>Emergency Contact Phone</label><input type="tel" value="${esc(pc.phone)}"/></div>
      </div>
    </div>
    <hr/>
    <div class="section">
      <div class="section-title">Services Requested â€” IHS</div>
      <div class="services-grid">
        <label class="service-item"><input type="checkbox" ${svcChecked('primary care')}/> Primary Care</label>
        <label class="service-item"><input type="checkbox" ${svcChecked('mental health')}/> Mental Health</label>
        <label class="service-item"><input type="checkbox" ${svcChecked('dental')}/> Dental</label>
        <label class="service-item"><input type="checkbox" ${svcChecked('pharmacy')}/> Pharmacy</label>
        <label class="service-item"><input type="checkbox" ${svcChecked('optometry')}/> Optometry</label>
        <label class="service-item"><input type="checkbox" ${svcChecked('community health')}/> Community Health</label>
        <label class="service-item"><input type="checkbox" ${svcChecked('behavioral health')}/> Behavioral Health</label>
        <label class="service-item"><input type="checkbox" ${svcChecked('wic')}/> WIC</label>
        <label class="service-item"><input type="checkbox" ${svcChecked('other')}/> Other</label>
      </div>
    </div>
    <div class="form-footer">
      <button type="button" class="btn btn-outline" onclick="window.print()">&#128424; Print</button>
    </div>
  </form>
</div>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) { showToast('Please allow pop-ups to open the Medium Form', 'error'); return; }
    w.document.write(html);
    w.document.close();
  } catch { showToast('Could not open Medium Form', 'error'); }
}

async function exportCSV() {
  const isArchive = document.getElementById('page-title').textContent === 'Archive';
  try {
    const res = await fetch(`${API}/referrals/export/csv?archived=${isArchive}`, { headers: authHeaders() });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const datetimems = new Date().toLocaleString('sv-SE').replace(' ', ' ') + ':' + String(new Date().getMilliseconds()).padStart(3,'0');
    const filePrefix = isArchive ? 'archive' : 'referrals';
    const a = document.createElement('a'); a.href = url; a.download = `${filePrefix}_${datetimems}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported');
  } catch { showToast('Export error','error'); }
}

// â”€â”€â”€ REFERRAL FORM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function makeCommentDateFieldId() {
  return `comment-date-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultCommentTemplates() {
  return [
    { key: 'outreach', label: 'Outreach', template: 'Reached out to client today; left voicemail', is_active: true, sort_order: 0 },
    { key: 'follow_up', label: 'Follow-up', template: 'Followed up with client regarding previous outreach; awaiting response', is_active: true, sort_order: 1 },
    { key: 'assessment', label: 'Assessment', template: 'Assessment status reviewed today; next steps discussed with client', is_active: true, sort_order: 2 },
    { key: 'scheduling', label: 'Scheduling', template: 'Coordinated scheduling update with client and documented availability', is_active: true, sort_order: 3 },
    { key: 'documentation', label: 'Documentation', template: 'Reviewed required documents with client and noted outstanding items', is_active: true, sort_order: 4 }
  ];
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function getActiveCommentTemplates() {
  const source = Array.isArray(commentTemplates) && commentTemplates.length ? commentTemplates : getDefaultCommentTemplates();
  return source.filter(t => t && t.is_active !== false);
}

function getCommentTemplateByKey(key) {
  return getActiveCommentTemplates().find(t => t.key === key) || null;
}

function getCommentTypeLabel(key, fallback = '') {
  return getCommentTemplateByKey(key)?.label || fallback || '';
}

function buildCommentTypeOptions(selectedKey = '') {
  return `<option value="">Select...</option>${getActiveCommentTemplates().map(t => `<option value="${escapeAttr(t.key)}" ${t.key === selectedKey ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}`;
}

function buildSmartCommentText(label, date, templateText) {
  const header = [label, date].filter(Boolean).join(' - ');
  const body = String(templateText || '').trim();
  return [header, body].filter(Boolean).join('\n');
}

function buildCommentDatePicker(fieldId, value = '') {
  return `<input class="form-input comment-date" id="${fieldId}" value="${value}" placeholder="MM/DD/YYYY" readonly disabled>`;
}

function buildCommentEntry(comment = {}, idx = Date.now()) {
  const fieldId = String(idx).startsWith('comment-date-') ? String(idx) : `comment-date-${idx}`;
  const author = comment.person || getCurrentAuthorName();
  const date = comment.date || getTodayMdY();
  const type = comment.type || '';
  const typeLabel = comment.typeLabel || getCommentTypeLabel(type, '');
  const templateText = comment.template_text || comment.templateText || getCommentTemplateByKey(type)?.template || '';
  const action = comment.action || buildSmartCommentText(typeLabel, date, templateText);
  const autoFillValue = buildSmartCommentText(typeLabel, date, templateText);
  const templateHint = templateText ? `Template: ${templateText.substring(0, 60)}${templateText.length > 60 ? '...' : ''}` : '';
  
  return `<div class="comment-entry" data-template-text="${escapeAttr(templateText)}" data-autofill-value="${escapeAttr(autoFillValue)}">
    <div class="comment-entry-header">
      <div class="form-group">
        <label class="form-label">Author<span class="required-star">*</span></label>
        <input class="form-input comment-author" value="${escapeAttr(author)}" readonly>
      </div>
      <div class="form-group">
        <label class="form-label">Date<span class="required-star">*</span></label>
        ${buildCommentDatePicker(fieldId, date)}
      </div>
      <div class="form-group">
        <label class="form-label">Comment Type<span class="required-star">*</span></label>
        <select class="form-select comment-type" onchange="applyCommentTemplate(this)">${buildCommentTypeOptions(type)}</select>
      </div>
    </div>
    ${templateHint ? `<div class="comment-template-hint">&#128221; ${templateHint}</div>` : ''}
    <textarea class="form-input comment-text" maxlength="500" placeholder="Edit the template or add your own comment...">${escapeHtml(action)}</textarea>
    <div class="comment-actions">
      <button class="btn btn-sm btn-danger" type="button" style="width:100%;" onclick="this.closest('.comment-entry').remove()">Remove Comment</button>
    </div>
  </div>`;
}

function applyCommentTemplate(selectEl, force = false) {
  const entry = selectEl.closest('.comment-entry');
  if (!entry) return;
  const template = getCommentTemplateByKey(selectEl.value);
  const dateInput = entry.querySelector('.comment-date');
  const textEl = entry.querySelector('.comment-text');
  if (!dateInput || !textEl) return;
  if (!template) {
    entry.dataset.templateText = '';
    entry.dataset.autofillValue = '';
    return;
  }
  const today = getTodayMdY();
  dateInput.value = today;
  const nextText = buildSmartCommentText(template.label, today, template.template);
  const current = (textEl.value || '').trim();
  const previousAutoFill = (entry.dataset.autofillValue || '').trim();
  if (force || !current || current === previousAutoFill) {
    textEl.value = nextText;
  }
  entry.dataset.templateText = template.template || '';
  entry.dataset.autofillValue = nextText;
}

// â”€â”€â”€ CHECKLIST FILE UPLOAD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function resetChecklistPendingChanges() {
  pendingChecklistFiles = {};
  pendingChecklistRemovals = {};
}

function setChecklistRowUI(index, { fileName = '', hasFile = false } = {}) {
  const chk = document.getElementById(`chk-${index}`);
  const nameEl = document.getElementById(`chk-file-name-${index}`);
  const removeBtn = document.getElementById(`chk-remove-${index}`);
  if (chk) {
    chk.checked = !!hasFile;
    chk.disabled = true;
  }
  if (nameEl) {
    nameEl.textContent = fileName ? `&#128206; ${fileName}` : '';
    nameEl.style.color = fileName ? 'var(--accent)' : 'var(--text-muted)';
  }
  if (removeBtn) {
    removeBtn.style.display = hasFile ? 'inline-flex' : 'none';
  }
}

async function handleChecklistFile(index, inputEl) {
  if (!inputEl.files || !inputEl.files[0]) return;
  const file = inputEl.files[0];
  pendingChecklistFiles[index] = file;
  delete pendingChecklistRemovals[index];
  inputEl.dataset.fileName = file.name;
  inputEl.dataset.fileUrl = '';
  setChecklistRowUI(index, { fileName: file.name, hasFile: true });
  inputEl.value = '';
  showToast('File selected. Click Save to store changes.');
}

async function removeChecklistFile(index) {
  const inputEl = document.getElementById(`chk-file-${index}`);
  if (!inputEl) return;

  const hasPendingUpload = !!pendingChecklistFiles[index];
  const originalFileUrl = inputEl.dataset.originalFileUrl || '';
  const originalFileName = inputEl.dataset.originalFileName || '';

  if (hasPendingUpload) {
    delete pendingChecklistFiles[index];
    if (originalFileUrl && !pendingChecklistRemovals[index]) {
      inputEl.dataset.fileUrl = originalFileUrl;
      inputEl.dataset.fileName = originalFileName;
      setChecklistRowUI(index, { fileName: originalFileName, hasFile: true });
      showToast('Selected file removed. Original file restored.');
    } else {
      inputEl.dataset.fileUrl = '';
      inputEl.dataset.fileName = '';
      setChecklistRowUI(index, { fileName: '', hasFile: false });
      showToast('Selected file removed. Click Save to apply.');
    }
    return;
  }

  const hasCurrentFile = !!(inputEl.dataset.fileUrl || originalFileUrl);
  if (!hasCurrentFile) return;
  pendingChecklistRemovals[index] = true;
  inputEl.dataset.fileUrl = '';
  inputEl.dataset.fileName = '';
  setChecklistRowUI(index, { fileName: '', hasFile: false });
  showToast('File marked for removal. Click Save to apply.');
}

async function persistChecklistPendingChanges(referralId) {
  const removalIndexes = Object.keys(pendingChecklistRemovals).filter(k => pendingChecklistRemovals[k]);
  const uploadIndexes = Object.keys(pendingChecklistFiles);

  for (const idx of removalIndexes) {
    const res = await fetch(`${API}/referrals/${referralId}/documents/${idx}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) {
      let msg = `Could not remove file for checklist item ${Number(idx) + 1}`;
      try {
        const e = await res.json();
        msg = e.detail || msg;
      } catch {}
      showToast(msg, 'error');
      return false;
    }
  }

  for (const idx of uploadIndexes) {
    const file = pendingChecklistFiles[idx];
    if (!file) continue;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API}/referrals/${referralId}/documents/${idx}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: fd
    });
    if (!res.ok) {
      let msg = `Upload failed for checklist item ${Number(idx) + 1}`;
      try {
        const e = await res.json();
        msg = e.detail || msg;
      } catch {}
      showToast(msg, 'error');
      return false;
    }
    const result = await res.json();
    const inputEl = document.getElementById(`chk-file-${idx}`);
    if (inputEl) {
      inputEl.dataset.fileUrl = result.file_url || '';
      inputEl.dataset.fileName = result.file_name || '';
      inputEl.dataset.originalFileUrl = result.file_url || '';
      inputEl.dataset.originalFileName = result.file_name || '';
    }
  }

  resetChecklistPendingChanges();
  return true;
}

function getCurrentAuthorName() {
  return (currentUser?.full_name || currentUser?.username || '').trim();
}

function getTodayMdY() {
  return new Date().toLocaleDateString('en-US');
}

function buildReferralForm(data = {}, isEditing = false) {
  const p = data.patient || {};
  const addr = data.address || {};
  const ref = data.referral || {};
  const pc = data.primaryContact || {};
  const services = data.servicesRequired || [];
  const comments = data.commentsTimeline || [];
  const checklists = data.checklists || {};
  const homeVisitTime = checklists.homeVisitTime || '';
  const checkItems = ["Birth Certificate","Recent Bank Statement (Within 30 days)","SSN Card","Picture Valid ID","No Insurance / Medicare/Medicaid Card","Doctor's Name and Phone Number","List of all Current Medications"];
  const docs = checklists.documents || [];
  const additionalContacts = checklists.additionalContacts || [];
  const branchOptions = dropdowns.branch || [];
  const defaultBranchValue = branchOptions[0]?.value || '';
  const selectedBranchValue = ref.branch || defaultBranchValue;
  const hasSelectedBranchInOptions = branchOptions.some(o => o.value === selectedBranchValue);
  const branchFallbackOption = selectedBranchValue && !hasSelectedBranchInOptions
    ? `<option value="${selectedBranchValue}" selected>${selectedBranchValue}</option>`
    : '';
  const archiveReasonValue = data.archiveReason || '';
  const archiveRestoreNoteValue = data.archiveRestoreNote || '';

  return `
  <div class="form-section"><div class="form-section-title">Patient Information</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">First name <span class="required-star">*</span></label><input class="form-input" id="f-firstName" value="${p.firstName||''}" maxlength="50"><div class="field-error" id="err-firstName">Required</div></div>
      <div class="form-group"><label class="form-label">Last name <span class="required-star">*</span></label><input class="form-input" id="f-lastName" value="${p.lastName||''}" maxlength="50"><div class="field-error" id="err-lastName">Required</div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Date of birth<span class="required-star">*</span></label><div class="dp-wrapper"><div class="dp-input-row"><input class="form-input" id="f-dob" value="${p.dob||''}" placeholder="MM/DD/YYYY" readonly><button class="dp-trigger" type="button" onclick="dpToggle('f-dob')">&#128197;</button></div><div class="dp-popup" id="dp-f-dob"></div></div><div class="field-error" id="err-dob">Required</div></div>
      <div class="form-group"><label class="form-label">Gender<span class="required-star">*</span></label><select class="form-select" id="f-gender"><option value="">Select...</option>${ddOptions('gender', p.gender||'')}</select><div class="field-error" id="err-gender">Required</div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Client Type<span class="required-star">*</span></label><select class="form-select" id="f-clientType"><option value="">Select...</option>${ddOptions('client_type', ref.clientType||'')}</select><div class="field-error" id="err-clientType">Required</div></div>  
      <div class="form-group"><label class="form-label">Veteran status<span class="required-star">*</span></label><select class="form-select" id="f-veteran"><option value="">Select...</option>${ddOptions('veteran_status', p.veteranStatus||'')}</select><div class="field-error" id="err-veteran">Required</div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">SSN<span class="required-star">*</span></label><input class="form-input" id="f-ssn" inputmode="numeric" maxlength="9" value="${p.ssn_Last||''}" placeholder="Enter SSN"><div class="field-error" id="err-ssn">Required</div></div>
      <div class="form-group"><label class="form-label">Medicaid ID<span class="required-star">*</span></label><input class="form-input" id="f-medicaid" inputmode="numeric" maxlength="15" value="${p.medicaid_Last||''}" placeholder="Enter Medicaid ID"><div class="field-error" id="err-medicaid">Required</div></div>
    </div>
  </div>

  <div class="form-section"><div class="form-section-title">Address</div>
    <div class="form-row-full"><div class="form-group"><label class="form-label">Address line 1 <span class="required-star">*</span></label><input class="form-input" id="f-line1" value="${addr.line1||''}" maxlength="100"><div class="field-error" id="err-line1">Required</div></div></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Address line 2</label><input class="form-input" id="f-line2" value="${addr.line2||''}" maxlength="100"><div class="field-error" id="err-line2">Optional field</div></div>
      <div class="form-group"><label class="form-label">City <span class="required-star">*</span></label><input class="form-input" id="f-city" value="${addr.city||''}" maxlength="50"><div class="field-error" id="err-city">Required</div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">State<span class="required-star">*</span></label><input class="form-input" id="f-state" value="${addr.state||''}" maxlength="50" placeholder="IL"><div class="field-error" id="err-state">Required</div></div>
      <div class="form-group"><label class="form-label">Postal code<span class="required-star">*</span></label><input class="form-input" id="f-postalCode" inputmode="numeric" maxlength="10" value="${addr.postalCode||''}"><div class="field-error" id="err-postalCode">Required</div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Township<span class="required-star">*</span></label><input class="form-input" id="f-township" maxlength="50" value="${addr.township||addr.country||''}" placeholder="Enter township"><div class="field-error" id="err-township">Required</div></div>
    </div>
  </div>

  <div class="form-section"><div class="form-section-title">Referral Details</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Referral date<span class="required-star">*</span></label><div class="dp-wrapper"><div class="dp-input-row"><input class="form-input" id="f-referralDate" value="${ref.referralDate||''}" placeholder="MM/DD/YYYY" readonly><button class="dp-trigger" type="button" onclick="dpToggle('f-referralDate')">&#128197;</button></div><div class="dp-popup" id="dp-f-referralDate"></div></div><div class="field-error" id="err-referralDate">Required</div></div>  
      <div class="form-group"><label class="form-label">Start of care<span class="required-star">*</span></label><div class="dp-wrapper"><div class="dp-input-row"><input class="form-input" id="f-startOfCare" value="${ref.startOfCare||''}" placeholder="MM/DD/YYYY" readonly><button class="dp-trigger" type="button" onclick="dpToggle('f-startOfCare')">&#128197;</button></div><div class="dp-popup" id="dp-f-startOfCare"></div></div><div class="field-error" id="err-startOfCare">Required</div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Referral Type<span class="required-star">*</span></label><select class="form-select" id="f-referralType"><option value="">Select...</option>${referralTypeOptions(ref.referralType||'')}</select><div class="field-error" id="err-referralType">Required</div></div>
      <div class="form-group"><label class="form-label">Referral source<span class="required-star">*</span></label><select class="form-select" id="f-referralSource"><option value="">Select...</option>${ddOptions('referral_source', ref.referralSource||'')}</select><div class="field-error" id="err-referralSource">Required</div></div>
      </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Intermediary<span class="required-star">*</span></label><select class="form-select" id="f-intermediary"><option value="">Select...</option>${intermediaryOptions(ref.intermediary||'')}</select><div class="field-error" id="err-intermediary">Required</div></div>
      <div class="form-group"><label class="form-label">Marketer<span class="required-star">*</span></label><select class="form-select" id="f-marketer"><option value="">Select...</option>${ddOptions('marketer', ref.marketer||'')}</select><div class="field-error" id="err-marketer">Required</div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Desired Caregiver<span class="required-star">*</span></label><select class="form-select" id="f-desiredCaregiver"><option value="">Select...</option>${desiredCaregiverOptions(ref.desiredCaregiver||'')}</select><div class="field-error" id="err-desiredCaregiver">Required</div></div>
      <div class="form-group"><label class="form-label">Branch<span class="required-star">*</span></label><select class="form-select" id="f-branch">${ddOptions('branch', selectedBranchValue)}${branchFallbackOption}</select><div class="field-error" id="err-branch">Required</div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Pay rate municipality<span class="required-star">*</span></label><input class="form-input" id="f-payRate" inputmode="numeric" maxlength="10" value="${ref.payRateMunicipality||''}" placeholder="Enter numbers only"><div class="field-error" id="err-payRate">Required</div></div>
      <div class="form-group"><label class="form-label">Services<span class="required-star">*</span></label><div class="services-wrapper"><input class="form-input" id="f-services" placeholder="Search and add services..."><div class="services-suggestions" id="services-suggestions"></div><div class="services-list" id="services-list">${services.map(s=>`<div class="service">${s}<span class="service-remove" onclick="removeService(this)">&times;</span></div>`).join('')}</div></div><div class="field-error" id="err-services">At least one service required</div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Assigned to<span class="required-star">*</span></label><select class="form-select" id="f-assignedTo"><option value="">Select...</option>${(dropdowns.assigned_to || []).map(u => `<option value="${u.value}" ${u.value === ref.assignedTo ? 'selected' : ''}>${(u.label || '').replace(/\s*\([^)]*\)\s*$/, '')}</option>`).join('')}</select><div class="field-error" id="err-assignedTo">Required</div></div>
      <div class="form-group"><label class="form-label">Status<span class="required-star">*</span></label><select class="form-select" id="f-status"><option value="">Select...</option>${referralStatusOptions(data.status||'New')}</select><div class="field-error" id="err-status">Required</div></div>
    </div>
  </div>

  ${isEditing ? `
    <div class="form-section"><div class="form-section-title">Stage Dates</div>
      ${buildStageDateFormRows(ref.referralDate || ref.intakeDate || '', comments)}
    </div>

  <div class="form-section"><div class="form-section-title">Home Visit</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Scheduled Date</label><div class="dp-wrapper"><div class="dp-input-row"><input class="form-input" id="f-homeVisitScheduledDate" value="${ref.homeVisitScheduledDate||''}" placeholder="MM/DD/YYYY" readonly><button class="dp-trigger" type="button" onclick="dpToggle('f-homeVisitScheduledDate')">&#128197;</button></div><div class="dp-popup" id="dp-f-homeVisitScheduledDate"></div></div></div>
      <div class="form-group"><label class="form-label">Visit Time</label><input class="form-input" id="f-homeVisitTime" type="time" value="${homeVisitTime}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Home Visit Status</label><select class="form-select" id="f-homeVisitStatus"><option value="">Select...</option>${ddOptions('home_visit_status', ref.homeVisitStatus||'')}</select></div>
      <div class="form-group"><label class="form-label">Completed Date</label><div class="dp-wrapper"><div class="dp-input-row"><input class="form-input" id="f-homeVisitCompletedDate" value="${ref.homeVisitCompletedDate||''}" placeholder="MM/DD/YYYY" readonly><button class="dp-trigger" type="button" onclick="dpToggle('f-homeVisitCompletedDate')">&#128197;</button></div><div class="dp-popup" id="dp-f-homeVisitCompletedDate"></div></div></div>
    </div>
    ${(ref.homeVisitStatus||'').toLowerCase() === 'completed' ? `<div class="form-hint" style="margin-bottom:10px;color:var(--accent-text);font-weight:600;">Schedule completed</div>` : ''}
  </div>
  ` : ''}

  <div class="form-section"><div class="form-section-title">Primary Contact</div>
    <div id="primary-contacts-container">
      <div class="contact-entry" data-primary="1" style="border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:12px;">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Contact name <span class="required-star">*</span></label><input class="form-input" id="f-contactName" value="${pc.name||''}" maxlength="50"><div class="field-error" id="err-contactName">Required</div></div>
          <div class="form-group"><label class="form-label">Phone <span class="required-star">*</span></label><input class="form-input" id="f-contactPhone" inputmode="numeric" maxlength="15" value="${pc.phone||''}"><div class="field-error" id="err-contactPhone">Required</div></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Email<span class="required-star">*</span></label><input class="form-input" id="f-contactEmail" type="email" value="${pc.email||''}"><div class="field-error" id="err-contactEmail">Required</div></div>
          <div class="form-group"><label class="form-label">Relationship<span class="required-star">*</span></label><select class="form-select" id="f-contactRel"><option value="">Select...</option>${ddOptions('relationship', pc.relationship||'')}</select><div class="field-error" id="err-contactRel">Required</div></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Alternate phone</label><input class="form-input" id="f-contactPhone2" inputmode="numeric" maxlength="15" value="${pc.alternatePhone||''}"><div class="field-error" id="err-contactPhone2">Numbers only</div></div>
        </div>
      </div>
      ${additionalContacts.map(c => `
      <div class="contact-entry extra-contact-entry" style="border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:12px;">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Contact name</label><input class="form-input extra-contact-name" value="${c.name||''}"></div>
          <div class="form-group"><label class="form-label">Phone</label><input class="form-input extra-contact-phone" value="${c.phone||''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Email</label><input class="form-input extra-contact-email" type="email" value="${c.email||''}"></div>
          <div class="form-group"><label class="form-label">Relationship</label><select class="form-select extra-contact-rel"><option value="">Select...</option>${ddOptions('relationship', c.relationship||'')}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Alternate phone</label><input class="form-input extra-contact-phone2" value="${c.alternatePhone||''}"></div>
          <div class="form-group"><label class="form-label">&nbsp;</label><button class="btn btn-sm btn-danger" type="button" style="width:100%;" onclick="this.closest('.extra-contact-entry').remove()">Remove Contact</button></div>
        </div>
      </div>`).join('')}
    </div>
    <button class="add-comment-btn" type="button" onclick="addPrimaryContact()">+ Add Another Contact</button>
  </div>

  ${isEditing ? `
  <div class="form-section"><div class="form-section-title">Archive Information </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Contract Received by Intermediary</label><div class="dp-wrapper"><div class="dp-input-row"><input class="form-input" id="f-contractDate" data-original-value="${ref.contractReceivedDate||''}" value="${ref.contractReceivedDate||''}" placeholder="MM/DD/YYYY" readonly><button class="dp-trigger" type="button" onclick="dpToggle('f-contractDate')">&#128197;</button></div><div class="dp-popup" id="dp-f-contractDate"></div></div><div class="field-error" id="err-contractDate">Optional field</div></div>
      <div class="form-group"><label class="form-label">Archive Reason</label><select class="form-select" id="f-archiveReason" data-original-value="${archiveReasonValue}"><option value="">Select...</option>${ddOptions('archive_reason', archiveReasonValue)}</select><div class="field-error" id="err-archiveReason">Optional field</div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Archive Restore Note</label><input class="form-input" id="f-archiveRestoreNote" value="${archiveRestoreNoteValue}" readonly></div>
      <div class="form-group"></div>
    </div>
  </div>
  ` : ''}

  ${isEditing ? `
  <div class="form-section"><div class="form-section-title">Document Checklist</div>
    ${checkItems.map((item, i) => {
      const d = docs[i] || {};
      const fileUrl = d.fileUrl || '';
      const fileName = d.fileName || '';
      const hasUploadedFile = !!fileUrl;
      return `<div class="checklist-upload-row" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:10px 12px;background:var(--surface-2);border-radius:12px;">
        <input type="checkbox" id="chk-${i}" ${(d.checked || hasUploadedFile) ? 'checked' : ''} disabled onclick="return false" onchange="return false" style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0;cursor:not-allowed;pointer-events:none;">
        <label style="font-size:13px;flex:1;cursor:default;">${item}</label>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span id="chk-file-name-${i}" style="font-size:11px;color:${hasUploadedFile ? 'var(--accent)' : 'var(--text-muted)'};max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${hasUploadedFile ? `&#128206; ${fileName}` : ''}</span>
          <button type="button" id="chk-remove-${i}" class="btn btn-sm" style="padding:3px 8px;font-size:11px;display:${hasUploadedFile ? 'inline-flex' : 'none'};" onclick="removeChecklistFile(${i})">✕</button>
          <input type="file" id="chk-file-${i}" data-file-url="${fileUrl}" data-file-name="${fileName}" data-original-file-url="${fileUrl}" data-original-file-name="${fileName}" style="display:none;" onchange="handleChecklistFile(${i}, this)">
          <button type="button" class="btn btn-sm" style="padding:4px 10px;font-size:11px;white-space:nowrap;" onclick="document.getElementById('chk-file-${i}').click()">
            Upload
          </button>
          ${d.timestamp ? `<span style="font-size:11px;color:var(--text-muted);">${new Date(d.timestamp).toLocaleDateString()}</span>` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>
  ` : ''}

  <div class="form-section"><div class="form-section-title">Comments Timeline</div>
    <div id="comments-container">
      ${comments.map((c, idx) => buildCommentEntry(c, idx)).join('')}
    </div>
    <button class="add-comment-btn" type="button" onclick="addComment()">+ Add Comment</button>
  </div>`;
}

function addComment() {
  const c = document.getElementById('comments-container');
  if (!c) return;
  c.insertAdjacentHTML('beforeend', buildCommentEntry({ person: getCurrentAuthorName(), date: getTodayMdY() }, makeCommentDateFieldId()));
}

function addPrimaryContact() {
  const container = document.getElementById('primary-contacts-container');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'contact-entry extra-contact-entry';
  div.style.border = '1px solid var(--border)';
  div.style.borderRadius = '14px';
  div.style.padding = '14px';
  div.style.marginBottom = '12px';
  div.innerHTML = `<div class="form-row">
    <div class="form-group"><label class="form-label">Contact name</label><input class="form-input extra-contact-name"></div>
    <div class="form-group"><label class="form-label">Phone</label><input class="form-input extra-contact-phone"></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Email</label><input class="form-input extra-contact-email" type="email"></div>
    <div class="form-group"><label class="form-label">Relationship</label><select class="form-select extra-contact-rel"><option value="">Select...</option>${ddOptions('relationship', '')}</select></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Alternate phone</label><input class="form-input extra-contact-phone2"></div>
    <div class="form-group"><label class="form-label">&nbsp;</label><button class="btn btn-sm btn-danger" type="button" style="width:100%;" onclick="this.closest('.extra-contact-entry').remove()">Remove Contact</button></div>
  </div>`;
  container.appendChild(div);
}

async function addScheduleNoteToForm(rid) {
  if (!rid) {
    showToast('Please save the referral first', 'error');
    return;
  }
  await addScheduleNote(rid);
  openEditReferral(rid);
}

async function addScheduleNote(rid) {
  const note = prompt('Enter schedule note:');
  if (!note || !note.trim()) return;

  try {
    const res = await fetch(`${API}/referrals/${rid}/schedule-notes`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ note: note.trim() })
    });
    if (res.ok) {
      showToast('Note added');
      refreshReferrals();
      loadScheduleView();
    } else {
      showToast('Error adding note', 'error');
    }
  } catch { showToast('Error adding note', 'error'); }
}

function openNewReferralModal() {
  isPreviewMode = false;
  editingReferralId = null;
  resetChecklistPendingChanges();
  document.getElementById('modal-title').textContent = 'New Referral';
  document.getElementById('modal-body').innerHTML = buildReferralForm({}, false);
  document.getElementById('btn-modal-pdf').style.display = 'none';
  const modalEmailButton = document.getElementById('btn-modal-email');
  if (modalEmailButton) {
    modalEmailButton.style.display = 'none';
  }
  document.getElementById('btn-modal-save').style.display = 'inline-flex';
  document.getElementById('referral-modal').classList.add('open');
  setTimeout(() => { initServicesInput(); syncIntakeWithReferralDate(); initClientTypeAutoDefault(false); }, 100);
}

async function openEditReferral(id) {
  isPreviewMode = false;
  editingReferralId = id;
  resetChecklistPendingChanges();
  try {
    const res = await fetch(`${API}/referrals/${id}`, { headers: authHeaders() });
    const data = await res.json();
    document.getElementById('modal-title').textContent = `Edit - ${data.patient.firstName} ${data.patient.lastName}`;
    document.getElementById('modal-body').innerHTML = buildReferralForm(data, true);
    setModalReadOnly(false);
    document.getElementById('btn-modal-save').style.display = 'inline-flex';
    document.getElementById('referral-modal').classList.add('open');
    setTimeout(() => { initServicesInput(); syncIntakeWithReferralDate(); initClientTypeAutoDefault(true); }, 100);
  } catch { showToast('Could not load referral','error'); }
}

let _previewReferralId = null;
let _previewReferralName = '';

function safeFileNamePart(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '') || 'unknown';
}

function buildPreviewPdfFileName() {
  const datetime = new Date().toLocaleString('sv-SE').replace(' ', ' ') + ':' + String(new Date().getMilliseconds()).padStart(3,'0');
  return `${safeFileNamePart(_previewReferralId)}_${safeFileNamePart(_previewReferralName)}_${datetime}.pdf`;
}

async function ensureHtml2Pdf() {
  if (typeof window.html2pdf === 'function') return;
  await new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-lib="html2pdf"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('html2pdf failed to load')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.async = true;
    script.dataset.lib = 'html2pdf';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('html2pdf failed to load'));
    document.head.appendChild(script);
  });
}

async function buildPreviewPdfBlobFromCurrentContent() {
  const preview = document.getElementById('pdf-preview-content');
  if (!preview) throw new Error('preview not found');

  await ensureHtml2Pdf();
  const exportWrap = document.createElement('div');
  exportWrap.style.padding = '16px';
  exportWrap.style.background = '#ffffff';
  exportWrap.innerHTML = preview.innerHTML;

  const options = {
    margin: [10, 10, 10, 10],
    filename: buildPreviewPdfFileName(),
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] }
  };

  const worker = window.html2pdf().set(options).from(exportWrap);
  if (typeof worker.outputPdf === 'function') {
    return worker.outputPdf('blob');
  }
  await worker.toPdf();
  const pdf = await worker.get('pdf');
  return pdf.output('blob');
}

async function buildPreviewPdfPayloadForReferral(referralId) {
  await openPreviewReferral(referralId, false);
  const pdfBlob = await buildPreviewPdfBlobFromCurrentContent();
  const previewPdfBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read generated PDF'));
    reader.readAsDataURL(pdfBlob);
  });
  return {
    preview_pdf_base64: previewPdfBase64,
    preview_pdf_filename: buildPreviewPdfFileName()
  };
}

async function openPreviewReferral(id, showOverlay = true) {
  _previewReferralId = id;
  try {
    const res = await fetch(`${API}/referrals/${id}`, { headers: authHeaders() });
    const data = await res.json();
    const p = data.patient || {};
    _previewReferralName = `${p.firstName || ''} ${p.lastName || ''}`.trim();
    const addr = data.address || {};
    const ref = data.referral || {};
    const pc = data.primaryContact || {};
    const docs = (data.checklists || {}).documents || [];
    const additionalContacts = (data.checklists || {}).additionalContacts || [];
    const homeVisitTime = (data.checklists || {}).homeVisitTime || '';
    const comments = data.commentsTimeline || [];
    const checkItems = [
      'Birth Certificate',
      'Recent Bank Statement (Within 30 days)',
      'SSN Card',
      'Picture Valid ID',
      'No Insurance / Medicare/Medicaid Card',
      "Doctor's Name and Phone Number",
      'List of all Current Medications'
    ];

    const hasValue = (value) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    };
    const formatValue = (value) => {
      if (value === null || value === undefined) return '-';
      if (Array.isArray(value)) {
        return value.map(v => String(v || '').trim()).filter(Boolean).join(', ') || '-';
      }
      const text = String(value).trim();
      return text || '-';
    };
    const field = (label, value) => `<div class="pdf-field"><div class="pdf-label">${escapeHtml(label)}</div><div class="pdf-value">${escapeHtml(formatValue(value))}</div></div>`;
    const selectedKeys = new Set(
      (typeof selectedPdfFields !== 'undefined' && Array.isArray(selectedPdfFields))
        ? selectedPdfFields
        : []
    );
    const isSelected = (key) => selectedKeys.size === 0 || selectedKeys.has(key);
    const renderOrderedFields = (items = []) => items
      .filter(item => isSelected(item.key))
      .filter(item => hasValue(item.value))
      .map(item => field(item.label, item.value))
      .join('');
    const renderSection = (title, html) => {
      if (!html) return '';
      return `<div class="pdf-section"><div class="pdf-section-title">${escapeHtml(title)}</div><div class="pdf-grid">${html}</div></div>`;
    };

    const patientHtml = renderOrderedFields([
      { key: 'first_name', label: 'First name', value: p.firstName },
      { key: 'last_name', label: 'Last name', value: p.lastName },
      { key: 'dob', label: 'Date of birth', value: p.dob },
      { key: 'gender', label: 'Gender', value: p.gender },
      { key: 'client_type', label: 'Client Type', value: ref.clientType },
      { key: 'veteran_status', label: 'Veteran status', value: p.veteranStatus },
      { key: 'ssn_last', label: 'SSN', value: p.ssn_Last },
      { key: 'medicaid_last', label: 'Medicaid ID', value: p.medicaid_Last }
    ]);
    const addressHtml = renderOrderedFields([
      { key: 'address_line1', label: 'Address line 1', value: addr.line1 },
      { key: 'address_line2', label: 'Address line 2', value: addr.line2 },
      { key: 'city', label: 'City', value: addr.city },
      { key: 'state', label: 'State', value: addr.state },
      { key: 'postal_code', label: 'Postal code', value: addr.postalCode },
      { key: 'township', label: 'Township', value: addr.township || addr.country }
    ]);
    const referralHtml = renderOrderedFields([
      { key: 'referral_date', label: 'Referral date', value: ref.referralDate },
      { key: 'start_of_care', label: 'Start of care', value: ref.startOfCare },
      { key: 'referral_type', label: 'Referral Type', value: ref.referralType },
      { key: 'referral_source', label: 'Referral source', value: ref.referralSource },
      { key: 'intermediary', label: 'Intermediary', value: ref.intermediary },
      { key: 'marketer', label: 'Marketer', value: ref.marketer },
      { key: 'desired_caregiver', label: 'Desired Caregiver', value: ref.desiredCaregiver },
      { key: 'branch', label: 'Branch', value: ref.branch },
      { key: 'pay_rate_municipality', label: 'Pay rate municipality', value: ref.payRateMunicipality },
      { key: 'services_required', label: 'Services', value: data.servicesRequired || [] },
      { key: 'assigned_to', label: 'Assigned to', value: ref.assignedTo },
      { key: 'status', label: 'Status', value: data.status || ref.status }
    ]);
    const homeVisitHtml = renderOrderedFields([
      { key: 'home_visit_scheduled_date', label: 'Scheduled Date', value: ref.homeVisitScheduledDate },
      { key: 'home_visit_status', label: 'Home Visit Status', value: ref.homeVisitStatus },
      { key: 'home_visit_completed_date', label: 'Completed Date', value: ref.homeVisitCompletedDate },
      { key: 'checklists', label: 'Visit Time', value: homeVisitTime }
    ]);
    const primaryContactHtml = renderOrderedFields([
      { key: 'contact_name', label: 'Contact name', value: pc.name },
      { key: 'contact_phone', label: 'Phone', value: pc.phone },
      { key: 'contact_email', label: 'Email', value: pc.email },
      { key: 'contact_relationship', label: 'Relationship', value: pc.relationship },
      { key: 'contact_phone2', label: 'Alternate phone', value: pc.alternatePhone }
    ]);
    const additionalContactsHtml = additionalContacts
      .map((c, idx) => renderOrderedFields([
        { key: 'contact_name', label: `Contact ${idx + 2} name`, value: c.name },
        { key: 'contact_phone', label: `Contact ${idx + 2} phone`, value: c.phone },
        { key: 'contact_email', label: `Contact ${idx + 2} email`, value: c.email },
        { key: 'contact_relationship', label: `Contact ${idx + 2} relationship`, value: c.relationship },
        { key: 'contact_phone2', label: `Contact ${idx + 2} alternate phone`, value: c.alternatePhone }
      ]))
      .filter(Boolean)
      .map(html => `<div class="pdf-grid" style="margin-bottom:10px;">${html}</div>`)
      .join('');
    const archiveHtml = renderOrderedFields([
      { key: 'contract_received_date', label: 'Contract Received by Intermediary', value: ref.contractReceivedDate },
      { key: 'archive_reason', label: 'Archive Reason', value: data.archiveReason },
      { key: 'archive_restore_note', label: 'Archive Restore Note', value: data.archiveRestoreNote }
    ]);

    const checklistHtml = isSelected('document_checklist') ? checkItems.map((item, i) => {
      const d = docs[i] || {};
      if (!(d.checked || d.fileName || d.fileUrl || d.timestamp)) return '';
      return `<div class="pdf-checklist-item">
        <div class="pdf-check-box ${d.checked ? 'checked' : ''}">${d.checked ? '&#10003;' : ''}</div>
        <span style="flex:1;">${escapeHtml(item)}</span>
        ${d.fileName ? `<span style="font-size:11px;color:#0F766E;">&#128206; ${escapeHtml(d.fileName)}</span>` : ''}
        ${d.timestamp && d.checked ? `<span style="font-size:10px;color:#94a3b8;">${new Date(d.timestamp).toLocaleDateString()}</span>` : ''}
      </div>`;
    }).join('') : '';

    const stageKeys = [
      'intake_date', 'outreach_date', 'checklist_review_date', 'home_visit_date',
      'submitted_to_intermediary_date', 'intermediary_assessment_date', 'contract_received_date',
      'closed_date', 'closure_reason', 'ready_for_assessment'
    ];
    const showStageSection = stageKeys.some(isSelected);
    const showCommentsSection = isSelected('comments_timeline') && comments.length;
    const contactKeys = ['contact_name', 'contact_phone', 'contact_email', 'contact_relationship', 'contact_phone2'];
    const showAdditionalContacts = additionalContactsHtml && contactKeys.some(isSelected);

    const datetimems = new Date().toLocaleString('sv-SE').replace(' ', ' ') + ':' + String(new Date().getMilliseconds()).padStart(3,'0');
    document.getElementById('pdf-preview-content').innerHTML = `
      <div class="pdf-header">
        <div class="pdf-logo">Applied Home Health Network</div>
        <div class="pdf-meta">
          <div style="font-size:13px;font-weight:700;color:#0f172a;">${escapeHtml(formatValue(p.firstName))} ${escapeHtml(formatValue(p.lastName))}</div>
          <div>Referral ID: ${id}</div>
          <div>Status: <strong>${escapeHtml(formatValue(data.status || ref.status))}</strong></div>
          <div>Printed: ${datetimems}</div>
        </div>
      </div>

      ${renderSection('Patient Information', patientHtml)}
      ${renderSection('Address', addressHtml)}
      ${renderSection('Referral Details', referralHtml)}

      ${showStageSection ? `
      <div class="pdf-section">
        <div class="pdf-section-title">Stage Dates</div>
        <div class="pdf-grid-3">
          ${buildStageDatePreviewFields(ref.referralDate || ref.intakeDate || '', comments, field)}
        </div>
      </div>` : ''}

      ${renderSection('Home Visit', homeVisitHtml)}
      ${renderSection('Primary Contact', primaryContactHtml)}
      ${showAdditionalContacts ? `<div class="pdf-section"><div class="pdf-section-title">Additional Contacts</div>${additionalContactsHtml}</div>` : ''}
      ${renderSection('Archive Information', archiveHtml)}
      ${checklistHtml ? `<div class="pdf-section"><div class="pdf-section-title">Document Checklist</div>${checklistHtml}</div>` : ''}

      ${showCommentsSection ? `
      <div class="pdf-section">
        <div class="pdf-section-title">Comments Timeline</div>
        ${comments.map(c => `<div class="pdf-comment">
          <div class="pdf-comment-meta">${escapeHtml(formatValue(c.person))} &nbsp;&#183;&nbsp; ${escapeHtml(formatValue(c.date))}</div>
          <div class="pdf-comment-text">${escapeHtml(formatValue(c.action))}</div>
        </div>`).join('')}
      </div>` : ''}
    `;

    if (showOverlay) {
      document.getElementById('pdf-preview-overlay').style.display = 'block';
      document.body.style.overflow = 'hidden';
    }
  } catch {
    showToast('Could not load preview', 'error');
  }
}

function closePdfPreview() {
  document.getElementById('pdf-preview-overlay').style.display = 'none';
  document.body.style.overflow = '';
  _previewReferralId = null;
  _previewReferralName = '';
}

async function downloadPreviewPdf() {
  if (!_previewReferralId) return;
  const btn = document.getElementById('pdf-download-btn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Generating...';
  try {
    const pdfBlob = await buildPreviewPdfBlobFromCurrentContent();
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildPreviewPdfFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    showToast('PDF download failed', 'error');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

async function emailFromPreview() {
  if (!_previewReferralId) return;
  const btn = document.getElementById('pdf-email-btn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sending...';
  try {
    const previewPayload = await buildPreviewPdfPayloadForReferral(_previewReferralId);

    const payload = {
      referral_id: _previewReferralId,
      pdf_fields: (typeof selectedPdfFields !== 'undefined' && Array.isArray(selectedPdfFields)) ? selectedPdfFields : [],
      preview_pdf_base64: previewPayload.preview_pdf_base64,
      preview_pdf_filename: previewPayload.preview_pdf_filename
    };

    const res = await fetch(`${API}/referral/${_previewReferralId}/send-email`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || 'Could not send email');
    }
    const data = await res.json();
    showToast(`Email sent to ${data.email_result?.recipients?.join(', ') || 'recipient'}`);
    await Promise.all([refreshReferralList(), loadArchive()]);
  } catch (e) {
    showToast(e?.message || 'Email send failed', 'error');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

function setModalReadOnly(readOnly) {
  const body = document.getElementById('modal-body');
  if (!body) return;
  body.querySelectorAll('input, select, textarea, button').forEach(el => {
    if (readOnly) {
      el.setAttribute('disabled', 'disabled');
    } else {
      el.removeAttribute('disabled');
    }
  });
}

function closeModal() {
  document.getElementById('referral-modal').classList.remove('open');
  setModalReadOnly(false);
  document.getElementById('btn-modal-save').style.display = 'inline-flex';
  document.getElementById('modal-body').innerHTML = '';
  resetChecklistPendingChanges();
  editingReferralId = null;
  isPreviewMode = false;
}

function collectReferralData() {
  const gv = id => (document.getElementById(id)?.value || '').trim();
  const services = Array.from(document.querySelectorAll('#services-list .service')).map(t => t.textContent.replace('×','').trim());
  const extraContacts = Array.from(document.querySelectorAll('#primary-contacts-container .extra-contact-entry')).map(el => ({
    name: (el.querySelector('.extra-contact-name')?.value || '').trim(),
    phone: (el.querySelector('.extra-contact-phone')?.value || '').trim(),
    email: (el.querySelector('.extra-contact-email')?.value || '').trim(),
    relationship: (el.querySelector('.extra-contact-rel')?.value || '').trim(),
    alternatePhone: (el.querySelector('.extra-contact-phone2')?.value || '').trim()
  })).filter(c => c.name || c.phone || c.email || c.relationship || c.alternatePhone);
  const comments = Array.from(document.querySelectorAll('#comments-container .comment-entry')).map(el => ({
    person: el.querySelector('.comment-author')?.value || '',
    date: el.querySelector('.comment-date')?.value || '',
    type: el.querySelector('.comment-type')?.value || '',
    typeLabel: getCommentTypeLabel(el.querySelector('.comment-type')?.value || '', el.querySelector('.comment-type option:checked')?.textContent || ''),
    template_text: el.dataset.templateText || '',
    action: el.querySelector('.comment-text')?.value || ''
  })).filter(c => c.action || c.type);
  const latestComment = comments.length ? comments[comments.length - 1] : null;
  const commentDerivedStage = (latestComment?.typeLabel || '').trim();
  const checkItems = ["Birth Certificate","Recent Bank Statement (Within 30 days)","SSN Card","Picture Valid ID","No Insurance / Medicare/Medicaid Card","Doctor's Name and Phone Number","List of all Current Medications"];
  const docs = checkItems.map((_, i) => {
    const chk = document.getElementById(`chk-${i}`);
    const fileInput = document.querySelector(`#chk-file-${i}`);
    const existingFileUrl = fileInput?.dataset.fileUrl || '';
    const existingFileName = fileInput?.dataset.fileName || '';
    return chk ? { checked: chk.checked, timestamp: chk.checked ? new Date().toISOString() : '', fileUrl: existingFileUrl, fileName: existingFileName } : {};
  });
  return {
    first_name: gv('f-firstName'), last_name: gv('f-lastName'),
    dob: gv('f-dob'), gender: gv('f-gender'), veteran_status: gv('f-veteran'),
    ssn_Last: gv('f-ssn'), medicaid_Last: gv('f-medicaid'),
    address_line1: gv('f-line1'), address_line2: gv('f-line2'),
    city: gv('f-city'), state: gv('f-state'), postal_code: gv('f-postalCode'), country: gv('f-township'), township: gv('f-township'),
    referral_date: gv('f-referralDate'), referral_source: gv('f-referralSource'),
    referral_type: gv('f-referralType'),
    intermediary: gv('f-intermediary'),
    branch: gv('f-branch'), marketer: document.getElementById('f-marketer')?.value || '', client_type: gv('f-clientType'),
    desired_caregiver: gv('f-desiredCaregiver'),
    pay_rate_municipality: gv('f-payRate'), start_of_care: gv('f-startOfCare'),
    status: gv('f-status') || commentDerivedStage || 'New', assigned_to: gv('f-assignedTo'),
    archive_reason: gv('f-archiveReason'),
    archive_restore_note: gv('f-archiveRestoreNote'),
    services_required: services,
    intake_date: gv('f-referralDate'), outreach_date: gv('f-outreachDate'),
    checklist_review_date: gv('f-checklistDate'), home_visit_date: gv('f-homeVisitDate'),
    home_visit_scheduled_date: gv('f-homeVisitScheduledDate'), home_visit_completed_date: gv('f-homeVisitCompletedDate'),
    home_visit_status: gv('f-homeVisitStatus'),
    submitted_to_intermediary_date: gv('f-submittedDate'),
    intermediary_assessment_date: gv('f-assessmentDate'),
    contract_received_date: gv('f-contractDate'), closed_date: gv('f-closedDate'),
    closure_reason: gv('f-closureReason'), ready_for_assessment: gv('f-readyForAssessment'),
    contact_name: gv('f-contactName'), contact_phone: gv('f-contactPhone'),
    contact_email: gv('f-contactEmail'), contact_relationship: gv('f-contactRel'),
    contact_phone2: gv('f-contactPhone2'),
    comments_timeline: comments,
    checklists: { documents: docs, additionalContacts: extraContacts, homeVisitTime: gv('f-homeVisitTime') }
  };
}

function validateReferral(d) {
  const errs = [];
  const req = {
    'f-firstName': 'err-firstName', 'f-lastName': 'err-lastName',
    'f-dob': 'err-dob', 'f-gender': 'err-gender',
    'f-veteran': 'err-veteran', 'f-ssn': 'err-ssn',
    'f-medicaid': 'err-medicaid', 'f-referralSource': 'err-referralSource', 'f-referralType': 'err-referralType',
    'f-intermediary': 'err-intermediary',
    'f-line1': 'err-line1', 'f-city': 'err-city',
    'f-state': 'err-state', 'f-postalCode': 'err-postalCode', 'f-township': 'err-township',
    'f-referralDate': 'err-referralDate', 'f-branch': 'err-branch',
    'f-clientType': 'err-clientType', 'f-desiredCaregiver': 'err-desiredCaregiver', 'f-payRate': 'err-payRate', 'f-marketer': 'err-marketer',
    'f-startOfCare': 'err-startOfCare', 'f-assignedTo': 'err-assignedTo', 'f-status': 'err-status',
    'f-contactName': 'err-contactName', 'f-contactPhone': 'err-contactPhone',
    'f-contactEmail': 'err-contactEmail', 'f-contactRel': 'err-contactRel'
  };
  document.querySelectorAll('.form-group.error').forEach(el => el.classList.remove('error'));
  document.querySelectorAll('.field-error').forEach(el => el.style.display = 'none');
  for (const [id, eid] of Object.entries(req)) {
    const el = document.getElementById(id);
    if (!el?.value.trim()) {
      el?.closest('.form-group')?.classList.add('error');
      const errEl = document.getElementById(eid);
      if (errEl) errEl.style.display = 'block';
      errs.push(id.replace('f-',''));
    }
  }

  const validations = [
    { id: 'f-firstName', errId: 'err-firstName', re: /^[A-Za-z\s]{1,50}$/, msg: 'Only letters allowed (max 50)' },
    { id: 'f-lastName', errId: 'err-lastName', re: /^[A-Za-z\s]{1,50}$/, msg: 'Only letters allowed (max 50)' },
    { id: 'f-ssn', errId: 'err-ssn', re: /^\d{4,9}$/, msg: 'SSN must be 4 to 9 digits' },
    { id: 'f-medicaid', errId: 'err-medicaid', re: /^\d{10,15}$/, msg: 'Medicaid ID must be 10 to 15 digits' },
    { id: 'f-line1', errId: 'err-line1', re: /^[A-Za-z0-9\s,./#'\-]{1,100}$/, msg: 'Use up to 100 chars (letters, numbers, spaces, comma, dot, slash, #, hyphen)' },
    { id: 'f-line2', errId: 'err-line2', re: /^$|^[\s\S]{0,100}$/, msg: 'Max 100 characters' },
    { id: 'f-city', errId: 'err-city', re: /^[A-Za-z\s]{1,50}$/, msg: 'Only letters allowed (max 50)' },
    { id: 'f-state', errId: 'err-state', re: /^[A-Za-z\s]+$/, msg: 'Only letters allowed' },
    { id: 'f-postalCode', errId: 'err-postalCode', re: /^\d{5,10}$/, msg: 'Postal code must be 5 to 10 digits' },
    { id: 'f-township', errId: 'err-township', re: /^[A-Za-z\s]+$/, msg: 'Only letters allowed' },
    { id: 'f-payRate', errId: 'err-payRate', re: /^\d+$/, msg: 'Numbers only' },
    { id: 'f-contactName', errId: 'err-contactName', re: /^[A-Za-z\s]{1,50}$/, msg: 'Only letters allowed (max 50)' },
    { id: 'f-contactPhone', errId: 'err-contactPhone', re: /^\d{10,15}$/, msg: 'Phone must be 10 to 15 digits' },
    { id: 'f-contactPhone2', errId: 'err-contactPhone2', re: /^$|^\d{1,15}$/, msg: 'Alternate phone must be numeric' },
    { id: 'f-contactEmail', errId: 'err-contactEmail', re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, msg: 'Invalid email format' }
  ];

  validations.forEach(({ id, errId, re, msg }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = (el?.value || '').trim();
    if (val && !re.test(val)) {
      el?.closest('.form-group')?.classList.add('error');
      const errEl = errId ? document.getElementById(errId) : null;
      if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
      }
      errs.push(id.replace('f-',''));
    }
  });

  document.querySelectorAll('#comments-container .comment-text').forEach((el, idx) => {
    if ((el.value || '').length > 500) {
      el.closest('.form-group')?.classList.add('error');
      errs.push(`comment-${idx}`);
    }
  });

  document.querySelectorAll('#comments-container .comment-entry').forEach((entry, idx) => {
    const typeEl = entry.querySelector('.comment-type');
    const textEl = entry.querySelector('.comment-text');
    if ((textEl?.value || '').trim() && !(typeEl?.value || '').trim()) {
      typeEl?.closest('.form-group')?.classList.add('error');
      errs.push(`comment-type-${idx}`);
    }
  });

  if (!d.services_required.length) {
    document.getElementById('err-services').style.display = 'block';
    errs.push('services');
  }

  return errs;
}

async function submitReferral() {
  if (editingReferralId) {
    const checklistOk = await persistChecklistPendingChanges(editingReferralId);
    if (!checklistOk) return;
  }

  const data = collectReferralData();
  const errs = validateReferral(data);
  if (errs.length) { showToast('Please fill required fields','error'); return; }

  const hasContractDate = !!(data.contract_received_date || '').trim();
  const hasArchiveReason = !!(data.archive_reason || '').trim();

  const url = editingReferralId ? `${API}/referrals/${editingReferralId}` : `${API}/referrals`;
  const method = editingReferralId ? 'PUT' : 'POST';
  try {
    const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(data) });
    if (!res.ok) { const e = await res.json(); showToast(e.detail||'Error saving','error'); return; }
    const result = await res.json();
    showToast(editingReferralId ? 'Referral updated' : 'Referral created');

    // Auto-archive only when both archive fields are filled
    const savedId = editingReferralId || result.id;
    if (hasContractDate && hasArchiveReason && editingReferralId) {
      const archiveReason = data.archive_reason;
      const archiveRes = await fetch(`${API}/referrals/${savedId}/archive?reason=${encodeURIComponent(archiveReason)}`, { method:'POST', headers: authHeaders() });
      if (archiveRes.ok) showToast('Record archived');
      else {
        const e = await archiveRes.json().catch(() => ({}));
        showToast(e.detail || 'Could not archive record', 'error');
        return;
      }
    }
    closeModal();
    await Promise.all([refreshReferralList(), loadArchive()]);
    if (document.getElementById('tab-dashboard')?.classList.contains('active')) {
      loadDashboard();
    }
  } catch { showToast('Server error','error'); }
}

// â”€â”€â”€ SYNC INTAKE DATE WITH REFERRAL DATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function syncIntakeWithReferralDate() {
  const refDate = document.getElementById('f-referralDate');
  const intakeDate = document.getElementById('f-intakeDate');
  if (!refDate || !intakeDate) return;
  
  // Set intake date to referral date if referral date has a value
  if (refDate.value) {
    intakeDate.value = refDate.value;
  }
  
  // Listen for changes to referral date and update intake date
  refDate.addEventListener('change', () => {
    if (refDate.value) {
      intakeDate.value = refDate.value;
    }
  });
}

function parseMdYDate(value) {
  if (!value) return null;
  const parts = value.split('/');
  if (parts.length !== 3) return null;
  const mm = Number(parts[0]);
  const dd = Number(parts[1]);
  const yyyy = Number(parts[2]);
  if (!mm || !dd || !yyyy) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
}

function getAgeYears(dob) {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function findClientTypeOptionByKeyword(selectEl, keyword) {
  if (!selectEl) return null;
  const k = (keyword || '').toLowerCase();
  return Array.from(selectEl.options).find(opt =>
    (opt.value || '').toLowerCase().includes(k) || (opt.textContent || '').toLowerCase().includes(k)
  ) || null;
}

function initClientTypeAutoDefault(isEditing = false) {
  // Existing referrals should keep their saved client type unless user changes manually.
  if (isEditing) return;

  const dobInput = document.getElementById('f-dob');
  const clientTypeSelect = document.getElementById('f-clientType');
  if (!dobInput || !clientTypeSelect) return;

  const applyDefault = () => {
    const dob = parseMdYDate(dobInput.value.trim());
    if (!dob) return;

    const age = getAgeYears(dob);
    const idoaOption = findClientTypeOptionByKeyword(clientTypeSelect, 'idoa');
    const dorsOption = findClientTypeOptionByKeyword(clientTypeSelect, 'dors');
    const target = age >= 60 ? idoaOption : dorsOption;
    if (!target) return;

    const hasManualOverride = clientTypeSelect.dataset.manualOverride === '1';
    const currentValue = clientTypeSelect.value;
    const lastAutoValue = clientTypeSelect.dataset.autoValue || '';
    const canAutoApply = !hasManualOverride || !currentValue || currentValue === lastAutoValue;

    if (canAutoApply) {
      clientTypeSelect.value = target.value;
      clientTypeSelect.dataset.autoValue = target.value;
      clientTypeSelect.dataset.manualOverride = '0';
    }
  };

  clientTypeSelect.addEventListener('change', () => {
    clientTypeSelect.dataset.manualOverride = '1';
  });

  dobInput.addEventListener('change', applyDefault);
  applyDefault();
}

// â”€â”€â”€ SERVICES INPUT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initServicesInput() {
  const input = document.getElementById('f-services');
  const sugg = document.getElementById('services-suggestions');
  if (!input || !sugg) return;
  const allServices = (dropdowns.services || []).map(s => s.value);

  input.addEventListener('input', function() {
    const q = this.value.toLowerCase();
    if (q.length < 1) { sugg.classList.remove('open'); return; }
    const existing = Array.from(document.querySelectorAll('#services-list .service')).map(t => t.textContent.replace('×','').trim().toLowerCase());
    const filtered = allServices.filter(s => s.toLowerCase().includes(q) && !existing.includes(s.toLowerCase()));
    sugg.innerHTML = filtered.map(s => `<div class="suggestion" onclick="addService('${s}')">${s}</div>`).join('');
    sugg.classList.toggle('open', filtered.length > 0);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); addService(input.value.trim()); }
    if (e.key === 'Escape') sugg.classList.remove('open');
  });
}

function addService(val) {
  const list = document.getElementById('services-list');
  const input = document.getElementById('f-services');
  const sugg = document.getElementById('services-suggestions');
  const exists = Array.from(list.querySelectorAll('.service')).some(t => t.textContent.replace('×','').trim() === val);
  if (!exists) {
    const services = document.createElement('div'); services.className = 'service';
    services.innerHTML = `${val}<span class="service-remove" onclick="removeService(this)">&times;</span>`;
    list.appendChild(services);
  }
  if (input) input.value = '';
  if (sugg) sugg.classList.remove('open');
}

function removeService(span) { span.closest('.service').remove(); }

// â”€â”€â”€ DATE PICKER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function dpToggle(fieldId) {
  const popup = document.getElementById('dp-' + fieldId);
  if (!popup) return;
  const was = popup.classList.contains('open');
  document.querySelectorAll('.dp-popup.open').forEach(p => p.classList.remove('open'));
  if (!was) { renderDp(fieldId); popup.classList.add('open'); }
}
function renderDp(fieldId) {
  const popup = document.getElementById('dp-' + fieldId);
  const input = document.getElementById(fieldId);
  if (!popup || !input) return;
  if (!popup.__date) popup.__date = new Date();
  const cur = popup.__date;
  const m = cur.getMonth(), y = cur.getFullYear();
  const firstDay = new Date(y,m,1).getDay();
  const days = new Date(y,m+1,0).getDate();
  const today = new Date();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthOptions = monthNames.map((name, idx) => `<option value="${idx}" ${idx===m?'selected':''}>${name}</option>`).join('');
  const thisYear = new Date().getFullYear();
  const startYear = thisYear - 120;
  const endYear = thisYear + 20;
  const yearOptions = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)
    .map(yr => `<option value="${yr}" ${yr===y?'selected':''}>${yr}</option>`).join('');

  let html = `<div onclick="event.stopPropagation()">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);gap:8px;">
    <button type="button" class="btn" style="padding:4px 10px;" onclick="dpNav('${fieldId}',-1)">&lsaquo;</button>
    <div style="display:flex;gap:8px;align-items:center;flex:1;justify-content:center;">
      <select class="form-select" style="max-width:150px;padding:6px 30px 6px 10px;border-radius:10px;" onchange="dpSetMonthYear('${fieldId}', this.value, null)">${monthOptions}</select>
      <select class="form-select" style="max-width:110px;padding:6px 30px 6px 10px;border-radius:10px;" onchange="dpSetMonthYear('${fieldId}', null, this.value)">${yearOptions}</select>
    </div>
    <button type="button" class="btn" style="padding:4px 10px;" onclick="dpNav('${fieldId}',1)">&rsaquo;</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:10px;font-size:11px;color:var(--text-muted);text-align:center;">
    <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;padding:0 10px 10px;">`;
  for (let i=0;i<firstDay;i++) html += '<div></div>';
  for (let d=1;d<=days;d++) {
    const ds = `${String(m+1).padStart(2,'0')}/${String(d).padStart(2,'0')}/${y}`;
    const isT = d===today.getDate()&&m===today.getMonth()&&y===today.getFullYear();
    html += `<button type="button" onclick="dpPick('${fieldId}','${ds}')" style="border:none;border-radius:8px;padding:7px 0;background:${isT?'var(--accent-light)':'transparent'};color:${isT?'var(--accent-text)':'var(--text-primary)'};cursor:pointer;font-size:12px;">${d}</button>`;
  }
  html += '</div></div>';
  popup.innerHTML = html;
}
function dpNav(fieldId, delta) {
  const popup = document.getElementById('dp-' + fieldId);
  if (!popup.__date) popup.__date = new Date();
  popup.__date.setMonth(popup.__date.getMonth() + delta);
  renderDp(fieldId);
}

function dpSetMonthYear(fieldId, month, year) {
  const popup = document.getElementById('dp-' + fieldId);
  if (!popup) return;
  if (!popup.__date) popup.__date = new Date();
  const d = new Date(popup.__date);
  const nextMonth = month === null ? d.getMonth() : Number(month);
  const nextYear = year === null ? d.getFullYear() : Number(year);
  d.setFullYear(nextYear, nextMonth, 1);
  popup.__date = d;
  renderDp(fieldId);
}
function dpPick(fieldId, val) {
  const el = document.getElementById(fieldId);
  const popup = document.getElementById('dp-' + fieldId);
  if (el) {
    el.value = val;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (popup) popup.classList.remove('open');
}
window.addEventListener('click', e => {
  if (e.target.closest('.dp-wrapper') || e.target.closest('.dp-popup')) return;
  document.querySelectorAll('.dp-popup.open').forEach(p => p.classList.remove('open'));
});

