/*
 * Standalone command palette and quick-open overlay for the mcbCode Studio.
 * Load as a classic script after the application scripts (or whenever convenient;
 * app globals are resolved lazily when a command is run).
 */
(() => {
  'use strict';

  if (window.__studioCommandPaletteInstalled) return;
  window.__studioCommandPaletteInstalled = true;

  const STYLE_ID = 'studio-command-palette-styles';
  const ROOT_ID = 'studio-command-palette';
  const commands = [];
  let overlay;
  let input;
  let results;
  let heading;
  let hint;
  let mode = 'commands';
  let visibleItems = [];
  let selectedIndex = 0;
  let previousFocus = null;
  let renderToken = 0;

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        --cp-bg: var(--bg-1, #1e1e1e);
        --cp-raised: var(--bg-2, #252526);
        --cp-hover: var(--bg-3, #2a2d2e);
        --cp-fg: var(--text-1, #dedede);
        --cp-muted: var(--text-2, #9a9a9a);
        --cp-border: var(--border, rgba(255,255,255,.13));
        --cp-accent: var(--accent, #78a9ff);
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        display: none;
        align-items: flex-start;
        justify-content: center;
        padding: min(12vh, 112px) 18px 24px;
        box-sizing: border-box;
        background: rgba(0,0,0,.48);
        color: var(--cp-fg);
        font: 13px/1.45 var(--font-mono, "Consolas", "Courier New", monospace);
      }
      #${ROOT_ID}[data-open="true"] { display: flex; }
      #${ROOT_ID} * { box-sizing: border-box; }
      #${ROOT_ID} .studio-cp-panel {
        width: min(640px, 100%);
        max-height: min(70vh, 640px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--cp-border);
        border-radius: var(--radius, 4px);
        background: var(--cp-bg);
        box-shadow: 0 18px 56px rgba(0,0,0,.45);
      }
      #${ROOT_ID} .studio-cp-search-wrap {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 13px 16px;
        border-bottom: 1px solid var(--cp-border);
        background: var(--cp-raised);
      }
      #${ROOT_ID} .studio-cp-mark {
        flex: 0 0 auto;
        color: var(--cp-muted);
        font-size: 16px;
        line-height: 1;
      }
      #${ROOT_ID} input {
        width: 100%;
        min-width: 0;
        padding: 0;
        border: 0;
        outline: 0;
        color: var(--cp-fg);
        background: transparent;
        font: inherit;
        font-size: 15px;
      }
      #${ROOT_ID} input::placeholder { color: var(--cp-muted); opacity: .9; }
      #${ROOT_ID} .studio-cp-heading {
        padding: 10px 16px 5px;
        color: var(--cp-muted);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: .045em;
        text-transform: uppercase;
      }
      #${ROOT_ID} .studio-cp-results {
        min-height: 38px;
        overflow: auto;
        padding: 4px 6px 8px;
        overscroll-behavior: contain;
      }
      #${ROOT_ID} .studio-cp-option {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 38px;
        margin: 1px 0;
        padding: 7px 10px;
        border: 0;
        border-radius: 5px;
        color: var(--cp-fg);
        background: transparent;
        cursor: pointer;
        text-align: left;
        font: inherit;
        width: 100%;
      }
      #${ROOT_ID} .studio-cp-option:hover,
      #${ROOT_ID} .studio-cp-option[data-selected="true"] { background: var(--cp-hover); }
      #${ROOT_ID} .studio-cp-option[data-selected="true"] { outline: 1px solid color-mix(in srgb, var(--cp-accent) 48%, transparent); }
      #${ROOT_ID} .studio-cp-option-main { flex: 1 1 auto; min-width: 0; }
      #${ROOT_ID} .studio-cp-label { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #${ROOT_ID} .studio-cp-description {
        flex: 0 1 45%;
        overflow: hidden;
        color: var(--cp-muted);
        font-size: 12px;
        text-align: right;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID} .studio-cp-empty {
        padding: 15px 10px 17px;
        color: var(--cp-muted);
        text-align: center;
      }
      #${ROOT_ID} .studio-cp-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 14px;
        border-top: 1px solid var(--cp-border);
        color: var(--cp-muted);
        font-size: 11px;
      }
      #${ROOT_ID} .studio-cp-keys { display: flex; gap: 9px; white-space: nowrap; }
      #${ROOT_ID} kbd {
        padding: 1px 5px;
        border: 1px solid var(--cp-border);
        border-radius: 3px;
        color: var(--cp-fg);
        background: var(--cp-raised);
        font: inherit;
      }
      @media (max-width: 520px) {
        #${ROOT_ID} { padding: 7vh 10px 16px; }
        #${ROOT_ID} .studio-cp-panel { max-height: 82vh; }
        #${ROOT_ID} .studio-cp-description { display: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        #${ROOT_ID} *, #${ROOT_ID} *::before, #${ROOT_ID} *::after { scroll-behavior: auto !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    if (overlay && overlay.isConnected) return;
    addStyles();
    overlay = document.getElementById(ROOT_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = ROOT_ID;
      overlay.dataset.open = 'false';
      overlay.setAttribute('role', 'presentation');
      overlay.innerHTML = `
        <section class="studio-cp-panel" role="dialog" aria-modal="true" aria-labelledby="studio-cp-title">
          <div class="studio-cp-search-wrap">
            <span class="studio-cp-mark" aria-hidden="true">⌕</span>
            <input id="studio-cp-input" type="text" autocomplete="off" spellcheck="false" aria-label="Command palette" aria-controls="studio-cp-results" aria-autocomplete="list">
          </div>
          <div class="studio-cp-heading" id="studio-cp-title"></div>
          <div class="studio-cp-results" id="studio-cp-results" role="listbox" aria-label="Results" tabindex="-1"></div>
          <div class="studio-cp-footer"><span id="studio-cp-hint"></span><span class="studio-cp-keys"><span><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span><kbd>Esc</kbd> Close</span></span></div>
        </section>`;
      document.body.appendChild(overlay);
    }
    input = overlay.querySelector('#studio-cp-input');
    results = overlay.querySelector('#studio-cp-results');
    heading = overlay.querySelector('#studio-cp-title');
    hint = overlay.querySelector('#studio-cp-hint');
    overlay.addEventListener('mousedown', event => {
      if (event.target === overlay) closePalette(true);
    });
    input.addEventListener('input', render);
    input.addEventListener('keydown', handlePaletteKeydown);
    results.addEventListener('click', event => {
      const option = event.target.closest('[role="option"]');
      if (!option) return;
      const index = Number(option.dataset.index);
      if (Number.isInteger(index) && visibleItems[index]) selectItem(visibleItems[index]);
    });
    results.addEventListener('mousemove', event => {
      const option = event.target.closest('[role="option"]');
      if (!option) return;
      const index = Number(option.dataset.index);
      if (Number.isInteger(index) && index !== selectedIndex) {
        selectedIndex = index;
        updateSelection();
      }
    });
  }

  function getProjectFiles() {
    try {
      if (typeof currentProject !== 'undefined' && currentProject && Array.isArray(currentProject.files)) {
        return { project: currentProject, files: currentProject.files };
      }
    } catch (_) { /* A project binding may not exist in a partial app build. */ }
    return { project: null, files: [] };
  }

  function filePath(file, files) {
    const segments = [String(file?.name || 'Unnamed file')];
    let parent = file?.parent_id;
    const visited = new Set();
    while (parent != null && !visited.has(String(parent))) {
      visited.add(String(parent));
      const folder = files.find(item => item && String(item.id) === String(parent));
      if (!folder) break;
      if (folder.name) segments.unshift(String(folder.name));
      parent = folder.parent_id;
    }
    return segments.join('/');
  }

  function getQuickOpenItems() {
    const { files } = getProjectFiles();
    const items = [];
    files.forEach(file => {
      if (!file || typeof file !== 'object' || file.type === 'folder') return;
      if (file.type && file.type !== 'file') return;
      const label = String(file.name || 'Unnamed file');
      items.push({
        type: 'project-file',
        label,
        description: filePath(file, files),
        searchText: `${label} ${filePath(file, files)}`,
        file
      });
    });

    document.querySelectorAll('.tab').forEach(tab => {
      const id = tab.dataset.tab;
      if (!id) return;
      const label = tab.querySelector('.tab-label')?.textContent?.trim() || id;
      items.push({
        type: 'open-tab',
        label,
        description: tab.classList.contains('active') ? 'Open tab · active' : 'Open tab',
        searchText: `${label} ${id} open tab`,
        id
      });
    });
    return items;
  }

  function getFuzzyScore(query, text) {
    const needle = query.toLocaleLowerCase();
    const haystack = String(text || '').toLocaleLowerCase();
    if (!needle) return 0;
    let queryIndex = 0;
    let score = 0;
    let consecutive = 0;
    let first = -1;
    for (let index = 0; index < haystack.length && queryIndex < needle.length; index += 1) {
      if (haystack[index] !== needle[queryIndex]) {
        consecutive = 0;
        continue;
      }
      if (first < 0) first = index;
      const boundary = index === 0 || /[\s_./\\-]/.test(haystack[index - 1]);
      score += 10 + (boundary ? 8 : 0) + (consecutive ? 6 : 0) - Math.min(index, 30) * 0.08;
      consecutive += 1;
      queryIndex += 1;
    }
    if (queryIndex !== needle.length) return -Infinity;
    if (haystack.includes(needle)) score += 18;
    if (haystack.startsWith(needle)) score += 16;
    return score - Math.max(0, haystack.length - needle.length) * 0.025;
  }

  function getItems() {
    if (mode === 'commands') {
      return commands.map(command => ({ ...command, type: 'command', searchText: `${command.label} ${command.description || ''} ${command.aliases || ''}` }));
    }
    return getQuickOpenItems();
  }

  function render() {
    if (!results) return;
    const query = input.value.trim();
    const ranked = getItems().map((item, order) => ({ item, order, score: query ? getFuzzyScore(query, item.searchText || item.label) : 0 }))
      .filter(entry => entry.score > -Infinity)
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, 80)
      .map(entry => entry.item);
    visibleItems = ranked;
    selectedIndex = Math.min(selectedIndex, Math.max(0, ranked.length - 1));
    results.replaceChildren();
    if (!ranked.length) {
      const empty = document.createElement('div');
      empty.className = 'studio-cp-empty';
      empty.textContent = mode === 'quick' ? 'No matching files or open tabs.' : 'No matching commands.';
      results.appendChild(empty);
      input.removeAttribute('aria-activedescendant');
      return;
    }
    ranked.forEach((item, index) => {
      const option = document.createElement('div');
      option.id = `studio-cp-option-${index}`;
      option.className = 'studio-cp-option';
      option.dataset.index = String(index);
      option.dataset.selected = index === selectedIndex ? 'true' : 'false';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', index === selectedIndex ? 'true' : 'false');
      option.tabIndex = -1;
      const main = document.createElement('span');
      main.className = 'studio-cp-option-main';
      const label = document.createElement('span');
      label.className = 'studio-cp-label';
      label.textContent = item.label;
      main.appendChild(label);
      const description = document.createElement('span');
      description.className = 'studio-cp-description';
      description.textContent = item.description || '';
      option.append(main, description);
      results.appendChild(option);
    });
    updateSelection();
  }

  function updateSelection() {
    if (!results) return;
    results.querySelectorAll('[role="option"]').forEach((option, index) => {
      const selected = index === selectedIndex;
      option.dataset.selected = selected ? 'true' : 'false';
      option.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    const active = results.querySelector(`#studio-cp-option-${selectedIndex}`);
    if (active) {
      input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView?.({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function handlePaletteKeydown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!visibleItems.length) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      selectedIndex = (selectedIndex + delta + visibleItems.length) % visibleItems.length;
      updateSelection();
    } else if (event.key === 'Enter') {
      if (!visibleItems.length) return;
      event.preventDefault();
      event.stopPropagation();
      selectItem(visibleItems[selectedIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePalette(true);
    }
  }

  function openPalette(nextMode) {
    ensureOverlay();
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    mode = nextMode === 'quick' ? 'quick' : 'commands';
    overlay.dataset.open = 'true';
    overlay.querySelector('.studio-cp-panel').setAttribute('aria-label', mode === 'quick' ? 'Quick Open' : 'Command Palette');
    heading.textContent = mode === 'quick' ? 'Quick Open' : 'Commands';
    hint.textContent = mode === 'quick' ? 'Files in the active project and open tabs' : 'Run an editor or workspace command';
    input.setAttribute('aria-label', mode === 'quick' ? 'Quick open files and tabs' : 'Command palette');
    input.placeholder = mode === 'quick' ? 'Search files by name…' : 'Type a command…';
    input.value = '';
    selectedIndex = 0;
    renderToken += 1;
    render();
    requestAnimationFrame(() => {
      if (overlay?.dataset.open === 'true') {
        input.focus();
        input.select();
      }
    });
  }

  function closePalette(restoreFocus) {
    if (!overlay || overlay.dataset.open !== 'true') return;
    overlay.dataset.open = 'false';
    if (restoreFocus && previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
      requestAnimationFrame(() => {
        try { previousFocus.focus({ preventScroll: true }); } catch (_) { previousFocus.focus(); }
      });
    }
    previousFocus = null;
  }

  function safeCall(fn, ...args) {
    if (typeof fn !== 'function') return false;
    try {
      const result = fn(...args);
      if (result && typeof result.catch === 'function') result.catch(error => console.warn('Studio command failed:', error));
      return true;
    } catch (error) {
      console.warn('Studio command failed:', error);
      return false;
    }
  }

  function clickFirst(selectors) {
    for (const selector of selectors) {
      const target = document.querySelector(selector);
      if (target && typeof target.click === 'function') {
        target.click();
        return true;
      }
    }
    return false;
  }

  function runAction(action) {
    const dataAction = value => clickFirst([`[data-action="${value}"]`]);
    const sidebarView = value => clickFirst([`[data-sidebar-view="${value}"]`]);
    switch (action) {
      case 'open-file':
        if (safeCall(window.studioOpenFile)) return;
        if (dataAction('open-file')) return;
        if (safeCall(window.openCloudBrowser)) return;
        clickFirst(['#openfile-overlay']);
        break;
      case 'new-file':
        if (safeCall(window.studioNewBlankFile)) return;
        if (dataAction('new-file')) return;
        if (typeof window.nextDynamicId === 'function' && typeof window.openTab === 'function') {
          safeCall(window.openTab, window.nextDynamicId(), 'untitled', '');
        }
        break;
      case 'save':
        if (safeCall(window.studioSaveActiveFile)) return;
        if (dataAction('save-file')) return;
        safeCall(window.saveActiveTab);
        break;
      case 'toggle-sidebar':
        if (dataAction('toggle-sidebar')) return;
        document.getElementById('sidebar-wrap')?.classList.toggle('collapsed');
        break;
      case 'workspace-search':
        if (safeCall(window.studioOpenWorkspaceSearch)) return;
        if (sidebarView('search')) return;
        clickFirst(['[data-action="workspace-search"]']);
        break;
      case 'preferences':
        if (safeCall(window.studioOpenPreferences)) return;
        if (sidebarView('settings')) return;
        clickFirst(['[data-action="preferences"]']);
        break;
      case 'wiki':
        if (safeCall(window.studioOpenBedrockWiki)) return;
        if (clickFirst(['[data-action="toggle-wiki"]'])) return;
        if (safeCall(window.toggleWikiPanel)) return;
        clickFirst(['#activity-wiki-icon']);
        break;
      case 'extensions':
        if (safeCall(window.openExtManager, 'installed')) return;
        if (dataAction('open-extensions')) return;
        clickFirst(['#activity-extensions-icon']);
        break;
      case 'theme':
        if (safeCall(window.openThemeModal)) return;
        dataAction('open-theme');
        break;
      default:
        break;
    }
  }

  function activateOpenTab(id) {
    const tab = Array.from(document.querySelectorAll('.tab')).find(element => element.dataset.tab === String(id));
    if (!tab) return false;
    if (typeof window.activateTab === 'function') {
      safeCall(window.activateTab, String(id));
      return true;
    }
    tab.click();
    return true;
  }

  function openProjectFile(file) {
    const { project, files } = getProjectFiles();
    if (!project || !Array.isArray(files) || !file || typeof file !== 'object') return false;
    const stillPresent = files.some(candidate => candidate === file || (file.id != null && candidate?.id != null && String(candidate.id) === String(file.id)));
    if (!stillPresent) return false;
    const currentFile = files.find(candidate => candidate === file || (file.id != null && candidate?.id != null && String(candidate.id) === String(file.id)));
    if (!currentFile || currentFile.type === 'folder' || (currentFile.type && currentFile.type !== 'file')) return false;
    if (typeof window.openProjectTreeFile === 'function') {
      safeCall(window.openProjectTreeFile, currentFile);
      return true;
    }
    const row = Array.from(document.querySelectorAll('#sidebar-content .tree-row[data-file-id]'))
      .find(element => currentFile.id != null && element.dataset.fileId === String(currentFile.id));
    if (row) {
      row.click();
      return true;
    }
    return false;
  }

  function selectItem(item) {
    if (!item) return;
    closePalette(false);
    if (mode === 'commands' && item.run) {
      safeCall(item.run);
      return;
    }
    if (mode === 'commands' && item.action) {
      runAction(item.action);
      return;
    }
    if (item.type === 'open-tab') {
      activateOpenTab(item.id);
      return;
    }
    if (item.type === 'project-file') openProjectFile(item.file);
  }

  function handleGlobalKeydown(event) {
    if (event.defaultPrevented || event.altKey || event.repeat) return;
    const commandModifier = event.metaKey || event.ctrlKey;
    if (!commandModifier || event.metaKey && event.ctrlKey) return;
    if (event.key.toLowerCase() !== 'p') return;
    if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) window.studioOpenCommandPalette();
    else window.studioOpenQuickOpen();
  }

  const builtIns = [
    { label: 'Open File', description: 'Browse project files', action: 'open-file', aliases: 'open' },
    { label: 'New Blank File', description: 'Create an empty editor tab', action: 'new-file', aliases: 'new file' },
    { label: 'Save', description: 'Save the active file', action: 'save', aliases: 'save active file' },
    { label: 'Toggle Sidebar', description: 'Show or hide the sidebar', action: 'toggle-sidebar', aliases: 'view explorer' },
    { label: 'Workspace Search', description: 'Search files and open buffers', action: 'workspace-search', aliases: 'find search' },
    { label: 'Preferences', description: 'Editor settings', action: 'preferences', aliases: 'settings' },
    { label: 'Bedrock Wiki', description: 'Open the Bedrock reference panel', action: 'wiki', aliases: 'wiki' },
    { label: 'Extensions', description: 'Manage installed extensions', action: 'extensions', aliases: 'plugins marketplace' },
    { label: 'Custom Theme', description: 'Edit the studio theme', action: 'theme', aliases: 'theme appearance' }
  ];
  commands.push(...builtIns);

  window.studioRegisterCommand = function studioRegisterCommand(command, run, options) {
    let normalized;
    if (typeof command === 'string') {
      normalized = { ...(options || {}), label: command, run };
    } else if (command && typeof command === 'object') {
      normalized = { ...command };
    } else {
      return () => {};
    }
    if (typeof normalized.label !== 'string' || !normalized.label.trim()) return () => {};
    normalized.label = normalized.label.trim();
    normalized.description = typeof normalized.description === 'string' ? normalized.description : '';
    normalized.aliases = Array.isArray(normalized.aliases) ? normalized.aliases.join(' ') : String(normalized.aliases || '');
    if (typeof normalized.run !== 'function') return () => {};
    const duplicate = commands.findIndex(existing => existing.label.toLocaleLowerCase() === normalized.label.toLocaleLowerCase());
    if (duplicate >= 0) commands.splice(duplicate, 1);
    commands.push(normalized);
    return () => {
      const index = commands.indexOf(normalized);
      if (index >= 0) commands.splice(index, 1);
    };
  };

  window.studioOpenCommandPalette = () => openPalette('commands');
  window.studioOpenQuickOpen = () => openPalette('quick');
  document.addEventListener('keydown', handleGlobalKeydown, true);
})();
