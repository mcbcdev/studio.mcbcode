// Bedrock-specific workbench panels: search, preferences, pack diagnostics and builders.
(() => {
  const byId = (id) => document.getElementById(id);
  const DEFAULT_PREFERENCES = { fontSize: 14, tabSize: 2, lineNumbers: true, softWrap: false };
  const PREF_KEY = 'studio_editor_preferences_v1';
  let activeSidebarView = 'explorer';
  let activeToolTab = 'doctor';
  let doctorState = { issues: [], scannedAt: null, files: [] };

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
    const labels = { explorer: 'Explorer', search: 'Search', settings: 'Preferences', toolkit: 'Bedrock Workbench' };
    const content = byId('sidebar-content');
    if (content) content.hidden = view !== 'explorer';
    ['search-panel', 'settings-panel', 'toolkit-panel'].forEach(id => {
      const pane = byId(id);
      if (pane) pane.hidden = id !== `${view}-panel`;
    });
    document.querySelectorAll('[data-sidebar-view]').forEach(button => {
      button.classList.toggle('active', button.dataset.sidebarView === view);
      button.setAttribute('aria-pressed', button.dataset.sidebarView === view ? 'true' : 'false');
    });
    const title = byId('sidebar-title');
    if (title) title.textContent = view === 'explorer' && typeof currentProject !== 'undefined' && currentProject
      ? currentProject.name : ({ explorer: 'Explorer', search: 'Workspace Search', settings: 'Editor Preferences', toolkit: 'Bedrock Workbench' }[view] || 'Explorer');
    const statusView = byId('studio-status-view');
    if (statusView) statusView.textContent = labels[view] || view;
    if (view === 'search') {
      renderSearchResults();
      setTimeout(() => byId('workspace-search')?.focus(), 0);
    }
    if (view === 'settings') syncPreferenceControls();
    if (view === 'toolkit') renderToolTab();
  }
  window.studioRefreshSidebarTitle = () => {
    const title = byId('sidebar-title');
    if (!title) return;
    title.textContent = activeSidebarView === 'explorer' && typeof currentProject !== 'undefined' && currentProject
      ? currentProject.name
      : ({ explorer: 'Explorer', search: 'Search', settings: 'Preferences', toolkit: 'Bedrock Workbench' }[activeSidebarView] || 'Explorer');
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
  function syncPreferenceControls() {
    const prefs = window.studioPreferences;
    const font = byId('pref-font-size');
    if (!font) return;
    font.value = String(prefs.fontSize);
    byId('pref-font-size-value').value = `${prefs.fontSize}px`;
    byId('pref-tab-size').value = String(prefs.tabSize);
    byId('pref-line-numbers').checked = prefs.lineNumbers;
    byId('pref-soft-wrap').checked = prefs.softWrap;
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
      if (label.toLowerCase().endsWith('.mcfunction')) gutters.push('mcf-error-gutter');
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

  // File tree helpers keep imported archives browser-local and fetch cloud file bodies only on demand.
  function getOpenEntry(file) {
    return Object.entries(editors).find(([, entry]) =>
      (entry.fileId != null && String(entry.fileId) === String(file.id)) ||
      (entry.saveId != null && file.save_id != null && String(entry.saveId) === String(file.save_id)) ||
      (entry.localArchiveFile?.fileId != null && String(entry.localArchiveFile.fileId) === String(file.id))
    ) || null;
  }

  async function readWorkspaceFile(file) {
    const opened = getOpenEntry(file);
    if (opened) return opened[1].cm.getValue();
    if (file.zipEntry) return await file.zipEntry.async('string');
    if (file.save_id && typeof api === 'function') {
      const saved = await api('/save?id=' + encodeURIComponent(file.save_id));
      return typeof saved.content === 'string' ? saved.content : null;
    }
    return null;
  }

  function addIssue(issues, level, title, detail, path, file, extra = {}) {
    issues.push({ level, title, detail, path: path || '', file: file || null, ...extra });
  }

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function validVersion(version) {
    return Array.isArray(version) && version.length === 3 && version.every(value => Number.isInteger(value) && value >= 0);
  }

  async function runPackDoctor() {
    const body = byId('toolkit-body');
    if (!body) return;
    body.innerHTML = '<div class="tool-hero"><span class="tool-kicker">workspace diagnostics</span><h4>scanning pack\u2026</h4><p>checking manifests and indexing addon files.</p></div>';
    const issues = [];
    const projectFiles = typeof currentProject !== 'undefined' && currentProject && Array.isArray(currentProject.files)
      ? currentProject.files.filter(file => file.type === 'file') : [];
    const textTabs = Object.entries(editors).map(([id, entry]) => {
      const tab = document.querySelector(`.tab[data-tab="${CSS.escape(id)}"]`);
      return { id, entry, label: tab?.querySelector('.tab-label')?.textContent || id, content: entry.cm.getValue() };
    });
    const manifestFiles = projectFiles.filter(file => file.name?.toLowerCase() === 'manifest.json');
    const openedManifests = textTabs.filter(item => item.label.split('/').pop().toLowerCase() === 'manifest.json');
    let validManifestCount = 0;
    let inspectedManifests = 0;

    if (!projectFiles.length && !openedManifests.length) {
      addIssue(issues, 'warning', 'No addon workspace is open', 'Open a .mcpack, .mcaddon, or mcbCode project to run the full pack audit.', '', null);
    }
    if (projectFiles.length && !manifestFiles.length) {
      addIssue(issues, 'error', 'manifest.json not found', 'Bedrock packs need a manifest at each pack root. This project tree has no file with that name.', '', null);
    }

    const targets = manifestFiles.map(file => ({ file, path: projectPath(file), open: getOpenEntry(file) }));
    openedManifests.forEach(item => {
      if (!targets.some(target => target.open?.[0] === item.id)) targets.push({ file: null, path: item.label, open: [item.id, item.entry], content: item.content });
    });

    for (const target of targets.slice(0, 8)) {
      inspectedManifests++;
      const path = target.path;
      let raw;
      try { raw = target.content ?? await readWorkspaceFile(target.file); }
      catch (error) {
        addIssue(issues, 'error', 'Could not read manifest', error.message || 'The file could not be loaded.', path, target.file);
        continue;
      }
      if (typeof raw !== 'string') {
        addIssue(issues, 'warning', 'Manifest contents unavailable', 'Open this file to inspect it. The doctor does not fetch unopened cloud files in the background.', path, target.file);
        continue;
      }
      let manifest;
      try { manifest = JSON.parse(raw); }
      catch (error) {
        addIssue(issues, 'error', 'Invalid JSON', `Manifest parsing failed: ${error.message}`, path, target.file, { tabId: target.open?.[0] });
        continue;
      }
      validManifestCount++;
      if (manifest.format_version == null) addIssue(issues, 'warning', 'Manifest format_version is missing', 'Add the manifest schema version so Bedrock can interpret the pack metadata.', path, target.file, { tabId: target.open?.[0] });
      const header = manifest.header;
      if (!header || typeof header !== 'object') addIssue(issues, 'error', 'Header object is missing', 'A pack manifest needs a header with a name, UUID, and version.', path, target.file, { tabId: target.open?.[0] });
      else {
        if (!header.name) addIssue(issues, 'error', 'Pack name is missing', 'Set header.name to a short display name.', path, target.file, { tabId: target.open?.[0] });
        if (!UUID_PATTERN.test(String(header.uuid || ''))) addIssue(issues, 'error', 'Header UUID is invalid', 'Use a unique UUID in 8-4-4-4-12 hexadecimal format.', path, target.file, { tabId: target.open?.[0] });
        if (!validVersion(header.version)) addIssue(issues, 'error', 'Header version is invalid', 'Use a three-number version array such as [1, 0, 0].', path, target.file, { tabId: target.open?.[0] });
        if (header.min_engine_version != null && !validVersion(header.min_engine_version)) addIssue(issues, 'error', 'Minimum engine version is invalid', 'Use a three-number version array such as [1, 20, 0].', path, target.file, { tabId: target.open?.[0] });
      }
      if (!Array.isArray(manifest.modules) || !manifest.modules.length) {
        addIssue(issues, 'error', 'No modules are declared', 'Add a data, resources, or script module to make this pack usable.', path, target.file, { tabId: target.open?.[0] });
      } else {
        const seen = new Map();
        manifest.modules.forEach((module, index) => {
          const label = `Module ${index + 1}`;
          if (!module || typeof module !== 'object') {
            addIssue(issues, 'error', `${label} is invalid`, 'Each module must be an object.', path, target.file, { tabId: target.open?.[0] });
            return;
          }
          if (!['data', 'resources', 'script'].includes(module.type)) addIssue(issues, 'warning', `${label} has an unfamiliar type`, `Module type \u201c${String(module.type || 'missing')}\u201d is not one of data, resources, or script.`, path, target.file, { tabId: target.open?.[0] });
          if (!UUID_PATTERN.test(String(module.uuid || ''))) addIssue(issues, 'error', `${label} UUID is invalid`, 'Every module must have its own valid UUID.', path, target.file, { tabId: target.open?.[0] });
          if (!validVersion(module.version)) addIssue(issues, 'error', `${label} version is invalid`, 'Use a three-number version array.', path, target.file, { tabId: target.open?.[0] });
          if (module.uuid && seen.has(module.uuid)) addIssue(issues, 'error', 'Duplicate module UUID', `Modules ${seen.get(module.uuid)} and ${index + 1} share the same UUID.`, path, target.file, { tabId: target.open?.[0] });
          else if (module.uuid) seen.set(module.uuid, index + 1);
          if (module.type === 'script' && module.entry) {
            const scriptExists = projectFiles.some(file => projectPath(file).toLowerCase().endsWith(String(module.entry).toLowerCase()));
            if (projectFiles.length && !scriptExists) addIssue(issues, 'warning', 'Script entry file is missing', `The manifest points to ${module.entry}, but no matching project file was found.`, path, target.file, { tabId: target.open?.[0] });
          }
        });
      }
      (Array.isArray(manifest.dependencies) ? manifest.dependencies : []).forEach((dependency, index) => {
        if (!UUID_PATTERN.test(String(dependency?.uuid || '')) && !dependency?.module_name) addIssue(issues, 'error', `Dependency ${index + 1} has no valid identifier`, 'Set a UUID or module_name.', path, target.file, { tabId: target.open?.[0] });
        if (dependency?.version != null && !validVersion(dependency.version) && typeof dependency.version !== 'string') addIssue(issues, 'error', `Dependency ${index + 1} version is invalid`, 'Use a three-number array or a module version string.', path, target.file, { tabId: target.open?.[0] });
      });
    }

    const allPaths = projectFiles.map(projectPath);
    const functions = allPaths.filter(path => path.toLowerCase().endsWith('.mcfunction'));
    const scripts = allPaths.filter(path => /\.(js|ts)$/i.test(path) && /(^|\/)(scripts?|javascript)(\/|$)/i.test(path));
    if (functions.length) addIssue(issues, 'success', `${functions.length} mcfunction file${functions.length === 1 ? '' : 's'} indexed`, 'Use the Functions tab to browse command files and see call references in open buffers.', '', null);
    else if (projectFiles.length) addIssue(issues, 'info', 'No mcfunction files found', 'This is normal for script-only or resource-only packs.', '', null);
    if (scripts.length) addIssue(issues, 'success', `${scripts.length} script file${scripts.length === 1 ? '' : 's'} found`, 'Script file discovery is based on the active project file paths.', '', null);
    if (inspectedManifests && validManifestCount && !issues.some(issue => issue.level === 'error')) {
      addIssue(issues, 'success', 'Manifest structure looks good', 'The inspected manifest parsed and passed the core UUID, version, and module checks.', '', null);
    }

    doctorState = { issues, scannedAt: new Date(), files: projectFiles };
    renderDoctor();
    renderOutput(issues);
    updateStudioStatus();
  }

  function renderDoctor() {
    const body = byId('toolkit-body');
    if (!body) return;
    const issues = doctorState.issues;
    const errors = issues.filter(issue => issue.level === 'error').length;
    const warnings = issues.filter(issue => issue.level === 'warning').length;
    const checks = issues.filter(issue => issue.level === 'success').length;
    body.replaceChildren();
    const hero = document.createElement('div');
    hero.className = 'tool-hero';
    const headline = errors ? `${errors} error${errors === 1 ? '' : 's'} found` : doctorState.scannedAt ? 'No errors found' : 'Manifest and pack checks';
    hero.innerHTML = `<span class="tool-kicker">Pack Doctor</span><h4>${headline}</h4><p>Checks manifest structure, UUIDs, modules, and referenced files. It does not run Minecraft.</p>`;
    body.appendChild(hero);
    const scan = document.createElement('button');
    scan.className = 'view-button primary';
    scan.type = 'button';
    scan.textContent = doctorState.scannedAt ? 'Scan again' : 'Scan workspace';
    scan.style.width = '100%';
    scan.style.marginTop = '10px';
    scan.addEventListener('click', runPackDoctor);
    body.appendChild(scan);
    if (!doctorState.scannedAt) return;
    const stats = document.createElement('div');
    stats.className = 'audit-summary';
    [['errors', errors], ['warnings', warnings], ['checks', checks]].forEach(([label, number]) => {
      const item = document.createElement('div'); item.className = 'audit-stat';
      item.innerHTML = `<strong>${number}</strong><span>${label}</span>`;
      stats.appendChild(item);
    });
    body.appendChild(stats);
    const list = document.createElement('div');
    if (!issues.length) list.innerHTML = '<div class="search-empty">nothing to report yet.</div>';
    issues.forEach(issue => {
      const row = document.createElement('div');
      row.className = `audit-issue ${issue.level}`;
      row.innerHTML = '<div class="audit-issue-head"><span class="issue-mark"></span><span class="issue-title"></span></div><p class="issue-detail"></p>';
      row.querySelector('.issue-title').textContent = issue.title;
      row.querySelector('.issue-detail').textContent = issue.detail;
      if (issue.path) {
        const path = document.createElement('div'); path.className = 'issue-path'; path.textContent = issue.path; row.appendChild(path);
      }
      if (issue.file || issue.tabId) {
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        row.addEventListener('click', () => openIssueFile(issue));
        row.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openIssueFile(issue); }
        });
      }
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  async function openIssueFile(issue) {
    if (issue.tabId && document.querySelector(`.tab[data-tab="${CSS.escape(issue.tabId)}"]`)) {
      activateTab(issue.tabId);
      return;
    }
    if (issue.file && typeof openProjectTreeFile === 'function') await openProjectTreeFile(issue.file);
  }

  function renderOutput(issues) {
    const output = byId('output-body');
    if (!output) return;
    output.replaceChildren();
    if (!issues.length) {
      output.innerHTML = '<div class="search-empty">no findings.</div>';
      return;
    }
    issues.forEach(issue => {
      const row = document.createElement('div');
      row.className = `output-line ${issue.level}`;
      const level = document.createElement('span'); level.className = 'output-level'; level.textContent = issue.level;
      const message = document.createElement('span'); message.className = 'output-message';
      message.textContent = `${issue.title}${issue.path ? ` \u2014 ${issue.path}` : ''}: ${issue.detail}`;
      row.append(level, message);
      if (issue.file || issue.tabId) {
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        row.addEventListener('click', () => openIssueFile(issue));
        row.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openIssueFile(issue); }
        });
      }
      output.appendChild(row);
    });
  }
  function relativeContent(file) {
    const hit = getOpenEntry(file);
    return hit ? hit[1].cm.getValue() : '';
  }

  function renderFunctions() {
    const body = byId('toolkit-body');
    if (!body) return;
    body.replaceChildren();
    const files = typeof currentProject !== 'undefined' && currentProject && Array.isArray(currentProject.files)
      ? currentProject.files.filter(file => file.type === 'file' && file.name?.toLowerCase().endsWith('.mcfunction')) : [];
    const functions = files.map(file => {
      const path = projectPath(file);
      const content = relativeContent(file);
      const lines = content ? content.split('\n') : [];
      const calls = [...new Set([...content.matchAll(/\bfunction\s+([a-z0-9_.-]+:[a-z0-9_./-]+)/gi)].map(match => match[1]))];
      const executable = lines.filter(line => line.trim() && !line.trim().startsWith('#')).length;
      return { file, path, executable, calls };
    });
    const tabFiles = Object.entries(editors).filter(([id]) => {
      const label = document.querySelector(`.tab[data-tab="${CSS.escape(id)}"] .tab-label`)?.textContent || '';
      return label.toLowerCase().endsWith('.mcfunction');
    });
    tabFiles.forEach(([id, entry]) => {
      const label = document.querySelector(`.tab[data-tab="${CSS.escape(id)}"] .tab-label`)?.textContent || id;
      if (!functions.some(item => item.path === label)) {
        const content = entry.cm.getValue();
        functions.push({ file: null, path: label, executable: content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).length,
          calls: [...new Set([...content.matchAll(/\bfunction\s+([a-z0-9_.-]+:[a-z0-9_./-]+)/gi)].map(match => match[1]))], tabId: id });
      }
    });
    const hero = document.createElement('div'); hero.className = 'tool-hero';
    hero.innerHTML = `<span class="tool-kicker">Function Index</span><h4>${functions.length} command file${functions.length === 1 ? '' : 's'}</h4><p>Lists project .mcfunction files and call references found in open buffers.</p>`;
    body.appendChild(hero);
    if (!functions.length) {
      const empty = document.createElement('div'); empty.className = 'search-empty';
      empty.textContent = 'No .mcfunction files in the current workspace or open tabs.';
      body.appendChild(empty); return;
    }
    const list = document.createElement('div');
    functions.forEach(item => {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'tool-list-row';
      const name = document.createElement('span'); name.textContent = item.path;
      const meta = document.createElement('small'); meta.textContent = item.executable ? `${item.executable} commands` : item.file ? 'open to inspect' : 'empty';
      row.append(name, meta);
      row.addEventListener('click', async () => {
        if (item.tabId) { activateTab(item.tabId); return; }
        if (item.file && typeof openProjectTreeFile === 'function') await openProjectTreeFile(item.file);
      });
      list.appendChild(row);
      if (item.calls.length) {
        const refs = document.createElement('div'); refs.className = 'builder-info'; refs.textContent = `calls: ${item.calls.join(', ')}`; list.appendChild(refs);
      }
    });
    body.appendChild(list);
  }

  function renderBuilder() {
    const body = byId('toolkit-body');
    if (!body) return;
    body.innerHTML = `
      <div class="tool-hero"><span class="tool-kicker">File Builder</span><h4>Bedrock pack files</h4><p>Generate a scratch manifest or function registration file. Use File &gt; Download Active File to save the selected tab.</p></div>
      <label class="view-field"><span>Pack name</span><input class="view-input" id="builder-pack-name" value="New Bedrock Pack" maxlength="60"></label>
      <label class="view-field"><span>Namespace</span><input class="view-input" id="builder-namespace" value="my_pack" maxlength="32"></label>
      <label class="view-field"><span>Pack type</span><select class="view-select" id="builder-pack-type"><option value="data">Behavior pack</option><option value="resources">Resource pack</option><option value="script">Script behavior pack</option></select></label>
      <div class="view-button-row"><button class="view-button primary" id="builder-manifest">Generate manifest.json</button></div>
      <div class="prefs-card"><h4>Function registration</h4><p>Generate <code>functions/tick.json</code> and the referenced function file under <code>functions/</code>.</p>
        <label class="view-field"><span>Function ID</span><input class="view-input" id="builder-function-id" value="my_pack:tick" maxlength="80"></label>
        <div class="view-button-row"><button class="view-button" id="builder-tick">Generate functions/tick.json</button><button class="view-button" id="builder-function">Generate function file</button></div>
      </div>
      <div class="builder-info">Generated files open in scratch tabs. They are not added to the active pack or project. After downloading, place function files under <code>functions/</code>.</div>`;
    byId('builder-manifest').addEventListener('click', makeManifest);
    byId('builder-tick').addEventListener('click', makeTickJson);
    byId('builder-function').addEventListener('click', makeTickFunction);
  }

  function safeNamespace(value) {
    return String(value || 'my_pack').trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').replace(/^[_\-.]+|[_\-.]+$/g, '') || 'my_pack';
  }
  function createUuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
      const random = Math.random() * 16 | 0;
      return (char === 'x' ? random : (random & 0x3 | 0x8)).toString(16);
    });
  }
  function openScratch(label, content) {
    openTab(nextDynamicId(), label, content);
    updateStudioStatus();
  }
  function makeManifest() {
    const name = byId('builder-pack-name').value.trim() || 'New Bedrock Pack';
    const namespace = safeNamespace(byId('builder-namespace').value);
    const type = byId('builder-pack-type').value;
    const module = { type: type === 'script' ? 'script' : type, uuid: createUuid(), version: [1, 0, 0] };
    if (type === 'script') { module.language = 'javascript'; module.entry = 'scripts/main.js'; }
    const manifest = {
      format_version: 2,
      header: { name, description: `A ${type === 'resources' ? 'resource' : 'behavior'} pack for Minecraft Bedrock Edition.`, uuid: createUuid(), version: [1, 0, 0], min_engine_version: [1, 20, 0] },
      modules: [module]
    };
    openScratch('manifest.json', JSON.stringify(manifest, null, 2));
    if (type === 'script') openScratch('scripts/main.js', `// Script entry starter for ${namespace}.\n// Before importing Bedrock APIs, declare @minecraft/server in manifest.dependencies\n// with the module version supported by your target game release.\nconsole.warn('${namespace}: script entry loaded');\n`);
    showBuilderNotice('Generated a fresh manifest and opened it in a scratch tab.');
  }
  function functionId() {
    const raw = byId('builder-function-id').value.trim();
    const [ns, ...parts] = raw.split(':');
    const safePath = parts.join(':').replace(/[^a-zA-Z0-9_./-]/g, '').replace(/^\/+|\/+$/g, '');
    return `${safeNamespace(ns)}:${safePath || 'tick'}`;
  }
  function makeTickJson() {
    const id = functionId();
    openScratch('functions/tick.json', JSON.stringify({ values: [id] }, null, 2));
    showBuilderNotice(`Generated functions/tick.json with the registration for ${id}.`);
  }
  function makeTickFunction() {
    const id = functionId();
    const path = id.split(':').pop() || 'tick';
    openScratch(`functions/${path}.mcfunction`, `# Runs every tick when registered in functions/tick.json.\n# Add commands below; remove this comment before shipping if you prefer.\n`);
    showBuilderNotice(`Generated functions/${path}.mcfunction for ${id}.`);
  }
  function showBuilderNotice(message) {
    const note = document.querySelector('#toolkit-body .builder-info:last-child');
    if (note) note.textContent = message;
  }

  function renderToolTab() {
    document.querySelectorAll('[data-tool-tab]').forEach(button => {
      const selected = button.dataset.toolTab === activeToolTab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    if (activeToolTab === 'doctor') renderDoctor();
    else if (activeToolTab === 'functions') renderFunctions();
    else renderBuilder();
  }
  document.querySelectorAll('[data-tool-tab]').forEach(button => button.addEventListener('click', () => {
    activeToolTab = button.dataset.toolTab;
    renderToolTab();
  }));

  function toggleOutput() { byId('output-panel')?.classList.toggle('show'); }
  window.toggleStudioOutput = toggleOutput;
  window.openStudioToolkit = () => setSidebarView('toolkit');
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

  byId('output-clear')?.addEventListener('click', () => {
    const output = byId('output-body');
    if (output) output.innerHTML = '<div class="search-empty">output cleared.</div>';
  });
  byId('output-close')?.addEventListener('click', () => byId('output-panel')?.classList.remove('show'));

  // Initialize the new panels with useful content and live status.
  renderDoctor();
  renderSearchResults();
  updateStudioStatus();
})();
