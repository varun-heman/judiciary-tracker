const notificationState = {
  courts: [],
  notifications: [],
  sources: [],
  selectedCourt: 'ALL',
  query: ''
};

let applyingNotificationRoute = false;

const SIX_MONTHS_AGO = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - 6);
  return d;
})();

async function loadNotificationData() {
  try {
    const [courts, notifications, sources] = await Promise.all([
      fetch('data/courts.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch('data/notifications.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch('data/notification-sources.json').then(r => { if (!r.ok) throw new Error(); return r.json(); })
    ]);
    notificationState.courts = courts;
    notificationState.notifications = notifications;
    notificationState.sources = sources;
    return true;
  } catch (e) {
    if (Array.isArray(window.COURTS_DATA) && Array.isArray(window.NOTIFICATIONS_DATA)) {
      notificationState.courts = window.COURTS_DATA;
      notificationState.notifications = window.NOTIFICATIONS_DATA;
      notificationState.sources = Array.isArray(window.NOTIFICATION_SOURCES_DATA) ? window.NOTIFICATION_SOURCES_DATA : [];
      return true;
    }
    document.getElementById('notifications-content').innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h2>Cannot load notification data</h2>
        <p>Serve the folder locally or upload all JSON files to GitHub Pages.</p>
      </div>`;
    return false;
  }
}

function recentNotifications() {
  return notificationState.notifications
    .filter(n => new Date(n.date + 'T00:00:00') >= SIX_MONTHS_AGO)
    .filter(n => notificationState.selectedCourt === 'ALL' || n.court_id === notificationState.selectedCourt)
    .filter(notificationMatchesQuery)
    .sort((a, b) => new Date(b.date) - new Date(a.date) || a.court.localeCompare(b.court));
}

function notificationMatchesQuery(notification) {
  if (!notificationState.query) return true;
  const q = notificationState.query.toLowerCase();
  const fields = [
    notification.title,
    notification.court,
    notification.category,
    notification.date,
    notification.extraction_notes
  ];
  const transferFields = (notification.transfer_entries || []).flatMap(transferSearchFields);
  return [...fields, ...transferFields].some(value => (value || '').toLowerCase().includes(q));
}

function transferSearchFields(entry) {
  return [
    entry.person_name,
    entry.role_type,
    entry.from_position,
    entry.to_position,
    entry.assumed_role,
    entry.effective_date,
    entry.notes
  ];
}

function transferMatchesQuery(entry) {
  if (!notificationState.query) return true;
  const q = notificationState.query.toLowerCase();
  return transferSearchFields(entry).some(value => (value || '').toLowerCase().includes(q));
}

function courtList() {
  return notificationState.courts
    .filter(c => c.type === 'institution')
    .sort((a, b) => {
      if (a.id === 'SC') return -1;
      if (b.id === 'SC') return 1;
      return a.name.localeCompare(b.name);
    });
}

function validNotificationCourt(id) {
  return id === 'ALL' || courtList().some(c => c.id === id);
}

function readNotificationRoute() {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

function applyNotificationRoute() {
  const params = readNotificationRoute();
  notificationState.selectedCourt = 'ALL';
  notificationState.query = '';

  const court = params.get('court') || params.get('view');
  if (court && validNotificationCourt(court)) notificationState.selectedCourt = court;
  notificationState.query = (params.get('q') || '').trim();

  const search = document.getElementById('notification-search');
  if (search) search.value = notificationState.query;
}

function writeNotificationRoute({ replace = false } = {}) {
  if (applyingNotificationRoute) return;
  const params = new URLSearchParams();
  if (notificationState.selectedCourt !== 'ALL') params.set('court', notificationState.selectedCourt);
  if (notificationState.query) params.set('q', notificationState.query);

  const baseUrl = window.location.pathname + window.location.search;
  const nextUrl = params.toString() ? `${baseUrl}#${params.toString()}` : baseUrl;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (replace) {
    history.replaceState(null, '', nextUrl);
  } else if (currentUrl !== nextUrl) {
    history.pushState(null, '', nextUrl);
  }
}

function rerenderNotificationsFromRoute() {
  applyingNotificationRoute = true;
  applyNotificationRoute();
  renderNotificationNav();
  renderNotifications();
  applyingNotificationRoute = false;
}

// Persistent sidebar collapse state for notifications page
const notifSectionCollapsed = {};

function getNotifSectionCollapsed(key, itemCount) {
  if (key in notifSectionCollapsed) return notifSectionCollapsed[key];
  return itemCount > 4;
}

window.toggleNotifSection = function(key, itemCount) {
  notifSectionCollapsed[key] = !getNotifSectionCollapsed(key, itemCount);
  renderNotificationNav();
};

function renderNotificationNav() {
  const nav = document.getElementById('notification-nav');
  const courts = courtList();
  const notifications = notificationState.notifications.filter(n => new Date(n.date + 'T00:00:00') >= SIX_MONTHS_AGO);
  const countFor = id => notifications.filter(n => n.court_id === id).length;

  // Views section (always ≤4, stays expanded)
  const viewsKey = 'Views';
  const viewsCount = 2;
  const viewsCollapsed = getNotifSectionCollapsed(viewsKey, viewsCount);

  let html = `
    <div class="nav-section${viewsCollapsed ? ' collapsed' : ''}">
      <button class="nav-section-title collapsible" onclick="toggleNotifSection('${viewsKey}', ${viewsCount}); return false;">
        <span>Views</span>
        <span class="nav-collapse-icon">${viewsCollapsed ? '▸' : '▾'}</span>
      </button>
      <div class="nav-section-items">
        <a class="nav-item ${notificationState.selectedCourt === 'ALL' ? 'active' : ''}" href="#" onclick="selectNotificationCourt('ALL'); return false;">
          <span class="nav-dot good"></span>
          <span class="nav-label">All Courts</span>
          <span class="nav-badge">${notifications.length}</span>
        </a>
        <a class="nav-item" href="index.html">
          <span class="nav-icon">↩</span>
          <span class="nav-label">Main Tracker</span>
        </a>
      </div>
    </div>`;

  // Courts section (26 courts → collapsed by default)
  const courtsKey = 'Courts';
  const courtsCollapsed = getNotifSectionCollapsed(courtsKey, courts.length);
  let courtsItemsHtml = '';
  courts.forEach(court => {
    const count = countFor(court.id);
    courtsItemsHtml += `
      <a class="nav-item ${notificationState.selectedCourt === court.id ? 'active' : ''}" href="#" onclick="selectNotificationCourt('${court.id}'); return false;">
        <span class="nav-dot ${count ? 'good' : 'unknown'}"></span>
        <span class="nav-label">${escHtml(court.name.replace(' High Court', ' HC'))}</span>
        ${count ? `<span class="nav-badge">${count}</span>` : ''}
      </a>`;
  });

  html += `
    <div class="nav-section${courtsCollapsed ? ' collapsed' : ''}">
      <button class="nav-section-title collapsible" onclick="toggleNotifSection('${courtsKey}', ${courts.length}); return false;">
        <span>Courts</span>
        <span class="nav-count">${courts.length}</span>
        <span class="nav-collapse-icon">${courtsCollapsed ? '▸' : '▾'}</span>
      </button>
      <div class="nav-section-items">${courtsItemsHtml}</div>
    </div>`;

  nav.innerHTML = html;
}

function renderNotifications() {
  const container = document.getElementById('notifications-content');
  const rows = recentNotifications();
  const selectedName = notificationState.selectedCourt === 'ALL'
    ? 'All Courts'
    : (courtList().find(c => c.id === notificationState.selectedCourt)?.name || 'Court');

  const grouped = rows.reduce((acc, row) => {
    if (!acc[row.court]) acc[row.court] = [];
    acc[row.court].push(row);
    return acc;
  }, {});

  const sources = notificationState.sources
    .filter(s => notificationState.selectedCourt === 'ALL' || s.court_id === notificationState.selectedCourt)
    .sort((a, b) => a.court.localeCompare(b.court));

  container.innerHTML = `
    <div class="view-header">
      <h2>${escHtml(selectedName)} Judge/Staff Transfer Notifications</h2>
      <p class="view-subtitle">Default view shows indexed transfer/posting/staff-movement documents from ${formatDateIso(SIX_MONTHS_AGO)} through today. Notification rows link to individual PDFs; source cards link to the court index pages used to find them.</p>
    </div>
    <div class="stats-bar">
      <span class="stat-chip">${rows.length} PDF documents</span>
      <span class="stat-chip">${sources.length} source page${sources.length === 1 ? '' : 's'}</span>
    </div>
    ${rows.length ? Object.entries(grouped).map(([court, items]) => renderCourtGroup(court, items)).join('') : renderEmptySources(sources)}
    ${renderSourcePanel(sources)}
  `;
  renderTransferRail(rows);
}

function renderCourtGroup(court, items) {
  return `
    <div class="notification-group">
      <div class="section-label">${escHtml(court)} <span class="section-count">${items.length}</span></div>
      <div class="notification-list">
        ${items.map(renderNotificationRow).join('')}
      </div>
    </div>`;
}

function renderNotificationRow(item) {
  const isPdf = item.file_type === 'pdf' || /\.pdf($|\?)/i.test(item.url);
  const allEntries = Array.isArray(item.transfer_entries) ? item.transfer_entries : [];
  const entries = notificationState.query ? allEntries.filter(transferMatchesQuery) : allEntries;
  const openAction = `openNotificationPdf('${escAttr(item.id)}')`;
  return `
    <article class="notification-card">
      <div class="notification-row">
        <div class="notification-date">${formatDate(item.date)}</div>
        <div class="notification-main">
          <button class="notification-title notification-title-button" onclick="${openAction}">${escHtml(item.title)}</button>
          <div class="notification-meta">${escHtml(item.category || 'Notification')} · ${escHtml(item.court)} · Source index: ${sourceLink(item.source_page)}${item.original_url ? ` · <a class="inline-link" href="${escHtml(item.original_url)}" target="_blank" rel="noopener">original PDF</a>` : ''}</div>
        </div>
        <button class="notification-file ${isPdf ? 'pdf' : 'index'}" onclick="${openAction}">${isPdf ? 'PDF' : 'Index'}</button>
      </div>
      ${renderTransferDetails(item, entries)}
    </article>`;
}

function renderTransferRail(rows) {
  const rail = document.querySelector('#transfer-rail .transfer-rail-content');
  if (!rail) return;
  const entries = rows.flatMap(row =>
    (row.transfer_entries || [])
      .filter(transferMatchesQuery)
      .map(entry => ({ ...entry, court: row.court, court_id: row.court_id, notification_id: row.id, notification_title: row.title, date: row.date }))
  );
  rail.innerHTML = entries.length ? `
    <div class="transfer-rail-meta">${entries.length} parsed movement${entries.length === 1 ? '' : 's'}</div>
    <div class="transfer-rail-list">
      ${entries.map(entry => `
        <button class="rail-transfer" onclick="openNotificationPdf('${escAttr(entry.notification_id)}')">
          <span class="rail-court">${escHtml(entry.court)}</span>
          <strong>${escHtml(entry.person_name)}</strong>
          <span>${escHtml(entry.assumed_role || entry.to_position || 'Role not stated')}</span>
          <span class="rail-date">${entry.effective_date ? formatDate(entry.effective_date) : formatDate(entry.date)}</span>
        </button>
      `).join('')}
    </div>
  ` : `<div class="upcoming-empty">No parsed transfers for this filter.</div>`;
}

function renderTransferDetails(item, entries) {
  const total = (item.transfer_entries || []).length;
  if (!entries.length) {
    return `<div class="transfer-empty">No parsed transfer details available. AI parsed; not human verified. Check the PDF before relying on this data.</div>`;
  }
  const label = notificationState.query && entries.length !== total
    ? `${entries.length} matching transfer${entries.length === 1 ? '' : 's'} of ${total}`
    : `${entries.length} extracted transfer${entries.length === 1 ? '' : 's'}`;
  return `
    <details class="transfer-details">
      <summary>${label}</summary>
      <div class="transfer-note">AI parsed; not human verified. Check the linked PDF before relying on this data.</div>
      <div class="transfer-table">
        ${entries.map(entry => `
          <div class="transfer-entry">
            <div class="transfer-person">
              <strong>${escHtml(entry.person_name)}</strong>
              <span class="transfer-role">${escHtml(entry.role_type || 'Judicial Officer')}</span>
            </div>
            <div class="transfer-route">
              <div>
                <span class="transfer-label">From</span>
                <span>${escHtml(entry.from_position || 'Not stated')}</span>
              </div>
              <div>
                <span class="transfer-label">To</span>
                <span>${escHtml(entry.to_position || 'Not stated')}</span>
              </div>
              <div>
                <span class="transfer-label">Assuming</span>
                <span>${escHtml(entry.assumed_role || entry.to_position || 'Not stated')}</span>
              </div>
            </div>
            <div class="transfer-effective">
              <span class="transfer-label">Active</span>
              <span>${entry.effective_date ? formatDate(entry.effective_date) : 'Not stated'}</span>
            </div>
            ${entry.notes ? `<div class="transfer-entry-note">${escHtml(entry.notes)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </details>`;
}

function renderEmptySources(sources) {
  return `
    <div class="empty-state">
      <p>No indexed notification PDFs for this filter yet.</p>
      <p>Available public data for this court is incomplete.</p>
    </div>`;
}

function renderSourcePanel(sources) {
  return `
    <div class="source-panel">
      <div class="section-label">Official Source Pages</div>
      <div class="source-grid">
        ${sources.map(s => s.url ? `
          <a class="source-card" href="${escHtml(s.url)}" target="_blank" rel="noopener">
            <div class="source-title">${escHtml(s.court)}</div>
            <div class="source-url">${escHtml(s.url)}</div>
            <div class="source-notes">${escHtml(s.notes || '')}</div>
          </a>
        ` : `
          <div class="source-card source-card-missing">
            <div class="source-title">${escHtml(s.court)}</div>
            <div class="source-url">Needs source verification</div>
            <div class="source-notes">${escHtml(s.notes || '')}</div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function sourceLink(url) {
  if (!url) return 'not recorded';
  return `<a class="inline-link" href="${escHtml(url)}" target="_blank" rel="noopener">index</a>`;
}

function findNotification(id) {
  return notificationState.notifications.find(row => row.id === id);
}

window.openNotificationPdf = function(id) {
  const item = findNotification(id);
  if (!item) return;
  const modal = document.getElementById('pdf-modal');
  const frame = document.getElementById('pdf-frame');
  const panel = document.getElementById('pdf-transfer-panel');
  document.getElementById('pdf-modal-title').textContent = item.title;
  document.getElementById('pdf-modal-court').textContent = `${item.court} · ${formatDate(item.date)}`;
  frame.src = item.local_pdf || item.url;
  panel.innerHTML = renderModalTransferPanel(item);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
};

window.closeNotificationPdf = function() {
  const modal = document.getElementById('pdf-modal');
  const frame = document.getElementById('pdf-frame');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (frame) frame.src = 'about:blank';
};

function renderModalTransferPanel(item) {
  const entries = Array.isArray(item.transfer_entries) ? item.transfer_entries : [];
  if (!entries.length) {
    return `
      <div class="pdf-transfer-title">Parsed Transfers</div>
      <div class="transfer-empty">No parsed transfer details available. AI parsed; not human verified. Check the PDF before relying on this data.</div>`;
  }
  return `
    <div class="pdf-transfer-title">Parsed Transfers <span>${entries.length}</span></div>
    <div class="transfer-note">AI parsed; not human verified. Check the PDF before relying on this data.</div>
    <div class="pdf-transfer-list">
      ${entries.map(entry => `
        <div class="modal-transfer-entry">
          <div class="transfer-person">
            <strong>${escHtml(entry.person_name)}</strong>
            <span class="transfer-role">${escHtml(entry.role_type || 'Judicial Officer')}</span>
          </div>
          <div class="modal-transfer-route">
            <span class="transfer-label">From</span>
            <p>${escHtml(entry.from_position || 'Not stated')}</p>
            <span class="transfer-label">To</span>
            <p>${escHtml(entry.to_position || 'Not stated')}</p>
            <span class="transfer-label">Assuming</span>
            <p>${escHtml(entry.assumed_role || entry.to_position || 'Not stated')}</p>
            <span class="transfer-label">Active</span>
            <p>${entry.effective_date ? formatDate(entry.effective_date) : 'Not stated'}</p>
          </div>
        </div>
      `).join('')}
    </div>`;
}

window.selectNotificationCourt = function(id) {
  notificationState.selectedCourt = id;
  writeNotificationRoute();
  renderNotificationNav();
  renderNotifications();
  document.getElementById('main-panel').scrollTop = 0;
};

function formatDate(str) {
  if (!str) return 'No date';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateIso(date) {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  return escHtml(str).replace(/'/g, '&#39;');
}

async function initNotifications() {
  const search = document.getElementById('notification-search');
  search.addEventListener('input', e => {
    notificationState.query = e.target.value.trim();
    writeNotificationRoute({ replace: true });
    renderNotifications();
  });

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

  const menuBtn = document.getElementById('menu-toggle');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
  }
  setupRightRailToggle();

  const ok = await loadNotificationData();
  if (ok) {
    applyNotificationRoute();
    renderNotificationNav();
    renderNotifications();
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeNotificationPdf();
});

function setRightRailCollapsed(collapsed) {
  document.body.classList.toggle('right-rail-collapsed', collapsed);
  const toggle = document.getElementById('right-rail-toggle');
  if (toggle) {
    toggle.textContent = collapsed ? '‹' : '›';
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute('aria-label', collapsed ? 'Expand right panel' : 'Collapse right panel');
  }
  try { localStorage.setItem('jt-right-rail', collapsed ? 'collapsed' : 'open'); } catch(e) {}
}

function setupRightRailToggle() {
  const toggle = document.getElementById('right-rail-toggle');
  if (!toggle) return;
  let collapsed = false;
  try { collapsed = localStorage.getItem('jt-right-rail') === 'collapsed'; } catch(e) {}
  setRightRailCollapsed(collapsed);
  toggle.addEventListener('click', () => setRightRailCollapsed(!document.body.classList.contains('right-rail-collapsed')));
}

window.addEventListener('hashchange', rerenderNotificationsFromRoute);
window.addEventListener('popstate', rerenderNotificationsFromRoute);
document.addEventListener('DOMContentLoaded', initNotifications);
