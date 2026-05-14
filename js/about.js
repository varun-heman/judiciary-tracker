(async function loadAboutMarkdown() {
  const container = document.getElementById('about-content');
  if (!container) return;

  try {
    const response = await fetch('about.md', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Could not load about.md');
    const markdown = await response.text();
    container.innerHTML = `<p class="dashboard-kicker">About this project</p>${renderMarkdown(markdown)}`;
  } catch (error) {
    container.innerHTML = `
      <p class="dashboard-kicker">About this project</p>
      <h1>India Judiciary Tracker</h1>
      <p>The about text could not be loaded. Please check <code>about.md</code>.</p>`;
  }
})();

function renderMarkdown(markdown) {
  return markdown
    .trim()
    .split(/\n{2,}/)
    .map(block => {
      const text = block.trim();
      if (!text) return '';
      if (text.startsWith('# ')) return `<h1>${inlineMarkdown(text.slice(2))}</h1>`;
      if (text.startsWith('## ')) return `<h2>${inlineMarkdown(text.slice(3))}</h2>`;
      return `<p>${inlineMarkdown(text.replace(/\n/g, ' '))}</p>`;
    })
    .join('');
}

function inlineMarkdown(text) {
  return escapeHtml(text).replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}
