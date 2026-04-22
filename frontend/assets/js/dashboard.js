// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [dashRes, refsRes, archivedRes] = await Promise.all([
      fetch(`${API}/dashboard`, { headers: authHeaders() }),
      fetch(`${API}/referrals`, { headers: authHeaders() }),
      fetch(`${API}/referrals?archived=true`, { headers: authHeaders() })
    ]);
    if (!dashRes.ok) throw new Error('dashboard failed');
    const d = await dashRes.json();
    const refs = refsRes.ok ? await refsRes.json() : [];
    const archivedRefs = archivedRes.ok ? await archivedRes.json() : [];
    renderKPIs(d); renderCharts(d, refs, archivedRefs);
  } catch { showToast('Could not load dashboard','error'); }
}

function renderKPIs(d) {
  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Total Referrals</div><div class="kpi-value">${d.totalReferrals}</div><div class="kpi-sub">All time</div></div>
    <div class="kpi-card kpi-card-active"><div class="kpi-label">Active</div><div class="kpi-value">${d.activeReferrals}</div><div class="kpi-sub">In progress</div></div>
    <div class="kpi-card kpi-card-completed"><div class="kpi-label">Completed</div><div class="kpi-value">${d.completed}</div><div class="kpi-sub">Successful</div></div>
    <div class="kpi-card kpi-card-closed"><div class="kpi-label">Closed</div><div class="kpi-value">${d.closed}</div><div class="kpi-sub">No services</div></div>
    <div class="kpi-card"><div class="kpi-label">Conversion Rate</div><div class="kpi-value">${d.conversionRate}%</div><div class="kpi-sub">Referral → care</div></div>
    <div class="kpi-card"><div class="kpi-label">Avg Conversion</div><div class="kpi-value">${d.avgConversionDays||'-'} days</div><div class="kpi-sub">To start of care</div></div>`;
}

function renderCharts(d, refs = [], archivedRefs = []) {
  const colors6 = ['#6D28D9','#1D4ED8','#0F766E','#B45309','#10B981','#64748B'];
  const svcColors = ['#E24B4A','#1D9E75','#378ADD','#6D28D9','#B45309','#0F766E','#0EA5E9','#9333EA'];
  const genderColors = { Female:'#ff4d6d', Male:'#00b4d8', Other:'#9d4edd' };
  const clamp = n => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
  const pct = n => `${Math.round(clamp(n) * 100)}%`;
  const hexToRgba = (hex, alpha) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return `rgba(148,163,184,${alpha})`;
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };
  const renderReferralSourceGenderCard = () => {
    const holder = document.getElementById('referral-source-gender-card');
    if (!holder) return;

    const sourceCounts = refs.reduce((acc, r) => {
      const key = (r?.referral?.referralSource || '').trim();
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const sourceRanked = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
    const sourceTotal = sourceRanked.reduce((sum, [, count]) => sum + count, 0);
    const sourceMax = Math.max(...sourceRanked.map(([, count]) => count), 1);

    const genderCounts = refs.reduce((acc, r) => {
      const raw = (r?.patient?.gender || '').trim().toLowerCase();
      const key = raw.includes('female') ? 'Female' : raw.includes('male') ? 'Male' : raw ? 'Other' : '';
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const orderedGenders = ['Female', 'Male', 'Other'];
    const genderTotal = orderedGenders.reduce((sum, g) => sum + (genderCounts[g] || 0), 0);
    const hasGenderData = genderTotal > 0;

    if (!sourceRanked.length && !hasGenderData) {
      holder.innerHTML = '<div class="rsg-empty">No referral source or gender data available</div>';
      return;
    }

    const bars = sourceRanked.length ? sourceRanked.map(([label, count], idx) => {
      const ratio = sourceTotal > 0 ? count / sourceTotal : 0;
      const width = `${Math.max(12, Math.round((count / sourceMax) * 100))}%`;
      const color = svcColors[idx % svcColors.length];
      return `<div class="rsg-item">
        <div class="rsg-label"><span>${label}</span><span class="rsg-pct">${pct(ratio)}</span></div>
        <div class="rsg-bar-bg"><div class="rsg-bar-fill" style="width:${width};background:${color};"></div></div>
      </div>`;
    }).join('') : '<div class="rsg-empty" style="min-height:120px;">No referral source data</div>';

    const femaleRatio = genderTotal > 0 ? (genderCounts.Female || 0) / genderTotal : 0;
    const maleRatio = genderTotal > 0 ? (genderCounts.Male || 0) / genderTotal : 0;
    const otherRatio = genderTotal > 0 ? (genderCounts.Other || 0) / genderTotal : 0;
    const genderIconPath = 'M12,2A2,2 0 0,1 14,4A2,2 0 0,1 12,6A2,2 0 0,1 10,4A2,2 0 0,1 12,2 M10.5,7H13.5A2,2 0 0,1 15.5,9V14.5H14V22H10V14.5H8.5V9A2,2 0 0,1 10.5,7Z';
    const otherBandHeight = otherRatio > 0 ? Math.max(2, Number((24 * otherRatio).toFixed(2))) : 0;

    // Keep tiny non-zero categories visible in the icon gradient.
    const minVisibleSlice = 0.07;
    const visualRatios = (() => {
      const entries = [femaleRatio, maleRatio, otherRatio];
      const fixed = entries.map(v => (v > 0 && v < minVisibleSlice ? minVisibleSlice : 0));
      const fixedTotal = fixed.reduce((sum, v) => sum + v, 0);
      const remainingBudget = Math.max(0, 1 - fixedTotal);
      const remainingActual = entries.reduce((sum, v, idx) => sum + (fixed[idx] ? 0 : v), 0);

      return entries.map((v, idx) => {
        if (fixed[idx]) return fixed[idx];
        if (remainingActual <= 0) return 0;
        return (v / remainingActual) * remainingBudget;
      });
    })();

    const stopA = Math.min(100, Number((visualRatios[0] * 100).toFixed(2)));
    const stopB = Math.min(100, Math.max(stopA, Number(((visualRatios[0] + visualRatios[1]) * 100).toFixed(2))));

    const legends = hasGenderData ? orderedGenders.map(g => {
      const value = genderCounts[g] || 0;
      const ratio = genderTotal > 0 ? value / genderTotal : 0;
      return `<div class="rsg-legend"><span class="rsg-dot" style="background:${genderColors[g]};"></span><span>${g}</span><span class="rsg-pct">${pct(ratio)}</span></div>`;
    }).join('') : '<div class="rsg-empty" style="min-height:120px;">No gender data</div>';

    holder.innerHTML = `<div class="rsg-layout">
      <div class="rsg-left">
        <div class="rsg-chip">Referral Source</div>
        <div class="rsg-bars">${bars}</div>
      </div>
      <div class="rsg-divider"></div>
      <div class="rsg-right">
        <div class="rsg-right-wrap">
          <div class="rsg-legends">${legends}</div>
          <svg class="rsg-gender-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-label="Gender distribution icon">
            <defs>
              <linearGradient id="genderGradientRsg" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" style="stop-color:#ff4d6d;stop-opacity:1"></stop>
                <stop offset="${stopA}%" style="stop-color:#ff4d6d;stop-opacity:1"></stop>
                <stop offset="${stopA}%" style="stop-color:#00b4d8;stop-opacity:1"></stop>
                <stop offset="${stopB}%" style="stop-color:#00b4d8;stop-opacity:1"></stop>
                <stop offset="${stopB}%" style="stop-color:#9d4edd;stop-opacity:1"></stop>
                <stop offset="100%" style="stop-color:#9d4edd;stop-opacity:1"></stop>
              </linearGradient>
              <clipPath id="genderShapeClipRsg">
                <path d="${genderIconPath}"></path>
              </clipPath>
            </defs>
            <path fill="url(#genderGradientRsg)" d="${genderIconPath}"></path>
            ${otherBandHeight > 0 ? `<rect x="0" y="0" width="24" height="${otherBandHeight}" fill="#9d4edd" clip-path="url(#genderShapeClipRsg)"></rect>` : ''}
          </svg>
        </div>
      </div>
    </div>`;
  };
  const formatNumber = value => Number(value || 0).toLocaleString('en-US');
  const renderPerformanceList = (elementId, accessor) => {
    const holder = document.getElementById(elementId);
    if (!holder) return;

    const counts = refs.reduce((acc, ref) => {
      const key = (accessor(ref) || '').trim();
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) {
      holder.innerHTML = '<div class="perf-empty">No data available</div>';
      return;
    }

    const total = ranked.reduce((sum, [, count]) => sum + count, 0);
    holder.innerHTML = ranked.map(([label, count], idx) => {
      const ratio = total > 0 ? count / total : 0;
      const color = svcColors[idx % svcColors.length];
      const initial = (label || '?').trim().charAt(0).toUpperCase() || '?';
      return `<div class="perf-row">
        <div class="perf-main">
          <span class="perf-avatar" style="background:${hexToRgba(color, 0.22)};">${initial}</span>
          <div>
            <div class="perf-name">${label}</div>
            <div class="perf-sub">referral performance</div>
          </div>
        </div>
        <div class="perf-chip">${pct(ratio)}</div>
        <div class="perf-count-wrap"><span class="perf-count">${formatNumber(count)}</span><span class="perf-unit">cases</span></div>
      </div>`;
    }).join('');
  };
  const renderArchiveReasonCard = () => {
    const counts = archivedRefs.reduce((acc, ref) => {
      const key = getArchiveReasonDisplay(ref);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = ranked.reduce((sum, [, count]) => sum + count, 0);
    const totalEl = document.getElementById('archive-reason-total');
    const chartEl = document.getElementById('archive-reason-chart');
    if (totalEl) totalEl.textContent = formatNumber(total);
    if (!chartEl) return;
    if (!ranked.length) {
      chartEl.innerHTML = '<div class="archive-empty">No archive reason data available</div>';
      return;
    }
    const maxValue = Math.max(...ranked.map(([, count]) => count), 1);
    const activeIndex = ranked.findIndex(([, count]) => count === maxValue);
    chartEl.innerHTML = ranked.map(([label, count], idx) => {
      const color = svcColors[idx % svcColors.length];
      const height = `${Math.max(14, (count / maxValue) * 85)}%`;
      const activeClass = idx === activeIndex ? ' active' : '';
      return `<div class="archive-bar-col${activeClass}" title="${label}: ${formatNumber(count)} archived referrals">
        <div class="archive-bar-label-top">${formatNumber(count)}</div>
        <div class="archive-bar-track">
          <div class="archive-bar${activeClass}" style="height:${height};background:${color};"></div>
        </div>
        <div class="archive-bar-name">${label}</div>
      </div>`;
    }).join('');
  };
  const renderSvcCard = () => {
    const typeCounts = refs.reduce((acc, r) => {
      const key = (r?.referral?.clientType || '').trim();
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const ranked = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const total = ranked.reduce((sum, [, count]) => sum + count, 0);
    const center = document.getElementById('svc-center-value');
    if (center) center.textContent = String(total);

    const radialSvg = document.getElementById('svc-radial-svg');
    const list = document.getElementById('svc-metrics-list');
    if (!list) return;
    if (!ranked.length) {
      list.className = 'svc-metrics-list';
      list.innerHTML = '<div class="svc-empty">No client type data available</div>';
      return;
    }
    list.className = ranked.length <= 3 ? 'svc-metrics-list spacious' : 'svc-metrics-list';

    const ringGap = ranked.length <= 2 ? 14 : ranked.length === 3 ? 10 : ranked.length === 4 ? 7 : 4;
    const minStroke = ranked.length <= 3 ? 12 : 8;
    const maxStroke = ranked.length <= 2 ? 18 : ranked.length === 3 ? 16 : ranked.length === 4 ? 12 : 9;

    if (radialSvg) {
      radialSvg.innerHTML = '';
      const ns = 'http://www.w3.org/2000/svg';
      const cx = 115;
      const cy = 115;
      const outerRadius = 94;
      const innerPadding = ranked.length <= 3 ? 22 : 14;
      const availableBand = outerRadius - innerPadding - (ringGap * Math.max(ranked.length - 1, 0));
      const strokeWidth = Math.max(minStroke, Math.min(maxStroke, availableBand / Math.max(ranked.length, 1)));

      ranked.forEach(([, count], idx) => {
        const radius = outerRadius - (idx * (strokeWidth + ringGap));
        if (radius - (strokeWidth / 2) <= innerPadding) return;
        const color = svcColors[idx % svcColors.length];
        const ratio = total > 0 ? count / total : 0;
        const circumference = 2 * Math.PI * radius;

        const bg = document.createElementNS(ns, 'circle');
        bg.setAttribute('cx', String(cx));
        bg.setAttribute('cy', String(cy));
        bg.setAttribute('r', String(radius));
        bg.setAttribute('fill', 'none');
        bg.setAttribute('stroke', '#e8e8e8');
        bg.setAttribute('stroke-width', String(strokeWidth));
        radialSvg.appendChild(bg);

        const fg = document.createElementNS(ns, 'circle');
        fg.setAttribute('cx', String(cx));
        fg.setAttribute('cy', String(cy));
        fg.setAttribute('r', String(radius));
        fg.setAttribute('fill', 'none');
        fg.setAttribute('stroke', color);
        fg.setAttribute('stroke-width', String(strokeWidth));
        fg.setAttribute('stroke-linecap', 'round');
        fg.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
        fg.setAttribute('stroke-dasharray', `${circumference} ${circumference}`);
        fg.setAttribute('stroke-dashoffset', `${circumference * (1 - clamp(ratio))}`);
        radialSvg.appendChild(fg);
      });
    }

    list.innerHTML = ranked.map(([label, count], idx) => {
      const color = svcColors[idx % svcColors.length];
      const ratio = total > 0 ? count / total : 0;
      return `<div>
        <div class="svc-item-head">
          <div class="svc-item-title"><span class="svc-dot" style="background:${color};"></span>${label}</div>
          <span class="svc-item-value">${count} (${pct(ratio)})</span>
        </div>
        <div class="svc-track" style="background:${hexToRgba(color, 0.24)};"><div class="svc-fill" style="width:${pct(ratio)};background:${color};"></div></div>
      </div>`;
    }).join('');
  };
  const renderChecklistCompletionCard = () => {
    const checklistItems = [
      'Birth Certificate',
      'Recent Bank Statement (Within 30 days)',
      'SSN Card',
      'Picture Valid ID',
      'No Insurance / Medicare/Medicaid Card',
      "Doctor's Name and Phone Number",
      'List of all Current Medications'
    ];
    const holder = document.getElementById('checklist-completion-list');
    const summary = document.getElementById('checklist-summary');
    if (!holder) return;

    const totalReferrals = refs.length;
    if (!totalReferrals) {
      if (summary) summary.textContent = 'No referrals available for checklist summary.';
      holder.innerHTML = '<div class="checklist-empty">No checklist data available</div>';
      return;
    }

    const itemCounts = checklistItems.map((label, index) => {
      const completed = refs.reduce((count, ref) => {
        return ref?.checklists?.documents?.[index]?.checked ? count + 1 : count;
      }, 0);
      return { label, completed, ratio: completed / totalReferrals };
    });

    const fullyCompleteCount = refs.reduce((count, ref) => {
      const docs = ref?.checklists?.documents || [];
      const allChecked = checklistItems.every((_, i) => docs[i]?.checked === true);
      return allChecked ? count + 1 : count;
    }, 0);

    if (summary) {
      summary.textContent = `${fullyCompleteCount}/${totalReferrals} referrals fully complete`;
    }

    holder.innerHTML = itemCounts.map((item, idx) => {
      const color = svcColors[idx % svcColors.length];
      return `<div class="checklist-row">
        <div class="checklist-row-head">
          <div class="checklist-name">${item.label}</div>
          <div class="checklist-value">${item.completed}/${totalReferrals} (${pct(item.ratio)})</div>
        </div>
        <div class="checklist-track"><div class="checklist-fill" style="width:${pct(item.ratio)};background:${color};"></div></div>
      </div>`;
    }).join('');
  };
  renderReferralSourceGenderCard();
  renderArchiveReasonCard();
  renderSvcCard();
  renderChecklistCompletionCard();
  renderPerformanceList('marketer-performance-list', r => r?.referral?.marketer || '');
  renderPerformanceList('assigned-performance-list', r => r?.referral?.assignedTo || '');
}

