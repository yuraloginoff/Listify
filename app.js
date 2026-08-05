/* ============================================================
   Start Page — Personal Link Manager
   Vanilla JS + localStorage
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'startpage_data_v1';

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

  // ---- DOM ----
  const board = document.getElementById('board');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('search');

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
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
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
  function getFilteredGroups() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return state.groups;

    return state.groups
      .map(g => ({
        ...g,
        links: g.links.filter(l =>
          l.title.toLowerCase().includes(query) ||
          getDomain(l.url).toLowerCase().includes(query)
        )
      }))
      .filter(g => g.links.length > 0);
  }

  function render() {
    const groups = getFilteredGroups();

    if (state.groups.length === 0) {
      board.innerHTML = '';
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;

    if (groups.length === 0) {
      board.innerHTML = '<p style="color: var(--color-text-faint); text-align: center; padding: 4rem 1rem; grid-column: 1 / -1;">No links match your search.</p>';
      return;
    }

    board.innerHTML = groups.map(renderGroup).join('');
  }

  function renderGroup(group) {
    const linksHtml = group.links.length > 0
      ? `<ul class="links-list">${group.links.map(l => renderLink(group.id, l)).join('')}</ul>`
      : '<p class="group-empty">No links yet</p>';

    return `
      <section class="group-card" data-group-id="${group.id}">
        <div class="group-header">
          <div class="group-title-area">
            <span class="group-icon"></span>
            <span class="group-title">${escapeHtml(group.name)}</span>
            <span class="group-count">${group.links.length}</span>
          </div>
          <div class="group-actions">
            <button class="group-action-btn" onclick="App.editGroup('${group.id}')" title="Edit group" aria-label="Edit group">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="group-action-btn danger" onclick="App.deleteGroup('${group.id}')" title="Delete group" aria-label="Delete group">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        ${linksHtml}
        <button class="add-link-btn" onclick="App.openLinkModal(null, '${group.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Add link
        </button>
      </section>
    `;
  }

  function renderLink(groupId, link) {
    const faviconUrl = getFaviconUrl(link.url);
    const domain = getDomain(link.url);
    const initial = getInitial(link.title);
    const safeUrl = escapeHtml(normalizeUrl(link.url));

    return `
      <li class="link-item" data-link-id="${link.id}">
        <span class="link-favicon">
          ${faviconUrl ? `<img src="${faviconUrl}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"><span style="display:none">${escapeHtml(initial)}</span>` : escapeHtml(initial)}
        </span>
        <div class="link-content">
          <a class="link-title" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)}</a>
        </div>
        <div class="link-actions">
          <button class="link-action-btn" onclick="App.openLinkModal('${link.id}', '${groupId}')" title="Edit link" aria-label="Edit link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="link-action-btn danger" onclick="App.deleteLink('${groupId}', '${link.id}')" title="Delete link" aria-label="Delete link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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

  // ---- Link CRUD ----
  function openLinkModal(linkId, groupId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;

    if (linkId) {
      const link = group.links.find(l => l.id === linkId);
      if (!link) return;
      editingLink = { groupId, linkId };
      linkModalTitle.textContent = 'Edit Link';
      linkTitleInput.value = link.title;
      linkUrlInput.value = link.url;
    } else {
      editingLink = { groupId, linkId: null };
      linkModalTitle.textContent = 'New Link';
      linkTitleInput.value = '';
      linkUrlInput.value = '';
    }
    linkModalHint.textContent = '';
    linkModal.hidden = false;
    setTimeout(() => linkTitleInput.focus(), 50);
  }

  function saveLink() {
    if (!editingLink) return;
    const title = linkTitleInput.value.trim();
    const url = linkUrlInput.value.trim();

    if (!title) {
      linkTitleInput.focus();
      return;
    }
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

    const normalized = normalizeUrl(url);
    const group = state.groups.find(g => g.id === editingLink.groupId);
    if (!group) return;

    if (editingLink.linkId) {
      const link = group.links.find(l => l.id === editingLink.linkId);
      if (link) {
        link.title = title;
        link.url = normalized;
      }
    } else {
      group.links.push({ id: uid(), title, url: normalized });
    }

    save();
    closeLinkModal();
    render();
  }

  function closeLinkModal() {
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
    linkTitleInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); linkUrlInput.focus(); }
    });
    linkUrlInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveLink(); }
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

    // Search
    searchInput.addEventListener('input', render);

    // Keyboard
    document.addEventListener('keydown', handleKeydown);

    render();
  }

  // ---- Public API (for inline onclick) ----
  window.App = {
    editGroup,
    deleteGroup,
    openLinkModal,
    deleteLink,
  };

  // ---- Boot ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
