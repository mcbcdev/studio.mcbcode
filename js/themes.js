// ================= custom theme system =================
  // every color the whole UI uses, matched to the :root defaults declared in <style>.
  // saved to localStorage so it persists across visits, per-browser (not per-account).
  const THEME_VARS = [
    { key: '--accent',        label: 'Accent',              default: '#05ee93' },
    { key: '--accent-dim',    label: 'Accent (dim/hover)',  default: '#04b874' },
    { key: '--bg-0',          label: 'Activity bar bg',     default: '#141414' },
    { key: '--bg-1',          label: 'Sidebar bg',          default: '#181818' },
    { key: '--bg-2',          label: 'Tab bar / menu bg',   default: '#1b1b1b' },
    { key: '--bg-3',          label: 'Editor bg',           default: '#1e1e1e' },
    { key: '--bg-4',          label: 'Modal bg',            default: '#202020' },
    { key: '--bg-5',          label: 'Active tab bg',       default: '#232323' },
    { key: '--bg-6',          label: 'Hover bg',            default: '#2a2a2a' },
    { key: '--bg-7',          label: 'Active file/tab bg',  default: '#2e2e2e' },
    { key: '--border',        label: 'Border',              default: '#2a2a2a' },
    { key: '--border-strong', label: 'Border (strong)',     default: '#3a3a3a' },
    { key: '--text-main',     label: 'Main text',           default: '#ffffff' },
    { key: '--text-sub',      label: 'Subtext',             default: '#bebebe' },
    { key: '--text-body',     label: 'Editor text',         default: '#d4d4d4' },
    { key: '--text-dim',      label: 'Dim text',            default: '#999999' },
    { key: '--text-muted',    label: 'Muted text',          default: '#888888' },
    { key: '--text-tab',      label: 'Tab/sidebar text',    default: '#aaaaaa' },
  ];

  // separate list so the modal can show a "Syntax Colors" section header before these
  const SYNTAX_VARS = [
    { key: '--syn-keyword',  label: 'Keywords (if, const...)', default: '#ff9900' },
    { key: '--syn-string',   label: 'Strings',                  default: '#05ee93' },
    { key: '--syn-number',   label: 'Numbers',                  default: '#6d9cf6' },
    { key: '--syn-comment',  label: 'Comments',                 default: '#6d6d6d' },
    { key: '--syn-variable', label: 'Variables',                default: '#d4d4d4' },
    { key: '--syn-def',      label: 'Function/var names',       default: '#6d9cf6' },
    { key: '--syn-property', label: 'Object properties',        default: '#c2f66d' },
    { key: '--syn-atom',     label: 'true/false/null',          default: '#ff00d0' },
    { key: '--syn-operator', label: 'Operators (+ - = etc)',    default: '#d4d4d4' },
    { key: '--syn-tag',      label: 'Tags (JSON/XML)',          default: '#ff9900' },
  ];

  const THEME_STORAGE_KEY = 'mcbcode_theme_vars';
  const THEME_CSS_STORAGE_KEY = 'mcbcode_custom_css';

  function applyThemeVars(varsObj) {
    [...THEME_VARS, ...SYNTAX_VARS].forEach(v => {
      if (varsObj[v.key]) document.documentElement.style.setProperty(v.key, varsObj[v.key]);
    });
  }

  function applyCustomCss(cssText) {
    let styleTag = document.getElementById('custom-theme-css');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'custom-theme-css';
      document.head.appendChild(styleTag); // appended last, so it wins over the base stylesheet
    }
    styleTag.textContent = cssText || '';
  }

  // runs once on page load, before the theme modal even exists, so a saved
  // theme is visible immediately instead of flashing default colors first
  function loadSavedThemeOnStartup() {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved) applyThemeVars(JSON.parse(saved));
    } catch {}
    try {
      const savedCss = localStorage.getItem(THEME_CSS_STORAGE_KEY);
      if (savedCss) applyCustomCss(savedCss);
    } catch {}
  }
  loadSavedThemeOnStartup();

  const themeOverlay = document.getElementById('theme-overlay');
  const themeGrid = document.getElementById('theme-grid');
  let pendingCustomCss = null; // holds an uploaded css file's text until Apply/Save is clicked

  function buildThemeGrid() {
    themeGrid.innerHTML = '';
    function addSectionLabel(text) {
      const el = document.createElement('div');
      el.className = 'theme-section-label';
      el.textContent = text;
      el.style.gridColumn = '1 / -1';
      themeGrid.appendChild(el);
    }
    function addRow(v) {
      const current = getComputedStyle(document.documentElement).getPropertyValue(v.key).trim() || v.default;
      const label = document.createElement('div');
      label.className = 'theme-row-label';
      label.innerHTML = `${v.label}<span class="var-name">${v.key}</span>`;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = current.length === 7 ? current : v.default; // <input type=color> needs #rrggbb
      input.dataset.varKey = v.key;
      themeGrid.appendChild(label);
      themeGrid.appendChild(input);
    }
    addSectionLabel('Editor Syntax Colors');
    SYNTAX_VARS.forEach(addRow);
    addSectionLabel('Interface Colors');
    THEME_VARS.forEach(addRow);
  }

  function openThemeModal() {
    buildThemeGrid();
    document.getElementById('theme-css-filename').textContent = '';
    pendingCustomCss = null;
    themeOverlay.classList.add('show');
  }
  document.getElementById('theme-close').addEventListener('click', () => {
    themeOverlay.classList.remove('show');
  });

  function collectThemeInputVars() {
    const obj = {};
    themeGrid.querySelectorAll('input[type="color"]').forEach(input => {
      obj[input.dataset.varKey] = input.value;
    });
    return obj;
  }

  document.getElementById('theme-apply').addEventListener('click', () => {
    applyThemeVars(collectThemeInputVars());
    if (pendingCustomCss !== null) applyCustomCss(pendingCustomCss);
  });

  document.getElementById('theme-save').addEventListener('click', () => {
    const vars = collectThemeInputVars();
    applyThemeVars(vars);
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(vars));
    if (pendingCustomCss !== null) {
      applyCustomCss(pendingCustomCss);
      localStorage.setItem(THEME_CSS_STORAGE_KEY, pendingCustomCss);
    }
    themeOverlay.classList.remove('show');
  });

  document.getElementById('theme-reset').addEventListener('click', () => {
    [...THEME_VARS, ...SYNTAX_VARS].forEach(v => document.documentElement.style.removeProperty(v.key));
    applyCustomCss('');
    localStorage.removeItem(THEME_STORAGE_KEY);
    localStorage.removeItem(THEME_CSS_STORAGE_KEY);
    pendingCustomCss = null;
    document.getElementById('theme-css-filename').textContent = '';
    buildThemeGrid();
  });

  document.getElementById('theme-css-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingCustomCss = reader.result;
      document.getElementById('theme-css-filename').textContent = `loaded: ${file.name} (click Apply or Save to use it)`;
    };
    reader.readAsText(file);
  });

  // ================= theme guide/help popup =================
  const themeGuideOverlay = document.getElementById('theme-guide-overlay');
  const themeGuideCode = document.getElementById('theme-guide-code');

  document.getElementById('theme-help-btn').addEventListener('click', () => {
    themeGuideCode.textContent = ':root {\n' +
      THEME_VARS.map(v => `  ${v.key}: ${v.default};  /* ${v.label} */`).join('\n') +
      '\n}';
    themeGuideOverlay.classList.add('show');
  });
  document.getElementById('theme-guide-close').addEventListener('click', () => {
    themeGuideOverlay.classList.remove('show');
  });
  document.getElementById('theme-guide-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(themeGuideCode.textContent).then(() => {
      const btn = document.getElementById('theme-guide-copy');
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    });
  });
