/* ============================================================
   Start Page — Personal Link Manager
   Vanilla JS + localStorage
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'startpage_data_v1';
  const FAVICON_CACHE_KEY = 'listify_favicons_v1';

  // ---- Storage adapter (localStorage with in-memory fallback) ----
  const memStore = {};
  const storage = {
    getItem(key) {
      try { return localStorage.getItem(key); }
      catch { return memStore[key] ?? null; }
    },
    setItem(key, value) {
      try { localStorage.setItem(key, value); }
      catch { memStore[key] = value; }
    }
  };

  // ---- State ----
  let state = { groups: [] };
  let editingGroup = null;   // { id } when editing, null when creating
  let editingLink = null;    // { groupId, linkId } when editing, null when creating
  let confirmCallback = null;
  let faviconCache = {};

  // ---- DOM ----
  const board = document.getElementById('board');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('search');
  const linkGroupSelect = document.getElementById('linkGroupSelect');

  const groupModal = document.getElementById('groupModal');
  const groupInput = document.getElementById('groupInput');
  const groupModalTitle = document.getElementById('groupModalTitle');

  const linkModal = document.getElementById('linkModal');
  const linkTitleInput = document.getElementById('linkTitleInput');
  const linkUrlInput = document.getElementById('linkUrlInput');
  const linkModalTitle = document.getElementById('linkModalTitle');
  const linkModalHint = document.getElementById('linkModalHint');

  const confirmModal = document.getElementById('confirmModal');
  const confirmTitle = document.getElementById('confirmTitle');
  const confirmText = document.getElementById('confirmText');

  // ---- Title auto-fetch state ----
  let titleFetchController = null;

  // ---- Persistence ----
  function load() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.groups)) {
          state = parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  }

  function save() {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save data:', e);
    }
  }

  // ---- Utilities ----
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normalizeUrl(url) {
    url = url.trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    return url;
  }

  function isValidUrl(url) {
    try {
      new URL(normalizeUrl(url));
      return true;
    } catch {
      return false;
    }
  }

  function getDomain(url) {
    try {
      return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  function getFaviconUrl(url) {
    const domain = getDomain(url);
    if (!domain) return '';
    // Return cached data URL if available
    if (faviconCache[domain]) return faviconCache[domain];
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
  }

  // ---- Favicon cache ----
  function loadFaviconCache() {
    try {
      faviconCache = JSON.parse(storage.getItem(FAVICON_CACHE_KEY)) || {};
    } catch {
      faviconCache = {};
    }
  }

  function saveFaviconCache() {
    try {
      storage.setItem(FAVICON_CACHE_KEY, JSON.stringify(faviconCache));
    } catch (e) {
      console.error('Failed to save favicon cache:', e);
    }
  }

  async function fetchMissingFavicons() {
    const domains = new Set();
    state.groups.forEach(g => g.links.forEach(l => {
      const d = getDomain(l.url);
      if (d && !faviconCache[d]) domains.add(d);
    }));

    for (const domain of domains) {
      try {
        const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`);
        if (!res.ok) continue;
        const blob = await res.blob();
        const dataUrl = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
        if (dataUrl) {
          faviconCache[domain] = dataUrl;
          // Update any visible img for this domain
          const img = document.querySelector(`img[data-domain="${domain}"]`);
          if (img) img.src = dataUrl;
        }
      } catch {
        // Skip on error
      }
    }
    saveFaviconCache();
  }

  function getInitial(title) {
    return (title || '?').trim().charAt(0).toUpperCase();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ---- Theme ----
  function initTheme() {
    const toggle = document.querySelector('[data-theme-toggle]');
    const root = document.documentElement;
    let theme = 'dark';
    try {
      theme = storage.getItem('startpage_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch {}
    root.setAttribute('data-theme', theme);
    updateThemeIcon(theme, toggle);

    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      try { storage.setItem('startpage_theme', theme); } catch {}
      updateThemeIcon(theme, toggle);
    });
  }

  function updateThemeIcon(theme, toggle) {
    toggle.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
    if (theme === 'dark') {
      toggle.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
    } else {
      toggle.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    }
  }

  // ---- Render ----
  function render() {
    if (state.groups.length === 0) {
      board.innerHTML = '';
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;
    board.innerHTML = state.groups.map(renderGroup).join('');
    layoutMasonry();
    fetchMissingFavicons();
  }

  // ---- Masonry layout ----
  function layoutMasonry() {
    const cards = board.querySelectorAll('.group-card');
    if (cards.length === 0) return;

    const cardWidth = 250;
    const gap = 20; // var(--space-5)
    const boardWidth = board.offsetWidth;
    const colCount = Math.max(1, Math.floor((boardWidth + gap) / (cardWidth + gap)));
    const cols = new Array(colCount).fill(0);
    const totalWidth = colCount * (cardWidth + gap) - gap;
    const offsetLeft = Math.max(0, (boardWidth - totalWidth) / 2);

    cards.forEach(card => {
      // Find shortest column
      let minCol = 0;
      for (let i = 1; i < colCount; i++) {
        if (cols[i] < cols[minCol]) minCol = i;
      }
      const left = offsetLeft + minCol * (cardWidth + gap);
      const top = cols[minCol];
      card.style.transform = `translate(${left}px, ${top}px)`;
      card.style.opacity = '1';
      cols[minCol] = top + card.offsetHeight + gap;
    });

    // Set board height to tallest column
    board.style.height = Math.max(...cols) + 'px';
  }

  function renderGroup(group) {
    const total = group.links.length;
    const linksHtml = total > 0
      ? `<ul class="links-list">${group.links.map((l, i) => renderLink(group.id, l, i, total)).join('')}</ul>`
      : '<p class="group-empty">No links yet</p>';

    return `
      <section class="group-card" data-group-id="${group.id}">
        <div class="group-header">
          <div class="group-actions group-actions-left">
            <button class="group-action-btn" onclick="App.editGroup('${group.id}')" title="Edit group" aria-label="Edit group">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
          <div class="group-title-area">
            <span class="group-icon"></span>
            <span class="group-title">${escapeHtml(group.name)}</span>
            <span class="group-count">${group.links.length}</span>
          </div>
          <div class="group-actions group-actions-right">
            <button class="group-action-btn add" onclick="App.openLinkModal(null, '${group.id}')" title="Add link" aria-label="Add link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>
        ${linksHtml}
      </section>
    `;
  }

  function renderLink(groupId, link, index, total) {
    const faviconUrl = getFaviconUrl(link.url);
    const domain = getDomain(link.url);
    const initial = getInitial(link.title);
    const safeUrl = escapeHtml(normalizeUrl(link.url));

    return `
      <li class="link-item" data-link-id="${link.id}">
        <span class="link-favicon">
          ${faviconUrl ? `<img src="${faviconUrl}" alt="" data-domain="${escapeHtml(domain)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"><span style="display:none">${escapeHtml(initial)}</span>` : escapeHtml(initial)}
        </span>
        <div class="link-content">
          <a class="link-title" href="${safeUrl}" rel="noopener noreferrer">${escapeHtml(link.title)}</a>
        </div>
        <div class="link-actions">
          ${index > 0 ? `<button class="link-action-btn move" onclick="App.moveLink('${groupId}', '${link.id}', -1)" title="Move up" aria-label="Move up">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>` : ''}
          ${index < total - 1 ? `<button class="link-action-btn move" onclick="App.moveLink('${groupId}', '${link.id}', 1)" title="Move down" aria-label="Move down">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>` : ''}
          <button class="link-action-btn" onclick="App.openLinkModal('${link.id}', '${groupId}')" title="Edit link" aria-label="Edit link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
      </li>
    `;
  }

  // ---- Group CRUD ----
  function openGroupModal(group) {
    editingGroup = group || null;
    groupModalTitle.textContent = group ? 'Edit Group' : 'New Group';
    groupInput.value = group ? group.name : '';

    const groupDeleteBtn = document.getElementById('groupDeleteBtn');
    if (group) {
      groupDeleteBtn.hidden = false;
      groupDeleteBtn.onclick = () => {
        closeGroupModal();
        deleteGroup(group.id);
      };
    } else {
      groupDeleteBtn.hidden = true;
      groupDeleteBtn.onclick = null;
    }

    groupModal.hidden = false;
    setTimeout(() => groupInput.focus(), 50);
  }

  function saveGroup() {
    const name = groupInput.value.trim();
    if (!name) {
      groupInput.focus();
      return;
    }

    if (editingGroup) {
      editingGroup.name = name;
    } else {
      state.groups.push({ id: uid(), name, links: [] });
    }

    save();
    closeGroupModal();
    render();
  }

  function closeGroupModal() {
    groupModal.hidden = true;
    editingGroup = null;
    groupInput.value = '';
  }

  function editGroup(id) {
    const group = state.groups.find(g => g.id === id);
    if (group) openGroupModal(group);
  }

  function deleteGroup(id) {
    const group = state.groups.find(g => g.id === id);
    if (!group) return;
    showConfirm(
      'Delete group',
      `Delete "${group.name}" and its ${group.links.length} link(s)?`,
      () => {
        state.groups = state.groups.filter(g => g.id !== id);
        save();
        render();
      }
    );
  }

  // ---- Title auto-fetch from URL ----
  async function fetchTitle(url) {
    if (titleFetchController) titleFetchController.abort();
    titleFetchController = new AbortController();
    const proxies = [
      u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
      u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
      u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    ];
    for (const makeProxy of proxies) {
      try {
        const proxyUrl = makeProxy(url);
        const resp = await fetch(proxyUrl, { signal: titleFetchController.signal });
        if (!resp.ok) continue;
        const html = await resp.text();
        const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (match && match[1]) {
          return match[1].trim();
        }
      } catch (e) {
        if (e.name === 'AbortError') return '';
      }
    }
    return '';
  }

  // ---- Link CRUD ----
  function populateGroupSelect(selectedId) {
    linkGroupSelect.innerHTML = state.groups.map(g =>
      `<option value="${g.id}" ${g.id === selectedId ? 'selected' : ''}>${escapeHtml(g.name)}</option>`
    ).join('');
  }

  function openLinkModal(linkId, groupId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;

    const deleteBtn = document.getElementById('linkDeleteBtn');

    if (linkId) {
      const link = group.links.find(l => l.id === linkId);
      if (!link) return;
      editingLink = { groupId, linkId };
      linkModalTitle.textContent = 'Edit Link';
      linkUrlInput.value = link.url;
      linkTitleInput.value = link.title;
      deleteBtn.hidden = false;
      deleteBtn.onclick = () => {
        closeLinkModal();
        deleteLink(groupId, linkId);
      };
    } else {
      editingLink = { groupId, linkId: null };
      linkModalTitle.textContent = 'New Link';
      linkUrlInput.value = '';
      linkTitleInput.value = '';
      deleteBtn.hidden = true;
      deleteBtn.onclick = null;
    }
    populateGroupSelect(groupId);
    linkModalHint.textContent = '';
    linkModal.hidden = false;
    setTimeout(() => linkUrlInput.focus(), 50);
  }

  function saveLink() {
    if (!editingLink) return;
    const title = linkTitleInput.value.trim();
    const url = linkUrlInput.value.trim();
    const targetGroupId = linkGroupSelect.value;

    if (!url) {
      linkModalHint.textContent = 'URL is required.';
      linkUrlInput.focus();
      return;
    }
    if (!isValidUrl(url)) {
      linkModalHint.textContent = 'Please enter a valid URL.';
      linkUrlInput.focus();
      return;
    }
    if (!title) {
      linkModalHint.textContent = 'Title is required (auto-filled when you paste a URL).';
      linkTitleInput.focus();
      return;
    }

    const normalized = normalizeUrl(url);
    const oldGroupId = editingLink.groupId;
    const oldGroup = state.groups.find(g => g.id === oldGroupId);
    if (!oldGroup) return;

    if (editingLink.linkId) {
      const link = oldGroup.links.find(l => l.id === editingLink.linkId);
      if (link) {
        link.title = title;
        link.url = normalized;
        // Move to different group if changed
        if (targetGroupId !== oldGroupId) {
          oldGroup.links = oldGroup.links.filter(l => l.id !== editingLink.linkId);
          const newGroup = state.groups.find(g => g.id === targetGroupId);
          if (newGroup) {
            newGroup.links.push(link);
          }
        }
      }
    } else {
      // New link — add to selected group
      const targetGroup = state.groups.find(g => g.id === targetGroupId) || oldGroup;
      targetGroup.links.push({ id: uid(), title, url: normalized });
    }

    save();
    closeLinkModal();
    render();
  }

  function closeLinkModal() {
    if (titleFetchController) { titleFetchController.abort(); titleFetchController = null; }
    linkModal.hidden = true;
    editingLink = null;
    linkTitleInput.value = '';
    linkUrlInput.value = '';
    linkModalHint.textContent = '';
  }

  function deleteLink(groupId, linkId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;
    const link = group.links.find(l => l.id === linkId);
    if (!link) return;
    showConfirm(
      'Delete link',
      `Delete "${link.title}"?`,
      () => {
        group.links = group.links.filter(l => l.id !== linkId);
        save();
        render();
      }
    );
  }

  function moveLink(groupId, linkId, direction) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;
    const index = group.links.findIndex(l => l.id === linkId);
    if (index === -1) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= group.links.length) return;
    [group.links[index], group.links[newIndex]] = [group.links[newIndex], group.links[index]];
    save();
    render();
  }

  // ---- Confirm Modal ----
  function showConfirm(title, text, callback) {
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    confirmCallback = callback;
    confirmModal.hidden = false;
  }

  function closeConfirm() {
    confirmModal.hidden = true;
    confirmCallback = null;
  }

  // ---- Keyboard ----
  function handleKeydown(e) {
    if (e.key === 'Escape') {
      if (!groupModal.hidden) closeGroupModal();
      else if (!linkModal.hidden) closeLinkModal();
      else if (!confirmModal.hidden) closeConfirm();
    }
    // Ctrl/Cmd + K focuses search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  }

  // ---- Seed demo data (only on first run, when storage is empty) ----
  function seedIfEmpty() {
    if (state.groups.length > 0) return;
    state.groups = [
      {
        id: uid(), name: 'Work', links: [
          { id: uid(), title: 'Gmail', url: 'https://mail.google.com' },
          { id: uid(), title: 'GitHub', url: 'https://github.com' },
          { id: uid(), title: 'Google Drive', url: 'https://drive.google.com' },
        ]
      },
      {
        id: uid(), name: 'Social', links: [
          { id: uid(), title: 'X (Twitter)', url: 'https://x.com' },
          { id: uid(), title: 'Reddit', url: 'https://reddit.com' },
          { id: uid(), title: 'YouTube', url: 'https://youtube.com' },
        ]
      },
      {
        id: uid(), name: 'News', links: [
          { id: uid(), title: 'Hacker News', url: 'https://news.ycombinator.com' },
          { id: uid(), title: 'The Verge', url: 'https://theverge.com' },
        ]
      },
    ];
    save();
  }

  // ---- Clock ----
  function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayName = days[now.getDay()];
    const dayNum = now.getDate(); // no leading zero
    const monthName = months[now.getMonth()];

    document.getElementById('clockTime').textContent = hours + ':' + minutes;
    document.getElementById('clockDate').textContent = dayName + ', ' + dayNum + ' ' + monthName;
  }

  // ---- Export / Import ----
  function exportData() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `listify-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || !Array.isArray(parsed.groups)) {
          showConfirm('Import failed', 'Invalid backup file format.', () => {});
          return;
        }
        showConfirm(
          'Import backup',
          `Replace all current data with ${parsed.groups.length} group(s) from the backup?`,
          () => {
            state = parsed;
            save();
            render();
          }
        );
      } catch (err) {
        showConfirm('Import failed', 'Could not read the file. Make sure it is a valid Listify backup.', () => {});
      }
    };
    reader.readAsText(file);
  }

  // ---- Event wiring ----
  function init() {
    load();
    loadFaviconCache();
    seedIfEmpty();
    initTheme();

    // Clock
    updateClock();
    setInterval(updateClock, 1000);

    // Group modal
    document.getElementById('addGroupBtn').addEventListener('click', () => openGroupModal(null));
    document.getElementById('groupSaveBtn').addEventListener('click', saveGroup);
    document.getElementById('groupCancelBtn').addEventListener('click', closeGroupModal);
    groupInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveGroup(); }
    });

    // Link modal
    document.getElementById('linkSaveBtn').addEventListener('click', saveLink);
    document.getElementById('linkCancelBtn').addEventListener('click', closeLinkModal);
    linkUrlInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); linkTitleInput.focus(); }
    });
    linkTitleInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveLink(); }
    });

    // Auto-fetch title when URL field loses focus
    linkUrlInput.addEventListener('blur', async () => {
      const url = linkUrlInput.value.trim();
      if (!url || !isValidUrl(url)) return;
      // Only auto-fill if title is empty (don't overwrite user edits)
      if (linkTitleInput.value.trim()) return;
      linkModalHint.textContent = 'Fetching page title...';
      const normalized = normalizeUrl(url);
      const title = await fetchTitle(normalized);
      if (title) {
        // Only set if user hasn't typed anything while we were fetching
        if (!linkTitleInput.value.trim()) {
          linkTitleInput.value = title;
          linkModalHint.textContent = '';
        }
      } else {
        linkModalHint.textContent = 'Could not fetch title automatically. Please enter it manually.';
      }
    });

    // Confirm modal
    document.getElementById('confirmOkBtn').addEventListener('click', () => {
      if (confirmCallback) confirmCallback();
      closeConfirm();
    });
    document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirm);

    // Modal overlay click to close
    [groupModal, linkModal, confirmModal].forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) {
          if (modal === groupModal) closeGroupModal();
          else if (modal === linkModal) closeLinkModal();
          else if (modal === confirmModal) closeConfirm();
        }
      });
    });

    // Export / Import
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) {
        importData(e.target.files[0]);
        e.target.value = '';
      }
    });

    // Search — no longer filters links, submits to DuckDuckGo via form

    // Keyboard
    document.addEventListener('keydown', handleKeydown);

    // Re-layout masonry on resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layoutMasonry, 100);
    });

    render();
  }

  // ---- Public API (for inline onclick) ----
  window.App = {
    editGroup,
    deleteGroup,
    openLinkModal,
    deleteLink,
    moveLink,
  };

  // ---- Boot ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
