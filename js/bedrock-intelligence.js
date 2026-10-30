/*
 * Conservative Bedrock JSON guidance for CodeMirror 5. This is not a complete
 * Bedrock schema or runtime validator; suggestions and open-buffer identifiers
 * are best-effort and may be incomplete or stale until the editor is reopened.
 */
(function (window) {
  'use strict';

  const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const KEY_SETS = {
    common: ['format_version', 'minecraft:entity', 'minecraft:item', 'minecraft:block', 'minecraft:recipe_shaped', 'minecraft:recipe_shapeless', 'description', 'identifier', 'components', 'component_groups', 'events'],
    manifest: ['format_version', 'header', 'modules', 'dependencies', 'metadata', 'name', 'description', 'uuid', 'version', 'type', 'language', 'product_type', 'url', 'min_engine_version'],
    entity: ['minecraft:entity', 'description', 'identifier', 'is_spawnable', 'is_summonable', 'is_experimental', 'runtime_identifier', 'components', 'component_groups', 'events', 'spawn_rules'],
    item: ['minecraft:item', 'description', 'identifier', 'menu_category', 'components', 'icon', 'max_stack_size', 'display_name', 'minecraft:icon', 'minecraft:food', 'minecraft:durability'],
    block: ['minecraft:block', 'description', 'identifier', 'menu_category', 'components', 'states', 'permutations', 'traits', 'geometry', 'material_instances', 'selection_box', 'collision_box', 'loot'],
    recipe: ['minecraft:recipe_shaped', 'minecraft:recipe_shapeless', 'description', 'identifier', 'tags', 'pattern', 'key', 'result', 'ingredients', 'unlock', 'unlock_criteria', 'priority'],
    components: ['minecraft:health', 'minecraft:collision_box', 'minecraft:physics', 'minecraft:movement', 'minecraft:movement.basic', 'minecraft:attack', 'minecraft:damage_sensor', 'minecraft:interact', 'minecraft:inventory', 'minecraft:equipment', 'minecraft:scale', 'minecraft:pushable', 'minecraft:rideable', 'minecraft:behavior.float', 'minecraft:behavior.random_stroll', 'minecraft:behavior.nearest_attackable_target', 'minecraft:despawn', 'minecraft:loot', 'minecraft:breathable', 'minecraft:family', 'minecraft:knockback_resistance'],
    values: ['true', 'false']
  };

  function jsonFilename(filename) {
    return typeof filename === 'string' && /\.json$/i.test(filename);
  }

  function pos(index, text) {
    const before = text.slice(0, Math.max(0, index));
    const line = (before.match(/\n/g) || []).length;
    const lastNewline = before.lastIndexOf('\n');
    return { line, ch: before.length - lastNewline - 1 };
  }

  function syntaxOffset(error) {
    const message = String(error && error.message || '');
    const match = message.match(/(?:position|at)\s+(\d+)/i) || message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (!match) return 0;
    if (/line\s+\d+/i.test(match[0]) && match[2]) return null;
    return Number(match[1]) || 0;
  }

  function isManifest(text, filename, data) {
    const basename = String(filename || '').split(/[\\/]/).pop().toLowerCase();
    return basename === 'manifest.json' || !!(data && typeof data === 'object' &&
      (Object.prototype.hasOwnProperty.call(data, 'header') || Object.prototype.hasOwnProperty.call(data, 'modules')));
  }

  function makeDiagnostic(text, index, message, severity) {
    const at = pos(index, text);
    return {
      from: at,
      to: { line: at.line, ch: at.ch + 1 },
      message,
      severity: severity || 'warning'
    };
  }

  function diagnose(text, filename) {
    text = String(text == null ? '' : text);
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      const offset = syntaxOffset(error);
      const at = offset == null ? pos(text.length, text) : pos(offset, text);
      return [{
        from: at,
        to: { line: at.line, ch: at.ch + 1 },
        message: `Invalid JSON: ${String(error && error.message || 'parse error')}`,
        severity: 'error'
      }];
    }

    if (!isManifest(text, filename, data)) return [];
    const diagnostics = [];
    const root = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    const topIndex = (key) => {
      const match = text.match(new RegExp('"' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*:'));
      return match ? match.index : 0;
    };
    const fieldIssue = (object, field, label, index) => {
      if (!object || typeof object !== 'object' || !Object.prototype.hasOwnProperty.call(object, field)) {
        diagnostics.push(makeDiagnostic(text, index, `Manifest guidance: missing ${label}.`));
      }
    };
    const checkVersion = (value, label, index) => {
      if (!Array.isArray(value) || value.length !== 3 || !value.every(part => Number.isInteger(part) && part >= 0)) {
        diagnostics.push(makeDiagnostic(text, index, `Manifest guidance: ${label} should be a three-integer version array, e.g. [1, 0, 0].`));
      }
    };
    const checkUuid = (value, label, index) => {
      if (typeof value !== 'string' || !UUID_SHAPE.test(value)) {
        diagnostics.push(makeDiagnostic(text, index, `Manifest guidance: ${label} should have UUID shape (8-4-4-4-12 hexadecimal characters).`));
      }
    };

    fieldIssue(root, 'format_version', 'format_version', 0);
    if (root.format_version != null && !Number.isInteger(root.format_version)) {
      diagnostics.push(makeDiagnostic(text, topIndex('format_version'), 'Manifest guidance: format_version is usually an integer (commonly 2).'));
    }
    const header = root.header;
    if (!header || typeof header !== 'object' || Array.isArray(header)) {
      diagnostics.push(makeDiagnostic(text, topIndex('header'), 'Manifest guidance: header should be an object.'));
    } else {
      ['name', 'description', 'uuid', 'version'].forEach(field => fieldIssue(header, field, `header.${field}`, topIndex('header')));
      if (Object.prototype.hasOwnProperty.call(header, 'uuid')) checkUuid(header.uuid, 'header.uuid', topIndex('header'));
      if (Object.prototype.hasOwnProperty.call(header, 'version')) checkVersion(header.version, 'header.version', topIndex('header'));
    }

    if (!Array.isArray(root.modules) || root.modules.length === 0) {
      diagnostics.push(makeDiagnostic(text, topIndex('modules'), 'Manifest guidance: modules should be a non-empty array.'));
    } else {
      root.modules.forEach((module, index) => {
        const moduleIndex = topIndex('modules');
        if (!module || typeof module !== 'object' || Array.isArray(module)) {
          diagnostics.push(makeDiagnostic(text, moduleIndex, `Manifest guidance: modules[${index}] should be an object.`));
          return;
        }
        ['type', 'uuid', 'version'].forEach(field => fieldIssue(module, field, `modules[${index}].${field}`, moduleIndex));
        if (Object.prototype.hasOwnProperty.call(module, 'uuid')) checkUuid(module.uuid, `modules[${index}].uuid`, moduleIndex);
        if (Object.prototype.hasOwnProperty.call(module, 'version')) checkVersion(module.version, `modules[${index}].version`, moduleIndex);
        if (Object.prototype.hasOwnProperty.call(module, 'type') && !['resources', 'data', 'client_data', 'script'].includes(module.type)) {
          diagnostics.push(makeDiagnostic(text, moduleIndex, `Manifest guidance: module type "${String(module.type)}" is not one of the common module types.`));
        }
      });
    }
    return diagnostics;
  }

  function getOpenEditorText(skipCm) {
    const result = [];
    try {
      if (typeof editors !== 'undefined' && editors) {
        Object.keys(editors).forEach(id => {
          const entry = editors[id];
          if (entry && entry.cm && entry.cm !== skipCm && typeof entry.cm.getValue === 'function') result.push(entry.cm.getValue());
        });
      }
    } catch (_) { /* Globals may not exist yet or may be scoped by a host page. */ }
    return result;
  }

  function collectIdentifiers(skipCm) {
    const identifiers = new Set();
    getOpenEditorText(skipCm).forEach(text => {
      const matches = text.match(/\b[A-Za-z0-9_.-]+:[A-Za-z0-9_./-]+\b/g) || [];
      matches.forEach(value => identifiers.add(value));
      const keyed = text.matchAll(/"identifier"\s*:\s*"([A-Za-z0-9_.-]+:[A-Za-z0-9_./-]+)"/g);
      for (const match of keyed) identifiers.add(match[1]);
    });
    return Array.from(identifiers).sort();
  }

  function insideString(text, index) {
    let quoted = false;
    let escaped = false;
    for (let i = 0; i < index; i++) {
      const ch = text[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && quoted) { escaped = true; continue; }
      if (ch === '"') quoted = !quoted;
    }
    return quoted;
  }

  function contextBefore(text, index) {
    const before = text.slice(0, index);
    const stack = [];
    let quoted = false;
    let escaped = false;
    for (let i = 0; i < before.length; i++) {
      const ch = before[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && quoted) { escaped = true; continue; }
      if (ch === '"') { quoted = !quoted; continue; }
      if (quoted) continue;
      if (ch === '{') stack.push(i);
      else if (ch === '}') stack.pop();
    }
    const objectStart = stack.length ? stack[stack.length - 1] : 0;
    const fragment = before.slice(objectStart);
    const pair = fragment.match(/"([^"\\]+)"\s*:\s*(?:"[^"\\]*"|[^,{}]*)\s*,?\s*$/);
    return { fragment, key: pair ? pair[1] : '', valueExpected: !!(pair && /:\s*(?:"[^"\\]*)?\s*$/.test(fragment)) };
  }

  function categoryFor(filename, context) {
    const lower = String(filename || '').toLowerCase();
    const fragment = context.fragment.toLowerCase();
    if (/manifest\.json$/.test(lower)) return 'manifest';
    if (/recipe/.test(lower) || /minecraft:recipe_(?:shaped|shapeless)/.test(fragment)) return 'recipe';
    if (/block/.test(lower) || /minecraft:block/.test(fragment)) return 'block';
    if (/item/.test(lower) || /minecraft:item/.test(fragment)) return 'item';
    if (/entity|spawn/.test(lower) || /minecraft:entity/.test(fragment)) return 'entity';
    if (/components|component_groups/.test(fragment)) return 'components';
    return 'common';
  }

  function valueSuggestions(key, category, cm) {
    const profile = window.studioBedrockProfile || {};
    const versionHints = [profile.targetVersion, '1.21.0', '1.20.0'].filter((value, index, all) => value && all.indexOf(value) === index);
    if (key === 'format_version') return category === 'manifest' ? [2] : ['1.12.0', '1.16.0', '1.20.0', '1.21.0'];
    if (key === 'min_engine_version') return versionHints;
    const values = {
      type: ['resources', 'data', 'client_data', 'script'],
      is_spawnable: ['true', 'false'],
      is_summonable: ['true', 'false'],
      is_experimental: ['true', 'false'],
      menu_category: ['construction', 'equipment', 'items', 'nature'],
      tags: category === 'recipe' ? ['minecraft:crafting_table', 'minecraft:smelting', 'minecraft:brewing_stand'] : [],
      identifier: collectIdentifiers(cm)
    };
    if (key === 'identifier' || /identifier$/.test(key)) return values.identifier;
    return values[key] || [];
  }

  function hintResult(cm, filename) {
    const cursor = cm.getCursor();
    const text = cm.getValue();
    const offset = cm.indexFromPos(cursor);
    const before = text.slice(0, offset);
    const after = text.slice(offset);
    const stringContext = insideString(text, offset);
    const ctx = contextBefore(text, offset);
    const word = /[A-Za-z0-9_:.\/-]/;
    let start = offset;
    let end = offset;
    while (start > 0 && word.test(text[start - 1])) start--;
    while (end < text.length && word.test(text[end])) end++;
    const prefix = text.slice(start, offset);
    const category = categoryFor(filename, ctx);
    let suggestions;

    if (ctx.valueExpected) {
      suggestions = stringContext && ctx.key === 'format_version' && category === 'manifest'
        ? []
        : valueSuggestions(ctx.key, category, cm);
    } else {
      suggestions = [...KEY_SETS.common, ...(KEY_SETS[category] || []), ...KEY_SETS.components];
      if (/components\s*"?\s*:/.test(ctx.fragment)) suggestions = [...suggestions, ...KEY_SETS.components];
    }

    const values = [...new Set(suggestions)].filter(value => String(value).toLowerCase().startsWith(prefix.toLowerCase())).slice(0, 60);
    if (!values.length) return null;
    const from = cm.posFromIndex(start);
    const to = cm.posFromIndex(end);
    const wantsQuotedKeys = !stringContext;
    return {
      list: values.map(value => ({
        text: wantsQuotedKeys && !/^(?:true|false|null|-?\d)/.test(value) ? `"${value}"` : String(value),
        displayText: String(value)
      })),
      from: CodeMirror.Pos(from.line, from.ch),
      to: CodeMirror.Pos(to.line, to.ch)
    };
  }

  function showHints(cm, filename) {
    if (!cm || !window.CodeMirror || typeof CodeMirror.showHint !== 'function') return false;
    const result = hintResult(cm, filename);
    if (!result) return false;
    CodeMirror.showHint(cm, () => result, { completeSingle: false, alignWithWord: true, closeOnUnfocus: true });
    return true;
  }

  function ready(id, cm, filename) {
    if (!cm || !jsonFilename(filename)) return false;
    const attached = cm._studioBedrockIntelligence || (cm._studioBedrockIntelligence = { filename: String(filename || '') });
    attached.filename = String(filename || '');

    if (typeof cm.setOption === 'function' && window.CodeMirror && window.CodeMirror.lint) {
      cm.setOption('lint', {
        async: false,
        getAnnotations: function (text) { return diagnose(text, attached.filename); }
      });
    }

    if (!attached.keyMap && typeof cm.addKeyMap === 'function') {
      const keyMap = {
        'Ctrl-Space': function (editor) { showHints(editor, attached.filename); },
        'Cmd-Space': function (editor) { showHints(editor, attached.filename); }
      };
      cm.addKeyMap(keyMap);
      attached.keyMap = keyMap;
    }
    return true;
  }

  window.studioBedrockEditorReady = ready;
  window.studioBedrockDiagnostics = {
    analyze: diagnose,
    complete: function (idOrCm, filename) {
      let cm = idOrCm;
      if (typeof idOrCm !== 'object' || !idOrCm) {
        try {
          if (typeof editors !== 'undefined' && editors[idOrCm]) cm = editors[idOrCm].cm;
        } catch (_) { cm = null; }
      }
      if (!cm) return false;
      const name = filename || (cm._studioBedrockIntelligence && cm._studioBedrockIntelligence.filename) || '';
      return showHints(cm, name);
    },
    identifiers: collectIdentifiers
  };
})(window);
