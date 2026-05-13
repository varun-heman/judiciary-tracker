/**
 * India Judiciary & Ministry Tracker
 * Data is read from JSON files — all visuals are in CSS/HTML.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Persistent sidebar collapse state (survives renderNav re-renders)
// ─────────────────────────────────────────────────────────────────────────────
const sectionCollapsed = {};  // section key → boolean; undefined = use auto-default

function getSectionCollapsed(key, itemCount) {
  if (key in sectionCollapsed) return sectionCollapsed[key];
  return itemCount > 4;   // auto-collapse sections with more than 4 items
}

window.toggleNavSection = function(key, itemCount) {
  sectionCollapsed[key] = !getSectionCollapsed(key, itemCount);
  renderNav();
};

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
const state = {
  courts: [],
  ministries: [],
  adminStaff: [],
  adminRoleFilter: 'ALL',
  judgeRoleFilter: 'ALL',
  judgeTenureRange: 12,
  judgeTenureShowAll: true,
  selectedId: 'HOME',
  searchQuery: '',
};

let applyingRoute = false;

// ─────────────────────────────────────────────────────────────────────────────
// Date & Tenure Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getAge(dobStr) {
  if (!dobStr) return null;
  const today = new Date();
  const dob   = new Date(dobStr + 'T00:00:00');
  let age = today.getFullYear() - dob.getFullYear();
  const notYet = today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
  if (notYet) age--;
  return age > 0 ? age : null;
}

function getTenure(retireDateStr) {
  if (!retireDateStr) return { status: 'unknown', label: 'No date', daysLeft: null, pct: 0 };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const retire = new Date(retireDateStr + 'T00:00:00');
  const daysLeft = Math.ceil((retire - today) / 86400000);

  if (daysLeft < 0) return { status: 'retired', label: 'Retired', daysLeft, pct: 100 };
  if (daysLeft <= 90)  return { status: 'critical', label: `${daysLeft}d left`, daysLeft, pct: null };
  if (daysLeft <= 365) return { status: 'warning',  label: `~${Math.round(daysLeft / 30)}mo left`, daysLeft, pct: null };
  const yrs = Math.floor(daysLeft / 365);
  const mos = Math.floor((daysLeft % 365) / 30);
  return { status: 'good', label: `${yrs}y ${mos}m left`, daysLeft, pct: null };
}

function retirementRemainingProgress(retireDateStr) {
  const tenure = getTenure(retireDateStr);
  if (tenure.daysLeft === null || tenure.daysLeft < 0) return 0;
  return Math.min(100, Math.max(0, (tenure.daysLeft / 365) * 100));
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Loading
// ─────────────────────────────────────────────────────────────────────────────
async function loadData() {
  // 1. Try fetch (works on GitHub Pages, Netlify, or any HTTP server)
  try {
    const [courts, ministries, adminStaff] = await Promise.all([
      fetch('data/courts.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch('data/ministries.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch('data/admin-staff.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    ]);
    state.courts = courts;
    state.ministries = ministries;
    state.adminStaff = adminStaff;
    return true;
  } catch (e) {
    // 2. Fall back to embedded data from data/data.js (works with file:// open)
    if (Array.isArray(window.COURTS_DATA) && Array.isArray(window.MINISTRIES_DATA)) {
      state.courts = window.COURTS_DATA;
      state.ministries = window.MINISTRIES_DATA;
      state.adminStaff = Array.isArray(window.ADMIN_STAFF_DATA) ? window.ADMIN_STAFF_DATA : [];
      const bar = document.querySelector('.data-notice');
      if (bar) bar.innerHTML += ' &nbsp;|&nbsp; <span style="color:var(--warning)">Using embedded data because this page was opened directly</span>';
      return true;
    }
    // 3. Nothing worked
    document.getElementById('main-content').innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h2>Cannot load data files</h2>
        <p>For the best experience, serve the folder via a local HTTP server:</p>
        <div class="code-block">python3 -m http.server 8000</div>
        <p>Then open: <a href="http://localhost:8000" target="_blank">http://localhost:8000</a></p>
      </div>`;
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hash routing
// ─────────────────────────────────────────────────────────────────────────────
function validViewId(id) {
  if (id === 'HOME' || id === 'ADMIN') return true;
  return state.courts.some(d => d.id === id) || state.ministries.some(d => d.id === id);
}

function readRoute() {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

function applyRoute() {
  const params = readRoute();
  state.selectedId = 'HOME';
  state.searchQuery = '';
  state.judgeRoleFilter = 'ALL';
  state.adminRoleFilter = 'ALL';
  state.judgeTenureRange = 12;
  state.judgeTenureShowAll = true;

  const view = params.get('view') || params.get('court') || params.get('ministry');
  if (view && validViewId(view)) state.selectedId = view;

  state.searchQuery = (params.get('q') || '').trim();
  state.judgeRoleFilter = params.get('judgeRole') || 'ALL';
  state.adminRoleFilter = params.get('adminRole') || 'ALL';
  state.judgeTenureRange = Math.min(84, Math.max(1, Number(params.get('months')) || state.judgeTenureRange));
  state.judgeTenureShowAll = params.get('showAll') !== '0';

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = state.searchQuery;
}

function writeRoute({ replace = false } = {}) {
  if (applyingRoute) return;
  const params = new URLSearchParams();
  if (state.selectedId && state.selectedId !== 'HOME') params.set('view', state.selectedId);
  if (state.searchQuery) params.set('q', state.searchQuery);
  if (state.judgeRoleFilter !== 'ALL') params.set('judgeRole', state.judgeRoleFilter);
  if (state.adminRoleFilter !== 'ALL') params.set('adminRole', state.adminRoleFilter);
  if (!state.judgeTenureShowAll) {
    params.set('months', String(state.judgeTenureRange));
    params.set('showAll', '0');
  }

  const baseUrl = window.location.pathname + window.location.search;
  const nextUrl = params.toString() ? `${baseUrl}#${params.toString()}` : baseUrl;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (replace) {
    history.replaceState(null, '', nextUrl);
  } else if (currentUrl !== nextUrl) {
    history.pushState(null, '', nextUrl);
  }
}

function rerenderFromRoute() {
  applyingRoute = true;
  applyRoute();
  renderNav();
  renderContent();
  applyingRoute = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────
function renderNav() {
  const nav = document.getElementById('nav-list');
  const courtInstitutions = state.courts.filter(d => d.type === 'institution');
  const sc  = courtInstitutions.find(d => d.id === 'SC');
  const hcs = courtInstitutions
    .filter(d => d.id !== 'SC')
    .sort((a, b) => a.name.localeCompare(b.name));
  const ministries = state.ministries.filter(d => d.type === 'institution');

  let html = '';

  html += `
    <div class="nav-section">
      <div class="nav-section-items">
        <a class="nav-item ${state.selectedId === 'HOME' ? 'active' : ''}"
           href="#" onclick="selectHome(); return false;">
          <span class="nav-icon">⌂</span>
          <span class="nav-label">Overview</span>
        </a>
      </div>
    </div>`;

  // ── Supreme Court ──
  if (sc) {
    const scKey   = 'Apex Court';
    const scCount = 1;
    const scCollapsed = getSectionCollapsed(scKey, scCount);
    const scAlert = retiringWithin90Count(sc.id);
    html += `
      <div class="nav-section${scCollapsed ? ' collapsed' : ''}">
        <button class="nav-section-title collapsible" onclick="toggleNavSection('${scKey}', ${scCount}); return false;">
          <span>Apex Court</span>
          <span class="nav-collapse-icon">${scCollapsed ? '▸' : '▾'}</span>
        </button>
        <div class="nav-section-items">
          <a class="nav-item ${state.selectedId === 'SC' ? 'active' : ''}"
             href="#" onclick="selectView('SC'); return false;">
            <span class="nav-dot good"></span>
            <span class="nav-label">Supreme Court of India</span>
            ${scAlert ? `<span class="nav-badge critical">${scAlert}</span>` : ''}
          </a>
        </div>
      </div>`;
  }

  // ── High Courts ──
  const hcKey = 'High Courts';
  const hcCollapsed = getSectionCollapsed(hcKey, hcs.length);
  let hcItemsHtml = '';
  hcs.forEach(hc => {
    const cj = state.courts.find(d => d.parent_id === hc.id);
    const tenure = cj ? getTenure(cj.retirement_date) : { status: 'unknown' };
    const criticalCount = retiringWithin90Count(hc.id);
    hcItemsHtml += `
      <a class="nav-item ${state.selectedId === hc.id ? 'active' : ''}"
         href="#" onclick="selectView('${hc.id}'); return false;">
        <span class="nav-dot ${tenure.status}"></span>
        <span class="nav-label">${hc.name.replace(' High Court', ' HC')}</span>
        ${criticalCount ? `<span class="nav-badge critical">${criticalCount}</span>` : ''}
      </a>`;
  });
  html += `
    <div class="nav-section${hcCollapsed ? ' collapsed' : ''}">
      <button class="nav-section-title collapsible" onclick="toggleNavSection('${hcKey}', ${hcs.length}); return false;">
        <span>High Courts</span>
        <span class="nav-count">${hcs.length}</span>
        <span class="nav-collapse-icon">${hcCollapsed ? '▸' : '▾'}</span>
      </button>
      <div class="nav-section-items">${hcItemsHtml}</div>
    </div>`;

  // ── Court Staff ──
  const csKey = 'Court Staff';
  const csCount = 2;  // Administration + Transfers (static items)
  const csCollapsed = getSectionCollapsed(csKey, csCount);
  html += `
    <div class="nav-section${csCollapsed ? ' collapsed' : ''}">
      <button class="nav-section-title collapsible" onclick="toggleNavSection('${csKey}', ${csCount}); return false;">
        <span>Court Staff</span>
        <span class="nav-count">${state.adminStaff.length}</span>
        <span class="nav-collapse-icon">${csCollapsed ? '▸' : '▾'}</span>
      </button>
      <div class="nav-section-items">
        <a class="nav-item ${state.selectedId === 'ADMIN' ? 'active' : ''}"
           href="#" onclick="selectView('ADMIN'); return false;">
          <span class="nav-icon">▣</span>
          <span class="nav-label">Court Administration</span>
        </a>
        <a class="nav-item" href="notifications.html">
          <span class="nav-icon">↗</span>
          <span class="nav-label">Judge/Staff Transfers</span>
        </a>
      </div>
    </div>`;

  // ── Ministries ──
  if (ministries.length > 0) {
    const minKey = 'Ministries';
    const minCollapsed = getSectionCollapsed(minKey, ministries.length);
    let minItemsHtml = '';
    ministries.forEach(m => {
      minItemsHtml += `
        <a class="nav-item ${state.selectedId === m.id ? 'active' : ''}"
           href="#" onclick="selectView('${m.id}'); return false;">
          <span class="nav-icon">🏛</span>
          <span class="nav-label">${m.name}</span>
        </a>`;
    });
    html += `
      <div class="nav-section${minCollapsed ? ' collapsed' : ''}">
        <button class="nav-section-title collapsible" onclick="toggleNavSection('${minKey}', ${ministries.length}); return false;">
          <span>Ministries</span>
          <span class="nav-count">${ministries.length}</span>
          <span class="nav-collapse-icon">${minCollapsed ? '▸' : '▾'}</span>
        </button>
        <div class="nav-section-items">${minItemsHtml}</div>
      </div>`;
  }

  // ── Legend ──
  html += `
    <div class="nav-legend">
      <div class="legend-title">Tenure Remaining</div>
      <div class="legend-item"><span class="nav-dot good"></span> &gt; 1 year</div>
      <div class="legend-item"><span class="nav-dot warning"></span> 3–12 months</div>
      <div class="legend-item"><span class="nav-dot critical"></span> &lt; 3 months</div>
    </div>`;

  nav.innerHTML = html;
}

function retiringWithin90Count(courtId) {
  return state.courts.filter(person => {
    if (person.parent_id !== courtId || !isJudgeRecord(person)) return false;
    const tenure = getTenure(person.retirement_date);
    return tenure.daysLeft !== null && tenure.daysLeft >= 0 && tenure.daysLeft <= 90;
  }).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Person Card
// ─────────────────────────────────────────────────────────────────────────────
function renderCard(person, isHead = false) {
  const retireStr  = person.retirement_date || person.tenure_end || '';
  const assumedStr = person.date_assumed_role || person.assumed_office || '';
  const initialStr = person.date_initial_appointment || '';
  const tenure = getTenure(retireStr);
  const pct    = retireStr ? retirementRemainingProgress(retireStr) : 0;
  const roleLabel = person.role || 'Official';
  const isPlaceholder = person.type === 'placeholder';

  if (isPlaceholder) {
    return `
      <div class="person-card placeholder-card">
        <div class="card-identity">
          ${renderAvatar(person)}
          <div>
            <div class="card-role">${roleLabel}</div>
            <div class="person-name">${person.name}</div>
          </div>
        </div>
        ${person.notes ? `<div class="card-notes">${person.notes}</div>` : ''}
      </div>`;
  }

  const progressBar = (retireStr && tenure.status !== 'retired') ? `
    <div class="tenure-progress" title="${tenure.daysLeft} days until retirement">
      <div class="tenure-fill ${tenure.status}" style="width:${pct.toFixed(1)}%"></div>
    </div>` : '';

  return `
    <div class="person-card ${isHead ? 'head-card' : ''} border-${tenure.status}">
      <div class="card-top">
        <div class="card-identity">
          ${renderAvatar(person)}
          <div class="card-left">
            <span class="card-role-badge ${person.type || ''}">${roleLabel}</span>
            <div class="person-name">${person.name}</div>
            ${person.parent_high_court ? `<div class="parent-court">From: ${person.parent_high_court} HC</div>` : ''}
          </div>
        </div>
        ${retireStr ? `<div class="tenure-chip ${tenure.status}">${tenure.label}</div>` : ''}
      </div>
      ${progressBar}
      <div class="card-meta">
        ${person.date_of_birth ? `<div class="meta-row"><span class="meta-icon">👤</span><span>${getAge(person.date_of_birth)} yrs · born ${formatDate(person.date_of_birth)}</span></div>` : ''}
        ${assumedStr  ? `<div class="meta-row"><span class="meta-icon">📅</span><span>In role since ${formatDate(assumedStr)}</span></div>` : ''}
        ${initialStr  ? `<div class="meta-row"><span class="meta-icon">🔰</span><span>Initially elevated ${formatDate(initialStr)}</span></div>` : ''}
        ${retireStr   ? `<div class="meta-row"><span class="meta-icon">🔚</span><span>Retires ${formatDate(retireStr)}</span></div>` : ''}
        ${renderContactRows(person)}
        ${person.source_url ? `<div class="meta-row"><span class="meta-icon">↗</span><span><a class="inline-link" href="${escHtml(person.source_url)}" target="_blank" rel="noopener">${escHtml(person.source_label || 'Official source')}</a></span></div>` : ''}
        ${person.photo_source ? `<div class="meta-row"><span class="meta-icon">▧</span><span>Photo: ${escHtml(person.photo_source)}</span></div>` : ''}
        ${person.notes ? `<div class="meta-row notes-row"><span class="meta-icon">ℹ</span><span>${person.notes}</span></div>` : ''}
      </div>
    </div>`;
}

function renderAvatar(person) {
  const name = person.name || '';
  const initials = initialsFor(name);
  if (person.photo_url) {
    return `<img class="person-photo" src="${escHtml(person.photo_url)}" alt="${escHtml(name)}" loading="lazy" onerror="this.replaceWith(renderInitialsAvatar('${escAttr(initials)}'))">`;
  }
  return `<div class="person-photo avatar-fallback" aria-hidden="true">${escHtml(initials)}</div>`;
}

window.renderInitialsAvatar = function(initials) {
  const el = document.createElement('div');
  el.className = 'person-photo avatar-fallback';
  el.textContent = initials || '?';
  return el;
};

function initialsFor(name) {
  const clean = (name || '')
    .replace(/^Hon'?ble\s+/i, '')
    .replace(/^Justice\s+/i, '')
    .replace(/^(Shri|Sri|Smt\.?|Ms\.?|Mr\.?|Dr\.?|Sh\.)\s+/i, '')
    .replace(/\[[^\]]+\]/g, '')
    .trim();
  if (!clean || /^not published|^vacant/i.test(clean)) return '?';
  return clean.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function renderContactRows(person) {
  const rows = [];
  if (person.email) {
    rows.push(`<div class="meta-row"><span class="meta-icon">@</span><span><a class="inline-link" href="mailto:${escHtml(person.email)}">${escHtml(person.email)}</a></span></div>`);
  }
  if (person.phone) {
    const first = (person.phone.split('/')[0] || '').trim();
    const tel = first.startsWith('+') ? first : '';
    rows.push(`<div class="meta-row"><span class="meta-icon">☎</span><span>${tel ? `<a class="inline-link" href="tel:${escHtml(tel)}">${escHtml(person.phone)}</a>` : escHtml(person.phone)}</span></div>`);
  }
  if (person.fax) {
    rows.push(`<div class="meta-row"><span class="meta-icon">Fax</span><span>${escHtml(person.fax)}</span></div>`);
  }
  return rows.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats Banner
// ─────────────────────────────────────────────────────────────────────────────
function statsFor(people) {
  const active   = people.filter(p => { const t = getTenure(p.retirement_date || p.tenure_end); return t.status !== 'retired'; });
  const critical = active.filter(p => getTenure(p.retirement_date || p.tenure_end).status === 'critical');
  const warning  = active.filter(p => getTenure(p.retirement_date || p.tenure_end).status === 'warning');
  const chips = [];
  chips.push(`<span class="stat-chip">${active.length} active</span>`);
  if (critical.length) chips.push(`<span class="stat-chip critical">🔴 ${critical.length} retiring &lt;90d</span>`);
  if (warning.length)  chips.push(`<span class="stat-chip warning">🟡 ${warning.length} retiring &lt;1yr</span>`);
  return chips.join('');
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function dashboardBar(label, value, total, className = '') {
  const pct = percent(value, total);
  return `
    <div class="dash-bar-row ${className}">
      <div class="dash-bar-label"><span>${escHtml(label)}</span><strong>${value}</strong></div>
      <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
}

function judgeStatusBuckets(judges) {
  const active = judges.filter(j => {
    const t = getTenure(j.retirement_date);
    return t.status !== 'retired';
  });
  return {
    active,
    within90: active.filter(j => {
      const t = getTenure(j.retirement_date);
      return t.daysLeft !== null && t.daysLeft >= 0 && t.daysLeft <= 90;
    }),
    within6m: active.filter(j => {
      const t = getTenure(j.retirement_date);
      return t.daysLeft !== null && t.daysLeft >= 0 && t.daysLeft <= 183;
    }),
    within12m: active.filter(j => {
      const t = getTenure(j.retirement_date);
      return t.daysLeft !== null && t.daysLeft >= 0 && t.daysLeft <= 365;
    }),
    unknown: active.filter(j => getTenure(j.retirement_date).daysLeft === null)
  };
}

function isJudgeRecord(row) {
  return row && (row.type === 'supreme_court' || row.type === 'high_court');
}

function judgeTenureRangeDays() {
  const value = Math.min(84, Math.max(1, Number(state.judgeTenureRange) || 1));
  return Math.round(value * 30.44);
}

function judgeTenureRangeLabel() {
  const value = Math.min(84, Math.max(1, Number(state.judgeTenureRange) || 1));
  return `${value} month${value === 1 ? '' : 's'}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters — tenure + role, applied to both judges and admin staff
// ─────────────────────────────────────────────────────────────────────────────
function matchesJudgeRoleFilter(person) {
  if (state.judgeRoleFilter === 'ALL') return true;
  const role = person.role || '';
  if (state.judgeRoleFilter === 'Chief')      return /chief justice/i.test(role);
  if (state.judgeRoleFilter === 'Puisne')     return role === 'Judge';
  if (state.judgeRoleFilter === 'Additional') return role === 'Additional Judge';
  return true;
}

function matchesJudgeTenureFilter(person) {
  if (!isJudgeRecord(person)) return true;
  if (!matchesJudgeRoleFilter(person)) return false;
  if (state.judgeTenureShowAll) return true;
  const tenure = getTenure(person.retirement_date);
  return tenure.daysLeft !== null && tenure.daysLeft >= 0 && tenure.daysLeft <= judgeTenureRangeDays();
}

// Applies tenure slider + admin role filter to admin staff rows
function matchesAdminFilter(row) {
  if (state.adminRoleFilter !== 'ALL' && row.role_group !== state.adminRoleFilter) return false;
  if (!state.judgeTenureShowAll && row.retirement_date) {
    const t = getTenure(row.retirement_date);
    if (t.daysLeft === null || t.daysLeft < 0 || t.daysLeft > judgeTenureRangeDays()) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Filter Bar — shown in every view
// judgePool: all judges for this view (unfiltered)
// adminPool: all admin staff for this view (unfiltered)
// ─────────────────────────────────────────────────────────────────────────────
function renderUnifiedFilterBar(judgePool, adminPool) {
  judgePool = judgePool || [];
  adminPool = adminPool || [];

  const value   = Math.min(84, Math.max(1, Number(state.judgeTenureRange) || 1));
  const showAll = state.judgeTenureShowAll;

  // Compute how many are shown after all filters
  const shownJudges = judgePool.filter(matchesJudgeTenureFilter).length;
  const shownAdmin  = adminPool.filter(matchesAdminFilter).length;
  const totalShown  = shownJudges + shownAdmin;

  // ── Judge role pills ──
  const judgeGroups = [
    { key: 'Chief',      label: 'Chief Justice',    test: j => /chief justice/i.test(j.role || '') },
    { key: 'Puisne',     label: 'Judge',            test: j => (j.role || '') === 'Judge' },
    { key: 'Additional', label: 'Additional Judge', test: j => (j.role || '') === 'Additional Judge' },
  ].filter(g => judgePool.some(g.test));

  let judgeRolePills = '';
  if (judgeGroups.length > 0) {
    judgeRolePills =
      `<button class="role-filter ${state.judgeRoleFilter === 'ALL' ? 'active' : ''}" onclick="setJudgeRoleFilter('ALL')">All judges</button>` +
      judgeGroups.map(g =>
        `<button class="role-filter ${state.judgeRoleFilter === g.key ? 'active' : ''}" onclick="setJudgeRoleFilter('${g.key}')">${escHtml(g.label)}</button>`
      ).join('');
  }

  // ── Admin role pills ──
  let adminRolePills = '';
  if (adminPool.length > 0) {
    const roles = uniqueAdminRoles(adminPool);
    adminRolePills =
      `<button class="role-filter ${state.adminRoleFilter === 'ALL' ? 'active' : ''}" onclick="setAdminRoleFilter('ALL')">All roles</button>` +
      roles.map(role =>
        `<button class="role-filter ${state.adminRoleFilter === role ? 'active' : ''}" onclick="setAdminRoleFilter('${escAttr(role)}')">${escHtml(role)}</button>`
      ).join('');
  }

  const rolePills = judgeRolePills + adminRolePills;
  const hasRoleFilter = state.judgeRoleFilter !== 'ALL' || state.adminRoleFilter !== 'ALL';

  return `
    <div class="unified-filter-bar" aria-label="Filter panel">
      <div class="unified-filter-row">
        <div class="judge-range-summary">
          ${showAll
            ? `<span>Showing</span><strong id="judge-range-label">all</strong>`
            : `<span>Retiring within</span><strong id="judge-range-label">${escHtml(judgeTenureRangeLabel())}</strong>`}
        </div>
        <input class="judge-range-slider${showAll ? ' slider-dimmed' : ''}" id="judge-range-slider"
               type="range" min="1" max="84" step="1" value="${value}">
        <button class="show-all-btn${showAll ? ' active' : ''}" onclick="toggleJudgeTenureShowAll()"
                title="${showAll ? 'Switch back to date filter' : 'Show all regardless of retirement date'}">
          ${showAll ? 'Filter by retirement' : 'Show all'}
        </button>
        <span id="judge-range-count" class="filter-shown-count">${totalShown} shown</span>
      </div>
      ${rolePills ? `
      <div class="unified-filter-row role-row">
        <span class="filter-row-label">Role</span>
        <div class="role-pills-wrap">${rolePills}</div>
        <button class="clear-filter-btn${hasRoleFilter ? '' : ' hidden'}" onclick="clearAllRoleFilters()">× Clear</button>
      </div>` : ''}
    </div>`;
}

// Attach smooth slider listeners after every innerHTML write.
// input  → update label in-place (no DOM rebuild, no sticking)
// change → full re-render only on mouseup / touchend
function attachSliderListeners() {
  const slider = document.getElementById('judge-range-slider');
  if (!slider) return;
  const labelEl = document.getElementById('judge-range-label');
  const countEl = document.getElementById('judge-range-count');

  slider.addEventListener('input', function () {
    const v = Math.min(84, Math.max(1, Number(this.value) || 1));
    state.judgeTenureRange = v;
    state.judgeTenureShowAll = false;
    if (labelEl) labelEl.textContent = `${v} month${v === 1 ? '' : 's'}`;
    if (countEl) {
      let n = 0;
      if (state.selectedId === 'ADMIN') {
        n = filteredAdminStaff().length;
      } else {
        const judges = state.courts.filter(d => d.parent_id === state.selectedId && isJudgeRecord(d));
        n = judges.filter(matchesJudgeTenureFilter).length;
      }
      countEl.textContent = `${n} shown`;
    }
  });

  slider.addEventListener('change', function () {
    writeRoute();
    renderContent(); // full re-render on release — slider DOM survives the drag intact
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Content Renderer
// ─────────────────────────────────────────────────────────────────────────────
function renderContent() {
  const container = document.getElementById('main-content');
  const all = [...state.courts, ...state.ministries, ...state.adminStaff];

  // ── Search mode ──
  if (state.searchQuery.length > 1) {
    const q = state.searchQuery.toLowerCase();
    const rawResults = all.filter(d =>
      d.type !== 'institution' && d.type !== 'placeholder' &&
      (d.name.toLowerCase().includes(q) ||
       (d.role || '').toLowerCase().includes(q) ||
       (d.court || d.ministry || '').toLowerCase().includes(q) ||
       (d.state || '').toLowerCase().includes(q))
    );
    const resultJudges = rawResults.filter(isJudgeRecord);
    const resultAdmin  = rawResults.filter(r => r.role_group);
    const results = rawResults.filter(d => {
      if (isJudgeRecord(d)) return matchesJudgeTenureFilter(d);
      if (d.role_group)     return matchesAdminFilter(d);
      return true;
    });
    container.innerHTML = `
      <div class="view-header">
        <h2>Search: <em>"${escHtml(state.searchQuery)}"</em></h2>
        <div class="view-meta">${results.length} result${results.length !== 1 ? 's' : ''}</div>
      </div>
      ${renderUnifiedFilterBar(resultJudges, resultAdmin)}
      ${results.length
        ? `<div class="cards-grid">${results.map(r => r.role_group ? renderAdminCard(r) : renderCard(r)).join('')}</div>`
        : `<div class="empty-state"><p>No results found for "${escHtml(state.searchQuery)}"</p></div>`}`;
    attachSliderListeners();
    return;
  }

  if (state.selectedId === 'ADMIN') {
    container.innerHTML = renderAdminStaffView();
    attachSliderListeners();
    return;
  }

  if (state.selectedId === 'HOME') {
    container.innerHTML = renderDashboardView();
    return;
  }

  // ── Normal view ──
  const root = all.find(d => d.id === state.selectedId);
  if (!root) {
    container.innerHTML = `<div class="empty-state"><p>Select a court or ministry from the sidebar.</p></div>`;
    return;
  }

  const isMinistry = !!state.ministries.find(d => d.id === state.selectedId);
  const children   = all.filter(d => d.parent_id === state.selectedId);

  let html = `
    <div class="view-header">
      <h2>${escHtml(root.name)}</h2>
      ${root.notes ? `<p class="view-subtitle">${escHtml(root.notes)}</p>` : ''}
    </div>`;

  if (isMinistry) {
    html += renderMinistryView(root, all, children);
  } else {
    html += renderCourtView(root, all, children);
  }

  container.innerHTML = html;
  attachSliderListeners();
}

function renderDashboardView() {
  const courtInstitutions = state.courts.filter(d => d.type === 'institution');
  const highCourts = courtInstitutions.filter(c => c.id !== 'SC');
  const judges = state.courts.filter(isJudgeRecord);
  const buckets = judgeStatusBuckets(judges);
  const courtsWithJudges = courtInstitutions.filter(c => judges.some(j => j.parent_id === c.id));
  const courtsWithAdmin = courtInstitutions.filter(c => state.adminStaff.some(a => a.court_id === c.id));
  const photoCount = judges.filter(j => j.photo_url).length;
  const adminRoles = uniqueAdminRoles(state.adminStaff);
  const ministryPeople = state.ministries.filter(d => d.type !== 'institution').length;
  const courtRows = courtInstitutions.map(c => {
    const courtJudges = judges.filter(j => j.parent_id === c.id);
    const courtBuckets = judgeStatusBuckets(courtJudges);
    return {
      id: c.id,
      name: c.name,
      active: courtBuckets.active.length,
      within12m: courtBuckets.within12m.length,
      within90: courtBuckets.within90.length
    };
  }).sort((a, b) => b.within12m - a.within12m || b.within90 - a.within90 || a.name.localeCompare(b.name));
  const topRetiringCourts = courtRows.filter(c => c.within12m > 0).slice(0, 6);
  const roleCounts = ['Chief Justice', 'Judge', 'Additional Judge'].map(role => ({
    role,
    count: judges.filter(j => role === 'Chief Justice'
      ? /chief justice/i.test(j.role || '')
      : (j.role || '') === role
    ).length
  })).filter(r => r.count > 0);

  return `
    <div class="dashboard-view">
      <section class="dashboard-hero">
        <div>
          <p class="dashboard-kicker">India Judiciary Tracker</p>
          <h2>Overview</h2>
          <p class="dashboard-subtitle">A public, AI-parsed snapshot of tracked courts, sitting judges, court administration and upcoming retirements.</p>
        </div>
        <a class="dashboard-action" href="notifications.html">Judge/Staff Transfer Notifications</a>
      </section>

      <section class="dashboard-metrics" aria-label="Tracker summary">
        <button class="dashboard-metric" onclick="selectView('SC')">
          <span class="metric-label">Courts tracked</span>
          <strong>${courtInstitutions.length}</strong>
          <span>${plural(highCourts.length, 'High Court')} plus Supreme Court</span>
        </button>
        <button class="dashboard-metric" onclick="selectView('SC')">
          <span class="metric-label">Sitting judges</span>
          <strong>${buckets.active.length}</strong>
          <span>${percent(photoCount, judges.length)}% have local photos</span>
        </button>
        <button class="dashboard-metric critical" onclick="selectView('SC')">
          <span class="metric-label">Retiring within 90 days</span>
          <strong>${buckets.within90.length}</strong>
          <span>Across all tracked courts</span>
        </button>
        <button class="dashboard-metric warning" onclick="selectView('SC')">
          <span class="metric-label">Retiring within 12 months</span>
          <strong>${buckets.within12m.length}</strong>
          <span>${percent(buckets.within12m.length, buckets.active.length)}% of active judges</span>
        </button>
      </section>

      <section class="dashboard-grid">
        <article class="dashboard-panel">
          <div class="panel-heading">
            <h3>Retirement Pipeline</h3>
            <p>How many active judges are due to retire in common planning windows.</p>
          </div>
          ${dashboardBar('Within 90 days', buckets.within90.length, buckets.active.length, 'critical')}
          ${dashboardBar('Within 6 months', buckets.within6m.length, buckets.active.length, 'warning')}
          ${dashboardBar('Within 12 months', buckets.within12m.length, buckets.active.length, 'warning')}
          ${dashboardBar('Date unavailable', buckets.unknown.length, buckets.active.length, 'unknown')}
        </article>

        <article class="dashboard-panel">
          <div class="panel-heading">
            <h3>Data Coverage</h3>
            <p>What this static tracker currently has structured data for.</p>
          </div>
          ${dashboardBar('Courts with judge records', courtsWithJudges.length, courtInstitutions.length)}
          ${dashboardBar('Courts with admin/staff records', courtsWithAdmin.length, courtInstitutions.length)}
          ${dashboardBar('Judges with local photos', photoCount, judges.length)}
          ${dashboardBar('Court admin role categories', adminRoles.length, Math.max(adminRoles.length, 12), 'neutral')}
        </article>

        <article class="dashboard-panel">
          <div class="panel-heading">
            <h3>Judge Mix</h3>
            <p>Current tracked records by role label.</p>
          </div>
          ${roleCounts.map(r => dashboardBar(r.role, r.count, judges.length)).join('')}
        </article>

        <article class="dashboard-panel">
          <div class="panel-heading">
            <h3>Court Administration</h3>
            <p>Registry, CPC and other administrative records separated from judge records.</p>
          </div>
          <div class="dash-split-stat">
            <div><strong>${state.adminStaff.length}</strong><span>court staff records</span></div>
            <div><strong>${adminRoles.length}</strong><span>role filters</span></div>
            <div><strong>${ministryPeople}</strong><span>ministry people</span></div>
          </div>
          <button class="dashboard-secondary-action" onclick="selectView('ADMIN')">Explore administration</button>
        </article>
      </section>

      <section class="dashboard-panel wide">
        <div class="panel-heading">
          <h3>Courts With Upcoming Judge Retirements</h3>
          <p>Courts with at least one judge retiring within the next 12 months.</p>
        </div>
        ${topRetiringCourts.length
          ? `<div class="retirement-court-list">
              ${topRetiringCourts.map(c => `
                <button class="retirement-court-row" onclick="selectView('${escAttr(c.id)}')">
                  <span>${escHtml(c.name)}</span>
                  <strong>${c.within12m}</strong>
                  <em>${c.within90 ? `${c.within90} within 90d` : `${c.active} active judges`}</em>
                </button>`).join('')}
            </div>`
          : `<div class="empty-state compact"><p>No tracked judge retirements within 12 months.</p></div>`}
      </section>
    </div>`;
}

function renderCourtView(root, all, children) {
  const allJudges = children.filter(isJudgeRecord);
  const people = allJudges.filter(matchesJudgeTenureFilter);
  const allAdminStaff = state.adminStaff.filter(p => p.court_id === root.id);
  const adminStaff = allAdminStaff.filter(matchesAdminFilter).sort(adminSort);
  const head   = people.find(p =>
    p.role === 'Chief Justice of India' ||
    p.role === 'Chief Justice' ||
    p.role === 'Acting Chief Justice'
  );
  const rest = people.filter(p => p !== head).sort((a, b) => {
    if (a.date_assumed_role && b.date_assumed_role) {
      const d = new Date(a.date_assumed_role) - new Date(b.date_assumed_role);
      if (d !== 0) return d;
    }
    if (a.retirement_date && b.retirement_date)
      return new Date(a.retirement_date) - new Date(b.retirement_date);
    return 0;
  });

  let html = '';

  html += renderUnifiedFilterBar(allJudges, allAdminStaff);

  if (people.length > 0) {
    html += `<div class="stats-bar">${statsFor(people)}</div>`;
  }

  if (head) {
    html += `<div class="section-label">Presiding Head</div>`;
    html += renderCard(head, true);
  }

  if (rest.length > 0) {
    html += `<div class="section-label">Judges <span class="section-count">${rest.length}</span></div>`;
    html += `<div class="cards-grid">${rest.map(j => renderCard(j)).join('')}</div>`;
  }

  if (allAdminStaff.length > 0) {
    const countLabel = adminStaff.length < allAdminStaff.length
      ? `${adminStaff.length} of ${allAdminStaff.length}`
      : adminStaff.length;
    html += `<div class="section-label">Court Administration <span class="section-count">${countLabel}</span></div>`;
    html += adminStaff.length
      ? `<div class="cards-grid">${adminStaff.map(renderAdminCard).join('')}</div>`
      : `<div class="empty-state" style="padding:20px 0"><p>No staff match the current role filter.</p></div>`;
  }

  if (people.length === 0) {
    if (allJudges.length > 0) {
      html += `<div class="empty-state"><p>No judges match the current filters for this court.</p></div>`;
    } else {
      html += `
        <div class="empty-state">
          <p>No individual judges loaded for this court yet.</p>
          <p>Available public data for this court is incomplete.</p>
        </div>`;
    }
  }

  return html;
}

function renderMinistryView(root, all, children) {
  let html = '';

  const directPeople = children.filter(c => c.type !== 'institution');
  if (directPeople.length > 0) {
    html += `<div class="section-label">Political Leadership</div>`;
    html += directPeople.map(p => renderCard(p, true)).join('');
  }

  const depts = children.filter(c => c.type === 'institution');
  depts.forEach(dept => {
    const deptChildren = all.filter(d => d.parent_id === dept.id);
    html += `
      <div class="dept-block">
        <div class="dept-name">${escHtml(dept.name)}</div>
        ${dept.notes ? `<div class="dept-desc">${escHtml(dept.notes)}</div>` : ''}
        <div class="dept-officials">${deptChildren.map(p => renderCard(p)).join('')}</div>
      </div>`;
  });

  return html;
}

function renderAdminStaffView() {
  const staff = filteredAdminStaff();

  return `
    <div class="view-header">
      <h2>Court Administration</h2>
      <p class="view-subtitle">Administrative roles tracked separately from judges. Each court view also shows that court's registry, CPC, IT and administrative officers.</p>
    </div>
    ${renderUnifiedFilterBar([], state.adminStaff)}
    <div class="stats-bar">
      <span class="stat-chip">${staff.length} of ${state.adminStaff.length} records shown</span>
    </div>
    <div class="cards-grid">${staff.map(renderAdminCard).join('')}</div>
  `;
}

function filteredAdminStaff() {
  return state.adminStaff.filter(matchesAdminFilter).sort(adminSort);
}

function uniqueAdminRoles(rows) {
  return [...new Set(rows.map(r => r.role_group).filter(Boolean))]
    .sort((a, b) => {
      const priority = ['CPC', 'IT / Computerisation', 'Registrar General', 'Registrar Administration', 'Registrar Judicial', 'Registrar Vigilance'];
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.localeCompare(b);
    });
}

function adminSort(a, b) {
  const roles = uniqueAdminRoles([a, b]);
  const roleCompare = roles.indexOf(a.role_group) - roles.indexOf(b.role_group);
  if (roleCompare) return roleCompare;
  return (a.court || '').localeCompare(b.court || '') || (a.name || '').localeCompare(b.name || '');
}

function renderAdminCard(cpc) {
  // Extract place of posting from notes ("Place of posting: Prayagraj")
  const placeMatch = (cpc.notes || '').match(/Place of posting:\s*([^.]+)/);
  const place = placeMatch ? placeMatch[1].trim() : '';
  const courtShort = (cpc.court || '').replace(' High Court', ' HC');
  // Remaining notes after stripping place-of-posting
  const cleanNotes = (cpc.notes || '').replace(/Place of posting:[^.]*\.?\s*/g, '').trim();

  return `
    <div class="person-card cpc-card border-unknown">
      <div class="card-top">
        <div class="card-identity">
          ${renderAvatar(cpc)}
          <div class="card-left">
            <div class="card-badges-row">
              <span class="card-role-badge cpc">${escHtml(cpc.role_group || cpc.role || 'Admin')}</span>
              ${courtShort ? `<span class="court-badge">${escHtml(courtShort)}</span>` : ''}
            </div>
            <div class="person-name">${escHtml(cpc.name)}</div>
            ${place ? `<div class="parent-court">${escHtml(place)}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="card-meta">
        ${cpc.designation ? `<div class="meta-row"><span class="meta-icon">▣</span><span>${escHtml(cpc.designation)}</span></div>` : ''}
        ${cpc.date_of_birth ? `<div class="meta-row"><span class="meta-icon">👤</span><span>${getAge(cpc.date_of_birth)} yrs · born ${formatDate(cpc.date_of_birth)}</span></div>` : ''}
        ${renderContactRows(cpc)}
        ${cpc.date_assumed_role ? `<div class="meta-row"><span class="meta-icon">📅</span><span>In role since ${formatDate(cpc.date_assumed_role)}</span></div>` : ''}
        ${cpc.retirement_date ? `<div class="meta-row"><span class="meta-icon">🔚</span><span>Retires ${formatDate(cpc.retirement_date)}</span></div>` : ''}
        ${cpc.source_url ? `<div class="meta-row"><span class="meta-icon">↗</span><span><a class="inline-link" href="${escHtml(cpc.source_url)}" target="_blank" rel="noopener">${escHtml(cpc.source_label || 'Official source')}</a></span></div>` : ''}
        ${cleanNotes ? `<div class="meta-row notes-row"><span class="meta-icon">ℹ</span><span>${escHtml(cleanNotes)}</span></div>` : ''}
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter & View Handlers
// ─────────────────────────────────────────────────────────────────────────────
window.setAdminRoleFilter = function(role) {
  state.adminRoleFilter = role;
  writeRoute();
  renderContent();
};

window.setJudgeRoleFilter = function(key) {
  state.judgeRoleFilter = key;
  writeRoute();
  renderContent();
};

window.clearAllRoleFilters = function() {
  state.judgeRoleFilter = 'ALL';
  state.adminRoleFilter = 'ALL';
  writeRoute();
  renderContent();
};

window.setJudgeTenureRange = function(value) {
  state.judgeTenureRange = Math.min(84, Math.max(1, Number(value) || 1));
  state.judgeTenureShowAll = false;
  writeRoute();
  renderContent();
};

window.toggleJudgeTenureShowAll = function() {
  state.judgeTenureShowAll = !state.judgeTenureShowAll;
  writeRoute();
  renderContent();
};

window.selectHome = function() {
  state.selectedId = 'HOME';
  state.searchQuery = '';
  state.judgeRoleFilter = 'ALL';
  state.adminRoleFilter = 'ALL';
  state.judgeTenureShowAll = true;
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  writeRoute();
  renderNav();
  renderContent();
  document.getElementById('main-panel').scrollTop = 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// Global interactions
// ─────────────────────────────────────────────────────────────────────────────
window.selectView = function(id) {
  state.selectedId      = id;
  state.searchQuery     = '';
  state.judgeRoleFilter = 'ALL';
  state.adminRoleFilter = 'ALL';
  state.judgeTenureShowAll = true;   // always reset to show all on view change
  document.getElementById('search-input').value = '';
  writeRoute();
  renderNav();
  renderContent();
  document.getElementById('main-panel').scrollTop = 0;
};

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  return escHtml(str).replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Upcoming Retirements Panel
// ─────────────────────────────────────────────────────────────────────────────
function renderUpcomingPanel() {
  const all = [...state.courts, ...state.ministries];
  const upcoming = all
    .filter(d => d.type !== 'institution' && d.type !== 'placeholder')
    .map(d => ({ ...d, tenure: getTenure(d.retirement_date || d.tenure_end) }))
    .filter(d => d.tenure.daysLeft !== null && d.tenure.daysLeft >= 0 && d.tenure.daysLeft <= 365)
    .sort((a, b) => a.tenure.daysLeft - b.tenure.daysLeft);

  const panel = document.getElementById('upcoming-panel');
  if (!panel) return;

  panel.innerHTML = `
    ${upcoming.length === 0 ? '<div class="upcoming-empty">None within 1 year</div>' : ''}
    ${upcoming.map(p => `
      <div class="upcoming-item ${p.tenure.status}" onclick="selectView('${escHtml(p.parent_id)}')">
        <div class="upcoming-name">${escHtml(p.name)}</div>
        <div class="upcoming-court">${escHtml(p.court || p.ministry || '')}</div>
        <div class="upcoming-chip ${p.tenure.status}">${p.tenure.label}</div>
      </div>`).join('')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────
async function init() {
  // Search
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', e => {
    state.searchQuery = e.target.value.trim();
    writeRoute({ replace: true });
    renderContent();
  });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      state.searchQuery = '';
      writeRoute();
      renderContent();
    }
  });

  // Theme toggle
  const themeBtn = document.getElementById('theme-toggle');
  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    themeBtn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
    try { localStorage.setItem('jt-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); } catch(e) {}
  });
  try {
    if (localStorage.getItem('jt-theme') === 'dark') {
      document.body.classList.add('dark');
      themeBtn.textContent = '☀️';
    }
  } catch(e) {}

  // Sidebar toggle (mobile)
  const menuBtn = document.getElementById('menu-toggle');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('open');
    });
  }

  const ok = await loadData();
  if (ok) {
    applyRoute();
    renderNav();
    renderContent();
    renderUpcomingPanel();
  }
}

window.addEventListener('hashchange', rerenderFromRoute);
window.addEventListener('popstate', rerenderFromRoute);
document.addEventListener('DOMContentLoaded', init);
