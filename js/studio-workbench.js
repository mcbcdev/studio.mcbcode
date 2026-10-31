// Workspace search and editor preferences.
(() => {
  const byId = (id) => document.getElementById(id);
  const DEFAULT_PREFERENCES = { fontSize: 14, tabSize: 2, lineNumbers: true, softWrap: false };
  const PREF_KEY = 'studio_editor_preferences_v1';
  let activeSidebarView = 'explorer';

  function readPreferences() {
    try {
      const stored = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      const tabs = [2, 4, 'tab'].includes(stored.tabSize) ? stored.tabSize : DEFAULT_PREFERENCES.tabSize;
      return {
        fontSize: Math.min(20, Math.max(12, Number(stored.fontSize) || DEFAULT_PREFERENCES.fontSize)),
        tabSize: tabs,
        lineNumbers: stored.lineNumbers !== false,
        softWrap: !!stored.softWrap
      };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  window.studioPreferences = readPreferences();

  function updateStudioStatus() {
    const project = typeof currentProject !== 'undefined' && currentProject ? currentProject.name : 'No workspace';
    const opened = document.querySelectorAll('.tab').length;
    const projectEl = byId('studio-status-project');
    const tabsEl = byId('studio-status-tabs');
    if (projectEl) projectEl.textContent = project;
    if (tabsEl) tabsEl.textContent = `${opened} open file${opened === 1 ? '' : 's'}`;
  }
  window.updateStudioStatus = updateStudioStatus;

  function setSidebarView(view) {
    activeSidebarView = view;
    byId('sidebar-wrap')?.classList.remove('collapsed');
    const labels = { explorer: 'Explorer', search: 'Search', settings: 'Preferences' };
    const content = byId('sidebar-content');
    if (content) content.hidden = view !== 'explorer';
    ['search-panel', 'settings-panel'].forEach(id => {
      const pane = byId(id);
      if (pane) pane.hidden = id !== `${view}-panel`;
    });
    document.querySelectorAll('[data-sidebar-view]').forEach(button => {
      button.classList.toggle('active', button.dataset.sidebarView === view);
      button.setAttribute('aria-pressed', button.dataset.sidebarView === view ? 'true' : 'false');
    });
    const title = byId('sidebar-title');
    if (title) title.textContent = view === 'explorer' && typeof currentProject !== 'undefined' && currentProject
      ? currentProject.name : ({ explorer: 'Explorer', search: 'Workspace Search', settings: 'Editor Preferences' }[view] || 'Explorer');
    const statusView = byId('studio-status-view');
    if (statusView) statusView.textContent = labels[view] || view;
    if (view === 'search') {
      renderSearchResults();
      setTimeout(() => byId('workspace-search')?.focus(), 0);
    }
    if (view === 'settings') syncPreferenceControls();
  }
  window.studioRefreshSidebarTitle = () => {
    const title = byId('sidebar-title');
    if (!title) return;
    title.textContent = activeSidebarView === 'explorer' && typeof currentProject !== 'undefined' && currentProject
      ? currentProject.name
      : ({ explorer: 'Explorer', search: 'Search', settings: 'Preferences' }[activeSidebarView] || 'Explorer');
  };

  document.querySelectorAll('[data-sidebar-view]').forEach(button => {
    button.addEventListener('click', () => setSidebarView(button.dataset.sidebarView));
  });

  function openFileChooser() { byId('openfile-overlay')?.classList.add('show'); }
  byId('sidebar-content')?.addEventListener('click', event => {
    if (event.target.closest('#explorer-open-pack')) openFileChooser();
    if (event.target.closest('#explorer-open-cloud')) openCloudBrowser();
  });

  // Search covers open text buffers and every filename in the active project tree.
  // It intentionally does not download unopened cloud contents behind the user's back.
  const searchInput = byId('workspace-search');
  searchInput?.addEventListener('input', renderSearchResults);

  function projectPath(file) {
    if (file.virtualPath) return file.virtualPath;
    if (typeof currentProject === 'undefined' || !currentProject || !Array.isArray(currentProject.files)) return file.name || '';
    const names = [file.name || ''];
    let parentId = file.parent_id;
    const seen = new Set();
    while (parentId != null && !seen.has(String(parentId))) {
      seen.add(String(parentId));
      const parent = currentProject.files.find(item => String(item.id) === String(parentId));
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parent_id;
    }
    return names.join('/');
  }

  function addSearchResult(container, path, snippet, meta, onClick) {
    const button = document.createElement('button');
    button.className = 'search-result';
    button.type = 'button';
    const pathEl = document.createElement('span');
    pathEl.className = 'result-path';
    pathEl.textContent = path;
    const snippetEl = document.createElement('span');
    snippetEl.className = 'result-snippet';
    snippetEl.textContent = snippet || '';
    const metaEl = document.createElement('span');
    metaEl.className = 'result-line';
    metaEl.textContent = meta || '';
    button.append(pathEl, snippetEl, metaEl);
    button.addEventListener('click', onClick);
    container.appendChild(button);
  }

  function renderSearchResults() {
    const root = byId('search-results');
    const summary = byId('search-summary');
    if (!root || !summary) return;
    const query = (searchInput?.value || '').trim();
    root.replaceChildren();
    if (query.length < 2) {
      summary.textContent = 'Enter at least two characters.';
      root.innerHTML = '<div class="search-empty">Search checks open text tabs and file names in the active project.</div>';
      return;
    }
    const needle = query.toLowerCase();
    let filenameCount = 0;
    let matchCount = 0;
    const projectFiles = typeof currentProject !== 'undefined' && currentProject && Array.isArray(currentProject.files)
      ? currentProject.files.filter(file => file.type === 'file') : [];
    const nameHits = projectFiles.filter(file => projectPath(file).toLowerCase().includes(needle)).slice(0, 40);
    Object.entries(editors).forEach(([id, entry]) => {
      const tab = document.querySelector(`.tab[data-tab="${CSS.escape(id)}"]`);
      const label = tab?.querySelector('.tab-label')?.textContent || id;
      const text = entry.cm.getValue();
      const lines = text.split('\n');
      const hits = [];
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(needle) && hits.length < 5) hits.push({ line, index });
      });
      if (!hits.length) return;
      if (!root.querySelector('[data-search-group="content"]')) {
        const heading = document.createElement('div');
        heading.className = 'search-group-title';
        heading.dataset.searchGroup = 'content';
        heading.textContent = 'matches in open files';
        root.appendChild(heading);
      }
      hits.forEach(hit => {
        matchCount++;
        addSearchResult(root, label, hit.line.trim() || '(blank line)', `line ${hit.index + 1}`, () => {
          activateTab(id);
          entry.cm.setCursor({ line: hit.index, ch: Math.max(0, hit.line.toLowerCase().indexOf(needle)) });
          entry.cm.scrollIntoView({ line: hit.index, ch: 0 }, 90);
          entry.cm.focus();
        });
      });
    });
    if (nameHits.length) {
      const heading = document.createElement('div');
      heading.className = 'search-group-title';
      heading.textContent = 'matching project files';
      root.appendChild(heading);
      nameHits.forEach(file => {
        filenameCount++;
        addSearchResult(root, projectPath(file), 'open this file in the editor', file.type === 'folder' ? 'folder' : 'file', () => {
          if (typeof openProjectTreeFile === 'function') openProjectTreeFile(file);
        });
      });
    }
    summary.textContent = `${matchCount} open-buffer match${matchCount === 1 ? '' : 'es'} \u00b7 ${filenameCount} filename match${filenameCount === 1 ? '' : 'es'}`;
    if (!matchCount && !filenameCount) root.innerHTML = '<div class="search-empty">No matches. Unopened project file contents are not searched.</div>';
  }
  let searchRefreshTimer = null;
  window.refreshStudioSearch = () => {
    clearTimeout(searchRefreshTimer);
    searchRefreshTimer = setTimeout(renderSearchResults, 140);
  };

  // Editor preferences are deliberately device-local and apply immediately to every open tab.
  const BEDROCK_PROFILE_KEY = 'studio_bedrock_profile_v1';
  function bedrockProfileScope() {
    const project = typeof currentProject !== 'undefined' ? currentProject : null;
    if (project?.code) return `cloud:${project.code}`;
    if (project?.localArchive) return `archive:${project.name || project.workspace?.filename || 'pack'}`;
    return 'default';
  }
  function readBedrockProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(`${BEDROCK_PROFILE_KEY}:${bedrockProfileScope()}`) || '{}');
      return { targetVersion: String(saved.targetVersion || ''), experiments: String(saved.experiments || '') };
    } catch (_) { return { targetVersion: '', experiments: '' }; }
  }
  function syncBedrockProfileControls() {
    const profile = readBedrockProfile();
    window.studioBedrockProfile = profile;
    const version = byId('bedrock-target-version');
    const experiments = byId('bedrock-experiments');
    if (version) version.value = profile.targetVersion;
    if (experiments) experiments.value = profile.experiments;
  }
  window.studioSyncBedrockProfile = syncBedrockProfileControls;
  function saveBedrockProfile() {
    const profile = {
      targetVersion: byId('bedrock-target-version')?.value.trim() || '',
      experiments: byId('bedrock-experiments')?.value.trim() || ''
    };
    window.studioBedrockProfile = profile;
    try { localStorage.setItem(`${BEDROCK_PROFILE_KEY}:${bedrockProfileScope()}`, JSON.stringify(profile)); }
    catch (error) { console.warn('Could not save the Bedrock authoring profile:', error); }
  }
  byId('bedrock-target-version')?.addEventListener('input', saveBedrockProfile);
  byId('bedrock-experiments')?.addEventListener('input', saveBedrockProfile);

  function syncPreferenceControls() {
    const prefs = window.studioPreferences;
    const font = byId('pref-font-size');
    if (!font) return;
    font.value = String(prefs.fontSize);
    byId('pref-font-size-value').value = `${prefs.fontSize}px`;
    byId('pref-tab-size').value = String(prefs.tabSize);
    byId('pref-line-numbers').checked = prefs.lineNumbers;
    byId('pref-soft-wrap').checked = prefs.softWrap;
    syncBedrockProfileControls();
  }

  function applyPreferences() {
    const prefs = window.studioPreferences;
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (error) { console.warn('Could not save editor preferences:', error); }
    const sizeValue = byId('pref-font-size-value');
    if (sizeValue) sizeValue.value = `${prefs.fontSize}px`;
    Object.values(editors).forEach(entry => {
      const cm = entry.cm;
      cm.setOption('tabSize', prefs.tabSize === 'tab' ? 4 : Number(prefs.tabSize));
      cm.setOption('indentUnit', prefs.tabSize === 'tab' ? 4 : Number(prefs.tabSize));
      cm.setOption('indentWithTabs', prefs.tabSize === 'tab');
      cm.setOption('lineNumbers', prefs.lineNumbers);
      const tab = document.querySelector(`.tab[data-tab="${CSS.escape(Object.keys(editors).find(key => editors[key] === entry) || '')}"] .tab-label`);
      const label = tab?.textContent || '';
      const gutters = [];
      if (prefs.lineNumbers) gutters.push('CodeMirror-linenumbers');
      if (typeof lintableFilename === 'function' && lintableFilename(label)) gutters.push('CodeMirror-lint-markers');
      cm.setOption('gutters', gutters);
      cm.setOption('lineWrapping', prefs.softWrap);
      cm.getWrapperElement().style.fontSize = `${prefs.fontSize}px`;
      cm.refresh();
    });
  }

  byId('pref-font-size')?.addEventListener('input', event => {
    window.studioPreferences.fontSize = Number(event.target.value);
    applyPreferences();
  });
  byId('pref-tab-size')?.addEventListener('change', event => {
    window.studioPreferences.tabSize = event.target.value === 'tab' ? 'tab' : Number(event.target.value);
    applyPreferences();
  });
  byId('pref-line-numbers')?.addEventListener('change', event => {
    window.studioPreferences.lineNumbers = event.target.checked;
    applyPreferences();
  });
  byId('pref-soft-wrap')?.addEventListener('change', event => {
    window.studioPreferences.softWrap = event.target.checked;
    applyPreferences();
  });
  byId('pref-reset')?.addEventListener('click', () => {
    window.studioPreferences = { ...DEFAULT_PREFERENCES };
    applyPreferences();
    syncPreferenceControls();
  });
  syncPreferenceControls();
  syncBedrockProfileControls();

  window.downloadActiveStudioFile = function downloadActiveStudioFile() {
    const tab = document.querySelector('.tab.active');
    const entry = tab ? editors[tab.dataset.tab] : null;
    if (!tab || !entry) { alert('Open a text file before downloading.'); return; }
    const label = tab.querySelector('.tab-label')?.textContent || 'untitled.txt';
    const name = (label.split('/').pop() || 'untitled.txt').replace(/[\\/:*?"<>|]/g, '_');
    const blob = new Blob([entry.cm.getValue()], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };


  renderSearchResults();
  updateStudioStatus();
})();
