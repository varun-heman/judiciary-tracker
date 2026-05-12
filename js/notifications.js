const notificationState = {
  courts: [],
  notifications: [],
  sources: [],
  selectedCourt: 'ALL',
  query: ''
};

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
    .filter(n => {
      if (!notificationState.query) return true;
      const q = notificationState.query.toLowerCase();
      return [n.title, n.court, n.category, n.date].some(v => (v || '').toLowerCase().includes(q));
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date) || a.court.localeCompare(b.court));
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

function renderNotificationNav() {
  const nav = document.getElementById('notification-nav');
  const courts = courtList();
  const notifications = notificationState.notifications.filter(n => new Date(n.date + 'T00:00:00') >= SIX_MONTHS_AGO);
  const countFor = id => notifications.filter(n => n.court_id === id).length;

  let html = `
    <div class="nav-section">
      <div class="nav-section-title">Views</div>
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
    <div class="nav-section">
      <div class="nav-section-title">Courts <span class="nav-count">${courts.length}</span></div>`;

  courts.forEach(court => {
    const count = countFor(court.id);
    html += `
      <a class="nav-item ${notificationState.selectedCourt === court.id ? 'active' : ''}" href="#" onclick="selectNotificationCourt('${court.id}'); return false;">
        <span class="nav-dot ${count ? 'good' : 'unknown'}"></span>
        <span class="nav-label">${escHtml(court.name.replace(' High Court', ' HC'))}</span>
        ${count ? `<span class="nav-badge">${count}</span>` : ''}
      </a>`;
  });

  html += `</div>`;
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
      <h2>${escHtml(selectedName)} Notifications</h2>
      <p class="view-subtitle">Default view shows indexed notifications from ${formatDateIso(SIX_MONTHS_AGO)} through today. PDF links open in a new tab when the court publishes a direct PDF URL.</p>
    </div>
    <div class="stats-bar">
      <span class="stat-chip">${rows.length} indexed items</span>
      <span class="stat-chip">${sources.length} source page${sources.length === 1 ? '' : 's'}</span>
    </div>
    ${rows.length ? Object.entries(grouped).map(([court, items]) => renderCourtGroup(court, items)).join('') : renderEmptySources(sources)}
    ${renderSourcePanel(sources)}
  `;
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
  return `
    <a class="notification-row" href="${escHtml(item.url)}" target="_blank" rel="noopener">
      <div class="notification-date">${formatDate(item.date)}</div>
      <div class="notification-main">
        <div class="notification-title">${escHtml(item.title)}</div>
        <div class="notification-meta">${escHtml(item.category || 'Notification')} · ${escHtml(item.court)}</div>
      </div>
      <div class="notification-file ${isPdf ? 'pdf' : 'index'}">${isPdf ? 'PDF' : 'Index'}</div>
    </a>`;
}

function renderEmptySources(sources) {
  return `
    <div class="empty-state">
      <p>No indexed notification PDFs for this filter yet.</p>
      <p>Use the source links below, then add rows to <code>data/notifications.json</code>.</p>
    </div>`;
}

function renderSourcePanel(sources) {
  return `
    <div class="source-panel">
      <div class="section-label">Official Source Pages</div>
      <div class="source-grid">
        ${sources.map(s => `
          <a class="source-card" href="${escHtml(s.url)}" target="_blank" rel="noopener">
            <div class="source-title">${escHtml(s.court)}</div>
            <div class="source-url">${escHtml(s.url)}</div>
            <div class="source-notes">${escHtml(s.notes || '')}</div>
          </a>
        `).join('')}
      </div>
    </div>`;
}

window.selectNotificationCourt = function(id) {
  notificationState.selectedCourt = id;
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

async function initNotifications() {
  const search = document.getElementById('notification-search');
  search.addEventListener('input', e => {
    notificationState.query = e.target.value.trim();
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

  const ok = await loadNotificationData();
  if (ok) {
    renderNotificationNav();
    renderNotifications();
  }
}

document.addEventListener('DOMContentLoaded', initNotifications);
