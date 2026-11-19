'use strict';
const { CalendarEngine, fold } = require('./calendar');
const { DEFAULT_COLOR } = require('./imports');

function parseDate(c, value, partial = false) {
  const raw = typeof value === 'string' ? /^(-?\d{1,6})-(.+)-(\d{1,3})$/.exec(value.trim()) : null;
  if (typeof value === 'string' && !raw) throw new Error('Use ano-mês-dia ou um objeto com year, month e day.');
  const date = raw ? { year: raw[1], month: raw[2], day: raw[3] } : value;
  if (!date || typeof date !== 'object' || !/^\d+$/.test(String(date.day)) || (!partial && (date.year == null || date.month == null))) {
    throw new Error('A data não tem dia, mês ou ano suficientes.');
  }
  const engine = new CalendarEngine(c);
  const month = typeof date.month === 'string' ? date.month.trim() : date.month;
  const chosen = month == null ? engine.activeMonths(Number(date.year ?? c.firstYear ?? 1)).find((m) => Number(date.day) <= m.length) :
    /^\d+$/.test(String(month)) ? c.months[Number(month) - 1] : c.months.find((m) => m.id === month || fold(m.name) === fold(String(month)));
  const result = { year: Number(date.year ?? c.firstYear ?? 1), month: chosen?.id, day: Number(date.day) };
  engine.check(result);
  return { date: result, repeat: month == null ? 'pattern' : date.year == null ? 'year' : 'none' };
}
function noteAllowed(c, path, fm = {}) {
  if (!c.noteSources?.enabled || !path?.toLowerCase().endsWith('.md')) return false;
  const folder = (c.noteSources.folder || '').replace(/^\/+|\/+$/g, '');
  if (folder && !path.startsWith(folder + '/')) return false;
  const calendars = fm['fc-calendar'] ?? fm['brpg-calendar'];
  return calendars == null || [calendars].flat().some((label) => typeof label === 'string' &&
    (label === c.id || fold(label) === fold(c.name)));
}
const trim = (x, size) => typeof x === 'string' ? x.trim().slice(0, size) : '';
function deriveNoteEvents(c, file, fm = {}, content = '') {
  if (!noteAllowed(c, file.path, fm)) return [];
  const events = [], baseTitle = file.basename || file.path.split('/').at(-1).replace(/\.md$/i, '');
  const category = trim(fm['fc-category'], 60);
  const defaults = c.eventCategories?.find((x) => fold(x.name) === fold(category));
  let ordinal = 0;
  const add = (value, title, endValue = null) => {
    if (events.length >= 50) return;
    try {
      const { date, repeat } = parseDate(c, value, true);
      let end = null;
      if (endValue != null && repeat !== 'pattern') {
        const other = parseDate(c, endValue, true).date;
        if (repeat === 'year' && new CalendarEngine(c).epoch(other) < new CalendarEngine(c).epoch(date)) other.year++;
        if (new CalendarEngine(c).epoch(other) >= new CalendarEngine(c).epoch(date)) end = other;
      }
      events.push({ id: 'nota:' + file.path + ':' + (ordinal++), title: trim(title, 140) || baseTitle.slice(0, 140),
        start: date, end, repeat, note: file.path, description: '', category, color: defaults?.color || DEFAULT_COLOR,
        hidden: fm['fc-hidden'] === true, autoNote: true,
        ...(repeat === 'pattern' ? { pattern: { unit: 'month', every: 1, duration: 1, match: 'all', rules: [] } } : {}) });
    } catch { /* An invalid frontmatter date must not break the vault index. */ }
  };
  const value = fm['fc-date'] ?? fm['brpg-date'];
  if (value != null) {
    for (const entry of [value].flat().slice(0, 50)) add(entry, trim(fm['fc-display-name'], 140) || baseTitle,
      Array.isArray(value) ? null : fm['fc-end'] ?? fm['brpg-end']);
  } else if (c.noteSources.parseTitle) {
    const found = /^(-?\d{1,6}-\d{1,3}-\d{1,3})(?:\s+[-–—]\s+|\s+|$)(.*)$/.exec(baseTitle);
    if (found) add(found[1], found[2] || baseTitle);
  }
  if (c.noteSources.inline && content) {
    let fence = null;
    for (const line of content.slice(0, 256000).split('\n')) {
      const marker = /^\s*(```|~~~)/.exec(line)?.[1];
      if (marker) { if (fence === marker) fence = null; else if (!fence) fence = marker; continue; }
      if (fence) continue;
      const hit = /^\s*(?:[-*]\s+)?brpg:\s*(-?\d{1,6}-[^|]+-\d{1,3})\s*\|\s*(.+?)\s*$/.exec(line);
      if (hit) add(hit[1], hit[2]);
    }
  }
  return events;
}
class NoteIndex {
  constructor(plugin) { this.p = plugin; this.files = new Map(); this.tokens = new Map(); }
  forCalendar(id) {
    const events = [];
    for (const item of this.files.values()) {
      const found = item.get(id);
      if (found) events.push(...found);
      if (events.length >= 5000) return events.slice(0, 5000);
    }
    return events;
  }
  forget(path) { this.tokens.delete(path); return this.files.delete(path); }
  async update(file, cache, body) {
    const token = Symbol(), path = file.path;
    this.tokens.set(path, token);
    const all = this.p.state.calendars.filter((c) => noteAllowed(c, path, cache?.frontmatter));
    if (body === undefined && all.some((c) => c.noteSources.inline)) {
      try { body = await this.p.app.vault.cachedRead(file); } catch { body = ''; }
    }
    if (this.tokens.get(path) !== token) return false;
    const prior = this.files.get(path), next = new Map();
    for (const c of all) {
      const events = deriveNoteEvents(c, file, cache?.frontmatter || {}, body);
      if (events.length) next.set(c.id, events);
    }
    if (next.size) this.files.set(path, next); else this.files.delete(path);
    this.tokens.delete(path);
    return !!(next.size || prior);
  }
  async rebuild() {
    const run = this.rebuildRun = Symbol();
    const cache = this.p.app.metadataCache;
    this.files.clear(); this.tokens.clear();
    if (!cache || !this.p.state.calendars.some((c) => c.noteSources?.enabled)) return;
    const files = this.p.app.vault.getMarkdownFiles();
    for (let i = 0; i < files.length && this.rebuildRun === run; i += 24) {
      await Promise.all(files.slice(i, i + 24).map((file) => this.update(file, cache.getFileCache(file))));
    }
  }
}
module.exports = { parseDate, deriveNoteEvents, NoteIndex };
