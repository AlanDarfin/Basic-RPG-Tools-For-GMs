'use strict';
const { ItemView } = require('obsidian');
const { CalendarEngine, MAX_YEAR, sameDate, clockText } = require('./calendar');
const { el, button, select, info, replaceEl, inlineNumber, CalendarEditor, EventEditor, WorldDateEditor, Confirm } = require('./ui');

const VIEW = 'basic-rpg-calendar';
class CalendarView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.selected = null;
    this.calId = null;
    this.mode = 'month';
    this.category = '';
    this.showHidden = false;
    this.layout = 'auto';
  }
  getViewType() { return VIEW; }
  getDisplayText() { return 'Basic RPG · Calendário'; }
  getIcon() { return 'calendar-days'; }
  async onOpen() { this.render(); }
  async onClose() { replaceEl(this.contentEl); }
  sync(c, e) {
    if (!this.selected || this.calId !== c.id) {
      this.selected = { ...c.current };
      this.category = '';
      this.showHidden = false;
    } else {
      try { e.check(this.selected); } catch { this.selected = { ...c.current }; }
      if (this.savedToday && sameDate(this.selected, this.savedToday) && !sameDate(c.current, this.savedToday)) this.selected = { ...c.current };
    }
    this.calId = c.id;
    this.savedToday = { ...c.current };
  }
  choose(d) { this.selected = d; this.render(); }
  run(fn) { return () => this.plugin.attempt(fn); }
  filtered(events) { return events.filter((x) => (this.showHidden || !x.hidden) && (!this.category || x.category === this.category)); }
  render() {
    const c = this.plugin.active();
    if (!c) return;
    const e = new CalendarEngine(c);
    this.sync(c, e);
    const root = this.contentEl;
    root.classList.add('brpg', 'brpg-view');
    replaceEl(root);
    const header = el(root, 'header', 'brpg-header');
    const eyebrow = el(header, 'div', 'brpg-eyebrow', 'BASIC RPG');
    eyebrow.setAttribute('aria-hidden', 'true');
    el(header, 'h2', 'brpg-heading', c.name);
    const world = el(header, 'div', 'brpg-world-status');
    el(world, 'span', 'brpg-world-label', 'No mundo');
    el(world, 'span', 'brpg-world-date', `${e.format(c.current)} · ${clockText(c.current)}`);
    const actions = el(header, 'div', 'brpg-toolbar');
    select(actions, this.plugin.state.calendars.map((item) => [item.id, item.name]), c.id,
      (v) => this.plugin.attempt(() => this.plugin.setActive(v)), 'Calendário ativo');
    button(actions, 'Editar calendário', () => new CalendarEditor(this.plugin, c).open(), { icon: 'settings', iconOnly: true });
    button(actions, 'Novo calendário', () => this.plugin.newCalendar(), { icon: 'plus', iconOnly: true });
    button(actions, 'Voltar um dia no mundo', this.run(() => this.plugin.advance(-1)), { icon: 'skip-back', iconOnly: true, disabled: e.epoch(c.current) === 0 });
    button(actions, 'Avançar um dia no mundo', this.run(() => this.plugin.advance(1)), { icon: 'skip-forward', iconOnly: true,
      disabled: e.epoch(c.current) + 1 === e.yearStart(MAX_YEAR + 1) });

    const tabs = el(root, 'nav', 'brpg-tabs');
    tabs.setAttribute('aria-label', 'Visualização');
    for (const [key, title, icon] of [['month', 'Calendário', 'calendar-days'], ['timeline', 'Cronologia', 'list-ordered']]) {
      const b = button(tabs, title, () => { this.mode = key; this.render(); }, { icon });
      b.setAttribute('aria-pressed', String(this.mode === key));
    }
    const nav = el(root, 'div', 'brpg-toolbar brpg-navigation');
    const ordinal = (this.selected.year - 1) * c.months.length + e.monthIndex(this.selected.month);
    const monthMode = this.mode === 'month';
    const navigate = (dir) => () => {
      if (monthMode) { this.choose(e.monthShift(this.selected, dir)); return; }
      const year = this.selected.year + dir;
      this.choose({ ...this.selected, year, day: Math.min(this.selected.day, e.monthLength(year, this.selected.month)) });
    };
    button(nav, monthMode ? 'Mês anterior' : 'Ano anterior', navigate(-1),
      { icon: 'chevron-left', iconOnly: true, disabled: monthMode ? ordinal === 0 : this.selected.year === 1 });
    if (monthMode) select(nav, c.months.map((m) => [m.id, m.name]), this.selected.month,
      (month) => this.choose({ year: this.selected.year, month, day: 1 }), 'Mês em exibição');
    const y = el(nav, 'input', 'brpg-input brpg-year'); y.type = 'number'; y.min = '1'; y.max = String(MAX_YEAR);
    y.value = this.selected.year; y.setAttribute('aria-label', 'Ano em exibição');
    y.addEventListener('change', () => {
      const year = Number(y.value);
      if (Number.isInteger(year) && year >= 1 && year <= MAX_YEAR) {
        this.choose({ ...this.selected, year, day: Math.min(this.selected.day, e.monthLength(year, this.selected.month)) });
      } else y.value = this.selected.year;
    });
    button(nav, monthMode ? 'Próximo mês' : 'Próximo ano', navigate(1),
      { icon: 'chevron-right', iconOnly: true, disabled: monthMode ? ordinal + 1 === MAX_YEAR * c.months.length : this.selected.year === MAX_YEAR });
    button(nav, 'Hoje', () => this.choose({ ...c.current }), { icon: 'locate-fixed' });
    if (monthMode) select(nav, [['auto', 'Automático'], ['grid', 'Grade'], ['list', 'Lista']], this.layout,
      (value) => { this.layout = value; this.render(); }, 'Formato do mês');
    const filters = el(root, 'div', 'brpg-toolbar brpg-filters');
    const cats = [...new Set(c.events.map((x) => x.category).filter(Boolean))].sort();
    if (!cats.includes(this.category)) this.category = '';
    if (cats.length) select(filters, [['', 'Todas as categorias'], ...cats.map((cat) => [cat, cat])], this.category,
      (v) => { this.category = v; this.render(); }, 'Categoria de evento');
    const toggle = button(filters, this.showHidden ? 'Ocultar reservados' : 'Mostrar reservados', () => {
      this.showHidden = !this.showHidden; this.render();
    }, { icon: this.showHidden ? 'eye-off' : 'eye' });
    toggle.setAttribute('aria-pressed', String(this.showHidden));
    button(filters, 'Novo evento', () => new EventEditor(this.plugin, c, this.selected).open(), { icon: 'plus', className: 'brpg-button mod-cta' });
    if (this.mode === 'timeline') this.renderTimeline(root, c, e);
    else this.renderMonth(root, c, e);
  }
  renderMonth(root, c, e) {
    const { year, month } = this.selected, m = c.months[e.monthIndex(month)];
    const body = el(root, 'section', 'brpg-month');
    el(body, 'h3', 'brpg-section-title', `${m.name} · ano ${e.yearLabel(year)}`);
    const busy = new Map();
    const len = e.monthLength(year, month);
    for (let day = 1; day <= len; day++) busy.set(day, this.filtered(e.eventsOn({ year, month, day })));
    const group = el(body, 'div', `brpg-layout brpg-layout-${this.layout}${c.week.length > 8 ? ' brpg-long-week' : ''}`);
    // Render one layout in explicit modes. CSS selects the responsive default in auto.
    if (this.layout !== 'list') {
      const grid = el(group, 'div', 'brpg-grid');
      grid.style.setProperty('--brpg-week', String(c.week.length));
      if (!m.intercalary) for (const w of c.week) {
        const header = el(grid, 'div', 'brpg-weekday', w.length > 5 ? w.slice(0, c.week.length > 8 ? 2 : 3) : w);
        header.setAttribute('title', w);
        header.setAttribute('aria-label', w);
      }
      for (const row of e.rows(year, month)) {
        if (row.special) this.renderDay(grid, row.special, c, e, busy.get(row.special.day), 'brpg-outside');
        else for (const date of row.days) {
          if (date) this.renderDay(grid, date, c, e, busy.get(date.day), '');
          else el(grid, 'div', 'brpg-spacer').setAttribute('aria-hidden', 'true');
        }
      }
    }
    if (this.layout !== 'grid') {
      const list = el(group, 'div', 'brpg-month-list');
      for (let day = 1; day <= len; day++) this.renderDay(list, { year, month, day }, c, e, busy.get(day), 'brpg-list-day');
    }
    this.renderSelected(root, c, e, busy.get(this.selected.day) || []);
  }
  renderDay(root, d, c, e, events, extra) {
    const meta = e.dayMeta(d);
    const state = (sameDate(d, c.current) ? ' is-today' : '') + (sameDate(d, this.selected) ? ' is-selected' : '');
    const label = [e.format(d), meta.weekday || 'fora da semana', meta.special?.name, events.length ? `${events.length} evento(s)` : ''].filter(Boolean).join(' · ');
    const b = button(root, label, () => { this.choose(d); Array.from(this.contentEl.querySelectorAll('.brpg-layout button[aria-pressed="true"]')).find((node) => node.offsetParent)?.focus({ preventScroll: true }); },
      { className: `brpg-day ${extra}${state}` , iconOnly: true });
    b.setAttribute('aria-pressed', String(sameDate(d, this.selected)));
    if (sameDate(d, c.current)) b.setAttribute('aria-current', 'date');
    el(b, 'strong', 'brpg-day-number', String(d.day));
    if (extra === 'brpg-list-day') {
      el(b, 'span', 'brpg-day-name', meta.special?.name || meta.weekday || 'Fora da semana');
      if (events.length) el(b, 'span', 'brpg-day-event', events[0].title);
    } else if (meta.special) el(b, 'span', 'brpg-day-name', meta.special.name);
    if (events.length) {
      const marks = el(b, 'span', 'brpg-day-marks');
      marks.setAttribute('aria-hidden', 'true');
      for (const event of events.slice(0, 3)) this.dot(marks, event.color);
      if (events.length > 3) el(marks, 'span', '', '+');
    }
  }
  dot(root, color) { el(root, 'span', 'brpg-dot').style.setProperty('--brpg-event-color', color); }
  renderSelected(root, c, e, events) {
    const d = this.selected;
    const meta = e.dayMeta(d), season = e.season(d), moons = e.moons(d);
    const section = el(root, 'section', 'brpg-selected');
    const head = el(section, 'div', 'brpg-toolbar');
    el(head, 'h3', 'brpg-section-title', e.format(d));
    button(head, 'Definir como data do mundo', () => new WorldDateEditor(this.plugin, c, d).open(), { icon: 'clock-3', iconOnly: true });
    const bits = el(section, 'div', 'brpg-metadata');
    el(bits, 'span', 'brpg-chip', meta.weekday || 'Fora da semana');
    if (meta.special) el(bits, 'span', 'brpg-chip', meta.special.name);
    if (season) el(bits, 'span', 'brpg-chip', `${season.name} · dia ${season.dayOfSeason}`);
    for (const moon of moons) el(bits, 'span', 'brpg-chip', `${moon.icon} ${moon.name} · ${moon.phase}`);
    if (events.length) events.forEach((event) => this.eventCard(section, c, e, event, d));
    else info(section, 'Nenhum evento para este dia.');
  }
  renderTimeline(root, c, e) {
    const year = this.selected.year;
    const section = el(root, 'section', 'brpg-timeline');
    el(section, 'h3', 'brpg-section-title', `Cronologia · ano ${e.yearLabel(year)}`);
    const occurrences = this.filtered(c.events).map((event) => ({ event, d: e.firstOccurrenceInYear(event, year) }))
      .filter((x) => x.d).sort((a, b) => e.epoch(a.d) - e.epoch(b.d) || a.event.title.localeCompare(b.event.title));
    if (!occurrences.length) info(section, 'Nenhum evento no ano com o filtro atual.');
    const max = 200;
    for (const { event, d } of occurrences.slice(0, max)) this.eventCard(section, c, e, event, d, true);
    if (occurrences.length > max) info(section, `Mostrando os primeiros ${max}. Filtre por categoria para ver outro recorte.`);
  }
  eventCard(root, c, e, event, d, showDate = false) {
    const card = el(root, 'article', 'brpg-event');
    const top = el(card, 'div', 'brpg-event-heading');
    this.dot(top, event.color);
    el(top, 'h4', '', event.title);
    if (event.hidden) el(top, 'span', 'brpg-chip', 'Reservado');
    const details = [];
    if (showDate) details.push(e.format(d));
    if (event.category) details.push(event.category);
    if (event.repeat === 'year') details.push('Anual');
    if (event.repeat === 'season') details.push('Início de estação');
    if (event.end && event.repeat === 'none') details.push(`Até ${e.format(event.end)}`);
    if (details.length) el(card, 'p', 'brpg-hint', details.join(' · '));
    if (event.description) el(card, 'p', 'brpg-event-description', event.description);
    const actions = el(card, 'div', 'brpg-toolbar');
    if (event.note) button(actions, 'Abrir nota', this.run(() => this.plugin.openNote(event.note)), { icon: 'file-text' });
    button(actions, 'Editar evento', () => new EventEditor(this.plugin, c, d, event).open(), { icon: 'pencil', iconOnly: true });
    button(actions, 'Remover evento', () => new Confirm(this.app, `Remover “${event.title}” deste calendário?`,
      () => this.plugin.editCalendar(c.id, (updated) => { updated.events = updated.events.filter((x) => x.id !== event.id); })).open(), { icon: 'trash-2', iconOnly: true });
  }
}

module.exports = { VIEW, CalendarView };
