// Lightweight, read-only isometric preview for Bedrock geometry cubes.
(() => {
  const modelColor = name => {
    let hash = 0;
    for (const char of String(name || 'bone')) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    const hue = Math.abs(hash) % 360;
    return hue;
  };

  function readCubes(text) {
    const data = JSON.parse(text);
    let geometries = data && data['minecraft:geometry'];
    if (!geometries && data?.['minecraft:client_entity']?.description?.geometry) {
      throw new Error('This file references geometry elsewhere. Open the geometry JSON file to preview its cubes.');
    }
    if (!geometries) throw new Error('No minecraft:geometry data found in this file.');
    if (!Array.isArray(geometries)) geometries = [geometries];
    const cubes = [];
    geometries.forEach(geometry => {
      (geometry?.bones || []).forEach(bone => {
        (bone?.cubes || []).forEach(cube => {
          const origin = Array.isArray(cube.origin) ? cube.origin.map(Number) : null;
          const size = Array.isArray(cube.size) ? cube.size.map(Number) : null;
          if (!origin || !size || origin.length < 3 || size.length < 3 || ![...origin, ...size].every(Number.isFinite)) return;
          const inflate = Number(cube.inflate) || 0;
          const start = origin.map(value => value - inflate);
          const end = origin.map((value, index) => value + size[index] + inflate);
      cubes.push({ start, end, hue: modelColor(bone.name), bone: bone.name || 'bone' });
        });
      });
    });
    if (!cubes.length) throw new Error('No valid cubes found. This preview currently supports unrotated bone cubes.');
    return { cubes, geometryCount: geometries.length };
  }

  function project(x, y, z) {
    return { x: (x - z) * 0.8660254, y: (x + z) * 0.5 - y };
  }

  function polygon(ctx, points, fill, stroke) {
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function draw(canvas, model) {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-3').trim() || '#1e1e1e';
    ctx.fillRect(0, 0, width, height);

    const prepared = model.cubes.map(cube => {
      const [x0, y0, z0] = cube.start;
      const [x1, y1, z1] = cube.end;
      const points = [
        project(x0, y0, z0), project(x1, y0, z0), project(x1, y1, z0), project(x0, y1, z0),
        project(x0, y0, z1), project(x1, y0, z1), project(x1, y1, z1), project(x0, y1, z1)
      ];
      return { ...cube, points, depth: (x0 + x1 + z0 + z1) / 4 };
    }).sort((a, b) => a.depth - b.depth);
    const allPoints = prepared.flatMap(cube => cube.points);
    const minX = Math.min(...allPoints.map(point => point.x));
    const maxX = Math.max(...allPoints.map(point => point.x));
    const minY = Math.min(...allPoints.map(point => point.y));
    const maxY = Math.max(...allPoints.map(point => point.y));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min((width - 36) / spanX, (height - 28) / spanY, 24);
    const offsetX = (width - spanX * scale) / 2 - minX * scale;
    const offsetY = (height - spanY * scale) / 2 - minY * scale;
    const at = point => ({ x: point.x * scale + offsetX, y: point.y * scale + offsetY });

    prepared.forEach(cube => {
      const p = cube.points.map(at);
      const hue = cube.hue;
      polygon(ctx, [p[3], p[2], p[6], p[7]], `hsl(${hue} 48% 58%)`, 'rgba(0,0,0,.52)');
      polygon(ctx, [p[1], p[5], p[6], p[2]], `hsl(${hue} 48% 42%)`, 'rgba(0,0,0,.52)');
      polygon(ctx, [p[0], p[1], p[2], p[3]], `hsl(${hue} 48% 72%)`, 'rgba(0,0,0,.52)');
    });
  }

  function ready(id, cm, filename, panelHost) {
    if (!cm || !/\.json$/i.test(String(filename || '')) || !panelHost) return false;
    let preview = panelHost.querySelector('.bedrock-geometry-preview');
    if (!preview) {
      preview = document.createElement('section');
      preview.className = 'bedrock-geometry-preview';
      preview.hidden = true;
      preview.innerHTML = '<header><strong>Bedrock Geometry Preview</strong><button type="button" aria-label="Close geometry preview">Close</button></header><canvas aria-label="Isometric geometry cube preview"></canvas><div class="geometry-preview-note"></div>';
      panelHost.appendChild(preview);
      preview.querySelector('button').addEventListener('click', () => { preview.hidden = true; });
    }
    const canvas = preview.querySelector('canvas');
    const note = preview.querySelector('.geometry-preview-note');
    let resizeObserver;
    const render = () => {
      try {
        const model = readCubes(cm.getValue());
        draw(canvas, model);
        const cubeCount = model.cubes.length;
        note.textContent = `${cubeCount} cube${cubeCount === 1 ? '' : 's'} across ${model.geometryCount} geometry definition${model.geometryCount === 1 ? '' : 's'}. Isometric preview only: cube rotations, textures, and animations are not rendered.`;
      } catch (error) {
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        canvas.width = width * Math.min(window.devicePixelRatio || 1, 2);
        canvas.height = height * Math.min(window.devicePixelRatio || 1, 2);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        note.textContent = error instanceof SyntaxError ? 'The model JSON has a syntax error; fix it to preview.' : error.message;
      }
    };
    cm.on('change', render);
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => { if (!preview.hidden) render(); });
      resizeObserver.observe(preview);
    }
    const entry = typeof editors !== 'undefined' ? editors[id] : null;
    if (entry) entry.geometryPreview = { panel: preview, render, dispose: () => resizeObserver?.disconnect() };
    render();
    return true;
  }

  window.studioGeometryEditorReady = ready;
  window.toggleBedrockGeometryPreview = function toggleBedrockGeometryPreview() {
    const active = document.querySelector('.tab.active');
    if (!active) return false;
    const entry = typeof editors !== 'undefined' ? editors[active.dataset.tab] : null;
    if (!entry?.geometryPreview) {
      window.studioStatusMessage?.('Open a JSON editor tab to preview Bedrock geometry.');
      return false;
    }
    const preview = entry.geometryPreview.panel;
    preview.hidden = !preview.hidden;
    if (!preview.hidden) entry.geometryPreview.render();
    return true;
  };

  window.studioRegisterCommand?.({
    label: 'Preview Bedrock Geometry',
    description: 'Show an isometric preview of unrotated geometry cubes',
    aliases: 'model geometry preview',
    run: () => window.toggleBedrockGeometryPreview?.()
  });
})();
