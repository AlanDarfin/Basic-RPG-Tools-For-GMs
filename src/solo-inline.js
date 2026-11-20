'use strict';
const { TFile, Notice, Menu, editorLivePreviewField } = require('obsidian');
const { el, button } = require('./ui');
const { parseDice, rollDice, dieRoll, key, clamp, legacyCard, legacyDeck } = require('./solo');
const { loadLegacy } = require('./solo-vault');
const { art, cardFace } = require('./solo-ui');

const TRACKS = { b: 'boxes', boxes: 'boxes', c: 'clock', clock: 'clock', sc: 'smclock', smclock: 'smclock',
  lc: 'lgclock', lgclock: 'lgclock', limit: 'limit', contador: 'limit' };
function spec(text, track) {
  if (/^ +$/.test(text)) return { type: 'space', width: Math.min(40, text.length) };
  const s = text.trim();
  const [formula] = s.split(/ = |: /, 1), remainder = s.slice(formula.length + 3);
  const tokens = formula.split(/[,|]/).map(v => v.trim());
  const control = tokens.shift();
  const dice = control.match(/^(!)?(sm|lg|s|l)?(.*)$/i);
  const notation = dice?.[3].replace(/(\/[ad])([+-]\d+)$/i, '$2$1');
  if (notation && parseDice(notation)) {
    const size = tokens.find(param => /^\d{1,3}$/.test(param));
    const color = tokens.find(param => /^(?:#[\da-f]{3,8}|[a-z]{1,20})$/i.test(param) && param !== 'show');
    return { type: 'dice', notation, formula, locked: !!dice[1], explicit: tokens.includes('show'), color,
      size: size ? clamp(+size, 12, 72) : dice[2]?.toLowerCase().startsWith('s') ? 20 : dice[2]?.toLowerCase().startsWith('l') ? 40 : 28, previous: remainder };
  }
  const custom = s.match(/^dado:\s*(.{1,120})$/i);
  if (custom) return { type: 'custom', name: custom[1] };
  const tracked = s.match(/^(?:([a-z]+):\s*)?(-?\d{1,7})\s*\/\s*(\d{1,7})$/i);
  if (tracked) {
    const prefix = tracked[1]?.toLowerCase() || '', style = prefix ? TRACKS[prefix] : track;
    if (!['boxes','clock','smclock','lgclock','limit'].includes(style) || +tracked[3] < 1) return null;
    const max = +tracked[3], type = max > 24 && style === 'boxes' ? 'limit' : style;
    return { type, prefix, value: Math.min(+tracked[2], max), max };
  }
  if (/^[+-]?\d{1,7}$/.test(s)) return { type: 'count', value: +s };
  return null;
}
function widget(host, plugin, source, change) {
  const { settings } = plugin.solo();
  const s = spec(source, settings.inlineTrack);
  if (!s) return;
  const warn = (err) => new Notice(err?.message || String(err));
  host.classList.add('brpg-solo-inline');
  if (s.type === 'space') { host.classList.add('is-space'); host.style.width = s.width + 'ch'; return; }
  if (s.type === 'dice' || s.type === 'custom') {
    const result = el(host, 'span', 'brpg-solo-inline-result');
    result.setAttribute('aria-live', 'polite');
    const showRoll = (total, values) => {
      result.replaceChildren();
      el(result, 'strong', '', s.explicit && values ? values + ' (' + total + ')' : String(total));
      if (values) result.title = values;
      if (s.color) result.style.color = s.color;
    };
    if (s.previous) {
      const parsed = s.previous.match(/^(.*?) \((-?\d+)\)$/);
      showRoll(parsed?.[2] || s.previous, parsed?.[1]);
    }
    if (s.size) host.style.setProperty('--brpg-solo-die-size', s.size + 'px');
    let savingRoll = false, notationSource = source;
    const dice = button(host, s.notation || s.name, async () => {
      if (savingRoll) return;
      result.replaceChildren();
      try {
        if (s.type === 'dice') {
          const r = rollDice(s.notation);
          const values = r.values.join(', ');
          showRoll(r.total, values);
          if (change) {
            savingRoll = true;
            const replacement = s.formula + ' = ' + values + ' (' + r.total + ')';
            try { await change(replacement, notationSource); notationSource = replacement; }
            finally { savingRoll = false; }
          }
        } else {
          const d = plugin.solo().dice.find(die => die.id === s.name || key(die.name) === key(s.name));
          if (!d) throw new Error('Dado personalizado não encontrado.');
          const [f] = dieRoll(d, 1).faces;
          if (f.kind === 'image') art(result, plugin, f.image, f.label || d.name, '', 'brpg-solo-die-face');
          if (f.kind !== 'image' || f.label) el(result, 'strong', '', f.kind === 'number' ? String(f.value) : f.label);
        }
      } catch (error) { warn(error); }
    }, { icon: 'dice-5', disabled: s.locked, className: 'brpg-solo-inline-dice' });
    // Keep the roll button before its result in reading and tab order.
    host.appendChild(result);
    dice.title = 'Rolar ' + (s.notation || s.name);
    return;
  }
  let current = s.value, busy = false, previous = source;
  const operation = async (value, max = s.max, type = s.type, prefix = s.prefix) => {
    if (!change || busy) return;
    const next = clamp(value, max && type !== 'limit' ? 0 : -9999999, max || 9999999);
    if (next === current && max === s.max && type === s.type) return;
    busy = true;
    try {
      const text = (prefix ? prefix + ': ' : '') + next + (max ? '/' + max : '');
      await change(text, previous); previous = text; current = next; Object.assign(s, { max, type, prefix }); render();
    } catch (e) { warn(e); }
    finally { busy = false; }
  };
  function render() {
    host.replaceChildren();
    button(host, 'Diminuir', (e) => operation(current - (e.shiftKey ? 10 : 1)), { icon: 'minus', iconOnly: true, disabled: !change });
    if (s.type.includes('clock')) {
      const face = el(host, 'span', 'brpg-solo-clock is-' + s.type);
      face.style.setProperty('--brpg-solo-progress', clamp(current / s.max, 0, 1) * 360 + 'deg');
      face.setAttribute('aria-hidden', 'true');
    }
    if (s.type === 'boxes') {
      for (let i = 1; i <= s.max; i++) {
        const box = button(host, 'Marcar ' + i + ' de ' + s.max, () => operation(i === current ? i - 1 : i),
          { iconOnly: true, disabled: !change, className: 'brpg-solo-box' + (i <= current ? (settings.highlightBoxes ? ' is-filled' : ' is-checked') : '') });
        box.setAttribute('aria-pressed', String(i <= current));
      }
    }
    const value = el(host, 'strong', 'brpg-solo-inline-num', String(current) + (s.max ? '/' + s.max : ''));
    if (Menu && change) value.addEventListener('contextmenu', event => {
      event.preventDefault();
      const menu = new Menu(), add = (title, fn) => menu.addItem(item => item.setTitle(title).onClick(fn));
      add('Zerar', () => operation(0));
      add('Aumentar em 10', () => operation(current + 10));
      add('Diminuir em 10', () => operation(current - 10));
      if (s.max) {
        add('Preencher', () => operation(s.max));
        add('Aumentar limite', () => operation(current, Math.min(9999999, s.max + 1)));
        add('Diminuir limite', () => operation(current, Math.max(1, s.max - 1)));
        add('Mostrar como relógio', () => operation(current, s.max, 'clock', 'clock'));
        if (s.max <= 24) add('Mostrar como caixas', () => operation(current, s.max, 'boxes', 'boxes'));
        add('Mostrar como contador', () => operation(current, s.max, 'limit', 'limit'));
      }
      menu.showAtMouseEvent(event);
    });
    button(host, 'Aumentar', (e) => operation(current + (e.shiftKey ? 10 : 1)), { icon: 'plus', iconOnly: true, disabled: !change });
  }
  render();
}
function scanInline(section) {
  const spans = [];
  let fence = '', offset = 0;
  for (const line of section.split('\n')) {
    const fenced = line.match(/^ {0,3}(?:>\s*)?(`{3,}|~{3,})(.*)$/);
    if (fenced && (!fence || (fenced[1][0] === fence[0] && fenced[1].length >= fence.length && !fenced[2].trim()))) {
      fence = fence ? '' : fenced[1];
    } else if (!fence && !/^( {4}|\t)/.test(line)) {
      // A Markdown code span opens and closes with the same number of backticks.
      let m; const runs = /\x60+/g;
      while ((m = runs.exec(line))) {
        let escapes = 0;
        for (let i = m.index - 1; i >= 0 && line[i] === '\\'; i--) escapes++;
        if (escapes % 2) continue;
        let close, valid = false;
        for (const next of line.slice(runs.lastIndex).matchAll(/\x60+/g)) {
          if (next[0].length === m[0].length) { close = runs.lastIndex + next.index; valid = true; break; }
        }
        if (!valid) continue;
        spans.push({ from: offset + runs.lastIndex, to: offset + close, text: line.slice(runs.lastIndex, close) });
        runs.lastIndex = close + m[0].length;
      }
    }
    offset += line.length + 1;
  }
  return spans;
}
function processor(plugin, root, ctx) {
  if (!plugin.solo().settings.inline) return;
  const nodes = [...root.querySelectorAll('code')].filter(node => !node.closest('pre'));
  if (!nodes.length) return;
  const metadata = ctx.getSectionInfo(root), file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  const full = metadata?.text?.replace(/\r\n/g, '\n') || '';
  const rows = full.split('\n'), range = metadata && metadata.lineStart >= 0 &&
    metadata.lineEnd >= metadata.lineStart && rows.length > metadata.lineEnd;
  const origin = range ? rows.slice(metadata.lineStart, metadata.lineEnd + 1).join('\n') : '';
  const spans = range ? scanInline(origin) : [];
  const normalize = (text) => text.trim() || text;
  const aligned = spans.length === nodes.length && spans.every((p, i) => normalize(p.text) === normalize(nodes[i].textContent));
  nodes.forEach((node, i) => {
    if (node.closest('a')) return;
    const source = aligned ? spans[i].text : node.textContent;
    if (!spec(source, plugin.solo().settings.inlineTrack)) return;
    const span = node.ownerDocument.createElement('span');
    let write;
    if (file instanceof TFile && aligned && plugin.app.vault.process) {
      const loc = spans[i];
      let expected = origin, at = loc.from, length = loc.text.length;
      write = async (next, old) => plugin.app.vault.process(file, data => {
        if (!plugin.solo().settings.inline) throw new Error('Ferramentas nas notas desativadas.');
        const breaks = data.includes('\r\n') ? '\r\n' : '\n', lines = data.split(/\r?\n/);
        const current = lines.slice(metadata.lineStart, metadata.lineEnd + 1).join('\n');
        if (current !== expected || current.slice(at, at + length) !== old.trim() && current.slice(at, at + length) !== old)
          throw new Error('A nota mudou. Reabra a visualização antes de editar este contador.');
        const changed = current.slice(0, at) + next + current.slice(at + length);
        lines.splice(metadata.lineStart, metadata.lineEnd - metadata.lineStart + 1, ...changed.split('\n'));
        expected = changed; length = next.length;
        return lines.join(breaks);
      });
    }
    let current = source;
    widget(span, plugin, source, write ? async (next) => { await write(next, current); current = next; } : null);
    node.replaceWith(span);
  });
}
function liveExtension(plugin) {
  let CM, tree;
  try { CM = require('@codemirror/view'); tree = require('@codemirror/language').syntaxTree; } catch { return null; }
  if (!editorLivePreviewField || !CM?.ViewPlugin || !tree) return null;
  const { Decoration, ViewPlugin, WidgetType } = CM;
  class InlineWidget extends WidgetType {
    constructor(from, to, text, track) { super(); Object.assign(this, { from, to, text, track }); }
    eq(other) { return this.from === other.from && this.to === other.to && this.text === other.text && this.track === other.track; }
    toDOM(view) {
      const host = view.dom.ownerDocument.createElement('span');
      widget(host, plugin, this.text, (next, previous) => {
        const end = this.from + previous.length;
        if (view.state.doc.sliceString(this.from, end) !== previous) throw new Error('O texto do contador mudou.');
        view.dispatch({ changes: { from: this.from, to: end, insert: next } });
      });
      return host;
    }
    ignoreEvent() { return true; }
  }
  function decorations(view) {
    const { state } = view, { inline, inlineTrack } = plugin.solo().settings;
    if (!inline || !state.field(editorLivePreviewField, false)) return Decoration.none;
    const widgets = [], seen = new Set();
    for (const r of view.visibleRanges) tree(state).iterate({ from: r.from, to: r.to, enter(node) {
      if (node.name !== 'inline-code') return;
      const f = node.from, t = node.to;
      if (f < 1 || t >= state.doc.length || seen.has(f) || state.doc.sliceString(f - 1, f) !== '`' ||
          state.doc.sliceString(t, t + 1) !== '`') return;
      seen.add(f);
      if (state.selection.ranges.some(s => s.from <= t + 1 && s.to >= f - 1)) return;
      const text = state.doc.sliceString(f, t);
      if (spec(text, inlineTrack)) widgets.push(Decoration.replace({ widget: new InlineWidget(f, t, text, inlineTrack) }).range(f,t));
    } });
    return Decoration.set(widgets, true);
  }
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = decorations(view); }
    update(update) { this.decorations = decorations(update.view); }
  }, { decorations: v => v.decorations });
}
function registerSoloInline(plugin) {
  plugin.registerMarkdownPostProcessor?.((element, ctx) => processor(plugin, element, ctx));
  if (plugin.registerEditorExtension) {
    const ext = liveExtension(plugin);
    if (ext) plugin.registerEditorExtension(ext);
  }
  plugin.registerMarkdownCodeBlockProcessor('brpg-card', (source, root, ctx) => {
    const c = legacyCard(source, ctx.sourcePath, 'inline-card');
    if (!c.title) { root.textContent = 'Carta sem nome.'; return; }
    root.classList.add('brpg', 'brpg-solo-card'); cardFace(root, plugin, c);
  });
  plugin.registerMarkdownCodeBlockProcessor('brpg-deck', async (source, root) => {
    const catalog = plugin.solo().decks.find(d => key(d.name) === key(source) || d.id === source.trim());
    if (catalog) {
      root.classList.add('brpg');
      for (const [id, name] of [['main','Principal'],['extra','Extra'],['side','Reserva']]) {
        const cards = catalog.cards.filter(c => c.section === id);
        if (!cards.length) continue;
        el(root, 'h4', '', name);
        const grid = el(root, 'div', 'brpg-solo-card-grid');
        cards.forEach(card => cardFace(el(grid, 'div', 'brpg-solo-card'), plugin, card));
      }
      return;
    }
    if (!/^\s*#\s*(main|principal|extra|side|reserva)/im.test(source)) { root.textContent = 'Baralho do Basic RPG não encontrado.'; return; }
    try {
      const { catalog: legacy } = await loadLegacy(plugin.app, (tag) => tag);
      let entry = 0;
      const { cards, missing } = legacyDeck(source, legacy, () => 'embed-' + ++entry);
      root.classList.add('brpg');
      for (const [id, title] of [['main','Principal'],['extra','Extra'],['side','Reserva']]) {
        const found = cards.filter(c => c.section === id);
        if (!found.length) continue;
        el(root, 'h4', '', title);
        const grid = el(root, 'div', 'brpg-solo-card-grid');
        found.forEach(card => cardFace(el(grid, 'div', 'brpg-solo-card'), plugin, card));
      }
      if (missing.length) el(root, 'p', 'brpg-hint', 'Cartas não encontradas · ' + missing.slice(0, 30).join(', '));
    } catch (error) { el(root, 'p', 'brpg-hint', error.message); }
  });
}
module.exports = { spec, scanInline, widget, processor, liveExtension, registerSoloInline };
