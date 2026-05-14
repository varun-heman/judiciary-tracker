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
  judgeDetails: [],
  adminRoleFilter: 'ALL',
  judgeRoleFilter: 'ALL',
  judgeTenureRange: 12,
  judgeTenureShowAll: true,
  selectedId: 'HOME',
  selectedJudgeId: '',
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
    const [courts, ministries, adminStaff, judgeDetails] = await Promise.all([
      fetch('data/courts.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch('data/ministries.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch('data/admin-staff.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch('data/judge-details.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    ]);
    state.courts = courts;
    state.ministries = ministries;
    state.adminStaff = adminStaff;
    state.judgeDetails = judgeDetails;
    return true;
  } catch (e) {
    // 2. Fall back to embedded data from data/data.js (works with file:// open)
    if (Array.isArray(window.COURTS_DATA) && Array.isArray(window.MINISTRIES_DATA)) {
      state.courts = window.COURTS_DATA;
      state.ministries = window.MINISTRIES_DATA;
      state.adminStaff = Array.isArray(window.ADMIN_STAFF_DATA) ? window.ADMIN_STAFF_DATA : [];
      state.judgeDetails = Array.isArray(window.JUDGE_DETAILS_DATA) ? window.JUDGE_DETAILS_DATA : [];
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
  if (id === 'HOME' || id === 'ADMIN' || id === 'RETIRED') return true;
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
  state.selectedJudgeId = '';

  const view = params.get('view') || params.get('court') || params.get('ministry');
  if (view && validViewId(view)) state.selectedId = view;
  const judge = params.get('judge');
  if (judge && state.courts.some(d => d.id === judge && isJudgeRecord(d))) {
    state.selectedJudgeId = judge;
    const judgeRow = state.courts.find(d => d.id === judge);
    if (judgeRow && isArchivedRetiredJudge(judgeRow)) state.selectedId = 'RETIRED';
    else if (judgeRow && judgeRow.parent_id) state.selectedId = judgeRow.parent_id;
  }

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
  if (state.selectedJudgeId) params.set('judge', state.selectedJudgeId);
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
        <a class="nav-item" href="about.html">
          <span class="nav-icon">ⓘ</span>
          <span class="nav-label">About</span>
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
        <a class="nav-item ${state.selectedId === 'RETIRED' ? 'active' : ''}"
           href="#" onclick="selectView('RETIRED'); return false;">
          <span class="nav-icon">◌</span>
          <span class="nav-label">Retired Judges</span>
          <span class="nav-badge">${retiredJudges().length}</span>
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
  const isJudge = isJudgeRecord(person);
  const isRetired = isJudge && isRetiredJudge(person);
  const detail = isJudge ? getJudgeDetail(person.id) : null;
  const assetLabel = isJudge ? assetValueLabel(detail && detail.assets) : '';
  const assetRank = isJudge ? assetRankLabel(person.id) : '';
  const assetMissing = isJudge && !hasAssetDeclaration(detail && detail.assets);
  const cardAttrs = isJudge
    ? `role="button" tabindex="0" onclick="if(!event.target.closest('a,button,input,select')) selectJudge('${escAttr(person.id)}')" onkeydown="if((event.key === 'Enter' || event.key === ' ') && !event.target.closest('a,button,input,select')) { event.preventDefault(); selectJudge('${escAttr(person.id)}'); }"`
    : '';

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
    <div class="person-card ${isHead ? 'head-card' : ''} ${isJudge ? 'clickable-card' : ''} ${isRetired ? 'retired-card' : ''} border-${tenure.status}" ${cardAttrs}>
      <div class="card-top">
        <div class="card-identity">
          ${renderAvatar(person)}
          <div class="card-left">
            <span class="card-role-badge ${person.type || ''}">${roleLabel}</span>
            ${isRetired ? `<span class="retired-badge">Retired</span>` : ''}
            <div class="person-name">${person.name}</div>
            ${person.parent_high_court ? `<div class="parent-court">From: ${person.parent_high_court} HC</div>` : ''}
          </div>
        </div>
        ${retireStr ? `<div class="tenure-chip ${tenure.status}">${tenure.label}</div>` : ''}
      </div>
      ${assetLabel ? `<div class="asset-chip ${assetMissing ? 'missing' : ''}">${escHtml(assetLabel)}</div>` : ''}
      ${assetRank ? `<div class="asset-rank-chip">${escHtml(assetRank)}</div>` : ''}
      ${progressBar}
      <div class="card-meta">
        ${person.date_of_birth ? `<div class="meta-row"><span class="meta-icon">👤</span><span>${getAge(person.date_of_birth)} yrs · born ${formatDate(person.date_of_birth)}</span></div>` : ''}
        ${assumedStr  ? `<div class="meta-row"><span class="meta-icon">📅</span><span>In role since ${formatDate(assumedStr)}</span></div>` : ''}
        ${initialStr  ? `<div class="meta-row"><span class="meta-icon">🔰</span><span>Initially elevated ${formatDate(initialStr)}</span></div>` : ''}
        ${retireStr   ? `<div class="meta-row"><span class="meta-icon">🔚</span><span>${isRetired ? 'Retired' : 'Retires'} ${formatDate(retireStr)}</span></div>` : ''}
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

function getJudgeDetail(id) {
  return state.judgeDetails.find(d => d.id === id) || null;
}

function hasAssetDeclaration(assets) {
  return !!(assets && assets.source_url);
}

function assetNumber(assets) {
  if (!assets) return null;
  const value = assets.total_value ?? assets.disclosed_monetary_total ?? assets.value;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function formatRupees(value) {
  if (!Number.isFinite(Number(value))) return 'Not valued';
  const n = Number(value);
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(n >= 100000000 ? 1 : 2).replace(/\.0$/, '')} cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2).replace(/\.0$/, '')} lakh`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function assetValueLabel(assets) {
  if (!hasAssetDeclaration(assets)) return 'Assets Declaration Not Found';
  const metrics = assets.metrics || {};
  const parts = [];
  const value = assetNumber(assets) || Number(metrics.monetary_total);
  if (value) parts.push(`💰 ${formatRupees(value)}+`);
  if (Number(metrics.gold_grams) >= 1000) parts.push(`🏅 ${formatWeight(metrics.gold_grams)} gold`);
  if (Number(metrics.vehicles_count) > 0) parts.push(`🚗 ${plural(Number(metrics.vehicles_count), 'vehicle')}`);
  if (Number(metrics.real_estate_count) > 0) parts.push(`🏠 ${plural(Number(metrics.real_estate_count), 'property', 'properties')}`);
  if (Number(metrics.land_acres) > 0) parts.push(`🌾 ${Number(metrics.land_acres).toLocaleString('en-IN')} acres`);
  if (parts.length) return parts.slice(0, 4).join(' · ');
  if (assets.source_url) return '📄 Asset Declaration Found';
  return '';
}

function assetRankLabel(judgeId) {
  const rank = judgeAssetRank(judgeId);
  if (!rank) return '';
  const courtBit = rank.courtTotal > 1 ? `Court #${rank.courtRank} of ${rank.courtTotal}` : 'Only declared in court';
  return `Declared wealth: ${courtBit} · All India #${rank.globalRank} of ${rank.globalTotal}`;
}

function renderAssetRankSummary(judgeId) {
  const rank = judgeAssetRank(judgeId);
  if (!rank) return '';
  return `
    <div class="asset-rank-summary">
      <div><span>Same court</span><strong>#${rank.courtRank}</strong><em>of ${rank.courtTotal} judges with declarations</em></div>
      <div><span>All tracked courts</span><strong>#${rank.globalRank}</strong><em>of ${rank.globalTotal} judges with declarations</em></div>
    </div>`;
}

function judgeAssetRank(judgeId) {
  const judge = state.courts.find(d => d.id === judgeId && isJudgeRecord(d));
  const detail = getJudgeDetail(judgeId);
  const value = assetNumber(detail && detail.assets);
  if (!judge || value === null || value <= 0 || !hasAssetDeclaration(detail && detail.assets)) return null;
  const declared = state.courts
    .filter(isJudgeRecord)
    .map(j => ({
      id: j.id,
      parentId: j.parent_id,
      value: assetNumber((getJudgeDetail(j.id) || {}).assets)
    }))
    .filter(row => row.value !== null && row.value > 0);
  const globalRank = 1 + declared.filter(row => row.value > value).length;
  const courtDeclared = declared.filter(row => row.parentId === judge.parent_id);
  const courtRank = 1 + courtDeclared.filter(row => row.value > value).length;
  return {
    globalRank,
    globalTotal: declared.length,
    courtRank,
    courtTotal: courtDeclared.length
  };
}

function assetList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<div class="asset-empty">No sourced entries added yet.</div>';
  }
  const visibleItems = items.filter(hasAssetGroupContent);
  if (!visibleItems.length) {
    return '<div class="asset-empty">No sourced entries added yet.</div>';
  }
  return visibleItems.map(item => `
    <div class="asset-group ${escAttr(item.category || '')}">
      <div class="asset-group-head">
        <div>
          <strong>${item.emoji ? `<span class="asset-emoji">${escHtml(item.emoji)}</span>` : ''}${escHtml(item.label || item.type || 'Asset')}</strong>
          ${item.owner ? `<span>${escHtml(item.owner)}</span>` : ''}
        </div>
        <em>${assetGroupMeta(item)}</em>
      </div>
      ${item.description ? `<p class="asset-group-desc">${escHtml(item.description)}</p>` : ''}
      ${Array.isArray(item.items) && item.items.length
        ? assetTable(item)
        : '<div class="asset-empty">No separated entries found in the declaration.</div>'}
    </div>`).join('');
}

function assetTable(item) {
  const rows = (item.items || []).map(raw => assetTableRow(item.category, raw)).filter(Boolean);
  if (!rows.length) return '<div class="asset-empty">No separated entries found in the declaration.</div>';
  if (item.category === 'money') return moneyAssetTable(rows, item);
  if (item.category === 'property' || item.category === 'land') return propertyAssetTable(rows, item);
  if (item.category === 'jewellery') return jewelleryAssetTable(rows, item);
  if (item.category === 'vehicles') return vehicleAssetTable(rows, item);
  return notesAssetTable(rows, item);
}

function splitOwnerNote(raw) {
  const match = String(raw || '').match(/^([^:]{2,40}):\s*(.+)$/);
  return match
    ? { owner: match[1].trim(), note: match[2].trim() }
    : { owner: '', note: String(raw || '').trim() };
}

function assetTableRow(category, raw) {
  const { owner, note } = splitOwnerNote(raw);
  if (!note) return null;
  if (category === 'money') {
    return { owner, type: moneyHoldingType(note), amount: parseMoneyAmount(note), note };
  }
  if (category === 'property' || category === 'land') {
    return {
      owner,
      type: landHoldingType(note),
      share: propertyShare(note),
      areaSqFt: parseBuiltAreaSqFt(note),
      acres: parseAcres(note),
      note
    };
  }
  if (category === 'jewellery') {
    return {
      owner,
      type: /silver/i.test(note) ? 'Silver' : (/watch/i.test(note) ? 'Watch / valuables' : 'Gold'),
      grams: /silver/i.test(note) ? parseMetalGrams(note, 'silver') : parseMetalGrams(note, 'gold'),
      note
    };
  }
  if (category === 'vehicles') {
    return { owner, type: vehicleType(note), note };
  }
  return { owner, type: categoryLabel(category), note };
}

function moneyAssetTable(rows, item) {
  const total = assetNumber(item) || rows.reduce((sum, row) => sum + (row.amount || 0), 0);
  return `
    <div class="asset-table-wrap">
      <table class="asset-table">
        <thead><tr><th>Owner</th><th>Holding</th><th class="num">Amount</th><th>Note</th></tr></thead>
        <tbody>${rows.map(row => `
          <tr title="${escAttr(row.note)}">
            <td>${escHtml(row.owner || 'Declared')}</td>
            <td>${escHtml(row.type)}</td>
            <td class="num">${amountPill(row.amount ? formatRupees(row.amount) : '', '💰')}</td>
            <td class="note-cell"><span title="${escAttr(row.note)}">ⓘ</span></td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="2">Total disclosed monetary assets</td><td class="num">${amountPill(total ? formatRupees(total) : '', '💰', true)}</td><td></td></tr></tfoot>
      </table>
    </div>`;
}

function propertyAssetTable(rows, item) {
  if (item.category === 'property') return builtPropertyAssetTable(rows, item);
  return landAssetTable(rows, item);
}

function builtPropertyAssetTable(rows) {
  const totalArea = rows.reduce((sum, row) => sum + (row.areaSqFt || 0), 0);
  return `
    <div class="asset-table-wrap">
      <table class="asset-table">
        <thead><tr><th>Owner</th><th>Property</th><th>Share / size</th><th class="num">Area</th><th>Note</th></tr></thead>
        <tbody>${rows.map(row => `
          <tr title="${escAttr(row.note)}">
            <td>${escHtml(row.owner || 'Declared')}</td>
            <td>${escHtml(row.type)}</td>
            <td>${escHtml(row.share || 'Not stated')}</td>
            <td class="num">${amountPill(row.areaSqFt ? formatSqFt(row.areaSqFt) : '', '🏠')}</td>
            <td class="note-cell"><span title="${escAttr(row.note)}">ⓘ</span></td>
          </tr>`).join('')}</tbody>
        <tfoot>
          <tr><td colspan="3">Total disclosed properties</td><td class="num">${amountPill(String(rows.length), '🏠', true)}</td><td></td></tr>
          <tr><td colspan="3">Total disclosed residential/commercial area</td><td class="num">${amountPill(totalArea ? formatSqFt(totalArea) : '', '📐', true)}</td><td></td></tr>
        </tfoot>
      </table>
    </div>`;
}

function landAssetTable(rows, item) {
  const totalAcres = Number(item.acres) || rows.reduce((sum, row) => sum + (row.acres || 0), 0);
  return `
    <div class="asset-table-wrap">
      <table class="asset-table">
        <thead><tr><th>Owner</th><th>Type</th><th>Share / size</th><th class="num">Acres</th><th>Note</th></tr></thead>
        <tbody>${rows.map(row => `
          <tr title="${escAttr(row.note)}">
            <td>${escHtml(row.owner || 'Declared')}</td>
            <td>${escHtml(row.type)}</td>
            <td>${escHtml(row.share || 'Not stated')}</td>
            <td class="num">${amountPill(row.acres ? `${row.acres.toLocaleString('en-IN')} acres` : '', '🌾')}</td>
            <td class="note-cell"><span title="${escAttr(row.note)}">ⓘ</span></td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total disclosed acreage</td><td class="num">${amountPill(totalAcres ? `${totalAcres.toLocaleString('en-IN')} acres` : '', '🌾', true)}</td><td></td></tr></tfoot>
      </table>
    </div>`;
}

function jewelleryAssetTable(rows, item) {
  const gold = Number(item.gold_grams) || rows.filter(r => r.type === 'Gold').reduce((sum, row) => sum + (row.grams || 0), 0);
  return `
    <div class="asset-table-wrap">
      <table class="asset-table">
        <thead><tr><th>Owner</th><th>Asset</th><th class="num">Amount</th><th>Note</th></tr></thead>
        <tbody>${rows.map(row => `
          <tr title="${escAttr(row.note)}">
            <td>${escHtml(row.owner || 'Declared')}</td>
            <td>${escHtml(row.type)}</td>
            <td class="num">${amountPill(row.grams ? formatWeight(row.grams) : '', row.type === 'Silver' ? '🥈' : '🏅')}</td>
            <td class="note-cell"><span title="${escAttr(row.note)}">ⓘ</span></td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="2">Total gold</td><td class="num">${amountPill(gold ? formatWeight(gold) : '', '🏅', true)}</td><td></td></tr></tfoot>
      </table>
    </div>`;
}

function vehicleAssetTable(rows, item) {
  return `
    <div class="asset-table-wrap">
      <table class="asset-table">
        <thead><tr><th>Owner</th><th>Vehicle</th><th>Note</th></tr></thead>
        <tbody>${rows.map(row => `
          <tr title="${escAttr(row.note)}">
            <td>${escHtml(row.owner || 'Declared')}</td>
            <td>${escHtml(row.type)}</td>
            <td class="note-cell"><span title="${escAttr(row.note)}">ⓘ</span></td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><td>Total vehicles</td><td>${amountPill(String(Number(item.count) || rows.length), '🚗', true)}</td><td></td></tr></tfoot>
      </table>
    </div>`;
}

function notesAssetTable(rows) {
  return `
    <div class="asset-table-wrap">
      <table class="asset-table">
        <thead><tr><th>Owner</th><th>Type</th><th>Note</th></tr></thead>
        <tbody>${rows.map(row => `
          <tr title="${escAttr(row.note)}">
            <td>${escHtml(row.owner || 'Declared')}</td>
            <td>${escHtml(row.type)}</td>
            <td class="note-cell"><span title="${escAttr(row.note)}">ⓘ</span></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function moneyHoldingType(text) {
  if (/fdr|fixed deposit/i.test(text)) return 'Fixed deposit';
  if (/mutual fund/i.test(text)) return 'Mutual fund';
  if (/shares?/i.test(text)) return 'Shares';
  if (/bank|saving/i.test(text)) return 'Bank balance';
  if (/gpf/i.test(text)) return 'GPF';
  if (/ppf/i.test(text)) return 'PPF';
  if (/lic|insurance/i.test(text)) return 'Insurance';
  if (/bond|debenture|rbi/i.test(text)) return 'Bond / debenture';
  return 'Other monetary holding';
}

function amountPill(value, emoji = '', strong = false) {
  if (!value) return '<span class="asset-muted-value">Not stated</span>';
  return `<span class="amount-pill${strong ? ' strong' : ''}">${emoji ? `<span>${escHtml(emoji)}</span>` : ''}${escHtml(value)}</span>`;
}

function landHoldingType(text) {
  if (/commercial|office|shop/i.test(text)) return 'Commercial property';
  if (/agricultural|acre|bigha/i.test(text)) return 'Agricultural land';
  if (/plot/i.test(text)) return 'Plot';
  if (/flat|apartment/i.test(text)) return 'Flat / apartment';
  if (/house|bungalow|residential/i.test(text)) return 'House / residential';
  if (/land/i.test(text)) return 'Land';
  return 'Property';
}

function vehicleType(text) {
  return text.replace(/^Vehicle\s*:\s*/i, '').trim();
}

function categoryLabel(category) {
  return String(category || 'Entry').replace(/_/g, ' ');
}

function propertyShare(text) {
  const share = text.match(/\b\d+\/\d+(?:st|nd|rd|th)?\s+share\b|\b\d+\/\d+(?:st|nd|rd|th)?\b/i);
  const size = text.match(/\b[0-9][0-9,.]*(?:\s*&\s*half|½)?\s*(?:sq\.?\s*(?:yards?|yds?|feet|ft|meters?|mtrs?)|sqft|sq\.?ft|acres?|bighas?|kanal)\b/i);
  return [share && share[0], size && size[0]].filter(Boolean).join(' · ');
}

function parseMoneyAmount(text) {
  const marked = text.match(/(?:Rs\.?|₹)\s*([0-9][0-9,]*(?:\.[0-9]+)?)(?:\s*(cr\.?|crores?|lakhs?|lacs?))?/i);
  if (marked) return normalizeMoney(marked[1], marked[2]);
  const bare = text.match(/[–:-]\s*([0-9]{1,2}(?:,[0-9]{2}){1,4}(?:,[0-9]{3})?)\b/);
  return bare ? Number(bare[1].replace(/,/g, '')) : null;
}

function normalizeMoney(raw, unit = '') {
  let amount = Number(String(raw).replace(/,/g, ''));
  const u = String(unit || '').toLowerCase();
  if (u.startsWith('cr') || u.startsWith('crore')) amount *= 10000000;
  if (u.startsWith('lakh') || u.startsWith('lac')) amount *= 100000;
  return Number.isFinite(amount) ? amount : null;
}

function parseAcres(text) {
  const half = text.match(/([0-9][0-9,.]*)\s*&\s*half\s+acres?/i);
  if (half) return Number(half[1].replace(/,/g, '')) + 0.5;
  const decimalHalf = text.match(/([0-9][0-9,.]*)½\s*acres?/i);
  if (decimalHalf) return Number(decimalHalf[1].replace(/,/g, '')) + 0.5;
  const match = text.match(/([0-9][0-9,.]*)\s*acres?/i);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function parseBuiltAreaSqFt(text) {
  const patterns = [
    { re: /([0-9][0-9,.]*)\s*sq\.?\s*(?:yards?|yds?)/i, factor: 9 },
    { re: /([0-9][0-9,.]*)\s*(?:sq\.?\s*ft|sqft|sq\.?\s*feet)/i, factor: 1 },
    { re: /([0-9][0-9,.]*)\s*sq\.?\s*(?:meters?|mtrs?)/i, factor: 10.7639 },
    { re: /([0-9][0-9,.]*)\s*kanal/i, factor: 5445 },
  ];
  for (const { re, factor } of patterns) {
    const match = text.match(re);
    if (match) return Math.round(Number(match[1].replace(/,/g, '')) * factor);
  }
  return null;
}

function formatSqFt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${Math.round(n).toLocaleString('en-IN')} sq ft`;
}

function parseMetalGrams(text, metal) {
  const patterns = [
    new RegExp(`${metal}[^\\n]{0,60}?([0-9][0-9,.]*)\\s*(kgs?|kilograms?|gms?|grams?)`, 'i'),
    new RegExp(`([0-9][0-9,.]*)\\s*(kgs?|kilograms?|gms?|grams?)\\.?\\s+(?:of\\s+)?${metal}`, 'i')
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let value = Number(match[1].replace(/,/g, ''));
      if (/^kg|kilogram/i.test(match[2])) value *= 1000;
      return Number.isFinite(value) ? Math.round(value) : null;
    }
  }
  return null;
}

function hasAssetGroupContent(item) {
  if (!item) return false;
  if (Array.isArray(item.items) && item.items.length) return true;
  if (Number(assetNumber(item)) > 0) return true;
  return Number(item.gold_grams) > 0
    || Number(item.silver_grams) > 0
    || Number(item.count) > 0
    || Number(item.acres) > 0;
}

function assetGroupMeta(item) {
  const value = assetNumber(item);
  const bits = [];
  if (value !== null && value > 0) bits.push(formatRupees(value));
  if (Number(item.gold_grams) > 0) bits.push(`${formatWeight(item.gold_grams)} gold`);
  if (Number(item.silver_grams) > 0) bits.push(`${formatWeight(item.silver_grams)} silver`);
  if (Number(item.count) > 0) bits.push(plural(Number(item.count), 'vehicle'));
  if (Number(item.acres) > 0) bits.push(`${Number(item.acres).toLocaleString('en-IN')} acres`);
  return bits.length ? escHtml(bits.join(' · ')) : 'Not valued';
}

function formatWeight(grams) {
  const n = Number(grams);
  if (!Number.isFinite(n)) return '';
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 ? 2 : 0)}kg`;
  return `${Math.round(n)}g`;
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
  const active = judges.filter(j => !isRetiredJudge(j) && !isArchivedRetiredJudge(j)).filter(j => {
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

function daysSinceRetirement(person) {
  if (!isJudgeRecord(person) || !person.retirement_date) return null;
  const tenure = getTenure(person.retirement_date);
  return tenure.daysLeft !== null && tenure.daysLeft < 0 ? Math.abs(tenure.daysLeft) : null;
}

function isRetiredJudge(person) {
  return daysSinceRetirement(person) !== null;
}

function isRecentRetiredJudge(person) {
  const days = daysSinceRetirement(person);
  return days !== null && days <= 60;
}

function isArchivedRetiredJudge(person) {
  const days = daysSinceRetirement(person);
  return days !== null && days > 60;
}

function visibleCourtJudge(person) {
  return isJudgeRecord(person) && !isArchivedRetiredJudge(person);
}

function retiredJudges() {
  return state.courts
    .filter(isRetiredJudge)
    .sort((a, b) => new Date(b.retirement_date) - new Date(a.retirement_date));
}

function retiredCutoffLabel(rows = retiredJudges()) {
  const dates = rows.map(j => j.retirement_date).filter(Boolean).sort();
  return dates.length ? formatDate(dates[0]) : 'No retired judges are currently in the tracker';
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
  if (isRecentRetiredJudge(person)) return state.judgeTenureShowAll;
  if (isArchivedRetiredJudge(person)) return false;
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
      !(isJudgeRecord(d) && isArchivedRetiredJudge(d)) &&
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

  if (state.selectedJudgeId) {
    container.innerHTML = renderJudgeDetailView(state.selectedJudgeId);
    return;
  }

  if (state.selectedId === 'ADMIN') {
    container.innerHTML = renderAdminStaffView();
    attachSliderListeners();
    return;
  }

  if (state.selectedId === 'RETIRED') {
    container.innerHTML = renderRetiredJudgesView();
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
  const judges = state.courts.filter(visibleCourtJudge);
  const buckets = judgeStatusBuckets(judges);
  const courtsWithJudges = courtInstitutions.filter(c => judges.some(j => j.parent_id === c.id));
  const courtsWithAdmin = courtInstitutions.filter(c => state.adminStaff.some(a => a.court_id === c.id));
  const judgesWithRetirementDates = buckets.active.filter(j => getTenure(j.retirement_date).daysLeft !== null).length;
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
    count: buckets.active.filter(j => role === 'Chief Justice'
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
          <a class="dashboard-about-link" href="about.html">About this tracker</a>
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
          <span>Across ${plural(courtsWithJudges.length, 'court')} with judge rosters</span>
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
          ${dashboardBar('Judges with retirement dates', judgesWithRetirementDates, buckets.active.length)}
          ${dashboardBar('Court admin role categories', adminRoles.length, Math.max(adminRoles.length, 12), 'neutral')}
        </article>

        <article class="dashboard-panel">
          <div class="panel-heading">
            <h3>Judge Mix</h3>
            <p>Current tracked records by role label.</p>
          </div>
          ${roleCounts.map(r => dashboardBar(r.role, r.count, buckets.active.length)).join('')}
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

function renderJudgeDetailView(id) {
  const judge = state.courts.find(d => d.id === id && isJudgeRecord(d));
  if (!judge) return `<div class="empty-state"><p>Judge profile not found.</p></div>`;
  const detail = getJudgeDetail(id) || {};
  const assets = detail.assets || {};
  const hasAssets = hasAssetDeclaration(assets);
  const total = assetNumber(assets);
  const bio = detail.bio || judge.notes || 'No sourced biography has been added for this judge yet.';
  const sourceUrl = detail.bio_source_url || judge.source_url || '';
  const sourceLabel = detail.bio_source_label || judge.source_label || 'Official profile';
  const assetSourceUrl = assets.source_url || '';
  const assetSourceLabel = assets.source_label || 'Official asset declaration';
  const totalLabel = hasAssets
    ? (total !== null && total > 0 ? `${formatRupees(total)}+` : 'Not fully valued')
    : 'Assets Declaration Not Found';
  const valueType = hasAssets
    ? (assets.total_value_type || (total ? 'Disclosed monetary amounts only' : 'No monetary total available'))
    : 'No official/public asset declaration has been added for this judge yet.';
  const backView = isArchivedRetiredJudge(judge) ? 'RETIRED' : judge.parent_id;
  const backLabel = isArchivedRetiredJudge(judge) ? 'Retired Judges' : (judge.court || 'court');

  return `
    <div class="judge-detail-view">
      <button class="back-button" onclick="selectView('${escAttr(backView)}')">← Back to ${escHtml(backLabel)}</button>
      <section class="judge-profile-hero">
        ${renderAvatar(judge)}
        <div class="judge-profile-main">
          <span class="card-role-badge ${judge.type || ''}">${escHtml(judge.role || 'Judge')}</span>
          ${isRetiredJudge(judge) ? `<span class="retired-badge">Retired</span>` : ''}
          <h2>${escHtml(judge.name)}</h2>
          <p>${escHtml(judge.court || '')}${judge.state ? ` · ${escHtml(judge.state)}` : ''}</p>
          <div class="judge-profile-facts">
            ${judge.date_of_birth ? `<span>${getAge(judge.date_of_birth)} yrs</span>` : ''}
            ${judge.date_assumed_role ? `<span>In role since ${formatDate(judge.date_assumed_role)}</span>` : ''}
            ${judge.retirement_date ? `<span>${isRetiredJudge(judge) ? 'Retired' : 'Retires'} ${formatDate(judge.retirement_date)}</span>` : ''}
          </div>
        </div>
        <div class="asset-total-card">
          <span>Disclosed Assets</span>
          <strong>${escHtml(totalLabel)}</strong>
          <em>${escHtml(valueType)}</em>
          ${renderAssetRankSummary(judge.id)}
        </div>
      </section>

      <section class="detail-grid">
        <article class="detail-panel">
          <div class="panel-heading">
            <h3>Bio</h3>
            <p>AI-assisted summary from available public profile/source data.</p>
          </div>
          <p class="bio-text">${escHtml(bio)}</p>
          ${sourceUrl ? `<a class="inline-link" href="${escHtml(sourceUrl)}" target="_blank" rel="noopener">${escHtml(sourceLabel)}</a>` : ''}
        </article>

        <article class="detail-panel">
          <div class="panel-heading">
            <h3>Assets</h3>
            <p>Only official/public declarations are shown. Unvalued property is not estimated.</p>
          </div>
          ${assetSourceUrl ? `<a class="asset-source-link" href="${escHtml(assetSourceUrl)}" target="_blank" rel="noopener">${escHtml(assetSourceLabel)}</a>` : ''}
          ${assets.notes ? `<p class="asset-note">${escHtml(assets.notes)}</p>` : ''}
        </article>

        <article class="detail-panel">
          <div class="panel-heading"><h3>Movable Assets</h3><p>Investments, deposits, jewellery, vehicles and similar movable declarations.</p></div>
          ${assetList(assets.movable)}
        </article>

        <article class="detail-panel">
          <div class="panel-heading"><h3>Immovable Assets</h3><p>Land, houses, plots and other real-estate declarations.</p></div>
          ${assetList(assets.immovable)}
        </article>

        <article class="detail-panel wide">
          <div class="panel-heading"><h3>Liabilities / Family Entries</h3><p>Shown only where the public declaration includes liabilities, spouse, joint-family or dependent entries.</p></div>
          ${assetList(assets.family)}
        </article>
      </section>
    </div>`;
}

function renderRetiredJudgesView() {
  const retired = retiredJudges();
  const recent = retired.filter(isRecentRetiredJudge);
  const archived = retired.filter(isArchivedRetiredJudge);
  return `
    <div class="view-header">
      <h2>Retired Judges</h2>
      <p class="view-subtitle">This is not an exhaustive list of retired judges. It only includes judges previously tracked in this project. Retired-judge tracking currently starts from ${escHtml(retiredCutoffLabel(retired))}.</p>
    </div>
    <div class="stats-bar">
      <span class="stat-chip">${retired.length} retired in tracker</span>
      ${recent.length ? `<span class="stat-chip warning">${recent.length} still visible on court pages for 60d</span>` : ''}
      ${archived.length ? `<span class="stat-chip">${archived.length} archived from court pages</span>` : ''}
    </div>
    ${retired.length
      ? `<div class="cards-grid">${retired.map(j => renderCard(j)).join('')}</div>`
      : `<div class="empty-state"><p>No retired judges are currently in the tracker.</p></div>`}`;
}

function renderCourtView(root, all, children) {
  const allJudges = children.filter(visibleCourtJudge);
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
  state.selectedJudgeId = '';
  state.searchQuery = '';
  state.judgeRoleFilter = 'ALL';
  state.adminRoleFilter = 'ALL';
  state.judgeTenureShowAll = true;
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  writeRoute();
  renderNav();
  renderContent();
  closeSidebar();
  document.getElementById('main-panel').scrollTop = 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// Global interactions
// ─────────────────────────────────────────────────────────────────────────────
window.selectView = function(id) {
  state.selectedId      = id;
  state.selectedJudgeId = '';
  state.searchQuery     = '';
  state.judgeRoleFilter = 'ALL';
  state.adminRoleFilter = 'ALL';
  state.judgeTenureShowAll = true;   // always reset to show all on view change
  document.getElementById('search-input').value = '';
  writeRoute();
  renderNav();
  renderContent();
  closeSidebar();
  document.getElementById('main-panel').scrollTop = 0;
};

window.selectJudge = function(id) {
  const judge = state.courts.find(d => d.id === id && isJudgeRecord(d));
  if (!judge) return;
  state.selectedJudgeId = id;
  state.selectedId = isArchivedRetiredJudge(judge) ? 'RETIRED' : (judge.parent_id || state.selectedId);
  state.searchQuery = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  writeRoute();
  renderNav();
  renderContent();
  closeSidebar();
  document.getElementById('main-panel').scrollTop = 0;
};

function setSidebarOpen(open) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  sidebar.classList.toggle('open', open);
  if (backdrop) backdrop.classList.toggle('open', open);
}

function closeSidebar() {
  setSidebarOpen(false);
}

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
  const closeBtn = document.getElementById('sidebar-close');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      setSidebarOpen(!sidebar.classList.contains('open'));
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });

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
