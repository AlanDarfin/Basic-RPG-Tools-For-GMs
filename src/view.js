'use strict';
const { ItemView, setIcon } = require('obsidian');
const { CalendarEngine, MAX_YEAR, sameDate, clockText } = require('./calendar');
const { el, button, select, info, replaceEl, CalendarEditor, EventEditor, WorldDateEditor, Confirm } = require('./ui');
const { solarPositions, formatTime } = require('./sky');
const { eclipsesForDay, nextEclipse } = require('./eclipse');
const { mode: clockMode, readMinute } = require('./world-clock');
const { focusSky, skyOverview, gridIcon } = require('./celestial-ui');
const { weatherDay } = require('./weather');
const { renderWeather, weatherShortcut } = require('./weather-view');
const { renderSeasons } = require('./season-view');

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
    this.weatherPanel = 'forecast';
    this.expandedSeasons = new Set();
    this.category = '';
    this.showHidden = false;
    this.timelineMonth = '';
    this.layout = 'auto';
    this.detailOpen = false;
    this.skyMinute = null;
    this.skyFollowing = true;
    this.paintSkyClock = null;
    this.paintFocusSky = null;
    this.paintWeatherClock = null;
  }
  getViewType() { return VIEW; }
  getDisplayText() { return 'Basic RPG · Calendário'; }
  getIcon() { return 'calendar-days'; }
  async onOpen() { this.render(); }
  async onClose() { this.clockReadout = null; this.paintSkyClock = null; this.paintFocusSky = null; this.paintWeatherClock = null; replaceEl(this.contentEl); }
  clockTick() {
    const c = this.plugin.active();
    if (!c || !this.clockReadout || this.calId !== c.id) return;
    const e = new CalendarEngine(c), next = this.plugin.worldNow(c, e);
    if (!sameDate(next, this.savedToday)) { this.render(); return; }
    if (next.hour === this.savedToday.hour && next.minute === this.savedToday.minute) return;
    this.savedToday = { ...next };
    this.clockReadout.textContent = `${e.format(next)} · ${clockText(next)}`;
    if (sameDate(next, this.selected)) {
      if (this.mode === 'sky' && this.skyFollowing) this.paintSkyClock?.(readMinute(c, next));
      if (this.mode === 'month') this.paintFocusSky?.(next);
      if (this.mode === 'weather') this.paintWeatherClock?.(readMinute(c, next));
    }
  }
  sync(c, e, world) {
    if (!this.selected || this.calId !== c.id) {
      this.selected = { ...world };
      this.category = '';
      this.showHidden = false;
      this.expandedSeasons.clear();
      this.timelineMonth = '';
      this.detailOpen = false;
      this.skyMinute = null;
      this.skyFollowing = true;
    } else {
      try { e.check(this.selected); } catch { this.selected = { ...world }; }
      if (this.savedToday && sameDate(this.selected, this.savedToday) && !sameDate(world, this.savedToday)) this.selected = { ...world };
    }
    this.calId = c.id;
    this.savedToday = { ...world };
  }
  choose(d) { this.selected = d; this.render(); }
  showWeather(panel) { this.mode = 'weather'; this.weatherPanel = panel; this.render(); }
  openSkyFromFocus() { this.mode = 'sky'; this.skyFollowing = true; this.render(); }
  defaultSkyMinute(c, date, world) {
    return sameDate(date, world) ? readMinute(c, world) : Math.floor(c.clock.hours * c.clock.minutes / 2);
  }
  run(fn) { return () => this.plugin.attempt(fn); }
  filtered(events) { return events.filter((x) => (this.showHidden || !x.hidden) && (!this.category || x.category === this.category)); }
  render() {
    const c = this.plugin.active();
    if (!c) return;
    const e = new CalendarEngine(c);
    const worldNow = this.plugin.worldNow(c, e);
    this.sync(c, e, worldNow);
    this.paintSkyClock = null;
    this.paintFocusSky = null;
    this.paintWeatherClock = null;
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
    const live = clockMode(c) === 'real';
    el(readout, 'span', `brpg-world-label${live ? ' is-live' : ''}`, live ? 'Relógio em tempo real' : 'Relógio manual');
    this.clockReadout = el(readout, 'span', 'brpg-world-date', `${e.format(worldNow)} · ${clockText(worldNow)}`);
    const worldActions = el(world, 'div', 'brpg-toolbar');
    button(worldActions, 'Voltar um dia no mundo', this.run(() => this.plugin.advance(-1)), { icon: 'skip-back', iconOnly: true, disabled: e.epoch(worldNow) === 0 });
    button(worldActions, 'Avançar um dia no mundo', this.run(() => this.plugin.advance(1)), { icon: 'skip-forward', iconOnly: true,
      disabled: e.epoch(worldNow) + 1 === e.yearStart(MAX_YEAR + 1) });

    const tabs = el(root, 'nav', 'brpg-tabs');
    tabs.setAttribute('aria-label', 'Visualização');
    for (const [key, title, icon] of [['month', 'Calendário', 'calendar-days'], ['timeline', 'Cronologia', 'list-ordered'], ['sky', 'Céu', 'sun'], ['weather', 'Clima', 'cloud-sun']]) {
      const b = button(tabs, title, () => { this.mode = key; this.render(); }, { icon });
      b.setAttribute('aria-pressed', String(this.mode === key));
    }

    const nav = el(root, 'div', 'brpg-navigation');
    const monthMode = this.mode === 'month', skyMode = this.mode === 'sky', weatherMode = this.mode === 'weather';
    const dayMode = skyMode || weatherMode;
    nav.classList.add(dayMode ? 'brpg-nav-day' : monthMode ? 'brpg-nav-month' : 'brpg-nav-year');
    const ordinal = (this.selected.year - 1) * c.months.length + e.monthIndex(this.selected.month);
    const epoch = e.epoch(this.selected);
    const navigate = (dir) => () => {
      this.detailOpen = false;
      if (monthMode) return this.choose(e.monthShift(this.selected, dir));
      if (dayMode) return this.choose(e.shift(this.selected, dir));
      const year = this.selected.year + dir;
      this.choose({ ...this.selected, year, day: Math.min(this.selected.day, e.monthLength(year, this.selected.month)) });
    };
    button(nav, monthMode ? 'Mês anterior' : dayMode ? 'Dia anterior' : 'Ano anterior', navigate(-1),
      { icon: 'chevron-left', iconOnly: true, disabled: monthMode ? ordinal === 0 : dayMode ? epoch === 0 : this.selected.year === 1 });
    if (dayMode) {
      const d = el(nav, 'input', 'brpg-input brpg-day-input');
      d.type = 'number'; d.min = '1'; d.max = e.monthLength(this.selected.year, this.selected.month);
      d.value = this.selected.day; d.setAttribute('aria-label', 'Dia em exibição');
      d.addEventListener('change', () => this.choose({ ...this.selected, day: validNumber(d, 1, Number(d.max), this.selected.day) }));
    }
    if (monthMode || dayMode) select(nav, c.months.map((m) => [m.id, m.name]), this.selected.month,
      (month) => { this.detailOpen = false; this.choose({ year: this.selected.year, month, day: 1 }); }, 'Mês em exibição');
    const y = el(nav, 'input', 'brpg-input brpg-year'); y.type = 'number'; y.min = '1'; y.max = String(MAX_YEAR);
    y.value = this.selected.year; y.setAttribute('aria-label', 'Ano em exibição');
    y.addEventListener('change', () => {
      const year = validNumber(y, 1, MAX_YEAR, this.selected.year);
      this.choose({ ...this.selected, year, day: Math.min(this.selected.day, e.monthLength(year, this.selected.month)) });
    });
    button(nav, monthMode ? 'Próximo mês' : dayMode ? 'Próximo dia' : 'Próximo ano', navigate(1),
      { icon: 'chevron-right', iconOnly: true, disabled: monthMode ? ordinal + 1 === MAX_YEAR * c.months.length :
        dayMode ? epoch + 1 === e.yearStart(MAX_YEAR + 1) : this.selected.year === MAX_YEAR });
    button(nav, 'Hoje', () => {
      this.skyFollowing = true;
      this.choose(this.plugin.worldNow(c, e));
    }, { icon: 'locate-fixed', iconOnly: true });

    if (skyMode) { this.renderSky(root, c, e); return; }
    if (weatherMode) {
      const weatherTabs = el(root, 'nav', 'brpg-weather-tabs');
      weatherTabs.setAttribute('aria-label', 'Clima e estações');
      for (const [id, title, icon] of [['forecast', 'Previsão', 'cloud-sun'], ['seasons', 'Estações', 'leaf']]) {
        const b = button(weatherTabs, title, () => this.showWeather(id), { icon });
        b.setAttribute('aria-pressed', String(this.weatherPanel === id));
      }
      if (this.weatherPanel === 'seasons') renderSeasons(root, this, c, e);
      else this.paintWeatherClock = renderWeather(root, this, c, e);
      return;
    }
    const tools = el(root, 'div', 'brpg-calendar-tools');
    const toolOptions = el(tools, 'details', 'brpg-disclosure brpg-view-filters');
    let filterLabel = monthMode ? 'Exibição e filtros' : 'Filtros';
    if (!c.months.some((m) => m.id === this.timelineMonth)) this.timelineMonth = '';
    if (this.category || this.showHidden || (!monthMode && this.timelineMonth)) filterLabel += ' · ativos';
    summary(toolOptions, filterLabel, 'sliders-horizontal');
    const filters = el(toolOptions, 'div', 'brpg-toolbar');
    if (monthMode) select(filters, [['auto', 'Automático'], ['grid', 'Grade'], ['list', 'Lista']], this.layout,
      (value) => { this.layout = value; this.render(); }, 'Formato do mês');
    else select(filters, [['', 'Todos os meses'], ...c.months.map((m) => [m.id, m.name])], this.timelineMonth,
      (value) => { this.timelineMonth = value; this.render(); }, 'Mês na cronologia');
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
    button(tools, 'Novo evento', () => {
      this.detailOpen = true;
      const date = !monthMode && this.timelineMonth && this.timelineMonth !== this.selected.month
        ? { year: this.selected.year, month: this.timelineMonth, day: 1 } : this.selected;
      const editor = new EventEditor(this.plugin, c, date);
      if (this.category) editor.draft.category = this.category;
      editor.open();
    },
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
    button(heading, 'Configurar sóis', () => new CalendarEditor(this.plugin, c, false, 'sois').open(), { icon: 'settings', iconOnly: true });
    const weather = weatherDay(c, e, this.selected, MAX_YEAR);
    if (weather) weatherShortcut(pane, c, weather, () => this.showWeather('forecast'), true);

    const date = this.selected;
    const day = c.clock.hours * c.clock.minutes;
    const middle = Math.floor(day / 2);
    const initial = this.skyFollowing ? this.defaultSkyMinute(c, date, this.savedToday) : (this.skyMinute ?? middle);
    const controls = el(pane, 'div', 'brpg-sky-controls');
    const sliderRow = el(controls, 'div', 'brpg-sky-time');
    const row = el(sliderRow, 'div', 'brpg-toolbar brpg-time-head');
    const label = el(row, 'div', 'brpg-sky-mode');
    const modeText = el(label, 'strong', 'brpg-label');
    const status = el(label, 'span', 'brpg-hint');
    const timeCluster = el(row, 'div', 'brpg-time-stepper');
    const go = (minute) => { this.skyFollowing = false; update(minute); };
    const previous = button(timeCluster, 'Voltar uma hora na simulação', () => go(this.skyMinute - c.clock.minutes), { icon: 'minus', iconOnly: true });
    const time = el(timeCluster, 'input', 'brpg-input brpg-time-input');
    time.type = 'text'; time.inputMode = 'text'; time.maxLength = 5; time.setAttribute('aria-label', 'Hora simulada (HH:MM)');
    const next = button(timeCluster, 'Avançar uma hora na simulação', () => go(this.skyMinute + c.clock.minutes), { icon: 'plus', iconOnly: true });
    const rail = el(sliderRow, 'div', 'brpg-sky-rail');
    const slider = el(rail, 'input', 'brpg-time-range');
    slider.type = 'range'; slider.min = '0'; slider.max = String(day - 1); slider.step = '1';
    slider.setAttribute('aria-label', 'Percorrer as horas do dia');
    slider.disabled = day === 1;
    const axis = el(sliderRow, 'div', 'brpg-sky-axis');
    const marks = day === 1 ? [[0, 'Início do dia']] : day === 2 ? [[0, 'Início do dia'], [1, 'Fim do dia']] :
      [[0, 'Início do dia'], [middle, 'Meio-dia'], [day - 1, 'Fim do dia']].filter(([at], i, all) => all.findIndex(([n]) => n === at) === i);
    for (const [at, label] of marks) {
      const point = button(axis, label, () => go(at), { className: 'brpg-button brpg-sky-point', iconOnly: true, disabled: day === 1 });
      const stamp = formatTime(at, c.clock);
      point.title = label + ' · ' + stamp;
      point.setAttribute('aria-label', label);
      el(point, 'span', '', stamp);
    }
    const shortcuts = el(controls, 'div', 'brpg-toolbar brpg-sky-shortcuts');
    const useClock = button(shortcuts, 'Hora do mundo', () => {
      this.skyFollowing = true;
      this.choose(this.plugin.worldNow(c, e));
    }, { icon: 'clock-3' });
    el(shortcuts, 'span', 'brpg-hint', 'Toque na hora para digitar');

    const overview = el(pane, 'div', 'brpg-celestial-overview');
    const at = e.epoch(date);
    const suns = solarPositions(c.sky, at, c.clock, initial);
    const paintBodies = skyOverview(overview, suns, e.moons(date, initial / day));
    const updateEclipses = this.renderEclipses(pane, c, e, at, day);
    const details = el(pane, 'details', 'brpg-disclosure brpg-sun-details');
    summary(details, 'Horários e órbitas dos sóis', 'orbit');
    const cards = el(details, 'div', 'brpg-solar-cards');
    const paintOrbits = suns.map((sun) => this.solarCard(cards, sun, c.clock, day));
    const update = (minute, keepText = false) => {
      this.skyMinute = Math.max(0, Math.min(day - 1, minute));
      const following = this.skyFollowing && sameDate(this.savedToday, date);
      modeText.textContent = following ? 'Hora do mundo' : 'Hora simulada';
      status.textContent = following ? (clockMode(c) === 'real' ? 'Acompanhando o relógio' : 'Relógio em modo manual') : 'Prévia sem alterar a campanha';
      useClock.setAttribute('aria-pressed', String(following));
      const value = formatTime(this.skyMinute, c.clock);
      if (!keepText) time.value = value;
      slider.value = String(this.skyMinute);
      slider.setAttribute('aria-valuetext', value);
      slider.style.setProperty('--brpg-time-progress', day > 1 ? pct(this.skyMinute, day - 1) : '0%');
      previous.disabled = this.skyMinute === 0;
      next.disabled = this.skyMinute === day - 1;
      updateEclipses(this.skyMinute);
      const currentSuns = solarPositions(c.sky, at, c.clock, this.skyMinute);
      paintBodies(currentSuns, e.moons(date, this.skyMinute / day));
      paintOrbits.forEach((paint, i) => paint(currentSuns[i], this.skyMinute));
    };
    slider.addEventListener('input', () => go(Number(slider.value)));
    time.addEventListener('change', () => {
      const value = /^(\d{1,2}):(\d{2})$/.exec(time.value.trim());
      if (value && Number(value[1]) < c.clock.hours && Number(value[2]) < c.clock.minutes) {
        go(Number(value[1]) * c.clock.minutes + Number(value[2]));
      } else {
        time.value = formatTime(this.skyMinute, c.clock);
        this.plugin.attempt(() => { throw new Error(`Use HH:MM de 00:00 a ${formatTime(day - 1, c.clock)}.`); });
      }
    });
    this.paintSkyClock = (n) => update(n, time.ownerDocument.activeElement === time);
    if (!c.sky.suns.length) details.hidden = true;
    update(initial);
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
        this.skyFollowing = false;
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

  solarCard(root, sun, clock, total) {
    const card = el(root, 'article', 'brpg-solar-card');
    card.style.setProperty('--brpg-sun-color', sun.color);
    const head = el(card, 'div', 'brpg-sun-heading');
    const icon = el(head, 'span', 'brpg-sun-icon');
    icon.style.setProperty('--brpg-sun-size', String(.8 + Math.min(sun.size, 2) * .45));
    setIcon(icon, 'sun');
    const title = el(head, 'div', 'brpg-sun-name');
    el(title, 'h4', '', sun.name);
    const state = el(title, 'div', 'brpg-hint');
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
    const marker = el(track, 'span', 'brpg-sun-marker');
    const marks = el(card, 'div', 'brpg-sun-marks');
    const n = (num) => num.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    if (sun.horizon === 'normal') {
      el(marks, 'span', '', `Nascer ${formatTime(sun.from, clock)}`);
      el(marks, 'span', '', `Pôr ${formatTime(sun.to, clock)}`);
    }
    const altitude = el(marks, 'span');
    el(marks, 'span', '', `Ciclo de ${n(sun.period)} dias`);
    el(marks, 'span', '', `Tamanho ×${n(sun.size)}`);
    return (current, minute) => {
      card.classList.toggle('is-visible', current.visibleNow);
      state.textContent = current.label;
      altitude.textContent = `Altura ${n(current.altitude)}°`;
      marker.style.setProperty('--brpg-now', pct(minute, total));
    };
  }
  renderMonth(root, c, e) {
    const { year, month } = this.selected, m = c.months[e.monthIndex(month)];
    const content = el(root, 'div', 'brpg-calendar-content');
    const busy = new Map();
    const len = e.monthLength(year, month);
    for (let day = 1; day <= len; day++) busy.set(day, this.filtered(e.eventsOn({ year, month, day })));
    this.renderSelected(content, c, e, busy.get(this.selected.day) || []);
    const body = el(content, 'section', 'brpg-month');
    const head = el(body, 'div', 'brpg-month-head');
    const label = el(head, 'div');
    el(label, 'h3', 'brpg-section-title', `${m.name} · ano ${e.yearLabel(year)}`);
    const count = [...busy.values()].filter((events) => events.length).length;
    el(label, 'p', 'brpg-hint', `${len} dias${count ? ' · '+count+' com eventos' : ''}`);
    const layouts = el(head, 'div', 'brpg-month-layouts');
    for (const [layout, name, icon] of [['grid', 'Usar grade', null], ['list', 'Usar lista', 'list']]) {
      const b = button(layouts, name, () => {
        this.layout = this.layout === layout ? 'auto' : layout;
        this.render();
      }, { icon, iconOnly: true });
      if (layout === 'grid') gridIcon(el(b, 'span', 'brpg-icon'));
      b.setAttribute('aria-pressed', String(this.layout === layout));
    }
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
      let week = 0;
      for (let day = 1; day <= len; day++) {
        const date = { year, month, day };
        const meta = e.dayMeta(date);
        if (meta.index !== null && (meta.index === 0 || !week)) {
          week++;
          el(list, 'div', 'brpg-list-week', `Semana ${week}`);
        } else if (meta.index === null && (day === 1 || e.dayMeta({ year, month, day: day - 1 }).index !== null))
          el(list, 'div', 'brpg-list-week', 'Fora da semana');
        this.renderDay(list, date, c, e, busy.get(day), 'brpg-list-day');
      }
    }
  }
  renderDay(root, d, c, e, events, extra) {
    const meta = e.dayMeta(d);
    const state = (sameDate(d, this.savedToday) ? ' is-today' : '') + (sameDate(d, this.selected) ? ' is-selected' : '');
    const season = e.season(d), start = season?.dayOfSeason === 1;
    const label = [e.format(d), meta.weekday || 'fora da semana', meta.special?.name, start && `Início de ${season.name}`,
      events.length ? `${events.length} evento(s)` : ''].filter(Boolean).join(' · ');
    const b = button(root, label, () => {
      this.detailOpen = true;
      this.choose(d);
      const container = this.contentEl;
      if (container.clientWidth && container.clientWidth < 800)
        container.querySelector('.brpg-selected')?.scrollIntoView({ block: 'nearest' });
      else Array.from(container.querySelectorAll('.brpg-layout button[aria-pressed="true"]')).find((node) => node.offsetParent)?.focus({ preventScroll: true });
    }, { className: `brpg-day ${extra}${state}`, iconOnly: true });
    b.setAttribute('aria-pressed', String(sameDate(d, this.selected)));
    if (sameDate(d, this.savedToday)) b.setAttribute('aria-current', 'date');
    if (start) {
      b.classList.add('brpg-season-start');
      b.style.setProperty('--brpg-season-color', season.color);
      b.title = label;
    }
    el(b, 'strong', 'brpg-day-number', String(d.day));
    if (extra === 'brpg-list-day') {
      const info = el(b, 'span', 'brpg-list-info');
      el(info, 'span', 'brpg-day-name', meta.special?.name || meta.weekday || 'Fora da semana');
      if (start) el(info, 'span', 'brpg-day-event', `Início de ${season.name}`);
      if (events.length && (!start || events[0].title !== season.name)) el(info, 'span', 'brpg-day-event', events[0].title);
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
    const meta = e.dayMeta(d), season = e.season(d);
    const section = el(root, 'section', 'brpg-selected');
    const head = el(section, 'div', 'brpg-toolbar');
    const label = el(head, 'div', 'brpg-day-heading');
    el(label, 'div', 'brpg-eyebrow', 'DIA EM FOCO');
    el(label, 'h3', 'brpg-section-title', e.format(d));
    button(head, 'Ver céu desta data', () => this.openSkyFromFocus(), { icon: 'sun', iconOnly: true });
    button(head, 'Definir como data do mundo', () => new WorldDateEditor(this.plugin, c, d).open(), { icon: 'clock-3', iconOnly: true });
    const bits = el(section, 'div', 'brpg-metadata');
    el(bits, 'span', 'brpg-chip', meta.weekday || 'Fora da semana');
    if (meta.special) el(bits, 'span', 'brpg-chip', meta.special.name);
    if (season) {
      const chip = button(bits, `${season.name} · dia ${season.dayOfSeason}`, () => this.showWeather('seasons'),
        { icon: 'leaf', className: 'brpg-button brpg-season-shortcut' });
      chip.style.setProperty('--brpg-season-color', season.color);
    }
    const weather = weatherDay(c, e, d, MAX_YEAR);
    if (weather) weatherShortcut(bits, c, weather, () => this.showWeather('forecast'));
    const sky = (minute) => solarPositions(c.sky, e.epoch(d), c.clock, minute);
    const moonPhases = (minute) => e.moons(d, minute / (c.clock.hours * c.clock.minutes));
    const paint = focusSky(section, sky(0), moonPhases(0), () => this.openSkyFromFocus());
    const phases = (world) => {
      const minute = this.defaultSkyMinute(c, d, world);
      paint(sky(minute), moonPhases(minute), formatTime(minute, c.clock));
    };
    phases(this.savedToday);
    this.paintFocusSky = phases;
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
      .filter(({ d }) => d && (!this.timelineMonth || d.month === this.timelineMonth))
      .map((item) => ({ ...item, epoch: e.epoch(item.d) }))
      .sort((a, b) => a.epoch - b.epoch || a.event.title.localeCompare(b.event.title, 'pt-BR'));
    if (!occurrences.length) { info(section, 'Nenhum evento neste recorte.'); return; }
    const count = occurrences.length;
    const monthName = c.months.find((m) => m.id === this.timelineMonth)?.name;
    el(section, 'p', 'brpg-hint', `${count} ${count === 1 ? 'evento' : 'eventos'} · ${monthName || 'Todos os meses'}`);
    const max = 200;
    let month, monthBody, previous, entry;
    for (const { event, d, epoch } of occurrences.slice(0, max)) {
      if (d.month !== month) {
        month = d.month;
        monthBody = el(section, 'section', 'brpg-timeline-month');
        el(monthBody, 'h4', 'brpg-timeline-month-title', c.months[e.monthIndex(month)].name);
      }
      if (epoch !== previous) {
        previous = epoch;
        const today = sameDate(d, this.savedToday);
        const row = el(monthBody, 'div', `brpg-timeline-day${today ? ' is-today' : ''}`);
        const badge = button(row, `Abrir ${e.format(d)} no calendário`, () => {
          this.mode = 'month'; this.detailOpen = true; this.choose(d);
        }, { className: 'brpg-button brpg-timeline-date', iconOnly: true });
        el(badge, 'strong', '', String(d.day));
        if (today) { badge.setAttribute('aria-current', 'date'); el(badge, 'span', '', 'Hoje'); }
        entry = el(row, 'div', 'brpg-timeline-entries');
        const meta = e.dayMeta(d);
        el(entry, 'span', 'brpg-timeline-weekday', meta.special?.name || meta.weekday || 'Fora da semana');
      }
      this.eventCard(entry, c, e, event, d, true);
    }
    if (count > max) info(section, `Mostrando os primeiros ${max}. Filtre por mês ou categoria para ver outro recorte.`);
  }
  eventCard(root, c, e, event, d, compact = false) {
    const card = el(root, compact ? 'details' : 'article', compact ? 'brpg-timeline-event' : 'brpg-event');
    const details = [];
    if (event.category) details.push(event.category);
    if (event.repeat === 'year') details.push('Anual');
    if (event.repeat === 'season') details.push('Início de estação');
    if (event.end && event.repeat === 'none') details.push(`Até ${e.format(event.end)}`);
    let body = card;
    if (compact) {
      const top = el(card, 'summary', 'brpg-timeline-summary');
      this.dot(top, event.color);
      const label = el(top, 'span', 'brpg-timeline-label');
      el(label, 'strong', '', event.title);
      if (event.hidden) details.unshift('Reservado');
      if (details.length) el(label, 'small', '', details.join(' · '));
      const arrow = el(top, 'span', 'brpg-icon brpg-timeline-chevron');
      arrow.setAttribute('aria-hidden', 'true'); setIcon(arrow, 'chevron-down');
      body = el(card, 'div', 'brpg-timeline-event-body');
    } else {
      const top = el(card, 'div', 'brpg-event-heading');
      this.dot(top, event.color);
      el(top, 'h4', '', event.title);
      if (event.hidden) el(top, 'span', 'brpg-chip', 'Reservado');
      if (details.length) el(card, 'p', 'brpg-hint', details.join(' · '));
    }
    if (event.description) el(body, 'p', 'brpg-event-description', event.description);
    const actions = el(body, 'div', 'brpg-toolbar');
    if (event.note) button(actions, 'Abrir nota', this.run(() => this.plugin.openNote(event.note)), { icon: 'file-text' });
    button(actions, 'Editar evento', () => new EventEditor(this.plugin, c, d, event).open(), { icon: 'pencil', iconOnly: true });
    button(actions, 'Remover evento', () => new Confirm(this.app, `Remover “${event.title}” deste calendário?`,
      () => this.plugin.editCalendar(c.id, (updated) => { updated.events = updated.events.filter((x) => x.id !== event.id); })).open(), { icon: 'trash-2', iconOnly: true });
  }
}

module.exports = { VIEW, CalendarView };
