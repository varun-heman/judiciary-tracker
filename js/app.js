/**
 * India Judiciary & Ministry Tracker
 * Data is read from JSON files — all visuals are in CSS/HTML.
 */

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
const state = {
  courts: [],
  ministries: [],
  adminStaff: [],
  adminRoleFilter: 'ALL',
  judgeTenureRange: 12,
  selectedId: 'SC',
  searchQuery: '',
};

// ─────────────────────────────────────────────────────────────────────────────
// Date & Tenure Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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

function tenureProgress(assumedStr, retireStr) {
  if (!assumedStr || !retireStr) return 0;
  const start = new Date(assumedStr + 'T00:00:00');
  const end   = new Date(retireStr  + 'T00:00:00');
  const now   = new Date();
  const total = end - start;
  const elapsed = now - start;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
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
      // Show a subtle banner so user knows they're on embedded data
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

  // Collect upcoming retirements for badge
  const allPeople = [...state.courts, ...state.ministries].filter(d =>
    d.type !== 'institution' && d.type !== 'placeholder'
  );
  const retiring90 = allPeople.filter(d => {
    const t = getTenure(d.retirement_date || d.tenure_end);
    return t.daysLeft !== null && t.daysLeft >= 0 && t.daysLeft <= 90;
  }).length;

  let html = '';

  // ── Supreme Court ──
  if (sc) {
    const scJudges = state.courts.filter(d => d.parent_id === 'SC');
    const scAlert = retiringWithin90Count(sc.id);
    html += `
      <div class="nav-section">
        <div class="nav-section-title">Apex Court</div>
        <a class="nav-item ${state.selectedId === 'SC' ? 'active' : ''}"
           href="#" onclick="selectView('SC'); return false;">
          <span class="nav-dot good"></span>
          <span class="nav-label">Supreme Court of India</span>
          ${scAlert ? `<span class="nav-badge critical">${scAlert}</span>` : ''}
        </a>
      </div>`;
  }

  // ── High Courts ──
  html += `<div class="nav-section">
    <div class="nav-section-title">High Courts <span class="nav-count">${hcs.length}</span></div>`;
  hcs.forEach(hc => {
    const cj = state.courts.find(d => d.parent_id === hc.id);
    const tenure = cj ? getTenure(cj.retirement_date) : { status: 'unknown' };
    const criticalCount = retiringWithin90Count(hc.id);
    html += `
      <a class="nav-item ${state.selectedId === hc.id ? 'active' : ''}"
         href="#" onclick="selectView('${hc.id}'); return false;">
        <span class="nav-dot ${tenure.status}"></span>
        <span class="nav-label">${hc.name.replace(' High Court', ' HC')}</span>
        ${criticalCount ? `<span class="nav-badge critical">${criticalCount}</span>` : ''}
      </a>`;
  });
  html += `</div>`;

  // ── Court Staff ──
  html += `<div class="nav-section">
    <div class="nav-section-title">Court Staff</div>
    <a class="nav-item ${state.selectedId === 'ADMIN' ? 'active' : ''}"
       href="#" onclick="selectView('ADMIN'); return false;">
      <span class="nav-icon">▣</span>
      <span class="nav-label">Court Administration</span>
      <span class="nav-badge">${state.adminStaff.length}</span>
    </a>
    <a class="nav-item" href="notifications.html">
      <span class="nav-icon">↗</span>
      <span class="nav-label">Judge/Staff Transfers</span>
    </a>
  </div>`;

  // ── Ministries ──
  if (ministries.length > 0) {
    html += `<div class="nav-section">
      <div class="nav-section-title">Ministries</div>`;
    ministries.forEach(m => {
      html += `
        <a class="nav-item ${state.selectedId === m.id ? 'active' : ''}"
           href="#" onclick="selectView('${m.id}'); return false;">
          <span class="nav-icon">🏛</span>
          <span class="nav-label">${m.name}</span>
        </a>`;
    });
    html += `</div>`;
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
  const pct    = assumedStr && retireStr ? tenureProgress(assumedStr, retireStr) : 0;
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

  const progressBar = (assumedStr && retireStr && tenure.status !== 'retired') ? `
    <div class="tenure-progress" title="${pct.toFixed(1)}% of tenure elapsed">
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
        ${assumedStr  ? `<div class="meta-row"><span class="meta-icon">📅</span><span>In role since ${formatDate(assumedStr)}</span></div>` : ''}
        ${initialStr  ? `<div class="meta-row"><span class="meta-icon">🔰</span><span>Initially elevated ${formatDate(initialStr)}</span></div>` : ''}
        ${retireStr   ? `<div class="meta-row"><span class="meta-icon">🔚</span><span>Retires ${formatDate(retireStr)}</span></div>` : ''}
        ${renderContactRows(person)}
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

function matchesJudgeTenureFilter(person) {
  if (!isJudgeRecord(person)) return true;
  const tenure = getTenure(person.retirement_date);
  return tenure.daysLeft !== null && tenure.daysLeft >= 0 && tenure.daysLeft <= judgeTenureRangeDays();
}

function renderJudgeTenureFilterBar(judges) {
  if (!judges.length) return '';
  const value = Math.min(84, Math.max(1, Number(state.judgeTenureRange) || 1));
  const count = judges.filter(matchesJudgeTenureFilter).length;
  return `
    <div class="judge-filter-bar" aria-label="Filter judges by time left">
      <div class="judge-range-summary">
        <span>Retiring within</span>
        <strong id="judge-range-label">${escHtml(judgeTenureRangeLabel())}</strong>
        <span id="judge-range-count">${count} match${count === 1 ? '' : 'es'}</span>
      </div>
      <input class="judge-range-slider" id="judge-range-slider" type="range" min="1" max="84" step="1" value="${value}">
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
    if (labelEl) labelEl.textContent = `${v} month${v === 1 ? '' : 's'}`;
    // Live count update from current court's judges
    if (countEl) {
      const judges = state.selectedId && state.selectedId !== 'ADMIN'
        ? state.courts.filter(d => d.parent_id === state.selectedId && isJudgeRecord(d))
        : state.courts.filter(isJudgeRecord);
      const n = judges.filter(matchesJudgeTenureFilter).length;
      countEl.textContent = `${n} match${n === 1 ? '' : 'es'}`;
    }
  });

  slider.addEventListener('change', function () {
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
    const results = rawResults.filter(d => !isJudgeRecord(d) || matchesJudgeTenureFilter(d));
    container.innerHTML = `
      <div class="view-header">
        <h2>Search: <em>"${escHtml(state.searchQuery)}"</em></h2>
        <div class="view-meta">${results.length} result${results.length !== 1 ? 's' : ''}</div>
      </div>
      ${renderJudgeTenureFilterBar(resultJudges)}
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

function renderCourtView(root, all, children) {
  const allJudges = children.filter(isJudgeRecord);
  const people = allJudges.filter(matchesJudgeTenureFilter);
  const adminStaff = state.adminStaff
    .filter(p => p.court_id === root.id)
    .sort((a, b) => adminSort(a, b));
  const head   = people.find(p =>
    p.role === 'Chief Justice of India' ||
    p.role === 'Chief Justice' ||
    p.role === 'Acting Chief Justice'
  );
  const rest = people.filter(p => p !== head).sort((a, b) => {
    // Sort by date_assumed_role ascending (seniority order)
    if (a.date_assumed_role && b.date_assumed_role) {
      const d = new Date(a.date_assumed_role) - new Date(b.date_assumed_role);
      if (d !== 0) return d;
    }
    // Fallback: by retirement date ascending (older judge = more senior)
    if (a.retirement_date && b.retirement_date)
      return new Date(a.retirement_date) - new Date(b.retirement_date);
    return 0;
  });

  let html = '';

  html += renderJudgeTenureFilterBar(allJudges);

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

  if (adminStaff.length > 0) {
    html += `<div class="section-label">Court Administration <span class="section-count">${adminStaff.length}</span></div>`;
    html += `<div class="admin-toolbar">${renderAdminRoleButtons(adminStaff, root.id)}</div>`;
    html += `<div class="cards-grid">${adminStaff.map(renderAdminCard).join('')}</div>`;
  }

  if (people.length === 0) {
    if (allJudges.length > 0) {
      html += `<div class="empty-state"><p>No judges match "${escHtml(judgeTenureRangeLabel())}" for this court.</p></div>`;
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

  // Direct officials (Minister)
  const directPeople = children.filter(c => c.type !== 'institution');
  if (directPeople.length > 0) {
    html += `<div class="section-label">Political Leadership</div>`;
    html += directPeople.map(p => renderCard(p, true)).join('');
  }

  // Departments
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
  const roles = uniqueAdminRoles(state.adminStaff);

  return `
    <div class="view-header">
      <h2>Court Administration</h2>
      <p class="view-subtitle">Administrative roles are tracked separately from judges, but each court view also shows that court's registry, CPC, IT and administrative officers.</p>
    </div>
    <div class="stats-bar">
      <span class="stat-chip">${staff.length} records shown</span>
    </div>
    <div class="role-filter-bar">
      <button class="role-filter ${state.adminRoleFilter === 'ALL' ? 'active' : ''}" onclick="setAdminRoleFilter('ALL')">All roles</button>
      ${roles.map(role => `<button class="role-filter ${state.adminRoleFilter === role ? 'active' : ''}" onclick="setAdminRoleFilter('${escAttr(role)}')">${escHtml(role)}</button>`).join('')}
    </div>
    <div class="cards-grid">${staff.map(renderAdminCard).join('')}</div>
  `;
}

function filteredAdminStaff() {
  return state.adminStaff
    .filter(row => state.adminRoleFilter === 'ALL' || row.role_group === state.adminRoleFilter)
    .sort(adminSort);
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

function renderAdminRoleButtons(rows, courtId) {
  const roles = uniqueAdminRoles(rows);
  return roles.map(role =>
    `<button class="role-filter" onclick="selectView('ADMIN'); setAdminRoleFilter('${escAttr(role)}'); return false;">${escHtml(role)}</button>`
  ).join('');
}

function renderAdminCard(cpc) {
  return `
    <div class="person-card cpc-card border-unknown">
      <div class="card-top">
        <div class="card-identity">
          ${renderAvatar(cpc)}
          <div class="card-left">
            <span class="card-role-badge cpc">${escHtml(cpc.role_group || cpc.role || 'Admin')}</span>
            <div class="person-name">${escHtml(cpc.name)}</div>
            <div class="parent-court">${escHtml(cpc.court)} · ${escHtml(cpc.state)}</div>
          </div>
        </div>
        <div class="court-chip">${escHtml(cpc.court)}</div>
      </div>
      <div class="card-meta">
        ${cpc.designation ? `<div class="meta-row"><span class="meta-icon">▣</span><span>${escHtml(cpc.designation)}</span></div>` : ''}
        ${renderContactRows(cpc)}
        ${cpc.date_assumed_role ? `<div class="meta-row"><span class="meta-icon">📅</span><span>In role since ${formatDate(cpc.date_assumed_role)}</span></div>` : ''}
        ${cpc.retirement_date ? `<div class="meta-row"><span class="meta-icon">🔚</span><span>Retires ${formatDate(cpc.retirement_date)}</span></div>` : ''}
        ${cpc.photo_source ? `<div class="meta-row"><span class="meta-icon">▧</span><span>Photo: ${escHtml(cpc.photo_source)}</span></div>` : ''}
        ${cpc.source_url ? `<div class="meta-row"><span class="meta-icon">↗</span><span><a class="inline-link" href="${escHtml(cpc.source_url)}" target="_blank" rel="noopener">${escHtml(cpc.source_label || 'Official source')}</a></span></div>` : ''}
        ${cpc.notes ? `<div class="meta-row notes-row"><span class="meta-icon">ℹ</span><span>${escHtml(cpc.notes)}</span></div>` : ''}
      </div>
    </div>`;
}

window.setAdminRoleFilter = function(role) {
  state.adminRoleFilter = role;
  if (state.selectedId !== 'ADMIN') state.selectedId = 'ADMIN';
  renderNav();
  renderContent();
};

window.setJudgeTenureRange = function(value) {
  state.judgeTenureRange = Math.min(84, Math.max(1, Number(value) || 1));
  renderContent();
};

// ─────────────────────────────────────────────────────────────────────────────
// Global interactions
// ─────────────────────────────────────────────────────────────────────────────
window.selectView = function(id) {
  state.selectedId  = id;
  state.searchQuery = '';
  if (id !== 'ADMIN') state.adminRoleFilter = 'ALL';
  document.getElementById('search-input').value = '';
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
    renderContent();
  });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { searchInput.value = ''; state.searchQuery = ''; renderContent(); }
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
    renderNav();
    renderContent();
    renderUpcomingPanel();
  }
}

document.addEventListener('DOMContentLoaded', init);
