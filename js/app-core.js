  // ================= backend config =================
  // the actual API worker this studio talks to. every request needs
  // credentials:'include' so the mcb_session cookie (Domain=.mcbcode.com) gets sent.
  const API_BASE = 'https://auth.mcbcode.com';

  async function api(path, options = {}) {
    const res = await fetch(API_BASE + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  // ================= menu bar dropdowns =================
  // only menu items with an actual dropdown inside toggle open/close
  const menuItems = document.querySelectorAll('.menu-item:has(.menu-dropdown)');

  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = item.classList.contains('open');
      menuItems.forEach(m => m.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  // close menus when clicking anywhere else
  document.addEventListener('click', () => {
    menuItems.forEach(m => m.classList.remove('open'));
  });

  // File > New File / Open File / Save route to the real actions;
  // editor and view commands are routed to the active workbench state.
  document.querySelectorAll('[data-action="undo"]').forEach(el => {
    el.addEventListener('click', () => window.studioRunEditorCommand?.('undo'));
  });
  document.querySelectorAll('[data-action="redo"]').forEach(el => {
    el.addEventListener('click', () => window.studioRunEditorCommand?.('redo'));
  });
  document.querySelectorAll('[data-action="find-active"]').forEach(el => {
    el.addEventListener('click', () => window.studioOpenActiveFind?.());
  });
  document.querySelectorAll('[data-action="toggle-sidebar"]').forEach(el => {
    el.addEventListener('click', () => document.getElementById('sidebar-wrap')?.classList.toggle('collapsed'));
  });
  document.querySelectorAll('[data-action="toggle-console"]').forEach(el => {
    el.addEventListener('click', () => window.toggleStudioOutput?.());
  });
  document.querySelector('[data-action="new-file"]').addEventListener('click', () => {
    const id = nextDynamicId();
    openTab(id, 'untitled', '');
  });
  document.querySelector('[data-action="open-file"]').addEventListener('click', () => {
    document.getElementById('openfile-overlay').classList.add('show');
  });
  document.querySelector('[data-action="save-file"]').addEventListener('click', () => {
    saveActiveTab();
  });
  document.querySelector('[data-action="download-active-file"]').addEventListener('click', () => {
    window.downloadActiveStudioFile?.();
  });

  // extensions top-level menu item now opens the manager instead of the placeholder
  document.querySelector('[data-action="open-extensions"]').addEventListener('click', () => openExtManager('installed'));
  document.querySelector('[data-action="open-marketplace"]').addEventListener('click', () => openExtManager('marketplace'));
  document.querySelector('[data-action="open-theme"]').addEventListener('click', () => openThemeModal());
  document.getElementById('activity-extensions-icon').addEventListener('click', () => openExtManager('installed'));

  // ================= keyboard shortcuts modal =================
  document.getElementById('shortcuts-btn').addEventListener('click', () => {
    document.getElementById('shortcuts-overlay').classList.add('show');
  });
  document.getElementById('shortcuts-close').addEventListener('click', () => {
    document.getElementById('shortcuts-overlay').classList.remove('show');
  });

  // ================= shortcuts: windows/mac toggle =================
  const platformBtns = document.querySelectorAll('.platform-btn');
  const keySpans = document.querySelectorAll('.shortcuts-list .keys');

  function setShortcutPlatform(platform) {
    keySpans.forEach(el => {
      el.textContent = platform === 'mac' ? el.dataset.mac : el.dataset.win;
    });
    platformBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.platform === platform);
    });
  }

  platformBtns.forEach(btn => {
    btn.addEventListener('click', () => setShortcutPlatform(btn.dataset.platform));
  });

  // auto-detect so mac users see Cmd/Option by default, windows users see Ctrl/Alt
  const isMac = navigator.platform.toUpperCase().includes('MAC') || navigator.userAgent.toUpperCase().includes('MAC');
  setShortcutPlatform(isMac ? 'mac' : 'win');

  // ================= auth state =================
  let currentUser = null; // null = logged out, otherwise the object /me returns

  async function checkAuth() {
    try {
      currentUser = await api('/me');
    } catch (e) {
      currentUser = null;
      console.error('mcbCode auth check failed:', e.message);
    }
    updateAuthUI();
  }

  function updateAuthUI() {
    const popupTitle = document.getElementById('account-popup-title');
    const popupBody = document.getElementById('account-popup-body');
    const popupBtn = document.getElementById('account-popup-btn');
    const loginBtn = document.getElementById('btn-login');
    const accountIconImg = document.querySelector('#account-icon img');

    if (currentUser) {
      popupTitle.textContent = currentUser.username || 'Account';
      popupBody.textContent = `${currentUser.points || 0} points${currentUser.is_obsidian ? ' \u00b7 Obsidian' : ''}`;
      popupBtn.textContent = 'Log out';
      popupBtn.style.display = 'block';
      popupBtn.onclick = async () => {
        await api('/logout', { method: 'POST' });
        currentUser = null;
        updateAuthUI();
      };
      loginBtn.textContent = 'Account';
      accountIconImg.src = currentUser.pfp_url || 'https://mcbcode.com/img/icons/blank-transparent.png';
    } else {
      popupTitle.textContent = 'Account';
      popupBody.textContent = 'not logged in';
      popupBtn.textContent = 'Login';
      popupBtn.style.display = 'block';
      popupBtn.onclick = () => {
        window.location.href = 'https://mcbcode.com/account?redirectto=https://studio.mcbcode.com';
      };
      loginBtn.textContent = 'Login';
      accountIconImg.src = 'https://mcbcode.com/img/icons/blank-transparent.png';
    }
  }

  checkAuth();

  // ================= welcome panel + tab state =================
  const tabBar = document.getElementById('tab-bar');
  const codeArea = document.getElementById('code-area');
  const welcomePanel = document.getElementById('welcome-panel');

  function updateWelcomeVisibility() {
    const anyTabs = document.querySelectorAll('.tab').length > 0;
    welcomePanel.classList.toggle('show', !anyTabs);
  }

  // ================= tabs: switching =================
  function activateTab(id) {
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === id);
    });
    document.querySelectorAll('.code-panel').forEach(p => {
      p.classList.toggle('active', p.dataset.panel === id);
    });
    document.querySelectorAll('.file-item').forEach(f => {
      f.classList.toggle('active', f.dataset.file === id);
    });
    if (typeof setActiveTreeFileByTabId === 'function') setActiveTreeFileByTabId(id);
    updateWelcomeVisibility();

    // CodeMirror sizes itself based on its container at creation time, so a fresh
    // instance mounted while its tab was hidden renders broken until this is called
    const entry = editors[id];
    if (entry) {
      setTimeout(() => {
        entry.cm.refresh();
        // don't steal focus if a tab label is mid-rename (e.g. the two click events that
        // precede a dblclick both call activateTab, and would otherwise blur the label
        // the instant the rename starts)
        if (!document.activeElement || !document.activeElement.isContentEditable) {
          entry.cm.focus();
        }
      }, 0);
    }
  }
