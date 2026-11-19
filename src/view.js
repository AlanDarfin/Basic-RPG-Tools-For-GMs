'use strict';
const { ItemView, setIcon } = require('obsidian');
const { CalendarEngine, MAX_YEAR, sameDate, clockText } = require('./calendar');
const { el, button, select, info, replaceEl, CalendarEditor, EventEditor, WorldDateEditor, Confirm } = require('./ui');
const { solarPositions, formatTime } = require('./sky');
const { eclipsesForDay, nextEclipse } = require('./eclipse');

const VIEW = 'basic-rpg-calendar';
const pct = (n, total) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`;
function shortWeek(week) {
  return week.map((name, i) => {
    const opts = [];
    for (let n = 2; n <= 5; n++) opts.push(name.slice(0, n));
    return opts.find((abbr) => week.every((x, j) => j === i || x.slice(0, abbr.length).toLowerCase() !== abbr.toLowerCase())) || name.slice(0, 4);
  });
}
function summary(root, label, icon) {
  const line = el(root, 'summary', 'brpg-summary');
  setIcon(el(line, 'span', 'brpg-icon'), icon);
  el(line, 'span', '', label);
  return line;
}
function validNumber(field, lo, hi, prior) {
  const n = Number(field.value);
  if (field.value !== '' && Number.isInteger(n) && n >= lo && n <= hi) return n;
  field.value = prior;
  return prior;
}

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
    this.detailOpen = false;
    this.skyMinute = null;
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
      this.detailOpen = false;
      this.skyMinute = null;
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
    const headerTop = el(header, 'div', 'brpg-header-top');
    const identity = el(headerTop, 'div', 'brpg-identity');
    el(identity, 'div', 'brpg-eyebrow', 'BASIC RPG');
    el(identity, 'h2', 'brpg-heading', c.name);
    const options = el(headerTop, 'details', 'brpg-disclosure brpg-world-menu');
    summary(options, 'Calendários', 'layers');
    const actions = el(options, 'div', 'brpg-toolbar');
    select(actions, this.plugin.state.calendars.map((item) => [item.id, item.name]), c.id,
      (v) => this.plugin.attempt(() => this.plugin.setActive(v)), 'Calendário ativo');
    button(actions, 'Editar calendário', () => new CalendarEditor(this.plugin, c).open(), { icon: 'settings', iconOnly: true });
    button(actions, 'Novo calendário', () => this.plugin.newCalendar(), { icon: 'plus', iconOnly: true });
    const world = el(header, 'div', 'brpg-world-status');
    const readout = el(world, 'div', 'brpg-world-readout');
    el(readout, 'span', 'brpg-world-label', 'Data do mundo');
    el(readout, 'span', 'brpg-world-date', `${e.format(c.current)} · ${clockText(c.current)}`);
    const worldActions = el(world, 'div', 'brpg-toolbar');
    button(worldActions, 'Voltar um dia no mundo', this.run(() => this.plugin.advance(-1)), { icon: 'skip-back', iconOnly: true, disabled: e.epoch(c.current) === 0 });
    button(worldActions, 'Avançar um dia no mundo', this.run(() => this.plugin.advance(1)), { icon: 'skip-forward', iconOnly: true,
      disabled: e.epoch(c.current) + 1 === e.yearStart(MAX_YEAR + 1) });

    const tabs = el(root, 'nav', 'brpg-tabs');
    tabs.setAttribute('aria-label', 'Visualização');
    for (const [key, title, icon] of [['month', 'Calendário', 'calendar-days'], ['timeline', 'Cronologia', 'list-ordered'], ['sky', 'Céu', 'sun']]) {
      const b = button(tabs, title, () => { this.mode = key; this.render(); }, { icon });
      b.setAttribute('aria-pressed', String(this.mode === key));
    }

    const nav = el(root, 'div', 'brpg-navigation');
    const monthMode = this.mode === 'month', skyMode = this.mode === 'sky';
    nav.classList.add(skyMode ? 'brpg-nav-day' : monthMode ? 'brpg-nav-month' : 'brpg-nav-year');
    const ordinal = (this.selected.year - 1) * c.months.length + e.monthIndex(this.selected.month);
    const epoch = e.epoch(this.selected);
    const navigate = (dir) => () => {
      this.detailOpen = false;
      if (monthMode) return this.choose(e.monthShift(this.selected, dir));
      if (skyMode) return this.choose(e.shift(this.selected, dir));
      const year = this.selected.year + dir;
      this.choose({ ...this.selected, year, day: Math.min(this.selected.day, e.monthLength(year, this.selected.month)) });
    };
    button(nav, monthMode ? 'Mês anterior' : skyMode ? 'Dia anterior' : 'Ano anterior', navigate(-1),
      { icon: 'chevron-left', iconOnly: true, disabled: monthMode ? ordinal === 0 : skyMode ? epoch === 0 : this.selected.year === 1 });
    if (skyMode) {
      const d = el(nav, 'input', 'brpg-input brpg-day-input');
      d.type = 'number'; d.min = '1'; d.max = e.monthLength(this.selected.year, this.selected.month);
      d.value = this.selected.day; d.setAttribute('aria-label', 'Dia em exibição');
      d.addEventListener('change', () => this.choose({ ...this.selected, day: validNumber(d, 1, Number(d.max), this.selected.day) }));
    }
    if (monthMode || skyMode) select(nav, c.months.map((m) => [m.id, m.name]), this.selected.month,
      (month) => { this.detailOpen = false; this.choose({ year: this.selected.year, month, day: 1 }); }, 'Mês em exibição');
    const y = el(nav, 'input', 'brpg-input brpg-year'); y.type = 'number'; y.min = '1'; y.max = String(MAX_YEAR);
    y.value = this.selected.year; y.setAttribute('aria-label', 'Ano em exibição');
    y.addEventListener('change', () => {
      const year = validNumber(y, 1, MAX_YEAR, this.selected.year);
      this.choose({ ...this.selected, year, day: Math.min(this.selected.day, e.monthLength(year, this.selected.month)) });
    });
    button(nav, monthMode ? 'Próximo mês' : skyMode ? 'Próximo dia' : 'Próximo ano', navigate(1),
      { icon: 'chevron-right', iconOnly: true, disabled: monthMode ? ordinal + 1 === MAX_YEAR * c.months.length :
        skyMode ? epoch + 1 === e.yearStart(MAX_YEAR + 1) : this.selected.year === MAX_YEAR });
    button(nav, 'Hoje', () => this.choose({ ...c.current }), { icon: 'locate-fixed', iconOnly: true });

    if (skyMode) { this.renderSky(root, c, e); return; }
    const tools = el(root, 'div', 'brpg-calendar-tools');
    const toolOptions = el(tools, 'details', 'brpg-disclosure brpg-view-filters');
    let filterLabel = monthMode ? 'Exibição e filtros' : 'Filtros';
    if (this.category || this.showHidden) filterLabel += ' · ativos';
    summary(toolOptions, filterLabel, 'sliders-horizontal');
    const filters = el(toolOptions, 'div', 'brpg-toolbar');
    if (monthMode) select(filters, [['auto', 'Automático'], ['grid', 'Grade'], ['list', 'Lista']], this.layout,
      (value) => { this.layout = value; this.render(); }, 'Formato do mês');
    const cats = [...new Set(c.events.map((x) => x.category).filter(Boolean))].sort();
    if (!cats.includes(this.category)) this.category = '';
    if (cats.length) select(filters, [['', 'Todas as categorias'], ...cats.map((cat) => [cat, cat])], this.category,
      (v) => { this.category = v; this.render(); }, 'Categoria de evento');
    if (c.events.some((event) => event.hidden)) {
      const toggle = button(filters, this.showHidden ? 'Ocultar reservados' : 'Mostrar reservados', () => {
        this.showHidden = !this.showHidden; this.render();
      }, { icon: this.showHidden ? 'eye-off' : 'eye' });
      toggle.setAttribute('aria-pressed', String(this.showHidden));
    }
    button(tools, 'Novo evento', () => { this.detailOpen = true; new EventEditor(this.plugin, c, this.selected).open(); },
      { icon: 'plus', className: 'brpg-button mod-cta' });
    if (this.mode === 'timeline') this.renderTimeline(root, c, e);
    else this.renderMonth(root, c, e);
  }

  renderSky(root, c, e) {
    const pane = el(root, 'section', 'brpg-sky');
    const heading = el(pane, 'div', 'brpg-sky-header');
    const title = el(heading, 'div');
    el(title, 'h3', 'brpg-section-title', 'Céu do dia');
    el(title, 'div', 'brpg-hint', e.format(this.selected));
    button(heading, 'Configurar sóis', () => new CalendarEditor(this.plugin, c, false, 'sois').open(), { icon: 'settings' });

    const day = c.clock.hours * c.clock.minutes;
    const middle = Math.floor(day / 2);
    const controls = el(pane, 'div', 'brpg-sky-controls');
    const sliderRow = el(controls, 'div', 'brpg-sky-time');
    const row = el(sliderRow, 'div', 'brpg-toolbar');
    el(row, 'span', 'brpg-label', 'Hora simulada');
    const time = el(row, 'input', 'brpg-input brpg-time-input');
    time.type = 'text'; time.inputMode = 'text'; time.maxLength = 5; time.setAttribute('aria-label', 'Hora simulada (HH:MM)');
    const slider = el(sliderRow, 'input', 'brpg-time-range');
    slider.type = 'range'; slider.min = '0'; slider.max = String(day - 1); slider.step = '1';
    slider.setAttribute('aria-label', 'Percorrer as horas do dia');
    slider.disabled = day === 1;
    const axis = el(sliderRow, 'div', 'brpg-sky-axis');
    el(axis, 'span', '', '00:00');
    el(axis, 'span', '', formatTime(middle, c.clock));
    el(axis, 'span', '', formatTime(day, c.clock, true));
    const shortcuts = el(controls, 'div', 'brpg-toolbar');
    button(shortcuts, 'Hora do mundo', () => update(c.current.hour * c.clock.minutes + c.current.minute), { icon: 'clock-3' });
    button(shortcuts, 'Meio-dia', () => update(middle), { icon: 'sun' });
    const summaryBox = el(pane, 'div', 'brpg-sky-summary');
    summaryBox.setAttribute('aria-live', 'polite');
    const at = e.epoch(this.selected);
    const updateEclipses = this.renderEclipses(pane, c, e, at, day);
    const cards = el(pane, 'div', 'brpg-solar-cards');
    const update = (minute) => {
      this.skyMinute = Math.max(0, Math.min(day - 1, minute));
      time.value = formatTime(this.skyMinute, c.clock);
      slider.value = String(this.skyMinute);
      slider.setAttribute('aria-valuetext', time.value);
      updateEclipses(this.skyMinute);
      replaceEl(summaryBox); replaceEl(cards);
      const p = solarPositions(c.sky, at, c.clock, this.skyMinute);
      if (!p.length) {
        info(cards, 'Nenhum sol configurado neste calendário. Use Configurar sóis para adicionar um.');
        return;
      }
      const today = p.filter((x) => x.visibleToday);
      const now = p.filter((x) => x.visibleNow);
      for (const [label, items] of [['Acima do horizonte agora', now], ['Visíveis em algum momento do dia', today]]) {
        const line = el(summaryBox, 'div', 'brpg-sky-fact');
        el(line, 'span', 'brpg-label', label);
        el(line, 'strong', '', items.length ? items.map((x) => x.name).join(' · ') : 'Nenhum');
      }
      for (const sun of p) this.solarCard(cards, sun, c.clock, this.skyMinute, day);
    };
    slider.addEventListener('input', () => update(Number(slider.value)));
    time.addEventListener('change', () => {
      const value = /^(\d{1,2}):(\d{2})$/.exec(time.value.trim());
      if (value && Number(value[1]) < c.clock.hours && Number(value[2]) < c.clock.minutes)
        update(Number(value[1]) * c.clock.minutes + Number(value[2]));
      else {
        time.value = formatTime(this.skyMinute, c.clock);
        this.plugin.attempt(() => { throw new Error(`Use HH:MM de 00:00 a ${formatTime(day - 1, c.clock)}.`); });
      }
    });
    update(this.skyMinute ?? middle);
    const moons = e.moons(this.selected);
    if (moons.length) {
      const group = el(pane, 'div', 'brpg-sky-moons');
      el(group, 'h3', 'brpg-section-title', 'Luas');
      const list = el(group, 'div', 'brpg-metadata');
      moons.forEach((m) => el(list, 'span', 'brpg-chip', `${m.icon} ${m.name} · ${m.phase}`));
    }
  }

  renderEclipses(parent, c, engine, epoch, total) {
    const section = el(parent, 'section', 'brpg-eclipses');
    const head = el(section, 'div', 'brpg-toolbar brpg-eclipse-header');
    el(head, 'h3', 'brpg-section-title', 'Eclipses');
    const output = el(section, 'div', 'brpg-eclipse-results');
    output.setAttribute('aria-live', 'polite');
    const available = c.sky.suns.length && c.moons.some((moon) => !moon.hidden);
    if (!available) {
      info(section, 'Configure ao menos um sol e uma lua visível para calcular eclipses.');
      return () => {};
    }
    const entries = eclipsesForDay(c, epoch);
    button(head, 'Próximo eclipse', () => {
      replaceEl(output);
      const next = nextEclipse(c, epoch, 366, engine.yearStart(MAX_YEAR + 1) - 1);
      if (!next) { info(output, 'Nenhum pico encontrado nos próximos 366 dias do mundo.'); return; }
      const date = engine.fromEpoch(next.epoch);
      const first = next.events[0];
      info(output, `${engine.format(date)} · ${first.label.toLowerCase()} · ${formatTime(first.peak * total, c.clock, true)} · ${first.aboveHorizon ? 'pico acima' : 'pico abaixo'} do horizonte`);
      button(output, 'Abrir dia do eclipse', () => {
        this.skyMinute = Math.min(total - 1, Math.round(first.peak * total));
        this.choose(date);
      }, { icon: 'arrow-right' });
    }, { icon: 'search' });
    if (!entries.length) {
      info(section, 'Nenhum eclipse calculado para este dia.');
      return () => {};
    }
    const list = el(section, 'div', 'brpg-eclipse-list');
    const markerStatus = [];
    for (const event of entries) {
      const card = el(list, 'article', 'brpg-eclipse-card');
      const top = el(card, 'div', 'brpg-eclipse-item-head');
      const name = el(top, 'div', 'brpg-eclipse-name');
      el(name, 'strong', '', event.label);
      el(name, 'span', '', event.kind === 'solar' ? `${event.moon} passa na frente de ${event.sun}` : `${event.moon} entra na sombra do mundo em relação a ${event.sun}`);
      const status = el(top, 'span', '');
      const axis = el(card, 'div', 'brpg-eclipse-times');
      const time = (t) => formatTime(t * total, c.clock, true);
      el(axis, 'span', '', event.beginsBefore ? 'Já em curso às 00:00' : `Começa ${time(event.start)}`);
      el(axis, 'span', '', `${event.peakInDay ? 'Pico' : 'Máximo do trecho'} ${time(event.peak)}`);
      el(axis, 'span', '', event.endsAfter ? 'Continua no dia seguinte' : `Termina ${time(event.end)}`);
      const metrics = el(card, 'div', 'brpg-eclipse-metrics');
      el(metrics, 'span', 'brpg-chip', event.aboveHorizon ? 'Acima do horizonte no máximo' : 'Abaixo do horizonte no máximo');
      if (event.type !== 'penumbral') {
        const part = event.kind === 'solar' ? 'do disco coberto' : 'do disco na umbra';
        el(metrics, 'span', 'brpg-chip', `${Math.round(event.coverage * 100)}% ${part}`);
      }
      markerStatus.push({ event, card, status });
    }
    if (entries.some((item) => item.kind === 'lunar') && c.sky.suns.length > 1)
      info(section, 'Um eclipse lunar é calculado em relação a um sol. Outros sóis ainda podem iluminar a lua.');
    return (minute) => {
      const t = minute / total;
      for (const { event, card, status } of markerStatus) {
        const live = t >= event.start && t <= event.end;
        card.classList.toggle('is-in-progress', live);
        status.textContent = live ? 'Em curso na simulação' : '';
        status.className = live ? 'brpg-chip brpg-eclipse-live' : '';
      }
    };
  }

  solarCard(root, sun, clock, minute, total) {
    const card = el(root, 'article', 'brpg-solar-card' + (sun.visibleNow ? ' is-visible' : ''));
    card.style.setProperty('--brpg-sun-color', sun.color);
    const head = el(card, 'div', 'brpg-sun-heading');
    const icon = el(head, 'span', 'brpg-sun-icon');
    icon.style.setProperty('--brpg-sun-size', String(.8 + Math.min(sun.size, 2) * .45));
    setIcon(icon, 'sun');
    const title = el(head, 'div', 'brpg-sun-name');
    el(title, 'h4', '', sun.name);
    el(title, 'div', 'brpg-hint', sun.label);
    if (sun.reference) el(head, 'span', 'brpg-chip', 'Referência');
    const track = el(card, 'div', 'brpg-sun-track');
    const windows = sun.intervals.map(([a, b]) => `${formatTime(a, clock)} a ${formatTime(b, clock, true)}`);
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', windows.length ? `Intervalos visíveis: ${windows.join(' e ')}` : 'Sem nascer do sol neste dia');
    for (const [start, end] of sun.intervals) {
      const stripe = el(track, 'span', 'brpg-sun-window');
      stripe.style.setProperty('--brpg-from', pct(start, total));
      stripe.style.setProperty('--brpg-duration', pct(end - start, total));
    }
    el(track, 'span', 'brpg-sun-marker').style.setProperty('--brpg-now', pct(minute, total));
    const marks = el(card, 'div', 'brpg-sun-marks');
    const n = (num) => num.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    if (sun.horizon === 'normal') {
      el(marks, 'span', '', `Nascer ${formatTime(sun.from, clock)}`);
      el(marks, 'span', '', `Pôr ${formatTime(sun.to, clock)}`);
    }
    el(marks, 'span', '', `Altura ${n(sun.altitude)}°`);
    el(marks, 'span', '', `Ciclo de ${n(sun.period)} dias`);
    el(marks, 'span', '', `Tamanho ×${n(sun.size)}`);
  }
  renderMonth(root, c, e) {
    const { year, month } = this.selected, m = c.months[e.monthIndex(month)];
    const content = el(root, 'div', 'brpg-calendar-content');
    const body = el(content, 'section', 'brpg-month');
    el(body, 'h3', 'brpg-section-title', `${m.name} · ano ${e.yearLabel(year)}`);
    const busy = new Map();
    const len = e.monthLength(year, month);
    for (let day = 1; day <= len; day++) busy.set(day, this.filtered(e.eventsOn({ year, month, day })));
    this.renderSelected(content, c, e, busy.get(this.selected.day) || []);
    const group = el(body, 'div', `brpg-layout brpg-layout-${this.layout}${c.week.length > 8 ? ' brpg-long-week' : ''}`);
    // Render one layout in explicit modes. CSS selects the responsive default in auto.
    if (this.layout !== 'list') {
      const grid = el(group, 'div', 'brpg-grid');
      grid.style.setProperty('--brpg-week', String(c.week.length));
      if (!m.intercalary) for (const [i, label] of shortWeek(c.week).entries()) {
        const w = c.week[i];
        const header = el(grid, 'div', 'brpg-weekday', label);
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
  }
  renderDay(root, d, c, e, events, extra) {
    const meta = e.dayMeta(d);
    const state = (sameDate(d, c.current) ? ' is-today' : '') + (sameDate(d, this.selected) ? ' is-selected' : '');
    const label = [e.format(d), meta.weekday || 'fora da semana', meta.special?.name, events.length ? `${events.length} evento(s)` : ''].filter(Boolean).join(' · ');
    const b = button(root, label, () => {
      this.detailOpen = true;
      this.choose(d);
      const container = this.contentEl;
      if (container.clientWidth && container.clientWidth < 800)
        container.querySelector('.brpg-selected')?.scrollIntoView({ block: 'nearest' });
      else Array.from(container.querySelectorAll('.brpg-layout button[aria-pressed="true"]')).find((node) => node.offsetParent)?.focus({ preventScroll: true });
    }, { className: `brpg-day ${extra}${state}`, iconOnly: true });
    b.setAttribute('aria-pressed', String(sameDate(d, this.selected)));
    if (sameDate(d, c.current)) b.setAttribute('aria-current', 'date');
    el(b, 'strong', 'brpg-day-number', String(d.day));
    if (extra === 'brpg-list-day') {
      const info = el(b, 'span', 'brpg-list-info');
      el(info, 'span', 'brpg-day-name', meta.special?.name || meta.weekday || 'Fora da semana');
      if (events.length) el(info, 'span', 'brpg-day-event', events[0].title);
    } else if (meta.special) el(b, 'span', 'brpg-grid-extra', '◆');
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
    const label = el(head, 'div', 'brpg-day-heading');
    el(label, 'div', 'brpg-eyebrow', 'DIA EM FOCO');
    el(label, 'h3', 'brpg-section-title', e.format(d));
    button(head, 'Ver céu desta data', () => { this.mode = 'sky'; this.render(); }, { icon: 'sun', iconOnly: true });
    button(head, 'Definir como data do mundo', () => new WorldDateEditor(this.plugin, c, d).open(), { icon: 'clock-3', iconOnly: true });
    const bits = el(section, 'div', 'brpg-metadata');
    el(bits, 'span', 'brpg-chip', meta.weekday || 'Fora da semana');
    if (meta.special) el(bits, 'span', 'brpg-chip', meta.special.name);
    if (season) el(bits, 'span', 'brpg-chip', `${season.name} · dia ${season.dayOfSeason}`);
    if (moons.length) {
      const m = el(bits, 'span', 'brpg-chip', moons.map((moon) => moon.icon).join(' '));
      m.title = moons.map((moon) => `${moon.name} · ${moon.phase}`).join(' | ');
      m.setAttribute('aria-label', m.title);
    }
    if (events.length) {
      const details = el(section, 'details', 'brpg-disclosure brpg-day-events');
      details.open = this.detailOpen;
      const shortName = events[0].title.length > 50 ? events[0].title.slice(0, 49) + '…' : events[0].title;
      summary(details, `${events.length} ${events.length === 1 ? 'evento' : 'eventos'} · ${shortName}`, 'list');
      details.addEventListener('toggle', () => { this.detailOpen = details.open; });
      events.forEach((event) => this.eventCard(details, c, e, event, d));
    } else info(section, 'Nenhum evento para este dia.');
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
