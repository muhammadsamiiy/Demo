// â”€â”€â”€ SCHEDULE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function generateEvents() {
  EVENTS = [];
  allReferrals.forEach(r => {
    const sd = r.referral?.homeVisitScheduledDate || r.referral?.scheduleDate;
    const visitTime = r.checklists?.homeVisitTime || '';
    if (sd) {
      const parts = sd.split('/');
      if (parts.length===3) {
        const ds = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
        const assignedTo = r.referral?.assignedTo || '';
        const label = (dropdowns.assigned_to || []).find(u => u.value === assignedTo)?.label || assignedTo;
        const staffName = (label || '').replace(/\s*\([^)]*\)\s*$/, '');
        const addr = r.address || {};
        const fullAddr = [addr.line1, addr.city, addr.state, addr.postalCode].filter(Boolean).join(', ');
        const lastComment = getLatestTimelineComment(r.commentsTimeline || []);
        const lastNote = lastComment || getLatestScheduleNote(r.referral?.scheduleNotes || []);
        EVENTS.push({
          date: ds,
          title: `${r.patient.firstName} ${r.patient.lastName}`,
          type: 'Visit',
          time: visitTime || '-',
          staffName: staffName || '-',
          clientName: `${r.patient.firstName} ${r.patient.lastName}`,
          address: fullAddr || '-',
          phone: r.primaryContact?.phone || '-',
          scheduledDate: sd,
          status: r.status || '-',
          lastNote: lastNote || '-'
        });
      }
    }
  });
}

function getEventsForCalendarMonth() {
  const y = calDate.getFullYear();
  const m = calDate.getMonth();
  return EVENTS
    .filter(e => {
      const d = new Date(`${e.date}T00:00:00`);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName));
}

function renderCalendarHeader() {
  const y = calDate.getFullYear();
  const m = calDate.getMonth();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthOptions = monthNames.map((name, idx) => `<option value="${idx}" ${idx === m ? 'selected' : ''}>${name}</option>`).join('');
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 5;
  const endYear = currentYear + 5;
  const yearOptions = Array.from({ length: endYear - startYear + 1 }, (_, idx) => startYear + idx)
    .map(year => `<option value="${year}" ${year === y ? 'selected' : ''}>${year}</option>`)
    .join('');
  document.getElementById('cal-month-label').innerHTML = `
    <select class="cal-month-select" onchange="setCalendarMonth(this.value)">${monthOptions}</select>
    <select class="cal-month-select" onchange="setCalendarYear(this.value)">${yearOptions}</select>
  `;
}

function renderCalendar() {
  const y = calDate.getFullYear(), m = calDate.getMonth();
  renderCalendarHeader();
  const firstDay = new Date(y,m,1).getDay();
  const days = new Date(y,m+1,0).getDate();
  let html = '';
  for (let i=0;i<firstDay;i++) html += '<div class="cal-day" style="opacity:0;pointer-events:none;"></div>';
  for (let d=1;d<=days;d++) {
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const has = EVENTS.some(e => e.date === ds);
    html += `<div class="cal-day${has?' has-event':''}" onclick="showDayEvents('${ds}')">${d}</div>`;
  }
  document.getElementById('cal-days').innerHTML = html;
  renderUpcomingEvents();
}
function _renderEventCard(e) {
  return `<div class="event-item">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px;">
      <div><span style="color:var(--text-muted);font-weight:600;">Staff:</span> ${e.staffName}</div>
      <div><span style="color:var(--text-muted);font-weight:600;">Client:</span> ${e.clientName}</div>
      <div><span style="color:var(--text-muted);font-weight:600;">Phone:</span> ${e.phone}</div>
      <div><span style="color:var(--text-muted);font-weight:600;">Date:</span> ${e.scheduledDate}</div>
      <div><span style="color:var(--text-muted);font-weight:600;">Time:</span> ${e.time}</div>
      <div><span style="color:var(--text-muted);font-weight:600;">Status:</span> ${e.status}</div>
      <div style="grid-column:1/-1;"><span style="color:var(--text-muted);font-weight:600;">Address:</span> ${e.address}</div>
      <div style="grid-column:1/-1;"><span style="color:var(--text-muted);font-weight:600;">Notes:</span> ${e.lastNote}</div>
    </div>
  </div>`;
}
function renderUpcomingEvents() {
  const c = document.getElementById('events-list');
  const monthEvents = getEventsForCalendarMonth();
  if (!monthEvents.length) { c.innerHTML = '<div style="color:var(--text-muted);">No events scheduled for this month</div>'; return; }
  c.innerHTML = monthEvents.map(e => _renderEventCard(e)).join('');
}
function showDayEvents(ds) {
  const evs = EVENTS.filter(e => e.date === ds);
  const c = document.getElementById('events-list');
  c.innerHTML = evs.length
    ? evs.map(e => _renderEventCard(e)).join('')
    : `<div class="event-item"><div class="event-meta">No events on ${ds}</div></div>`;
}
function changeMonth(dir) { calDate.setMonth(calDate.getMonth()+dir); renderCalendar(); }
function setCalendarMonth(month) { calDate.setMonth(Number(month)); renderCalendar(); }
function setCalendarYear(year) { calDate.setFullYear(Number(year)); renderCalendar(); }

// â”€â”€â”€ SCHEDULE VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function loadScheduleView() {
  try {
    await refreshReferrals(); // Ensure we have latest data
    renderCalendar();
    renderScheduleTable();
  } catch { showToast('Could not load schedule','error'); }
}

function renderScheduleTable() {
  const c = document.getElementById('schedule-table-container');
  const todayStr = new Date().toISOString().slice(0,10);
  function completedDatePast(r) {
    const cd = r.referral?.homeVisitCompletedDate;
    if (!cd) return false;
    const parts = cd.split('/');
    if (parts.length !== 3) return false;
    const iso = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
    return iso < todayStr;
  }
  // Filter for current schedules (not completed and completed date not in the past)
  const currentSchedules = allReferrals.filter(r =>
    r.referral?.homeVisitScheduledDate &&
    r.referral?.homeVisitStatus !== 'Completed' &&
    !completedDatePast(r)
  );

  if (!currentSchedules.length) {
    c.innerHTML = '<div class="loading">No current schedules found.</div>';
    return;
  }

  c.innerHTML = `<table><thead><tr>
    <th>Staff Scheduled</th><th>Client Name</th><th>Address</th><th>Phone #</th>
    <th>Home Visit Date</th><th>Visit Time</th><th>Status</th><th>Notes</th>
  </tr></thead><tbody>${currentSchedules.map(r => {
    const addr = r.address || {};
    const fullAddr = [addr.line1, addr.city, addr.state, addr.postalCode].filter(Boolean).join(', ');
    const phone = r.primaryContact?.phone || '';
    const scheduledDate = r.referral?.homeVisitScheduledDate || '';
    const visitTime = r.checklists?.homeVisitTime || '-';
    const status = r.status || '';
    const assignedTo = r.referral?.assignedTo || '';
    const assignedToLabel = (dropdowns.assigned_to || []).find(u => u.value === assignedTo)?.label || assignedTo;
    const assignedToDisplay = (assignedToLabel || '').replace(/\s*\([^)]*\)\s*$/, '');
    const lastComment = getLatestTimelineComment(r.commentsTimeline || []);
    const lastNote = lastComment || getLatestScheduleNote(r.referral?.scheduleNotes || []);

    return `<tr>
      <td>${assignedToDisplay || '-'}</td>
      <td>${r.patient?.firstName || ''} ${r.patient?.lastName || ''}</td>
      <td>${fullAddr}</td>
      <td>${phone}</td>
      <td>${scheduledDate}</td>
      <td>${visitTime}</td>
      <td><span class="status-badge ${getBadge(status)}">${status}</span></td>
      <td><span style="font-size:12px;color:var(--text-secondary);">${lastNote || '-'}</span></td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

function exportScheduleCSV() {
  const todayStr = new Date().toISOString().slice(0,10);
  function _cdPast(r) {
    const cd = r.referral?.homeVisitCompletedDate;
    if (!cd) return false;
    const parts = cd.split('/');
    if (parts.length !== 3) return false;
    const iso = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
    return iso < todayStr;
  }
  const currentSchedules = allReferrals.filter(r =>
    r.referral?.homeVisitScheduledDate &&
    r.referral?.homeVisitStatus !== 'Completed' &&
    !_cdPast(r)
  );
  if (!currentSchedules.length) { showToast('No schedule data to export', 'error'); return; }
  const headers = ['Staff Scheduled','Client Name','Address','Phone','Home Visit Date','Visit Time','Status','Note'];
  const rows = currentSchedules.map(r => {
    const addr = r.address || {};
    const fullAddr = [addr.line1, addr.city, addr.state, addr.postalCode].filter(Boolean).join(' ');
    const assignedTo = r.referral?.assignedTo || '';
    const label = (dropdowns.assigned_to || []).find(u => u.value === assignedTo)?.label || assignedTo;
    const staffName = (label || '').replace(/\s*\([^)]*\)\s*$/, '');
    const visitTime = r.checklists?.homeVisitTime || '';
    const status = r.status || '';
    const lastComment = getLatestTimelineComment(r.commentsTimeline || []);
    const lastNote = lastComment || getLatestScheduleNote(r.referral?.scheduleNotes || []);
    const esc = v => `"${String(v||'').replace(/"/g,'""')}"`;
    return [staffName, `${r.patient?.firstName||''} ${r.patient?.lastName||''}`.trim(), fullAddr,
      r.primaryContact?.phone||'', r.referral?.homeVisitScheduledDate||'', visitTime, status, lastNote].map(esc).join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `schedules_${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast('Schedule exported');
}

async function completeSchedule(rid) {
  if (!confirm('Mark this schedule as completed?')) return;

  try {
    const res = await fetch(`${API}/referrals/${rid}/complete-schedule`, {
      method: 'PUT',
      headers: authHeaders()
    });
    if (res.ok) {
      showToast('Schedule completed');
      loadScheduleView();
    } else {
      showToast('Error completing schedule', 'error');
    }
  } catch { showToast('Error completing schedule', 'error'); }
}

function refreshSchedule() {
  loadScheduleView();
}

