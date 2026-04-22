// â”€â”€â”€ REFERRALS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function setReferralView(mode) {
  referralViewMode = mode === 'intermediary' ? 'intermediary' : 'all';
  if (referralViewMode === 'intermediary') {
    const intermediaryFilter = document.getElementById('intermediary-filter');
    if (intermediaryFilter) intermediaryFilter.value = '';
  }
  document.getElementById('view-all-btn')?.classList.toggle('active', referralViewMode === 'all');
  document.getElementById('view-intermediary-btn')?.classList.toggle('active', referralViewMode === 'intermediary');
  document.getElementById('all-referrals-section')?.classList.toggle('active', referralViewMode === 'all');
  document.getElementById('intermediary-referrals-section')?.classList.toggle('active', referralViewMode === 'intermediary');
  document.getElementById('intermediary-filter')?.classList.toggle('hide', referralViewMode === 'all');
  document.getElementById('btn-preview-followup')?.classList.toggle('hide', referralViewMode === 'all');
  ensureIntermediaryAutoStatusPolling();
  filterTable();
}

let intermediaryAutoStatusPollId = null;
let intermediaryRemainingTickerId = null;

function computeIntermediaryNextDueMs(group) {
  const rawTime = String(group?.follow_up_send_time || '09:00').trim();
  const m = rawTime.match(/^(\d{2}):(\d{2})$/);
  if (!m) return NaN;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return NaN;

  const frequency = String(group?.follow_up_frequency || 'weekly').toLowerCase();
  const intervalDays = frequency === 'daily' ? 1 : (frequency === 'monthly' ? 30 : 7);
  const now = new Date();
  const scheduledToday = new Date(now);
  scheduledToday.setHours(hh, mm, 0, 0);

  // If today's schedule time is still ahead, next run should be today.
  if (now < scheduledToday) {
    return scheduledToday.getTime();
  }

  let nextDue;
  const lastRaw = group?.last_follow_up_sent;
  if (lastRaw) {
    const lastSent = new Date(lastRaw);
    if (!Number.isNaN(lastSent.getTime())) {
      nextDue = new Date(lastSent);
      nextDue.setDate(nextDue.getDate() + intervalDays);
      nextDue.setHours(hh, mm, 0, 0);
      while (nextDue <= now) {
        nextDue.setDate(nextDue.getDate() + intervalDays);
      }
    }
  }

  if (!nextDue) {
    nextDue = new Date(now);
    nextDue.setHours(hh, mm, 0, 0);
    if (nextDue <= now) {
      nextDue.setDate(nextDue.getDate() + 1);
    }
  }

  return nextDue.getTime();
}

function formatIntermediaryRemainingText(diffMs) {
  if (!Number.isFinite(diffMs)) return '-';
  if (diffMs <= 0) return 'Due now';
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function updateIntermediaryRemainingTimeCells() {
  const cells = document.querySelectorAll('#intermediary-table-container [data-next-due-ms]');
  if (!cells.length) return;
  const nowMs = Date.now();
  cells.forEach(cell => {
    const raw = Number(cell.getAttribute('data-next-due-ms'));
    const text = formatIntermediaryRemainingText(raw - nowMs);
    cell.textContent = text;
  });
}

function ensureIntermediaryRemainingTicker() {
  if (intermediaryRemainingTickerId) return;
  intermediaryRemainingTickerId = setInterval(() => {
    const isIntermediaryView = referralViewMode === 'intermediary';
    const isReferralTabOpen = !!document.getElementById('tab-referral-list')?.classList.contains('active');
    if (!isIntermediaryView || !isReferralTabOpen) return;
    updateIntermediaryRemainingTimeCells();
  }, 1000);
}

function ensureIntermediaryAutoStatusPolling() {
  if (intermediaryAutoStatusPollId) return;
  intermediaryAutoStatusPollId = setInterval(async () => {
    const isIntermediaryView = referralViewMode === 'intermediary';
    const isReferralTabOpen = !!document.getElementById('tab-referral-list')?.classList.contains('active');
    if (!isIntermediaryView || !isReferralTabOpen) return;
    await refreshGroupedReferrals();
  }, 60000);
}

async function refreshReferralList() {
  await Promise.all([refreshReferrals(), refreshGroupedReferrals()]);
  filterTable();
}

async function refreshReferrals() {
  try {
    const res = await fetch(`${API}/referrals`, { headers: authHeaders() });
    allReferrals = await res.json();
    generateEvents();
    populateIntermediaryFilter();
    if (referralViewMode === 'all' && document.getElementById('tab-referral-list')?.classList.contains('active')) {
      renderTable(allReferrals);
    }
  } catch { showToast('Could not load referrals','error'); }
}

async function refreshGroupedReferrals() {
  try {
    const previousGroups = Array.isArray(intermediaryGroups) ? intermediaryGroups : [];
    const res = await fetch(`${API}/referrals/by-intermediary`, { headers: authHeaders() });
    if (!res.ok) throw new Error('grouped referrals api failed');
    intermediaryGroups = await res.json();
    notifyAutoFollowUpChanges(previousGroups, intermediaryGroups);
    if (referralViewMode === 'intermediary' && document.getElementById('tab-referral-list')?.classList.contains('active')) {
      renderIntermediaryGroups(intermediaryGroups);
    }
  } catch {
    intermediaryGroups = buildIntermediaryGroupsFromReferrals(allReferrals || []);
    if (referralViewMode === 'intermediary' && document.getElementById('tab-referral-list')?.classList.contains('active')) {
      renderIntermediaryGroups(intermediaryGroups);
    }
  }
}

function buildIntermediaryGroupsFromReferrals(refs) {
  const map = new Map();
  (refs || []).forEach(r => {
    const clientType = String(r?.referral?.clientType || '').toUpperCase();
    const referralType = String(r?.referral?.referralType || '').toUpperCase();
    if (!clientType.includes('IDOA') && !referralType.includes('IDOA')) return;
    const intermediaryName = (r?.referral?.intermediary || '').trim() || 'Unassigned';
    if (!map.has(intermediaryName)) {
      map.set(intermediaryName, {
        intermediary: intermediaryName,
        email: '-',
        total_referrals: 0,
        pending_follow_ups: 0,
        last_follow_up_sent: null,
        referrals: [],
      });
    }
    const group = map.get(intermediaryName);
    const includeFollowUp = !!r?.followUp?.includeInFollowUp;
    group.referrals.push({
      id: r.id,
      patient_name: `${r?.patient?.firstName || ''} ${r?.patient?.lastName || ''}`.trim() || '-',
      date_sent: r?.referral?.referralDate || '-',
      status: r?.status || '-',
      include_in_follow_up: includeFollowUp,
      last_follow_up_sent: r?.followUp?.lastFollowUpSentDate || null,
    });
    group.total_referrals += 1;
    if (includeFollowUp) group.pending_follow_ups += 1;
  });
  return Array.from(map.values()).sort((a, b) => (a.intermediary || '').localeCompare(b.intermediary || ''));
}

function populateIntermediaryFilter() {
  const sel = document.getElementById('intermediary-filter');
  if (!sel) return;
  const current = sel.value;
  const set = new Set();
  (dropdowns.intermediary || []).forEach(i => set.add(i.value));
  (allReferrals || []).forEach(r => {
    const value = (r?.referral?.intermediary || '').trim();
    if (value) set.add(value);
  });
  sel.innerHTML = '<option value="">All intermediaries</option>';
  Array.from(set).sort((a, b) => a.localeCompare(b)).forEach(name => {
    sel.innerHTML += `<option value="${name}">${name}</option>`;
  });
  sel.value = current || '';
}

async function loadArchive() {
  try {
    const res = await fetch(`${API}/referrals?archived=true`, { headers: authHeaders() });
    allArchive = await res.json();
    renderArchiveTable(allArchive);
  } catch { showToast('Could not load archive','error'); }
}

function getBadge(status) {
  const s = (status||'').toLowerCase();
  if (s.includes('complete')) return 'badge-completed';
  if (s.includes('schedul')) return 'badge-scheduled';
  if (s.includes('close')) return 'badge-closed';
  if (s.includes('pending')) return 'badge-assessment';
  if (s === 'new') return 'badge-new';
  return 'badge-referral';
}

function getLatestScheduleNote(notes) {
  if (!Array.isArray(notes) || !notes.length) return '';
  const noteTime = entry => Date.parse(entry?.timestamp || entry?.createdAt || entry?.date || '') || 0;
  const latest = notes.reduce((currentLatest, entry) => {
    if (!currentLatest) return entry;
    return noteTime(entry) >= noteTime(currentLatest) ? entry : currentLatest;
  }, null);
  return latest?.note || notes[notes.length - 1]?.note || '';
}

function getTimelineEntryParsedTime(entry, idx = 0) {
  const mdyDate = parseMdYDate(entry?.date || '');
  const parsed = mdyDate
    ? mdyDate.getTime()
    : (Date.parse(entry?.timestamp || entry?.createdAt || entry?.date || '') || 0);
  return { parsed, idx };
}

function getLatestTimelineEntry(comments) {
  if (!Array.isArray(comments) || !comments.length) return '';
  const dated = comments
    .map((entry, idx) => ({ entry, ...getTimelineEntryParsedTime(entry, idx) }))
    .filter(item => item.entry && (item.entry.action || item.entry.text));
  if (!dated.length) return null;
  dated.sort((a, b) => {
    if (b.parsed !== a.parsed) return b.parsed - a.parsed;
    return b.idx - a.idx;
  });
  return dated[0]?.entry || null;
}

function getLatestTimelineComment(comments) {
  const latest = getLatestTimelineEntry(comments);
  if (!latest) return '';
  return latest?.action || latest?.text || '';
}

function getCommentStageDateEntries(comments) {
  if (!Array.isArray(comments) || !comments.length) return [];
  const latestByType = new Map();
  comments.forEach((entry, idx) => {
    const label = (entry?.typeLabel || entry?.type || '').trim();
    const date = (entry?.date || '').trim();
    if (!label || !date) return;
    const current = latestByType.get(label);
    const candidate = { label, date, ...getTimelineEntryParsedTime(entry, idx) };
    if (!current || candidate.parsed > current.parsed || (candidate.parsed === current.parsed && candidate.idx > current.idx)) {
      latestByType.set(label, candidate);
    }
  });
  return Array.from(latestByType.values())
    .sort((a, b) => {
      if (a.parsed !== b.parsed) return a.parsed - b.parsed;
      return a.idx - b.idx;
    })
    .map(({ label, date }) => ({ label, date }));
}

function buildStageDateFormRows(referralDate, comments) {
  const stageEntries = [{ label: 'Intake', date: referralDate || '' }, ...getCommentStageDateEntries(comments)];
  const rows = [];
  for (let i = 0; i < stageEntries.length; i += 2) {
    const left = stageEntries[i];
    const right = stageEntries[i + 1];
    rows.push(`<div class="form-row">
      <div class="form-group"><label class="form-label">${left.label}</label><input class="form-input" value="${left.date}" readonly></div>
      ${right ? `<div class="form-group"><label class="form-label">${right.label}</label><input class="form-input" value="${right.date}" readonly></div>` : '<div class="form-group"></div>'}
    </div>`);
  }
  return rows.join('');
}

function buildStageDatePreviewFields(referralDate, comments, fieldRenderer) {
  const stageEntries = [{ label: 'Intake', date: referralDate || '' }, ...getCommentStageDateEntries(comments)];
  return stageEntries.map(item => fieldRenderer(item.label, item.date)).join('');
}

function renderTable(refs) {
  const c = document.getElementById('referral-table-container');
  if (!refs.length) { c.innerHTML = '<div class="loading">No referrals found.</div>'; return; }
  const canEdit = currentUser?.permissions?.can_edit_referral;
  const canArchive = currentUser?.permissions?.can_archive;
  const isAdmin = currentUser?.role === 'admin';
  c.innerHTML = `<table><thead><tr>
    <th>Referral Date</th><th>Referral Source</th><th>Last Name</th><th>First Name</th>
    <th>Primary Phone</th><th>Address</th><th>City</th><th>Postal Code</th>
    <th>Date of Birth</th><th>Status</th><th>Client Type</th><th>Notes</th><th>Actions</th>
  </tr></thead><tbody>${refs.map(r => {
    const lastComment = getLatestTimelineComment(r.commentsTimeline || []);
    const lastNote = lastComment || getLatestScheduleNote(r.referral?.scheduleNotes || []);
    return `
    <tr>
      <td>${r.referral?.referralDate||'-'}</td>
      <td>${r.referral?.referralSource||'-'}</td>
      <td>${r.patient.lastName}</td>
      <td>${r.patient.firstName}</td>
      <td>${r.primaryContact?.phone||'-'}</td>
      <td>${r.address.line1||'-'}</td>
      <td>${r.address.city||'-'}</td>
      <td>${r.address.postalCode||'-'}</td>
      <td>${r.patient.dob||'-'}</td>
      <td><span class="status-badge ${getBadge(r.status)}">${r.status||'New'}</span></td>
      <td>${r.referral?.clientType||'-'}</td>
      <td>${lastNote || '-'}</td>
      <td style="white-space:nowrap;">
        ${canEdit ? `<button class="btn btn-sm" onclick="openEditReferral('${r.id}')">Edit</button>` : ''}
        <button class="btn btn-sm" onclick="openPreviewReferral('${r.id}')">Preview</button>
        ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteRef('${r.id}')">Delete</button>` : ''}
      </td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

function renderIntermediaryGroups(groups) {
  const c = document.getElementById('intermediary-table-container');
  if (!groups.length) {
    c.innerHTML = '<div class="loading">No intermediary groups found.</div>';
    return;
  }
  const canEmail = currentUser?.role === 'admin' || currentUser?.permissions?.can_send_emails;

  const referralById = new Map((allReferrals || []).map(r => [r.id, r]));
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
  const formatDateTime = (raw) => {
    if (!raw) return '-';
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '-';
    return dt.toLocaleString();
  };
  const formatSchedule = (group) => {
    const freq = String(group?.follow_up_frequency || 'weekly');
    const time = String(group?.follow_up_send_time || '09:00');
    const capFreq = freq.charAt(0).toUpperCase() + freq.slice(1);
    return `${capFreq} @ ${time}`;
  };
  const buildRemainingTimeCell = (group) => {
    const nextDueMs = computeIntermediaryNextDueMs(group);
    const initialText = formatIntermediaryRemainingText(nextDueMs - Date.now());
    if (!Number.isFinite(nextDueMs)) return '-';
    return `<span data-next-due-ms="${nextDueMs}">${escapeHtml(initialText)}</span>`;
  };

  const previewRowsForGroup = (group, idx) => {
    if (!intermediaryPreviewOpen[group.intermediary]) return '';
    const rows = (group.referrals || []).map(ref => {
      const full = referralById.get(ref.id);
      const dob = full?.patient?.dob || '-';
      return `
        <tr>
          <td>${escapeHtml(ref.patient_name || '-')}</td>
          <td>${escapeHtml(dob)}</td>
          <td></td>
          <td></td>
          <td></td>
          <td>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-sm ${ref.include_in_follow_up ? '' : 'btn-warn'}" onclick="toggleFollowUpInclude('${ref.id}', ${!ref.include_in_follow_up})">
                ${ref.include_in_follow_up ? 'ON' : 'OFF'}
              </button>
              ${canEmail ? `<button class="btn btn-sm" onclick="sendEmailFromIntermediaryRow('${ref.id}')">Email</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <tr class="intermediary-preview-row">
        <td colspan="7">
          <div class="intermediary-preview-wrap">
            <table class="intermediary-preview-table">
              <thead>
                <tr>
                  <th>Referral Name</th>
                  <th>Date of Birth</th>
                  <th>Status</th>
                  <th>Assessment Date</th>
                  <th>Feedback</th>
                  <th>Follow-Up (On/Off)</th>
                </tr>
              </thead>
              <tbody>${rows || '<tr><td colspan="6">No referrals found.</td></tr>'}</tbody>
            </table>
          </div>
        </td>
      </tr>
    `;
  };

  c.innerHTML = `<table>
    <thead>
      <tr>
        <th>Intermediary ID</th>
        <th>Intermediary Name</th>
        <th>Intermediary Email</th>
        <th>Schedule</th>
        <th>Last Auto Email</th>
        <th>Remaining Time</th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody>
      ${groups.map((group, idx) => {
        const intermediaryId = `INT-${String(idx + 1).padStart(3, '0')}`;
        const enabledCount = (group.referrals || []).filter(r => !!r.include_in_follow_up).length;
        const hasEnabled = enabledCount > 0;
        const toggleColor = hasEnabled ? '#15803d' : '#b91c1c';
        return `
          <tr>
            <td>${intermediaryId}</td>
            <td>${escapeHtml(group.intermediary || 'Unassigned')}</td>
            <td>${escapeHtml(group.email || '-')}</td>
            <td>${escapeHtml(formatSchedule(group))}</td>
            <td>${escapeHtml(formatDateTime(group.last_follow_up_sent))}</td>
            <td>${buildRemainingTimeCell(group)}</td>
            <td style="white-space:nowrap;">
              <button class="btn btn-sm" onclick="toggleIntermediaryPreview('${(group.intermediary || '').replace(/'/g, "\\'")}')">
                ${intermediaryPreviewOpen[group.intermediary] ? 'Hide Preview' : 'Preview'}
              </button>
              <button class="btn btn-sm" onclick="previewIntermediarySchedule('${(group.intermediary || '').replace(/'/g, "\\'")}')">
                Preview Schedule
              </button>
              <button class="btn btn-sm" style="color:${toggleColor};font-weight:700;" onclick="handleIntermediaryToggleAction('${(group.intermediary || '').replace(/'/g, "\\'")}', ${!hasEnabled})">
                TOGGLE ${hasEnabled ? 'ON' : 'OFF'}
              </button>
            </td>
          </tr>
          ${previewRowsForGroup(group, idx)}
        `;
      }).join('')}
    </tbody>
  </table>`;

  updateIntermediaryRemainingTimeCells();
  ensureIntermediaryRemainingTicker();
}

function notifyAutoFollowUpChanges(previousGroups, nextGroups) {
  const prevMap = new Map((previousGroups || []).map(g => [String(g?.intermediary || '').toLowerCase(), g?.last_follow_up_sent || null]));
  const updates = (nextGroups || []).filter(g => {
    const key = String(g?.intermediary || '').toLowerCase();
    const prev = prevMap.get(key) || null;
    const curr = g?.last_follow_up_sent || null;
    return !!curr && curr !== prev;
  });
  if (!updates.length) return;
  const names = updates.slice(0, 3).map(g => g.intermediary).filter(Boolean);
  const more = updates.length > 3 ? ` +${updates.length - 3} more` : '';
  showToast(`Auto follow-up email sent: ${names.join(', ')}${more}`);
}

function toggleIntermediaryPreview(intermediaryName) {
  intermediaryPreviewOpen[intermediaryName] = !intermediaryPreviewOpen[intermediaryName];
  filterTable();
}

let pendingIntermediaryToggle = null;

async function previewIntermediarySchedule(intermediaryName) {
  await openIntermediaryScheduleModal(intermediaryName, null);
}

async function handleIntermediaryToggleAction(intermediaryName, includeInFollowUp) {
  if (!includeInFollowUp) {
    await openIntermediaryScheduleModal(intermediaryName, includeInFollowUp);
    return;
  }
  await toggleIntermediaryGroupFollowUp(intermediaryName, includeInFollowUp);
}

async function getIntermediaryMappingByName(intermediaryName) {
  const name = String(intermediaryName || '').trim().toLowerCase();
  if (!name) return null;
  const res = await fetch(`${API}/intermediary-mapping`, { headers: authHeaders() });
  if (!res.ok) return null;
  const rows = await res.json();
  return (rows || []).find(item => String(item?.intermediary || '').trim().toLowerCase() === name) || null;
}

async function openIntermediaryScheduleModal(intermediaryName, includeInFollowUp) {
  try {
    const mapping = await getIntermediaryMappingByName(intermediaryName);
    if (!mapping || !mapping.key) {
      showToast('Intermediary mapping not found. Add mapping in Settings first.', 'error');
      return;
    }
    const shouldToggleAfterSave = includeInFollowUp === false;
    pendingIntermediaryToggle = {
      intermediaryName,
      includeInFollowUp: includeInFollowUp === null ? null : !!includeInFollowUp,
      shouldToggleAfterSave,
      mapping,
    };
    const title = document.getElementById('intermediary-schedule-subtitle');
    if (title) {
      title.textContent = shouldToggleAfterSave
        ? `Set schedule for ${intermediaryName} before turning OFF.`
        : `Preview or update schedule for ${intermediaryName}.`;
    }
    const saveBtn = document.getElementById('btn-intermediary-schedule-save');
    if (saveBtn) saveBtn.textContent = shouldToggleAfterSave ? 'Save & Toggle OFF' : 'Save Schedule';
    document.getElementById('intermediary-schedule-frequency').value = mapping.follow_up_frequency || 'weekly';
    document.getElementById('intermediary-schedule-time').value = mapping.follow_up_send_time || '09:00';
    const modal = document.getElementById('intermediary-schedule-modal');
    if (modal) modal.classList.add('open');
  } catch {
    showToast('Could not open schedule popup', 'error');
  }
}

function closeIntermediaryScheduleModal() {
  const modal = document.getElementById('intermediary-schedule-modal');
  if (modal) modal.classList.remove('open');
  pendingIntermediaryToggle = null;
}

async function sendIntermediaryFollowUpNow() {
  if (!pendingIntermediaryToggle?.intermediaryName) {
    showToast('No intermediary selected', 'error');
    return;
  }

  const intermediaryName = pendingIntermediaryToggle.intermediaryName;
  const btn = document.getElementById('btn-intermediary-send-now');
  const originalText = btn?.textContent || 'Send Now';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending...';
  }

  try {
    const qs = `?intermediary=${encodeURIComponent(intermediaryName)}`;
    const res = await fetch(`${API}/follow-up/send${qs}`, {
      method: 'POST',
      headers: authHeaders(),
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      showToast(data.detail || `Could not send follow-up for ${intermediaryName}`, 'error');
      return;
    }

    const sentGroups = Number(data.sent_groups || 0);
    const skipped = Array.isArray(data.skipped) ? data.skipped : [];
    if (sentGroups > 0) {
      showToast(`Follow-up email sent for ${intermediaryName}`);
    } else {
      const firstReason = skipped[0]?.reason || 'No eligible referrals found';
      showToast(`${intermediaryName}: ${firstReason}`, 'error');
    }

    await refreshReferralList();
    if (typeof loadLogs === 'function') {
      await loadLogs();
    }
  } catch {
    showToast(`Could not send follow-up for ${intermediaryName}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

async function saveIntermediaryScheduleAndToggle() {
  if (!pendingIntermediaryToggle?.mapping?.key) {
    showToast('No intermediary selected', 'error');
    return;
  }

  const saveBtn = document.getElementById('btn-intermediary-schedule-save');
  const originalText = saveBtn?.textContent || 'Save Schedule';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  try {
    const mapping = pendingIntermediaryToggle.mapping;
    const frequency = (document.getElementById('intermediary-schedule-frequency')?.value || 'weekly').trim();
    const sendTime = (document.getElementById('intermediary-schedule-time')?.value || '09:00').trim();
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(sendTime)) {
      showToast('Send Time must be in 24-hour format HH:MM (e.g. 07:16)', 'error');
      return;
    }

    const payload = {
      township: mapping.township || '',
      postal_code: mapping.postal_code || '',
      form_type: mapping.form_type || '',
      intermediary: mapping.intermediary || '',
      email: mapping.email || '',
      follow_up_frequency: frequency,
      follow_up_send_time: sendTime,
      mapping: {
        township: mapping.township || '',
        postal_code: mapping.postal_code || '',
        form_type: mapping.form_type || '',
        intermediary: mapping.intermediary || '',
        email: mapping.email || '',
        follow_up_frequency: frequency,
        follow_up_send_time: sendTime,
      },
    };

    const res = await fetch(`${API}/intermediary-mapping/${encodeURIComponent(mapping.key)}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      showToast(e.detail || 'Could not save schedule', 'error');
      return;
    }

    const intermediaryName = pendingIntermediaryToggle.intermediaryName;
    const includeInFollowUp = pendingIntermediaryToggle.includeInFollowUp;
    const shouldToggleAfterSave = !!pendingIntermediaryToggle.shouldToggleAfterSave;
    closeIntermediaryScheduleModal();
    if (shouldToggleAfterSave) {
      await toggleIntermediaryGroupFollowUp(intermediaryName, includeInFollowUp);
      return;
    }
    showToast(`Schedule saved for ${intermediaryName}`);
    await refreshReferralList();
  } catch {
    showToast('Could not save schedule', 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  }
}

async function toggleIntermediaryGroupFollowUp(intermediaryName, includeInFollowUp) {
  const group = (intermediaryGroups || []).find(g => g.intermediary === intermediaryName);
  if (!group || !group.referrals?.length) return;
  try {
    await Promise.all(group.referrals.map(ref =>
      fetch(`${API}/referrals/${ref.id}/follow-up-toggle`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ include_in_follow_up: !!includeInFollowUp })
      })
    ));
    await refreshReferralList();
    showToast(`Follow-Up ${includeInFollowUp ? 'enabled' : 'disabled'} for ${intermediaryName}`);
  } catch {
    showToast('Could not update intermediary follow-up toggles', 'error');
    await refreshReferralList();
  }
}

async function toggleFollowUpInclude(referralId, includeInFollowUp) {
  try {
    const res = await fetch(`${API}/referrals/${referralId}/follow-up-toggle`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ include_in_follow_up: !!includeInFollowUp })
    });
    if (!res.ok) {
      const e = await res.json();
      showToast(e.detail || 'Could not update follow-up toggle', 'error');
      await refreshReferralList();
      return;
    }
    await refreshReferralList();
  } catch {
    showToast('Could not update follow-up toggle', 'error');
    await refreshReferralList();
  }
}

async function sendEmailFromIntermediaryRow(referralId) {
  if (typeof sendEmail !== 'function') {
    showToast('Email action is unavailable', 'error');
    return;
  }
  const result = await sendEmail(referralId);
  if (!result?.ok) {
    if (!result?.cancelled) {
      showToast(`Email notification: ${result?.error || 'send failed'}`, 'error');
    }
    return;
  }
  showToast('Email notification: sent successfully');
}

function renderArchiveTable(refs) {
  const c = document.getElementById('archive-table-container');
  if (!refs.length) { c.innerHTML = '<div class="loading">No archived records.</div>'; return; }
  const canEdit = currentUser?.permissions?.can_edit_referral;
  const canArchive = currentUser?.permissions?.can_archive;
  const isAdmin = currentUser?.role === 'admin';
  c.innerHTML = `<table><thead><tr>
    <th>Referral Date</th><th>Referral Source</th><th>Last Name</th><th>First Name</th>
    <th>Primary Phone</th><th>Address</th><th>City</th><th>Postal Code</th>
    <th>Date of Birth</th><th>Client Type</th><th>Notes</th><th>Archive Reason</th><th>Archive Date</th><th>Actions</th>
  </tr></thead><tbody>${refs.map(r => {
    const lastComment = getLatestTimelineComment(r.commentsTimeline || []);
    const lastNote = lastComment || getLatestScheduleNote(r.referral?.scheduleNotes || []);
    return `
    <tr>
      <td>${r.referral?.referralDate||'-'}</td>
      <td>${r.referral?.referralSource||'-'}</td>
      <td>${r.patient.lastName}</td>
      <td>${r.patient.firstName}</td>
      <td>${r.primaryContact?.phone||'-'}</td>
      <td>${r.address.line1||'-'}</td>
      <td>${r.address.city||'-'}</td>
      <td>${r.address.postalCode||'-'}</td>
      <td>${r.patient.dob||'-'}</td>
      <td>${r.referral?.clientType||'-'}</td>
      <td>${lastNote || '-'}</td>
      <td>${getArchiveReasonDisplay(r) || '-'}</td>
      <td>${r.archivedAt ? new Date(r.archivedAt).toLocaleDateString() : '-'}</td>
      <td style="white-space:nowrap;">
        ${canEdit ? `<button class="btn btn-sm" onclick="openEditReferral('${r.id}')">Edit</button>` : ''}
        <button class="btn btn-sm" onclick="openPreviewReferral('${r.id}')">Preview</button>
        ${canArchive ? `<button class="btn btn-sm" onclick="unarchiveRef('${r.id}')">Restore</button>` : ''}
        ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteRef('${r.id}')">Delete</button>` : ''}
      </td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

function filterTable() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const s = (document.getElementById('status-filter').value || '').trim().toLowerCase();
  const intermediary = (document.getElementById('intermediary-filter')?.value || '').trim().toLowerCase();

  if (referralViewMode === 'intermediary') {
    const filteredGroups = (intermediaryGroups || []).map(group => {
      const rows = (group.referrals || []).filter(ref => {
        const text = `${group.intermediary} ${ref.patient_name} ${ref.status || ''}`.toLowerCase();
        const matchSearch = !q || text.includes(q);
        const matchStatus = !s || String(ref.status || '').trim().toLowerCase() === s;
        const matchIntermediary = !intermediary || String(group.intermediary || '').trim().toLowerCase() === intermediary;
        return matchSearch && matchStatus && matchIntermediary;
      });
      return {
        ...group,
        referrals: rows,
        total_referrals: rows.length,
        pending_follow_ups: rows.filter(r => r.include_in_follow_up).length,
      };
    }).filter(group => group.referrals.length > 0);
    renderIntermediaryGroups(filteredGroups);
    return;
  }

  renderTable(allReferrals.filter(r => {
    const text = `${r.patient.firstName} ${r.patient.lastName} ${r.address.city} ${r.status} ${r.referral?.branch||''} ${r.referral?.marketer||''}`.toLowerCase();
    const include = r.followUp?.includeInFollowUp;
    return (!q || text.includes(q))
      && (!s || r.status === s)
      && (!intermediary || (r.referral?.intermediary || '') === intermediary);
  }));
}

function filterArchive() {
  const q = document.getElementById('archive-search').value.toLowerCase();
  const reason = document.getElementById('archive-reason-filter').value;
  renderArchiveTable(allArchive.filter(r => {
    const archiveReason = getArchiveReasonDisplay(r);
    const text = `${r.patient.firstName} ${r.patient.lastName} ${archiveReason}`.toLowerCase();
    return (!q || text.includes(q)) && (!reason || archiveReason === reason);
  }));
}

async function deleteRef(id) {
  if (!confirm('Are you sure you want to permanently delete this record? This cannot be undone.')) return;
  const res = await fetch(`${API}/referrals/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (res.ok) { showToast('Record permanently deleted'); refreshReferralList(); loadArchive(); }
  else showToast('Error deleting record', 'error');
}

async function archiveRef(id) {
  const reasons = (dropdowns.archive_reason || []).map(r => r.value);
  const reason = prompt(`Archive reason:\n${reasons.join('\n')}\n\nType reason:`, reasons[0]||'');
  if (!reason) return;
  const res = await fetch(`${API}/referrals/${id}/archive?reason=${encodeURIComponent(reason)}`, { method:'POST', headers: authHeaders() });
  if (res.ok) { showToast('Referral archived'); refreshReferralList(); }
  else showToast('Error archiving','error');
}

async function unarchiveRef(id) {
  const reason = prompt('Reason for restoring this record to Referral list:\n(Required - leave blank to cancel)');
  if (!reason || !reason.trim()) {
    if (reason !== null) showToast('Restore cancelled - reason is required', 'error');
    return;
  }
  const res = await fetch(`${API}/referrals/${id}/unarchive?restore_reason=${encodeURIComponent(reason.trim())}`, { method:'POST', headers: authHeaders() });
  if (res.ok) { showToast('Record restored to Referral list'); loadArchive(); refreshReferralList(); }
  else showToast('Error restoring record', 'error');
}

