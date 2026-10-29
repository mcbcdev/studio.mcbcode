// ================= bedrock wiki panel =================
  // pulls every .md file under /docs/ straight from GitHub and renders it client-side.
  // no backend involved: api.github.com and raw.githubusercontent.com both allow
  // cross-origin GET requests from the browser, so this is a plain fetch().
  //
  // note: the wiki's live site is generated from the "wiki" branch specifically
  // (not the repo's default branch — that's the site's source code), so the
  // branch below is hardcoded rather than looked up dynamically.
  const WIKI_OWNER = 'Bedrock-OSS';
  const WIKI_REPO = 'bedrock-wiki';
  const WIKI_BRANCH = 'wiki';
  const WIKI_DOCS_PREFIX = 'docs/';

  const wikiPanelWrap = document.getElementById('wiki-panel-wrap');
  const wikiPanel = document.getElementById('wiki-panel');
  const wikiResizer = document.getElementById('wiki-resizer');
  const wikiBodyEl = document.getElementById('wiki-body');
  const wikiSearchInput = document.getElementById('wiki-search-input');

  let wikiTree = null;            // [{ path: 'docs/blocks/foo.md' }, ...] once loaded
  let wikiTreeLoading = null;     // in-flight promise, so double-opens don't double-fetch
  const wikiContentCache = {};    // path -> raw markdown string
  let wikiCurrentPath = null;     // path currently being read, or null when showing the list

  // turns "docs/blocks/custom-components.md" into "Custom Components"
  function wikiTitleFromPath(path) {
    const base = path.slice(WIKI_DOCS_PREFIX.length).replace(/\.mdx?$/i, '');
    const name = base.split('/').pop();
    return name
      .replace(/^[0-9]+[-._]/, '') // strip a leading ordering number some wiki pages use, e.g. "01-intro"
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function wikiFolderFromPath(path) {
    const parts = path.slice(WIKI_DOCS_PREFIX.length).split('/');
    parts.pop();
    return parts.length ? parts.join(' / ') : 'General';
  }

  async function ensureWikiTreeLoaded() {
    if (wikiTree) return wikiTree;
    if (wikiTreeLoading) return wikiTreeLoading;

    wikiTreeLoading = (async () => {
      const res = await fetch(`https://api.github.com/repos/${WIKI_OWNER}/${WIKI_REPO}/git/trees/${WIKI_BRANCH}?recursive=1`);
      if (!res.ok) {
        if (res.status === 403) throw new Error("GitHub's API rate limit was hit — try again in a bit.");
        throw new Error(`GitHub returned ${res.status} while listing the wiki.`);
      }
      const data = await res.json();
      wikiTree = (data.tree || [])
        .filter(entry => entry.type === 'blob'
          && entry.path.startsWith(WIKI_DOCS_PREFIX)
          && /\.mdx?$/i.test(entry.path)
          && !entry.path.includes('/.vitepress/'))
        .map(entry => ({ path: entry.path }))
        .sort((a, b) => a.path.localeCompare(b.path));
      return wikiTree;
    })();

    try {
      return await wikiTreeLoading;
    } finally {
      wikiTreeLoading = null;
    }
  }

  function renderWikiList(filterText) {
    wikiCurrentPath = null;
    const term = (filterText || '').trim().toLowerCase();
    const matches = !wikiTree ? [] : wikiTree.filter(f => {
      if (!term) return true;
      return f.path.toLowerCase().includes(term) || wikiTitleFromPath(f.path).toLowerCase().includes(term);
    });

    if (!matches.length) {
      wikiBodyEl.innerHTML = `<div class="wiki-empty">${term ? 'No pages match that search.' : 'No pages found.'}</div>`;
      return;
    }

    let lastFolder = null;
    const html = matches.map(f => {
      const folder = wikiFolderFromPath(f.path);
      const heading = folder !== lastFolder ? `<div class="wiki-list-folder">${folder}</div>` : '';
      lastFolder = folder;
      return `${heading}<div class="wiki-list-item" data-path="${f.path}">${wikiTitleFromPath(f.path)}<span class="wiki-item-path">${f.path}</span></div>`;
    }).join('');
    wikiBodyEl.innerHTML = html;

    wikiBodyEl.querySelectorAll('.wiki-list-item').forEach(row => {
      row.addEventListener('click', () => openWikiDoc(row.dataset.path));
    });
  }

  function wikiStripFrontmatter(md) {
    if (!md.startsWith('---')) return { title: null, body: md };
    const end = md.indexOf('\n---', 3);
    if (end === -1) return { title: null, body: md };
    const raw = md.slice(3, end).trim();
    const body = md.slice(end + 4).replace(/^\s*\n/, '');
    const titleMatch = raw.match(/^title:\s*(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim().replace(/^["']|["']$/g, '') : null;
    return { title, body };
  }

  // best-effort relative-path resolver — this repo doesn't publish its site's routing
  // config, so links that don't cleanly map onto a known file just fall through and
  // open the live wiki.bedrock.dev site instead of a dead link.
  function wikiResolvePath(basePath, relativeHref) {
    const baseDir = basePath.split('/').slice(0, -1);
    const stack = baseDir.slice();
    relativeHref.split('/').forEach(part => {
      if (!part || part === '.') return;
      if (part === '..') stack.pop();
      else stack.push(part);
    });
    return stack.join('/');
  }

  function wikiFindKnownFile(candidatePath) {
    if (!wikiTree) return null;
    const tries = [candidatePath, candidatePath + '.md', candidatePath + '/index.md', candidatePath + '.mdx'];
    for (const t of tries) {
      const hit = wikiTree.find(f => f.path.toLowerCase() === t.toLowerCase());
      if (hit) return hit.path;
    }
    return null;
  }

  async function openWikiDoc(path) {
    wikiCurrentPath = path;
    wikiBodyEl.innerHTML = '<div class="wiki-loading">loading page...</div>';

    try {
      let md = wikiContentCache[path];
      if (!md) {
        const res = await fetch(`https://raw.githubusercontent.com/${WIKI_OWNER}/${WIKI_REPO}/${WIKI_BRANCH}/${path}`);
        if (!res.ok) throw new Error(`GitHub returned ${res.status} for that page.`);
        md = await res.text();
        wikiContentCache[path] = md;
      }

      const { title, body } = wikiStripFrontmatter(md);
      const rawHtml = marked.parse(body);
      const safeHtml = window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml;

      wikiBodyEl.innerHTML = `
        <div id="wiki-doc-toolbar">
          <button id="wiki-back-btn">&larr; Back</button>
          <span id="wiki-doc-title">${title || wikiTitleFromPath(path)}</span>
        </div>
        <div id="wiki-doc-content"><div class="wiki-markdown-body">${safeHtml}</div></div>
      `;
      document.getElementById('wiki-back-btn').addEventListener('click', () => renderWikiList(wikiSearchInput.value));

      const contentEl = wikiBodyEl.querySelector('.wiki-markdown-body');

      // rewrite relative images so they actually load, and try to route relative
      // doc links to another in-panel page instead of a dead link
      contentEl.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        if (src && !/^https?:\/\//i.test(src)) {
          const resolved = wikiResolvePath(path, src);
          img.src = `https://raw.githubusercontent.com/${WIKI_OWNER}/${WIKI_REPO}/${WIKI_BRANCH}/${resolved}`;
        }
      });

      contentEl.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href');
        if (!href || /^https?:\/\//i.test(href) || href.startsWith('#') || href.startsWith('mailto:')) {
          if (href && /^https?:\/\//i.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
          return;
        }
        const [rawPath] = href.split('#');
        const candidate = rawPath.startsWith('/') ? WIKI_DOCS_PREFIX.slice(0, -1) + rawPath : wikiResolvePath(path, rawPath);
        const known = wikiFindKnownFile(candidate);
        if (known) {
          a.href = 'javascript:void(0)';
          a.addEventListener('click', (e) => { e.preventDefault(); openWikiDoc(known); });
        } else {
          // couldn't map it onto a known repo file — send it to the live site instead of leaving a dead link
          a.href = `https://wiki.bedrock.dev/${rawPath.replace(/^\//, '')}`;
          a.target = '_blank';
          a.rel = 'noopener';
        }
      });
    } catch (e) {
      wikiBodyEl.innerHTML = `<div class="wiki-error">${e.message}</div>`;
    }
  }

  async function openWikiPanel() {
    wikiPanelWrap.classList.add('show');
    if (wikiTree) {
      renderWikiList(wikiSearchInput.value);
      return;
    }
    wikiBodyEl.innerHTML = '<div class="wiki-loading">loading the wiki file list...</div>';
    try {
      await ensureWikiTreeLoaded();
      renderWikiList(wikiSearchInput.value);
    } catch (e) {
      wikiBodyEl.innerHTML = `<div class="wiki-error">${e.message}</div>`;
    }
  }

  function closeWikiPanel() {
    wikiPanelWrap.classList.remove('show');
  }

  function toggleWikiPanel() {
    if (wikiPanelWrap.classList.contains('show')) closeWikiPanel();
    else openWikiPanel();
  }

  document.getElementById('activity-wiki-icon').addEventListener('click', toggleWikiPanel);
  document.querySelector('[data-action="toggle-wiki"]').addEventListener('click', toggleWikiPanel);
  document.getElementById('wiki-close').addEventListener('click', closeWikiPanel);
  wikiSearchInput.addEventListener('input', () => {
    if (wikiCurrentPath) return; // typing while reading a page shouldn't jump you back to the list
    renderWikiList(wikiSearchInput.value);
  });

  // resizing, mirrors the sidebar resizer but dragging left grows the panel (it's on the right edge)
  const WIKI_MIN = 240;
  const WIKI_MAX = 640;
  let isDraggingWiki = false;

  wikiResizer.addEventListener('mousedown', () => {
    isDraggingWiki = true;
    wikiResizer.classList.add('dragging');
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDraggingWiki) return;
    const newWidth = Math.max(WIKI_MIN, Math.min(WIKI_MAX, wikiPanelWrap.getBoundingClientRect().right - e.clientX));
    wikiPanel.style.width = newWidth + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!isDraggingWiki) return;
    isDraggingWiki = false;
    wikiResizer.classList.remove('dragging');
    document.body.style.userSelect = '';
  });
