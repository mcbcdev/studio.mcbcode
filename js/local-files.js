// Local files and Bedrock pack archives.
// Pack archives are opened entirely in the browser and remain local to this session.
const localFileInput = document.getElementById('local-file-input');
const packFileInput = document.getElementById('pack-file-input');
let latestArchiveWorkspace = null;
let archiveWorkspaceCounter = 0;
const archiveWorkspaces = new Set();

// Open one standalone text file, as before.
document.getElementById('btn-open-local').addEventListener('click', () => {
  localFileInput.click();
});

localFileInput.addEventListener('change', () => {
  const file = localFileInput.files[0];
  if (!file) return;
  const id = nextDynamicId();
  const mediaKind = mediaKindForFilename(file.name);
  if (mediaKind) {
    openMediaTab(id, file.name, mediaKind, file, 'local file');
    document.getElementById('openfile-overlay').classList.remove('show');
    localFileInput.value = '';
    return;
  }
  if (!/\.(js|mcfunction|txt|json|md)$/i.test(file.name)) {
    alert('file type unsupported');
    localFileInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    openTab(id, file.name, reader.result);
    document.getElementById('openfile-overlay').classList.remove('show');
  };
  reader.onerror = () => alert(`Couldn't read ${file.name}.`);
  reader.readAsText(file);
  localFileInput.value = '';
});

// Pick a .mcpack or .mcaddon archive for a temporary, browser-only workspace.
document.getElementById('btn-open-pack').addEventListener('click', () => {
  packFileInput.value = '';
  packFileInput.click();
});

packFileInput.addEventListener('change', async () => {
  const file = packFileInput.files[0];
  if (!file) return;
  if (typeof JSZip === 'undefined') {
    alert('The archive reader did not load. Check your connection and reload the studio.');
    return;
  }
  const extension = file.name.split('.').pop().toLowerCase();
  if (!['mcpack', 'mcaddon'].includes(extension)) {
    alert('Choose a .mcpack or .mcaddon file.');
    return;
  }
  if (file.size > 200 * 1024 * 1024) {
    alert('This archive is over 200 MB. Try a smaller pack to avoid running out of browser memory.');
    return;
  }
  if ([...archiveWorkspaces].some(workspace => workspace.hasChanges)) {
    alert('Export your edited pack before opening another archive.');
    return;
  }

  const button = document.getElementById('btn-open-pack');
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Opening pack...';
  try {
    const workspace = await loadArchiveWorkspace(file, extension);
    archiveWorkspaces.add(workspace);
    latestArchiveWorkspace = workspace;
    currentProject = {
      name: file.name.replace(/\.(mcpack|mcaddon)$/i, ''),
      files: workspace.files,
      localArchive: true,
      workspace
    };
    window.studioSyncBedrockProfile?.();
    collapsedFolders.clear();
    renderSidebarTree();
    document.getElementById('openfile-overlay').classList.remove('show');
    document.getElementById('export-pack-action').style.display = '';

    const manifest = workspace.files.find(entry => entry.type === 'file' && entry.name.toLowerCase() === 'manifest.json');
    const firstTextFile = workspace.files.find(entry => entry.type === 'file' && isTextPackFile(entry.name));
    const firstFile = manifest || firstTextFile;
    if (firstFile) await openLocalArchiveFile(firstFile);
  } catch (error) {
    console.error('Pack import failed:', error);
    alert(`Couldn't open that pack: ${error.message || 'the archive may be damaged or unsupported.'}`);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
    packFileInput.value = '';
  }
});

function safeArchivePath(path) {
  return String(path || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(segment => segment && segment !== '.' && segment !== '..')
    .join('/');
}

async function loadArchiveWorkspace(file, extension) {
  const outerZip = await JSZip.loadAsync(file);
  const workspace = {
    id: ++archiveWorkspaceCounter,
    filename: file.name,
    extension,
    outerZip,
    nestedPacks: [],
    fileEntries: [],
    files: [],
    hasChanges: false
  };

  if (extension === 'mcpack') {
    addZipFiles(workspace, outerZip, '');
  } else {
    const nestedPackEntries = Object.values(outerZip.files)
      .filter(entry => !entry.dir && entry.name.toLowerCase().endsWith('.mcpack'));

    for (const nestedEntry of nestedPackEntries) {
      const nestedBytes = await nestedEntry.async('uint8array');
      const nestedZip = await JSZip.loadAsync(nestedBytes);
      workspace.nestedPacks.push({ path: nestedEntry.name, zip: nestedZip });
      addZipFiles(workspace, nestedZip, `${safeArchivePath(nestedEntry.name)}/`);
    }

    // Also expose any ordinary files stored directly in the .mcaddon container.
    addZipFiles(workspace, outerZip, '', entry => !entry.name.toLowerCase().endsWith('.mcpack'));
  }

  workspace.files = buildArchiveTree(workspace.fileEntries, workspace.id);
  if (!workspace.files.some(entry => entry.type === 'file')) {
    throw new Error('No files were found in the archive.');
  }
  return workspace;
}

function addZipFiles(workspace, zip, virtualPrefix, includeEntry = () => true) {
  Object.values(zip.files).forEach(entry => {
    if (entry.dir || !includeEntry(entry)) return;
    const cleanEntryPath = safeArchivePath(entry.name);
    if (!cleanEntryPath) return;
    const virtualPath = safeArchivePath(`${virtualPrefix}${cleanEntryPath}`);
    if (!virtualPath) return;
    workspace.fileEntries.push({
      virtualPath,
      zip,
      zipPath: entry.name,
      zipEntry: entry
    });
  });
}

function buildArchiveTree(fileEntries, workspaceId) {
  const nodes = [];
  const folders = new Map();
  let folderCounter = 0;

  fileEntries.forEach((entry, fileIndex) => {
    const path = safeArchivePath(entry.virtualPath);
    const segments = path.split('/');
    let parentId = null;
    let folderPath = '';

    segments.slice(0, -1).forEach(segment => {
      folderPath = folderPath ? `${folderPath}/${segment}` : segment;
      if (!folders.has(folderPath)) {
        const id = `archive-${workspaceId}-folder-${++folderCounter}`;
        folders.set(folderPath, id);
        nodes.push({ id, name: segment, type: 'folder', parent_id: parentId });
      }
      parentId = folders.get(folderPath);
    });

    nodes.push({
      id: `archive-${workspaceId}-file-${fileIndex + 1}`,
      name: segments[segments.length - 1],
      type: 'file',
      parent_id: parentId,
      virtualPath: path,
      zip: entry.zip,
      zipPath: entry.zipPath,
      zipEntry: entry.zipEntry
    });
  });
  return nodes;
}

function createStudioArchiveFile(path, content, targetPackPath) {
  if (!currentProject || !currentProject.localArchive || !currentProject.workspace) {
    return { ok: false, error: 'Open an imported pack before adding a file.' };
  }
  const workspace = currentProject.workspace;
  const cleanPath = safeArchivePath(path);
  if (!cleanPath || cleanPath.endsWith('/')) return { ok: false, error: 'Enter a valid file path.' };

  let zip = workspace.outerZip;
  let virtualPath = cleanPath;
  if (workspace.extension === 'mcaddon') {
    let nestedPack = workspace.nestedPacks.find(pack => pack.path === targetPackPath);
    if (!nestedPack && workspace.nestedPacks.length === 1) nestedPack = workspace.nestedPacks[0];
    if (!nestedPack) return { ok: false, error: 'Choose a pack inside this .mcaddon before adding files.' };
    zip = nestedPack.zip;
    virtualPath = safeArchivePath(`${nestedPack.path}/${cleanPath}`);
  }
  if (zip.file(cleanPath)) return { ok: false, error: `${cleanPath} already exists in the selected pack.` };

  zip.file(cleanPath, String(content ?? ''));
  const zipEntry = zip.file(cleanPath);
  const entry = { virtualPath, zip, zipPath: cleanPath, zipEntry };
  workspace.fileEntries.push(entry);
  const previousFiles = new Map((workspace.files || []).filter(item => item.type === 'file').map(item => [item.virtualPath, item]));
  workspace.files = buildArchiveTree(workspace.fileEntries, workspace.id).map(item => {
    const previous = item.type === 'file' ? previousFiles.get(item.virtualPath) : null;
    return previous ? Object.assign(previous, item) : item;
  });
  currentProject.files = workspace.files;
  const file = workspace.files.find(item => item.type === 'file' && item.virtualPath === virtualPath);
  window.renderStudioExplorer?.();
  window.refreshStudioSearch?.();
  return file ? { ok: true, file, path: virtualPath } : { ok: false, error: 'The file was added but could not be indexed.' };
}
window.createStudioArchiveFile = createStudioArchiveFile;

function isTextPackFile(filename) {
  return /\.(json|js|ts|mcfunction|txt|md|lang|mcmeta|xml|molang|material|properties|csv|ya?ml|geo|animation|anim|shader|fsh|vsh|h|c|cpp)$/i.test(filename);
}

async function openLocalArchiveFile(file) {
  if (file.type !== 'file' || !file.zipEntry) return;
  const mediaKind = mediaKindForFilename(file.name);
  if (!isTextPackFile(file.name) && !mediaKind) {
    alert('file type unsupported');
    return;
  }

  try {
    const bytes = await file.zipEntry.async('uint8array');
    if (mediaKind) {
      const workspace = currentProject && currentProject.localArchive
        ? currentProject.workspace
        : latestArchiveWorkspace;
      if (!workspace) return;
      const id = `archive-${workspace.id}-${file.id}`;
      openMediaTab(id, file.name, mediaKind, bytes, 'imported pack asset');
      if (mediaViewers[id]) mediaViewers[id].archiveFileId = String(file.id);
      setActiveTreeFileByTabId(id);
      return;
    }
    if (bytes.byteLength > 5 * 1024 * 1024) {
      alert(`${file.name} is over 5 MB and wasn't opened in the text editor.`);
      return;
    }
    if (bytes.includes(0)) {
      alert(`${file.name} contains binary data and can't be edited in the text editor.`);
      return;
    }
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const workspace = currentProject && currentProject.localArchive
      ? currentProject.workspace
      : latestArchiveWorkspace;
    if (!workspace) return;

    const id = `archive-${workspace.id}-${file.id}`;
    openTab(id, file.name, content, null, null, null, {
      workspace,
      fileId: file.id,
      treeFile: file,
      zip: file.zip,
      zipPath: file.zipPath
    });
    setActiveTreeFileByTabId(id);
  } catch (error) {
    alert(`Couldn't open ${file.name} as UTF-8 text.`);
  }
}

function activeArchiveWorkspace() {
  const activeTab = document.querySelector('.tab.active');
  const activeEntry = activeTab ? editors[activeTab.dataset.tab] : null;
  return (activeEntry && activeEntry.localArchiveFile && activeEntry.localArchiveFile.workspace)
    || latestArchiveWorkspace;
}

async function exportImportedPack() {
  const workspace = activeArchiveWorkspace();
  if (!workspace) {
    alert('Open a .mcpack or .mcaddon first.');
    return;
  }

  const exportButton = document.getElementById('export-pack-action');
  const originalLabel = exportButton.textContent;
  exportButton.textContent = 'Building pack...';
  exportButton.style.pointerEvents = 'none';
  try {
    // Save the latest editor contents back into their in-memory archive entries.
    Object.entries(editors).forEach(([tabId, entry]) => {
      const localFile = entry.localArchiveFile;
      if (!localFile || localFile.workspace !== workspace) return;
      localFile.zip.file(localFile.zipPath, entry.cm.getValue());
      if (localFile.treeFile) localFile.treeFile.zipEntry = localFile.zip.file(localFile.zipPath);
      markDirty(tabId, false);
    });

    for (const nestedPack of workspace.nestedPacks) {
      const nestedBytes = await nestedPack.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
      workspace.outerZip.file(nestedPack.path, nestedBytes);
    }

    const blob = await workspace.outerZip.generateAsync({
      type: 'blob',
      mimeType: 'application/zip',
      compression: 'DEFLATE'
    });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = workspace.filename.replace(/[\\/:*?"<>|]/g, '_');
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    workspace.hasChanges = false;
  } catch (error) {
    console.error('Pack export failed:', error);
    alert(`Couldn't build the pack: ${error.message || 'unknown error.'}`);
  } finally {
    exportButton.textContent = originalLabel;
    exportButton.style.pointerEvents = '';
  }
}

document.getElementById('export-pack-action').addEventListener('click', exportImportedPack);
