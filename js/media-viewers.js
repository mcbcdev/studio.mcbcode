// ================= image and sound viewers =================
const mediaViewers = Object.create(null);
const MEDIA_FILE_LIMIT = 100 * 1024 * 1024;

function mediaKindForFilename(filename) {
  const extension = String(filename || '').split('.').pop().toLowerCase();
  if (extension === 'png' || extension === 'tga') return 'image';
  if (extension === 'ogg' || extension === 'fsb') return 'audio';
  return null;
}

function openMediaTab(id, label, kind, input, sourceLabel = 'local file') {
  if (!kind || !['image', 'audio'].includes(kind)) {
    alert('file type unsupported');
    return;
  }

  let tab = document.querySelector(`.tab[data-tab="${id}"]`);
  if (tab) {
    activateTab(id);
    return;
  }

  tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.tab = id;
  tab.innerHTML = '<span class="dirty-dot"></span><span class="tab-label"></span><span class="close-btn"></span>';
  tab.querySelector('.tab-label').textContent = label;
  tab.querySelector('.close-btn').textContent = '×';
  tab.querySelector('.close-btn').dataset.close = id;
  tabBar.appendChild(tab);

  const panel = document.createElement('div');
  panel.className = 'code-panel media-code-panel';
  panel.dataset.panel = id;

  const status = document.createElement('div');
  status.className = 'code-status show';
  status.innerHTML = '<span class="save-state-dot"></span><span class="media-source-label"></span>';
  status.querySelector('.save-state-dot').style.background = 'var(--accent)';
  status.querySelector('.media-source-label').textContent = `${sourceLabel} · preview only`;
  panel.appendChild(status);

  const viewer = document.createElement('section');
  viewer.className = 'media-viewer';
  viewer.setAttribute('aria-label', kind === 'image' ? 'Image viewer' : 'Sound effect viewer');
  panel.appendChild(viewer);
  codeArea.appendChild(panel);

  mediaViewers[id] = { urls: [], audio: null, projectFileId: null, projectCode: null, archiveFileId: null };
  attachTabEvents(tab);
  attachCloseEvent(tab.querySelector('.close-btn'));
  attachRenameEvent(tab.querySelector('.tab-label'), id);

  const mediaBlob = input instanceof Blob ? input : new Blob([input]);
  if (mediaBlob.size > MEDIA_FILE_LIMIT) {
    showMediaError(viewer, 'This file is over 100 MB and was not opened to protect browser memory.');
    activateTab(id);
    return;
  }

  if (kind === 'image') renderImageViewer(viewer, label, mediaBlob, id);
  else renderSoundViewer(viewer, label, mediaBlob, id);
  activateTab(id);
}

function disposeMediaTab(id) {
  const state = mediaViewers[id];
  if (!state) return;
  if (state.audio) {
    state.audio.pause();
    state.audio.removeAttribute('src');
    state.audio.load();
  }
  state.urls.forEach(url => URL.revokeObjectURL(url));
  delete mediaViewers[id];
}

function addMediaUrl(id, blob) {
  const url = URL.createObjectURL(blob);
  mediaViewers[id].urls.push(url);
  return url;
}

function makeMediaToolbar(title, detail) {
  const toolbar = document.createElement('div');
  toolbar.className = 'media-toolbar';
  const titleEl = document.createElement('span');
  titleEl.className = 'media-toolbar-title';
  titleEl.textContent = title;
  const detailEl = document.createElement('span');
  detailEl.className = 'media-toolbar-detail';
  detailEl.textContent = detail;
  toolbar.append(titleEl, detailEl);
  return toolbar;
}

function showMediaError(container, message) {
  const error = document.createElement('div');
  error.className = 'media-message media-error';
  error.setAttribute('role', 'status');
  error.textContent = message;
  container.appendChild(error);
}

function renderImageViewer(viewer, filename, blob, id) {
  const toolbar = makeMediaToolbar(filename, 'loading image…');
  const detail = toolbar.querySelector('.media-toolbar-detail');
  const stage = document.createElement('div');
  stage.className = 'media-image-stage';
  stage.setAttribute('role', 'region');
  stage.setAttribute('aria-label', 'Image preview');
  const controls = document.createElement('div');
  controls.className = 'media-image-controls';
  controls.setAttribute('aria-label', 'Image zoom controls');
  const zoomOut = document.createElement('button');
  zoomOut.type = 'button';
  zoomOut.textContent = '−';
  zoomOut.title = 'Zoom out';
  zoomOut.setAttribute('aria-label', 'Zoom out');
  const zoomLabel = document.createElement('span');
  zoomLabel.textContent = 'fit';
  zoomLabel.setAttribute('aria-live', 'polite');
  const zoomIn = document.createElement('button');
  zoomIn.type = 'button';
  zoomIn.textContent = '+';
  zoomIn.title = 'Zoom in';
  zoomIn.setAttribute('aria-label', 'Zoom in');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Fit';
  reset.title = 'Fit image to viewer';
  controls.append(zoomOut, zoomLabel, zoomIn, reset);
  viewer.append(toolbar, stage, controls);

  const extension = filename.split('.').pop().toLowerCase();
  const url = addMediaUrl(id, blob);
  const drawImage = (element, width, height) => {
    stage.replaceChildren(element);
    let scale = 1;
    const applyScale = () => {
      const fit = Math.min((stage.clientWidth - 48) / width, (stage.clientHeight - 48) / height, 1);
      const actual = Math.max(0.05, Math.min(8, fit * scale));
      element.style.width = `${Math.max(1, Math.round(width * actual))}px`;
      element.style.height = `${Math.max(1, Math.round(height * actual))}px`;
      zoomLabel.textContent = `${Math.round(actual * 100)}%`;
    };
    const fitImage = () => { scale = 1; applyScale(); };
    zoomIn.addEventListener('click', () => { scale = Math.min(scale * 1.25, 8); applyScale(); });
    zoomOut.addEventListener('click', () => { scale = Math.max(scale / 1.25, 0.05); applyScale(); });
    reset.addEventListener('click', fitImage);
    new ResizeObserver(fitImage).observe(stage);
    detail.textContent = `${width} × ${height} · ${extension.toUpperCase()}`;
    requestAnimationFrame(fitImage);
  };

  if (extension === 'png') {
    const image = new Image();
    image.alt = filename;
    image.onload = () => drawImage(image, image.naturalWidth, image.naturalHeight);
    image.onerror = () => showMediaError(stage, 'This PNG could not be decoded by the browser.');
    image.src = url;
    return;
  }

  blob.arrayBuffer().then(buffer => {
    const decoded = decodeTga(buffer);
    const canvas = document.createElement('canvas');
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const context = canvas.getContext('2d', { alpha: true });
    context.putImageData(new ImageData(decoded.pixels, decoded.width, decoded.height), 0, 0);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', filename);
    drawImage(canvas, decoded.width, decoded.height);
  }).catch(error => {
    detail.textContent = 'TGA';
    showMediaError(stage, error.message || 'This TGA image could not be decoded.');
  });
}

function decodeTga(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 18) throw new Error('This TGA file is too short to contain a valid header.');
  const view = new DataView(buffer);
  const idLength = bytes[0];
  const colorMapType = bytes[1];
  const imageType = bytes[2];
  const colorMapOrigin = view.getUint16(3, true);
  const colorMapLength = view.getUint16(5, true);
  const colorMapDepth = bytes[7];
  const width = view.getUint16(12, true);
  const height = view.getUint16(14, true);
  const pixelDepth = bytes[16];
  const descriptor = bytes[17];
  const isMapped = imageType === 1 || imageType === 9;
  const isTrueColor = imageType === 2 || imageType === 10;
  const isGray = imageType === 3 || imageType === 11;
  const isRle = imageType === 9 || imageType === 10 || imageType === 11;
  if (!width || !height || width * height > 16000000) throw new Error('This TGA has invalid or excessively large dimensions.');
  if (!(isMapped || isTrueColor || isGray)) throw new Error(`TGA image type ${imageType} is not supported.`);
  if (isMapped && colorMapType !== 1) throw new Error('This color-mapped TGA is missing its color map.');
  if (!isMapped && colorMapType !== 0) throw new Error('This TGA color-map layout is not supported.');
  if (isTrueColor && ![15, 16, 24, 32].includes(pixelDepth)) throw new Error(`TGA ${pixelDepth}-bit color is not supported.`);
  if (isGray && ![8, 16].includes(pixelDepth)) throw new Error(`TGA ${pixelDepth}-bit grayscale is not supported.`);
  if (isMapped && ![8, 16].includes(pixelDepth)) throw new Error(`TGA ${pixelDepth}-bit palette indices are not supported.`);
  if (isMapped && ![15, 16, 24, 32].includes(colorMapDepth)) throw new Error(`TGA ${colorMapDepth}-bit palette colors are not supported.`);

  let cursor = 18 + idLength;
  const palette = [];
  const colorBytes = Math.ceil(colorMapDepth / 8);
  if (isMapped) {
    if (cursor + colorMapLength * colorBytes > bytes.length) throw new Error('This TGA color map is incomplete.');
    for (let i = 0; i < colorMapLength; i++) {
      palette.push(readTgaColor(bytes, cursor, colorMapDepth, view, false));
      cursor += colorBytes;
    }
  }

  const sourcePixelBytes = Math.ceil(pixelDepth / 8);
  const totalPixels = width * height;
  const rgba = new Uint8ClampedArray(totalPixels * 4);
  const readPixel = () => {
    if (cursor + sourcePixelBytes > bytes.length) throw new Error('This TGA pixel data is incomplete.');
    let color;
    if (isMapped) {
      const index = pixelDepth === 8 ? bytes[cursor] : view.getUint16(cursor, true);
      const paletteIndex = index - colorMapOrigin;
      if (paletteIndex < 0 || paletteIndex >= palette.length) throw new Error('This TGA contains a palette index outside its color map.');
      color = palette[paletteIndex];
    } else if (isGray) {
      const gray = bytes[cursor];
      color = [gray, gray, gray, pixelDepth === 16 ? bytes[cursor + 1] : 255];
    } else {
      color = readTgaColor(bytes, cursor, pixelDepth, view, !!(descriptor & 0x0f));
    }
    cursor += sourcePixelBytes;
    return color;
  };

  let sourceIndex = 0;
  while (sourceIndex < totalPixels) {
    let packetCount = 1;
    let repeated = false;
    if (isRle) {
      if (cursor >= bytes.length) throw new Error('This TGA RLE data is incomplete.');
      const packet = bytes[cursor++];
      packetCount = (packet & 0x7f) + 1;
      repeated = !!(packet & 0x80);
      if (sourceIndex + packetCount > totalPixels) throw new Error('This TGA RLE packet exceeds the image dimensions.');
    }
    const repeatedColor = repeated ? readPixel() : null;
    for (let n = 0; n < packetCount; n++) {
      const color = repeated ? repeatedColor : readPixel();
      const sourceX = sourceIndex % width;
      const sourceY = Math.floor(sourceIndex / width);
      const destX = descriptor & 0x10 ? width - 1 - sourceX : sourceX;
      const destY = descriptor & 0x20 ? sourceY : height - 1 - sourceY;
      const dest = (destY * width + destX) * 4;
      rgba[dest] = color[0];
      rgba[dest + 1] = color[1];
      rgba[dest + 2] = color[2];
      rgba[dest + 3] = color[3];
      sourceIndex++;
    }
  }
  return { width, height, pixels: rgba };
}

function readTgaColor(bytes, offset, depth, view, hasAlpha) {
  if (depth === 24 || depth === 32) {
    return [bytes[offset + 2], bytes[offset + 1], bytes[offset], depth === 32 ? bytes[offset + 3] : 255];
  }
  const packed = view.getUint16(offset, true);
  const expand5 = value => (value << 3) | (value >> 2);
  return [
    expand5((packed >> 10) & 31),
    expand5((packed >> 5) & 31),
    expand5(packed & 31),
    depth === 16 && hasAlpha ? ((packed & 0x8000) ? 255 : 0) : 255
  ];
}

function renderSoundViewer(viewer, filename, blob, id) {
  const toolbar = makeMediaToolbar(filename, `${formatBytes(blob.size)} · ${filename.split('.').pop().toUpperCase()}`);
  viewer.appendChild(toolbar);
  if (filename.split('.').pop().toLowerCase() === 'ogg') {
    renderAudioElement(viewer, blob, id, 'audio/ogg');
    return;
  }
  blob.arrayBuffer().then(buffer => {
    const bank = parseFsb(buffer);
    renderFsbBank(viewer, bank, id);
  }).catch(error => showMediaError(viewer, error.message || 'This FSB sound bank could not be read.'));
}

function parseFsb(buffer) {
  const bytes = new Uint8Array(buffer);
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  if (magic === 'FSB5') return parseFsb5(buffer);
  if (magic === 'FSB3' || magic === 'FSB4') return parseLegacyFsb(buffer, magic);
  throw new Error(`This file does not have a recognized FSB header (${magic || 'unknown data'}).`);
}

function parseLegacyFsb(buffer, magic) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const headerSize = magic === 'FSB4' ? 48 : 24;
  if (bytes.byteLength < headerSize) throw new Error(`This ${magic} file is too short to contain a valid header.`);
  const sampleCount = view.getUint32(4, true);
  const sampleHeadersSize = view.getUint32(8, true);
  const dataSize = view.getUint32(12, true);
  const bankFlags = view.getUint32(20, true);
  const sampleHeadersStart = headerSize;
  const dataStart = sampleHeadersStart + sampleHeadersSize;
  if (sampleCount > 100000 || dataStart > bytes.length || dataStart + dataSize > bytes.length) {
    throw new Error(`${magic} has inconsistent or excessive section sizes.`);
  }
  if (bankFlags & 0x04) throw new Error('This FSB bank is encrypted and cannot be previewed.');
  if (bankFlags & 0x02) throw new Error(`This ${magic} bank uses compact sample headers that are not supported yet.`);

  const samples = [];
  let headerCursor = sampleHeadersStart;
  let dataCursor = dataStart;
  const headersEnd = dataStart;
  for (let index = 0; index < sampleCount; index++) {
    if (headerCursor + 80 > headersEnd) throw new Error(`${magic} sample header table is incomplete.`);
    const entrySize = view.getUint16(headerCursor, true);
    if (entrySize < 80 || headerCursor + entrySize > headersEnd) {
      throw new Error(`${magic} contains an invalid sample-header size.`);
    }
    const nameBytes = bytes.subarray(headerCursor + 2, headerCursor + 32);
    const zeroAt = nameBytes.indexOf(0);
    const name = new TextDecoder('utf-8').decode(nameBytes.subarray(0, zeroAt < 0 ? nameBytes.length : zeroAt)).trim();
    const sampleFrames = view.getUint32(headerCursor + 32, true);
    const compressedSize = view.getUint32(headerCursor + 36, true);
    const mode = view.getUint32(headerCursor + 48, true);
    const frequencyValue = view.getInt32(headerCursor + 52, true);
    const channelCount = view.getUint16(headerCursor + 60, true);
    const channels = channelCount || (mode & 0x40 ? 2 : 1);
    let format = 0;
    if (mode & 0x08000000) format = 15;
    else if (mode & (0x10000000 | 0x00040000 | 0x00000200)) format = 11;
    else if (mode & 0x00200000) format = 4;
    else if (mode & 0x10) format = 2;
    else if (mode & 0x08) format = 1;
    if (dataCursor + compressedSize > dataStart + dataSize) {
      throw new Error(`${magic} sample data exceeds its declared data section.`);
    }
    samples.push({
      index,
      name: name || `${String(index + 1).padStart(2, '0')} sample`,
      channels,
      frequency: frequencyValue > 0 ? frequencyValue : 0,
      sampleFrames,
      data: bytes.slice(dataCursor, dataCursor + compressedSize),
      format
    });
    headerCursor += entrySize;
    dataCursor += compressedSize;
  }
  return { version: magic, sampleCount, soundFormat: 0, formatLabel: magic, samples };
}

function parseFsb5(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 60) throw new Error('This FSB file is too short to contain a valid header.');
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  if (magic !== 'FSB5') throw new Error(`This viewer supports FSB5 banks; this file starts with ${magic || 'unknown data'}.`);
  const version = view.getUint32(4, true);
  const sampleCount = view.getUint32(8, true);
  const sampleHeadersSize = view.getUint32(12, true);
  const nameTableSize = view.getUint32(16, true);
  const dataSize = view.getUint32(20, true);
  const soundFormat = view.getUint32(24, true) & 0x3f;
  const headerSize = version === 0 ? 64 : 60;
  const sampleHeadersStart = headerSize;
  const namesStart = sampleHeadersStart + sampleHeadersSize;
  const dataStart = namesStart + nameTableSize;
  if (sampleCount > 100000 || namesStart > bytes.length || dataStart > bytes.length || dataStart + dataSize > bytes.length) {
    throw new Error('This FSB5 bank has inconsistent or excessive section sizes.');
  }
  const sampleRecords = [];
  let cursor = sampleHeadersStart;
  const headersEnd = namesStart;
  for (let i = 0; i < sampleCount; i++) {
    if (cursor + 8 > headersEnd) throw new Error('This FSB5 sample header table is incomplete.');
    const raw = view.getBigUint64(cursor, true);
    cursor += 8;
    const nextChunk = Number(raw & 1n);
    const frequencyCode = Number((raw >> 1n) & 15n);
    const channels = Number((raw >> 5n) & 1n) + 1;
    const dataOffset = Number((raw >> 6n) & 0x0fffffffn) * 16;
    const sampleFrames = Number((raw >> 34n) & 0x3fffffffn);
    const metadata = Object.create(null);
    let hasNext = nextChunk;
    while (hasNext) {
      if (cursor + 4 > headersEnd) throw new Error('This FSB5 metadata table is incomplete.');
      const chunk = view.getUint32(cursor, true);
      cursor += 4;
      hasNext = chunk & 1;
      const chunkSize = (chunk >>> 1) & 0xffffff;
      const chunkType = (chunk >>> 25) & 0x7f;
      if (cursor + chunkSize > headersEnd) throw new Error('This FSB5 metadata chunk is incomplete.');
      if (chunkType === 2 && chunkSize >= 4) metadata.frequency = view.getUint32(cursor, true);
      if (chunkType === 11 && chunkSize >= 4) metadata.vorbisCrc = view.getUint32(cursor, true);
      cursor += chunkSize;
    }
    const frequencyTable = { 1: 8000, 2: 11000, 3: 11025, 4: 16000, 5: 22050, 6: 24000, 7: 32000, 8: 44100, 9: 48000 };
    sampleRecords.push({
      index: i,
      name: `${String(i + 1).padStart(2, '0')} sample`,
      channels,
      frequency: metadata.frequency || frequencyTable[frequencyCode] || 0,
      dataOffset,
      sampleFrames,
      metadata
    });
  }
  if (cursor > headersEnd) throw new Error('This FSB5 sample headers exceed their declared section size.');

  const nameEnd = dataStart - nameTableSize;
  if (nameTableSize >= sampleCount * 4) {
    for (let i = 0; i < sampleCount; i++) {
      const nameOffset = view.getUint32(nameEnd + i * 4, true);
      const start = nameEnd + nameOffset;
      if (start < nameEnd + sampleCount * 4 || start >= dataStart) continue;
      let end = start;
      while (end < dataStart && bytes[end] !== 0) end++;
      const candidate = new TextDecoder('utf-8').decode(bytes.subarray(start, end)).trim();
      if (candidate) sampleRecords[i].name = candidate;
    }
  }

  const sortedOffsets = [...new Set(sampleRecords.map(sample => sample.dataOffset))].sort((a, b) => a - b);
  sampleRecords.forEach(sample => {
    const nextOffset = sortedOffsets.find(offset => offset > sample.dataOffset);
    const end = nextOffset === undefined ? dataSize : nextOffset;
    const start = Math.min(sample.dataOffset, dataSize);
    const boundedEnd = Math.max(start, Math.min(end, dataSize));
    sample.data = bytes.slice(dataStart + start, dataStart + boundedEnd);
  });
  return { version, sampleCount, soundFormat, dataSize, samples: sampleRecords };
}

function renderFsbBank(viewer, bank, id) {
  const meta = document.createElement('div');
  meta.className = 'media-bank-meta';
  const codecSummary = bank.formatLabel || fsbFormatName(bank.soundFormat);
  meta.textContent = `${codecSummary} · ${bank.sampleCount} sample${bank.sampleCount === 1 ? '' : 's'}${bank.formatLabel ? '' : ` · ${fsbFormatName(bank.soundFormat)}`}`;
  viewer.appendChild(meta);
  const sampleList = document.createElement('div');
  sampleList.className = 'media-sample-list';
  const playerWrap = document.createElement('div');
  playerWrap.className = 'media-audio-wrap';
  viewer.append(sampleList, playerWrap);
  if (!bank.samples.length) {
    showMediaError(sampleList, 'This FSB5 bank does not contain any samples.');
    return;
  }
  bank.samples.forEach((sample, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'media-sample-row';
    const name = document.createElement('span');
    name.className = 'media-sample-name';
    name.textContent = sample.name;
    const detail = document.createElement('span');
    detail.className = 'media-sample-detail';
    detail.textContent = `${sample.frequency || 'unknown'} Hz · ${sample.channels} ch · ${formatBytes(sample.data.length)}`;
    button.append(name, detail);
    button.addEventListener('click', () => {
      sampleList.querySelectorAll('.media-sample-row').forEach(row => row.classList.remove('active'));
      button.classList.add('active');
      playFsbSample(playerWrap, sample, bank.soundFormat, id);
    });
    sampleList.appendChild(button);
    if (index === 0) button.click();
  });
}

function fsbFormatName(format) {
  return ({ 0: 'unknown codec', 1: 'PCM8', 2: 'PCM16', 3: 'PCM24', 4: 'PCM32', 5: 'PCM float', 11: 'MPEG', 15: 'Vorbis' })[format] || `codec ${format}`;
}

function playFsbSample(container, sample, format, id) {
  container.replaceChildren();
  let audioBlob;
  if ([1, 2, 3, 4, 5].includes(format)) {
    if (!sample.frequency) {
      showMediaError(container, 'This sample has no valid sample rate and cannot be played.');
      return;
    }
    const bits = ({ 1: 8, 2: 16, 3: 24, 4: 32, 5: 32 })[format];
    audioBlob = new Blob([makeWav(sample.data, sample.frequency, sample.channels, bits, format === 5)], { type: 'audio/wav' });
  } else if (format === 11) {
    audioBlob = new Blob([sample.data], { type: 'audio/mpeg' });
  } else if (format === 15 && startsWithBytes(sample.data, [79, 103, 103, 83])) {
    audioBlob = new Blob([sample.data], { type: 'audio/ogg' });
  } else {
    showMediaError(container, format === 15
      ? 'This Vorbis sample uses FMOD-specific stream headers that cannot be rebuilt by the browser viewer.'
      : `${fsbFormatName(format)} playback is not supported by this viewer.`);
    return;
  }
  renderAudioElement(container, audioBlob, id, audioBlob.type);
}

function makeWav(pcm, sampleRate, channels, bits, floatSamples) {
  const bytesPerSample = bits / 8;
  const blockAlign = channels * bytesPerSample;
  const dataSize = pcm.byteLength - (pcm.byteLength % blockAlign);
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, floatSamples ? 3 : 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, bits, true); write(36, 'data'); view.setUint32(40, dataSize, true);
  return new Blob([header, pcm.subarray ? pcm.subarray(0, dataSize) : pcm.slice(0, dataSize)]);
}

function startsWithBytes(bytes, prefix) {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function renderAudioElement(container, blob, id, type) {
  const audio = document.createElement('audio');
  audio.className = 'media-audio';
  audio.controls = true;
  audio.preload = 'metadata';
  audio.setAttribute('aria-label', 'Audio playback controls');
  const url = addMediaUrl(id, blob);
  audio.src = url;
  mediaViewers[id].audio = audio;
  const detail = container.closest('.media-viewer')?.querySelector('.media-toolbar-detail');
  audio.addEventListener('loadedmetadata', () => {
    if (detail && Number.isFinite(audio.duration)) detail.textContent += ` · ${formatDuration(audio.duration)}`;
  }, { once: true });
  audio.addEventListener('error', () => showMediaError(container, `The browser could not decode this ${type.replace('audio/', '').toUpperCase()} audio stream.`), { once: true });
  container.appendChild(audio);
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

async function openCloudMediaFile(file, projectCode) {
  const kind = mediaKindForFilename(file.name);
  if (!kind) {
    alert('file type unsupported');
    return;
  }
  const urlValue = file.download_url || file.asset_url || file.r2_url || file.file_url || file.url;
  if (!urlValue) {
    alert('This binary asset does not include a preview URL in the project file list.');
    return;
  }
  let url;
  try {
    url = new URL(urlValue, 'https://auth.mcbcode.com');
    if (url.protocol !== 'https:') throw new Error('Only secure asset URLs can be previewed.');
    const response = await fetch(url.href, { credentials: url.origin === location.origin ? 'include' : 'omit' });
    if (!response.ok) throw new Error(`Asset request failed (${response.status}).`);
    const blob = await response.blob();
    const id = `cloud_asset_${projectCode || 'project'}_${file.id}`;
    openMediaTab(id, file.name, kind, blob, 'cloud project asset');
    if (mediaViewers[id]) {
      mediaViewers[id].projectFileId = String(file.id);
      mediaViewers[id].projectCode = projectCode || null;
    }
    if (typeof setActiveTreeFileByTabId === 'function') setActiveTreeFileByTabId(id);
    return id;
  } catch (error) {
    alert(`Couldn't preview that asset: ${error.message}`);
  }
}
