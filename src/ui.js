'use strict';

const { Modal, FuzzySuggestModal, setIcon } = require('obsidian');
const { CalendarEngine, MAX_YEAR, copy, uid, allWeekdays } = require('./calendar');
const { DEFAULT_COLOR } = require('./imports');
const { MAX_SUNS, emptySky, formatTime } = require('./sky');
const { parseClockTime } = require('./horizon');
const { UNITS, TYPES, PHASE_NAMES, validatePattern, previewPattern } = require('./recurrence');
const { eclipseDefaults } = require('./eclipse');
const { mode: clockMode, alignLocal } = require('./world-clock');
const { BIOMES, MAX_REGIONS, MAX_OFFSET, PROFILE_FIELDS, SEASON_MODIFIERS, biome, region, defaultWeather } = require('./weather');

function el(parent, tag, classes = '', content) {
  const child = parent.ownerDocument.createElement(tag);
  if (classes) child.className = classes;
  if (content !== undefined) child.textContent = content;
  parent.appendChild(child);
  return child;
}
function button(parent, label, fn, opts = {}) {
  const b = el(parent, 'button', opts.className || 'brpg-button');
  b.type = 'button';
  if (opts.icon) setIcon(el(b, 'span', 'brpg-icon'), opts.icon);
  if (!opts.iconOnly) el(b, 'span', '', label);
  b.setAttribute('aria-label', label);
  if (opts.iconOnly) b.title = label;
  if (opts.disabled) b.disabled = true;
  b.addEventListener('click', fn);
  return b;
}
function select(parent, entries, value, update, label) {
  const field = el(parent, 'select', 'brpg-input');
  if (label) field.setAttribute('aria-label', label);
  for (const [key, name] of entries) {
    const opt = el(field, 'option', '', name);
    opt.value = key;
  }
  field.value = value;
  if (update) field.addEventListener('change', () => update(field.value));
  return field;
}
function scope(parent, labels) {
  const field = el(parent, 'label', 'brpg-field');
  el(field, 'span', 'brpg-label', labels);
  return field;
}
function input(parent, label, value, update, options = {}) {
  const field = scope(parent, label);
  const elem = el(field, options.multiline ? 'textarea' : 'input', 'brpg-input');
  if (!options.multiline) elem.type = options.type || 'text';
  elem.value = value === undefined ? '' : String(value);
  if (options.multiline) elem.rows = options.rows || 3;
  if (options.maxLength) elem.maxLength = options.maxLength;
  if (options.min !== undefined) elem.min = options.min;
  if (options.max !== undefined) elem.max = options.max;
  if (options.step !== undefined) elem.step = options.step;
  elem.addEventListener('input', () => update(options.type === 'number' ? (elem.value === '' ? NaN : Number(elem.value)) : elem.value));
  return elem;
}
function fieldSelect(parent, name, entries, current, update) { return select(scope(parent, name), entries, current, update); }
function check(parent, name, value, update) {
  const label = el(parent, 'label', 'brpg-check');
  const elem = el(label, 'input'); elem.type = 'checkbox'; elem.checked = !!value;
  el(label, 'span', '', name);
  elem.addEventListener('change', () => update(elem.checked));
}
function info(parent, text) { return el(parent, 'p', 'brpg-hint', text); }
function inlineNumber(parent, label, value, update, min, max, step = 1) {
  return input(parent, label, value, update, { type: 'number', min, max, step });
}
function monthOptions(c) { return c.months.map((m) => [m.id, m.name]); }
function replaceEl(root) { root.replaceChildren(); }

function horizonFields(card, body, clock, redraw, zone = 0) {
  const box = el(card, 'details', 'brpg-disclosure brpg-horizon-settings');
  el(box, 'summary', 'brpg-summary', 'Nascer e pôr');
  box.open = redraw.body === body;
  const rule = body.riseSet;
  const total = clock.hours * clock.minutes;
  fieldSelect(box, 'Horários de ' + body.name, [['auto', 'Automáticos pela órbita'], ...(total > 1 ? [['fixed', 'Fixos todos os dias']] : [])],
    rule?.mode || 'auto', (mode) => {
      body.riseSet = mode === 'fixed' ? { mode, rise: Math.floor(total / 4) / total, set: Math.max(1, Math.floor(total * .75)) / total }
        : { mode };
      redraw.body = body;
      redraw();
    });
  if (total < 2) { info(box, 'Este relógio tem apenas um minuto por dia. Use horários automáticos.'); return; }
  const fields = el(box, 'div', 'brpg-form-row');
  if (rule?.mode === 'fixed') {
    for (const [key, label] of [['rise', 'Nasce (HH:MM)'], ['set', 'Põe-se (HH:MM)']]) {
      input(fields, label, Number.isFinite(rule[key]) ? formatTime((rule[key] + zone) * total, clock) : '',
        (v) => { const at = parseClockTime(v, clock); rule[key] = ((at - zone) % 1 + 1) % 1; }, { maxLength: 5 });
    }
    info(box, (zone ? 'Informe na hora local da região. ' : '') + 'O horário pode atravessar a meia-noite. A configuração não altera a geometria dos eclipses.');
  } else {
    for (const [key, label] of [['riseOffset', 'Ajuste do nascer (minutos)'], ['setOffset', 'Ajuste do pôr (minutos)']]) {
      inlineNumber(fields, label, Math.round((rule?.[key] || 0) * total), (v) => {
        const dest = body.riseSet ||= { mode: 'auto' };
        dest[key] = v / total;
      }, -Math.floor(total / 2), Math.floor(total / 2));
    }
    info(box, 'Os horários são recalculados a cada data. Valores negativos adiantam o horário.');
  }
}
function dateFields(root, cal, date, clock = false, changed = () => {}) {
  const row = el(root, 'div', 'brpg-form-row');
  const byMonth = (id) => cal.months.find((m) => m.id === id);
  const days = () => {
    try { return new CalendarEngine(cal).monthLength(date.year, date.month); }
    catch { return byMonth(date.month)?.length || 240; }
  };
  let dayInput;
  const clamp = () => {
    const length = days();
    if (dayInput && Number.isFinite(length)) {
      dayInput.max = length;
      if (Number.isInteger(date.day) && date.day > length) {
        date.day = length;
        dayInput.value = length;
      }
    }
  };
  const yearInput = inlineNumber(row, 'Ano', date.year, (v) => { date.year = v; changed(); }, cal.firstYear ?? 1, MAX_YEAR);
  const monthInput = fieldSelect(row, 'Mês', monthOptions(cal), date.month, (v) => { date.month = v; clamp(); changed(); });
  const refreshMonths = () => {
    if (!Number.isInteger(date.year) || date.year < (cal.firstYear ?? 1) || date.year > MAX_YEAR) return;
    try {
      const months = new CalendarEngine(cal).activeMonths(date.year);
      if (!months.length) return;
      replaceEl(monthInput);
      for (const m of months) el(monthInput, 'option', '', m.name).value = m.id;
      if (!months.some((m) => m.id === date.month)) date.month = months[0].id;
      monthInput.value = date.month;
      clamp();
    } catch { /* Keep the controls usable while the draft is invalid. */ }
  };
  yearInput.addEventListener('change', refreshMonths);
  dayInput = inlineNumber(row, 'Dia', date.day, (v) => { date.day = v; changed(); }, 1, days());
  refreshMonths();
  if (clock) {
    inlineNumber(row, 'Hora', date.hour, (v) => { date.hour = v; changed(); }, 0, cal.clock.hours - 1);
    inlineNumber(row, 'Minuto', date.minute, (v) => { date.minute = v; changed(); }, 0, cal.clock.minutes - 1);
  }
}

class RPGModal extends Modal {
  constructor(app, title) { super(app); this.heading = title; }
  frame() {
    this.modalEl.classList.add('brpg-modal-shell');
    this.contentEl.classList.add('brpg', 'brpg-modal');
    replaceEl(this.contentEl);
    el(this.contentEl, 'h2', 'brpg-heading', this.heading);
    return this.contentEl;
  }
  actions(root, action, name = 'Salvar') {
    const row = el(root, 'div', 'brpg-actions');
    const error = el(row, 'p', 'brpg-error');
    error.setAttribute('role', 'alert');
    button(row, 'Cancelar', () => this.close());
    const save = button(row, name, async () => {
      error.textContent = '';
      save.disabled = true;
      try {
        await action();
        this.close();
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err);
        save.disabled = false;
      }
    }, { className: 'brpg-button mod-cta' });
  }
  onClose() { replaceEl(this.contentEl); }
}

class CalendarEditor extends RPGModal {
  constructor(plugin, cal, isNew = false, start = 'geral') {
    super(plugin.app, isNew ? 'Criar calendário' : 'Editar calendário');
    this.plugin = plugin;
    this.draft = copy(cal);
    this.isNew = isNew;
    this.clockMode = isNew && !cal.clockSync ? 'real' : clockMode(cal);
    this.wasDateEdited = false;
    if (!isNew) this.draft.current = plugin.worldNow(cal);
    this.tab = start;
    this.draft.sky ||= emptySky(new CalendarEngine(cal).yearInfo(1).total);
  }
  onOpen() {
    const root = this.frame();
    const bar = el(root, 'div', 'brpg-toolbar');
    select(bar, [['geral', 'Geral'], ['meses', 'Meses'], ['extras', 'Dias especiais'], ['luas', 'Luas'], ['sois', 'Sóis'], ['estacoes', 'Estações'], ['clima', 'Clima'], ['notas', 'Notas e eventos'], ['ciclos', 'Ciclos e datas'], ['eras', 'Eras']],
      this.tab, (v) => { this.tab = v; this.section(); }, 'Seção do editor');
    this.form = el(root, 'div', 'brpg-form');
    this.redrawHorizon = () => this.section();
    this.section();
    this.actions(root, async () => {
      this.draft.name = this.draft.name.trim();
      await this.plugin.putCalendar(this.draft, this.isNew, {
        clockMode: this.clockMode, explicitDate: this.wasDateEdited,
      });
    }, this.isNew ? 'Criar calendário' : 'Salvar calendário');
  }
  group(title, desc) {
    const node = el(this.form, 'section', 'brpg-section');
    el(node, 'h3', '', title);
    if (desc) info(node, desc);
    return node;
  }
  section() {
    replaceEl(this.form);
    const c = this.draft;
    if (this.tab === 'geral') {
      const root = this.group('Identidade e semana');
      input(root, 'Nome do calendário', c.name, (v) => { c.name = v; }, { maxLength: 100 });
      input(root, 'Descrição', c.description, (v) => { c.description = v; }, { multiline: true, maxLength: 2000 });
      input(root, 'Dias da semana (um por linha)', c.week.join('\n'), (v) => {
        c.week = v.split('\n').map((x) => x.trim()).filter(Boolean);
      }, { multiline: true, rows: 5 });
      inlineNumber(root, 'Posição do primeiro dia do ano', c.firstWeekday + 1, (v) => { c.firstWeekday = v - 1; }, 1, 24);
      inlineNumber(root, 'Primeiro ano (0 ou negativo é permitido)', c.firstYear ?? 1, (v) => { c.firstYear = v; }, -MAX_YEAR, 1);
      check(root, 'A semana continua na virada de mês e ano', c.weekOverflow, (v) => { c.weekOverflow = v; });
      const clock = this.group('Relógio do mundo');
      const row = el(clock, 'div', 'brpg-form-row');
      inlineNumber(row, 'Horas por dia', c.clock.hours, (v) => { c.clock.hours = v; }, 1, 100);
      inlineNumber(row, 'Minutos por hora', c.clock.minutes, (v) => { c.clock.minutes = v; }, 1, 100);
      fieldSelect(clock, 'Avanço do relógio', [['real', 'Tempo real'], ['manual', 'Manual']], this.clockMode,
        (v) => { this.clockMode = v; });
      inlineNumber(clock, 'Horas reais por dia do mundo', c.realDayHours ?? 24, (v) => { c.realDayHours = v; }, .01, 8760, 'any');
      info(clock, 'O tempo decorrido é recuperado ao reabrir o Obsidian. A proporção padrão é 24 horas reais por dia fictício.');
      const targets = this.plugin.state.calendars.filter((item) => item.id !== c.id && !item.clockLink);
      if (targets.length) {
        fieldSelect(clock, 'Sincronizar com calendário', [['', 'Relógio independente'], ...targets.map((x) => [x.id, x.name])], c.clockLink?.id || '', (id) => {
          if (id) c.clockLink = { id, offset: c.clockLink?.offset || 0 }; else delete c.clockLink;
          this.section();
        });
        if (c.clockLink) inlineNumber(clock, 'Diferença em dias em relação à referência', c.clockLink.offset, (v) => { c.clockLink.offset = v; }, -1000000, 1000000, 'any');
      }
      dateFields(this.group('Definir data e hora'), c, c.current, true, () => { this.wasDateEdited = true; });
    } else if (this.tab === 'meses') {
      const root = this.group('Meses', 'A ordem é a ordem do ano. Meses intercalados não consomem dias da semana.');
      c.months.forEach((m, i) => {
        const card = el(root, 'div', 'brpg-edit-card');
        const row = el(card, 'div', 'brpg-form-row');
        input(row, 'Nome', m.name, (v) => { m.name = v; }, { maxLength: 60 });
        inlineNumber(row, 'Dias', m.length, (v) => { m.length = v; }, 1, 240);
        check(card, 'Fora da semana (intercalado)', m.intercalary, (v) => { m.intercalary = v; if (v) delete m.week; this.section(); });
        if (!m.intercalary) {
          const alt = el(card, 'details', 'brpg-disclosure');
          el(alt, 'summary', 'brpg-summary', 'Semana própria deste mês');
          input(alt, 'Dias (um por linha, vazio usa a semana global)', (m.week || []).join('\n'), (v) => {
            const week = v.split('\n').map((x) => x.trim()).filter(Boolean);
            if (week.length) m.week = week; else delete m.week;
          }, { multiline: true });
        }
        const recurrence = el(card, 'details', 'brpg-disclosure');
        el(recurrence, 'summary', 'brpg-summary', 'Recorrência do mês');
        inlineNumber(recurrence, 'Aparece a cada N anos', m.every ?? 1, (v) => { m.every = v; }, 1, MAX_YEAR);
        inlineNumber(recurrence, 'Deslocamento em anos', m.offset ?? 0, (v) => { m.offset = v; }, -MAX_YEAR, MAX_YEAR);
        const actions = el(card, 'div', 'brpg-toolbar');
        const swap = (j) => { [c.months[i], c.months[j]] = [c.months[j], c.months[i]]; this.section(); };
        button(actions, 'Subir mês', () => swap(i - 1), { icon: 'arrow-up', iconOnly: true, disabled: i === 0 });
        button(actions, 'Descer mês', () => swap(i + 1), { icon: 'arrow-down', iconOnly: true, disabled: i + 1 === c.months.length });
        button(actions, 'Remover mês', () => {
          const next = c.months.find((item) => item.id !== m.id);
          c.months.splice(i, 1);
          if (c.current.month === m.id) {
            Object.assign(c.current, { month: next.id, day: 1 });
            this.wasDateEdited = true;
          }
          this.section();
        }, { icon: 'trash-2', iconOnly: true, disabled: c.months.length === 1 });
      });
      button(root, 'Adicionar mês', () => { c.months.push({ id: uid('mes'), name: `Mês ${c.months.length + 1}`, length: 30, intercalary: false }); this.section(); }, { icon: 'plus' });
    } else if (this.tab === 'extras') {
      const root = this.group('Dias especiais', 'Entram no fim do mês por padrão. Escolha uma posição para inserir o dia no início ou no meio do mês.');
      c.leapDays.forEach((x, i) => {
        const card = el(root, 'div', 'brpg-edit-card');
        const row = el(card, 'div', 'brpg-form-row');
        input(row, 'Nome', x.name, (v) => { x.name = v; }, { maxLength: 60 });
        fieldSelect(row, 'Mês', monthOptions(c), x.month, (v) => { x.month = v; });
        inlineNumber(row, 'A cada N anos', x.every, (v) => { x.every = v; }, 1, MAX_YEAR);
        check(card, 'Não ocupa dia da semana', x.intercalary, (v) => { x.intercalary = v; });
        const options = el(card, 'details', 'brpg-detail');
        el(options, 'summary', '', 'Regra avançada');
        const o = el(options, 'div', 'brpg-form-row');
        input(o, 'Depois do dia (0 = início, vazio = fim)', x.after ?? '', (v) => {
          if (v.trim()) x.after = Number(v); else delete x.after;
        }, { maxLength: 4, type: 'text' }).inputMode = 'numeric';
        inlineNumber(o, 'Deslocamento de ano', x.offset, (v) => { x.offset = v; }, -MAX_YEAR, MAX_YEAR);
        inlineNumber(o, 'Exceto a cada (0 desativa)', x.except, (v) => { x.except = v; }, 0, MAX_YEAR);
        inlineNumber(o, 'Restaurar a cada (0 desativa)', x.also, (v) => { x.also = v; }, 0, MAX_YEAR);
        button(card, 'Remover dia especial', () => { c.leapDays.splice(i, 1); this.section(); }, { icon: 'trash-2' });
      });
      button(root, 'Adicionar dia especial', () => {
        c.leapDays.push({ id: uid('dia'), name: 'Novo dia', month: c.months[0].id, every: 1, except: 0, also: 0, offset: 0, intercalary: false });
        this.section();
      }, { icon: 'plus' });
    } else if (this.tab === 'luas') {
      const root = this.group('Luas', 'Cada lua tem um ciclo independente. O tamanho aparente controla o disco exibido e a cobertura dos eclipses.');
      c.moons.forEach((m, i) => {
        const eclipse = m.eclipse ||= eclipseDefaults(m, i);
        const card = el(root, 'div', 'brpg-edit-card');
        const row = el(card, 'div', 'brpg-form-row');
        input(row, 'Nome', m.name, (v) => { m.name = v; }, { maxLength: 60 });
        inlineNumber(row, 'Ciclo em dias', m.period, (v) => { m.period = v; }, 1, MAX_YEAR, 'any');
        inlineNumber(row, 'Deslocamento', m.offset, (v) => { m.offset = v; }, -MAX_YEAR, MAX_YEAR, 'any');
        inlineNumber(row, 'Tamanho aparente (raio em °)', eclipse.radius, (v) => { eclipse.radius = v; }, .02, 4, 'any');
        check(card, 'Ocultar no calendário', m.hidden, (v) => { m.hidden = v; });
        const orbit = el(card, 'details', 'brpg-disclosure brpg-eclipse-settings');
        el(orbit, 'summary', 'brpg-summary', 'Órbita e eclipses');
        const fields = el(orbit, 'div', 'brpg-form-row');
        inlineNumber(fields, 'Inclinação orbital (°)', eclipse.inclination, (v) => { eclipse.inclination = v; }, -89, 89, 'any');
        inlineNumber(fields, 'Nó ascendente (°)', eclipse.node, (v) => { eclipse.node = v; }, -360, 360, 'any');
        inlineNumber(fields, 'Raio da umbra (°)', eclipse.shadow, (v) => { eclipse.shadow = v; }, .02, 6, 'any');
        horizonFields(card, m, c.clock, this.redrawHorizon);
        button(card, 'Remover lua', () => { c.moons.splice(i, 1); this.section(); }, { icon: 'trash-2' });
      });
      button(root, 'Adicionar lua', () => {
        c.moons.push({ id: uid('lua'), name: 'Nova lua', period: 28, offset: 0, granularity: 8, rounding: 'round', hidden: false });
        this.section();
      }, { icon: 'plus' });
    } else if (this.tab === 'sois') {
      const root = this.group('Sóis e observação', 'O sol de referência passa no ponto mais alto ao meio-dia e precisa nascer todos os dias.');
      const sky = c.sky;
      const general = el(root, 'div', 'brpg-form-row');
      inlineNumber(general, 'Latitude do observador (°)', sky.latitude, (v) => { sky.latitude = v; }, -89, 89, 'any');
      inlineNumber(general, 'Período da órbita de raio 1 (dias)', sky.unitPeriod, (v) => { sky.unitPeriod = v; }, 1, MAX_YEAR, 'any');
      if (sky.suns.length) fieldSelect(root, 'Sol de referência', sky.suns.map((x) => [x.id, x.name]), sky.referenceId,
        (v) => { sky.referenceId = v; this.section(); });
      else info(root, 'Nenhum sol. Adicione um para começar.');
      sky.suns.forEach((sun, i) => {
        const card = el(root, 'div', 'brpg-edit-card brpg-sun-edit');
        const row = el(card, 'div', 'brpg-form-row');
        input(row, 'Nome', sun.name, (v) => { sun.name = v; }, { maxLength: 60 });
        input(row, 'Cor', sun.color, (v) => { sun.color = v; }, { type: 'color' });
        const orbit = el(card, 'div', 'brpg-form-row');
        inlineNumber(orbit, 'Semieixo relativo', sun.orbit, (v) => { sun.orbit = v; }, .04, 12, 'any');
        inlineNumber(orbit, 'Inclinação (°)', sun.tilt, (v) => { sun.tilt = v; }, -89, 89, 'any');
        inlineNumber(orbit, 'Fase inicial (°)', sun.phase, (v) => { sun.phase = v; }, -360, 360, 'any');
        inlineNumber(orbit, 'Tamanho relativo', sun.size, (v) => { sun.size = v; }, .05, 4, 'any');
        horizonFields(card, sun, c.clock, this.redrawHorizon);
        if (sun.id === sky.referenceId) info(card, 'Referência. Escolha outro sol antes de remover este.');
        else button(card, 'Remover sol', () => { sky.suns.splice(i, 1); this.section(); }, { icon: 'trash-2' });
        if (sky.suns.length === 1 && sun.id === sky.referenceId) {
          button(card, 'Remover único sol', () => { sky.suns = []; sky.referenceId = null; this.section(); }, { icon: 'trash-2' });
        }
      });
      button(root, 'Adicionar sol', () => {
        const sun = { id: uid('sol'), name: `Sol ${sky.suns.length + 1}`, orbit: 1, tilt: 0, phase: 0, size: 1, color: '#f4ac63' };
        sky.suns.push(sun); sky.referenceId ||= sun.id; this.section();
      }, { icon: 'plus', disabled: sky.suns.length >= MAX_SUNS });
    } else if (this.tab === 'estacoes') {
      const root = this.group('Estações', 'Estações por data se repetem no ano. As de ciclo correm independentemente do calendário civil.');
      fieldSelect(root, 'Tipo', [['date', 'Começam em uma data'], ['periodic', 'Ciclo contínuo por duração']], c.seasonMode, (v) => {
        c.seasonMode = v;
        c.seasons.forEach((s) => { s.month ||= c.months[0].id; s.day ||= 1; s.duration ||= 90; });
        this.section();
      });
      if (c.seasonMode === 'periodic') inlineNumber(root, 'Deslocamento do ciclo em dias', c.seasonOffset, (v) => { c.seasonOffset = v; }, -MAX_YEAR, MAX_YEAR, 'any');
      c.seasons.forEach((x, i) => {
        const card = el(root, 'div', 'brpg-edit-card');
        const row = el(card, 'div', 'brpg-form-row');
        input(row, 'Nome', x.name, (v) => { x.name = v; }, { maxLength: 60 });
        input(row, 'Cor', x.color, (v) => { x.color = v; }, { type: 'color' });
        if (c.seasonMode === 'periodic') {
          inlineNumber(row, 'Duração em dias', x.duration, (v) => { x.duration = v; }, 1, MAX_YEAR, 'any');
          const order = el(card, 'div', 'brpg-toolbar');
          const swap = (j) => { [c.seasons[i], c.seasons[j]] = [c.seasons[j], c.seasons[i]]; this.section(); };
          button(order, 'Subir estação', () => swap(i - 1), { icon: 'arrow-up', iconOnly: true, disabled: i === 0 });
          button(order, 'Descer estação', () => swap(i + 1), { icon: 'arrow-down', iconOnly: true, disabled: i + 1 === c.seasons.length });
        } else {
          fieldSelect(row, 'Mês', monthOptions(c), x.month, (v) => { x.month = v; });
          inlineNumber(row, 'Dia inicial', x.day, (v) => { x.day = v; }, 1, 240);
        }
        const effects = el(card, 'details', 'brpg-season-adjustments');
        effects.open = this.seasonEditorId === x.id;
        el(effects, 'summary', 'brpg-summary', 'Ajustes climáticos da estação');
        info(effects, 'Somam ao perfil de cada região e entram gradualmente no clima. Zero não altera o perfil. P.p. significa pontos percentuais.');
        const adjustments = el(effects, 'div', 'brpg-form-row');
        for (const [key, label, lo, hi] of SEASON_MODIFIERS) inlineNumber(adjustments, label, x.climate?.[key] ?? 0, (v) => {
          x.climate ||= {};
          if (v === 0) delete x.climate[key];
          else x.climate[key] = v;
          if (!Object.keys(x.climate).length) delete x.climate;
        }, lo, hi, 'any');
        button(card, 'Remover estação', () => {
          c.seasons.splice(i, 1);
          for (const r of c.weather?.regions || []) r.seasons = r.seasons.filter((p) => p.id !== x.id);
          this.section();
        }, { icon: 'trash-2' });
      });
      button(root, 'Adicionar estação', () => {
        const used = new Set(c.seasons.map((s) => s.month + '/' + s.day));
        let start = { month: c.months[0].id, day: 1 };
        if (c.seasonMode === 'date') {
          outer: for (const m of c.months) {
            for (let day = 1; day <= m.length; day++) {
              if (!used.has(m.id + '/' + day)) { start = { month: m.id, day }; break outer; }
            }
          }
        }
        const newSeason = { id: uid('estacao'), name: 'Estação ' + (c.seasons.length + 1), ...start, duration: 90, color: DEFAULT_COLOR };
        c.seasons.push(newSeason);
        this.seasonEditorId = newSeason.id;
        this.section();
      }, { icon: 'plus', disabled: c.seasons.length >= 50 || (c.seasonMode === 'date' &&
        c.seasons.length >= c.months.reduce((sum, m) => sum + m.length, 0)) });
    } else if (this.tab === 'clima') {
      this.weatherSection(c);
    } else if (this.tab === 'notas') {
      const root = this.group('Eventos das notas', 'Lê as propriedades das notas sem modificar os arquivos. Os eventos continuam pertencendo às notas.');
      const notes = c.noteSources ||= { enabled: false, folder: '', parseTitle: false, inline: false };
      check(root, 'Avisar os eventos do dia enquanto o Obsidian estiver aberto', c.dayNotices, (v) => { c.dayNotices = v; });
      check(root, 'Criar eventos a partir das notas', notes.enabled, (v) => { notes.enabled = v; });
      input(root, 'Pasta das notas (vazio usa o cofre)', notes.folder, (v) => { notes.folder = v.trim(); }, { maxLength: 500 });
      check(root, 'Ler data no início do título', notes.parseTitle, (v) => { notes.parseTitle = v; });
      check(root, 'Ler linhas de eventos no corpo da nota', notes.inline, (v) => { notes.inline = v; });
      info(root, 'Use fc-date com ano-mês-dia. Para um evento na nota, use brpg: 1-01-07 | Nome do evento.');
      const cats = this.group('Categorias', 'Uma por linha no formato Nome | #cor | reservado. A cor e o último campo são opcionais.');
      input(cats, 'Categorias padrão', (c.eventCategories || []).map((x) => x.name + ' | ' + x.color + (x.hidden ? ' | reservado' : '')).join('\n'),
        (text) => { c.eventCategories = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
          const [name, color, hidden] = l.split('|').map((s) => s.trim());
          return { name, color: color || DEFAULT_COLOR, hidden: hidden === 'reservado' };
        }); }, { multiline: true, rows: 5 });
    } else if (this.tab === 'ciclos') {
      const display = this.group('Exibição', 'Formatos de data podem usar {dia}, {mes}, {ano} para o nome da era e {numero} para o número absoluto.');
      input(display, 'Formato da data', c.dateFormat || '', (v) => { c.dateFormat = v.trim(); }, { maxLength: 100 });
      input(display, 'Anos com nome (ano | nome)', (c.namedYears || []).map((x) => x.year + ' | ' + x.name).join('\n'),
        (v) => { c.namedYears = v.split('\n').filter((l) => l.trim()).map((l) => {
          const [year, ...name] = l.split('|'); return { year: Number(year.trim()), name: name.join('|').trim() };
        }); }, { multiline: true, rows: 4 });
      const root = this.group('Ciclos independentes', 'Use ciclos separados para zodíaco, dinastias ou outros nomes recorrentes.');
      const cycles = c.cycles ||= [];
      for (const x of cycles) {
        const card = el(root, 'div', 'brpg-edit-card');
        input(card, 'Nome do ciclo', x.name, (v) => { x.name = v.trim(); }, { maxLength: 60 });
        fieldSelect(card, 'Unidade', UNITS.filter(([id]) => id !== 'week'), x.unit, (v) => { x.unit = v; });
        inlineNumber(card, 'Duração de cada nome', x.span, (v) => { x.span = v; }, 1, 100000);
        inlineNumber(card, 'Deslocamento', x.offset, (v) => { x.offset = v; }, -100000, 100000);
        input(card, 'Nomes no ciclo (um por linha)', x.labels.join('\n'), (v) => { x.labels = v.split('\n').map((l) => l.trim()).filter(Boolean); }, { multiline: true });
        button(card, 'Remover ciclo', () => { cycles.splice(cycles.indexOf(x), 1); this.section(); }, { icon: 'trash-2' });
      }
      button(root, 'Adicionar ciclo', () => { cycles.push({ name: 'Ciclo ' + (cycles.length + 1), unit: 'year', span: 1, offset: 0, labels: ['Lobo', 'Lua'] }); this.section(); },
        { icon: 'plus', disabled: cycles.length >= 12 });
    } else {
      const root = this.group('Eras', 'As eras só mudam como o ano aparece. Datas e eventos mantêm a contagem absoluta.');
      c.eras.forEach((x, i) => {
        const card = el(root, 'div', 'brpg-edit-card');
        const row = el(card, 'div', 'brpg-form-row');
        input(row, 'Nome', x.name, (v) => { x.name = v; }, { maxLength: 60 });
        inlineNumber(row, 'Ano de início', x.start, (v) => { x.start = v; }, c.firstYear ?? 1, MAX_YEAR);
        check(card, 'Mostrar como ano 1 na virada da era', x.reset, (v) => { x.reset = v; });
        button(card, 'Remover era', () => { c.eras.splice(i, 1); this.section(); }, { icon: 'trash-2' });
      });
      button(root, 'Adicionar era', () => { c.eras.push({ name: 'Nova era', start: c.firstYear ?? 1, reset: true }); this.section(); }, { icon: 'plus' });
    }
  }
  weatherSection(c) {
    const w = c.weather ||= defaultWeather();
    const general = this.group('Simulação do clima', 'A mesma semente, data e região reproduzem o mesmo clima. Não usa internet.');
    check(general, 'Ativar o clima neste calendário', w.enabled, (v) => { w.enabled = v; });
    const setup = el(general, 'div', 'brpg-form-row');
    input(setup, 'Semente do clima', w.seed, (v) => { w.seed = v.trim(); }, { maxLength: 80 });
    inlineNumber(setup, 'Atraso do clima (dias)', w.offset, (v) => { w.offset = v; }, -MAX_OFFSET, MAX_OFFSET);
    inlineNumber(setup, 'Ponto de congelamento (°C)', w.freeze, (v) => { w.freeze = v; }, -100, 100, 'any');
    fieldSelect(setup, 'Exibir temperatura em', [['C', 'Celsius (°C)'], ['F', 'Fahrenheit (°F)']], w.temperature, (v) => { w.temperature = v; });
    fieldSelect(setup, 'Exibir vento em', [['kmh', 'km/h'], ['mph', 'mph']], w.wind, (v) => { w.wind = v; });

    const body = this.group('Regiões', 'A região ativa vale para a campanha. Edite o perfil-base e ajuste só as estações que precisarem de um clima próprio.');
    const list = w.regions.map((r) => [r.id, r.name || 'Região sem nome']);
    const r = w.regions.find((x) => x.id === this.weatherRegion) || w.regions.find((x) => x.id === w.activeId);
    const selectors = el(body, 'div', 'brpg-form-row');
    fieldSelect(selectors, 'Região ativa', list, w.activeId, (v) => { w.activeId = v; this.weatherRegion = v; this.section(); });
    fieldSelect(selectors, 'Região para editar', list, r.id, (v) => { this.weatherRegion = v; this.section(); });
    const card = el(body, 'div', 'brpg-edit-card');
    const actions = el(card, 'div', 'brpg-toolbar');
    button(actions, 'Nova região', () => {
      const item = region(uid('regiao'), `Região ${w.regions.length + 1}`);
      w.regions.push(item); this.weatherRegion = item.id; this.weatherProfile = null; this.section();
    }, { icon: 'plus', disabled: w.regions.length >= MAX_REGIONS });
    button(actions, 'Remover região', () => new Confirm(this.app, `Remover “${r.name}” e seus perfis climáticos?`, () => {
      w.regions = w.regions.filter((x) => x.id !== r.id);
      if (w.activeId === r.id) w.activeId = w.regions[0].id;
      this.weatherRegion = null; this.weatherProfile = null;
      this.section();
    }).open(), { icon: 'trash-2', disabled: w.regions.length <= 1 });
    input(card, 'Nome da região', r.name, (v) => { r.name = v.trim(); }, { maxLength: 60 });
    const regionalSky = el(card, 'details', 'brpg-disclosure brpg-horizon-settings');
    el(regionalSky, 'summary', 'brpg-summary', 'Horizonte regional');
    const location = input(regionalSky, 'Latitude local (°) — vazio usa o céu padrão', r.latitude ?? '', (v) => {
      if (!v.trim()) delete r.latitude; else r.latitude = Number(v);
    }, { maxLength: 8 });
    location.inputMode = 'decimal';
    const total = c.clock.hours * c.clock.minutes;
    inlineNumber(regionalSky, 'Fuso regional (minutos em relação ao mundo)', Math.round((r.timeOffset || 0) * total),
      (v) => { r.timeOffset = v / total; }, -Math.floor(total / 2), Math.floor(total / 2));
    const bodies = [...c.sky.suns.map((x) => ['sun', x]), ...c.moons.map((x) => ['moon', x])];
    if (bodies.length) {
      const choice = this.regionalBody || bodies[0][0] + ':' + bodies[0][1].id;
      fieldSelect(regionalSky, 'Astro para ajustar na região', bodies.map(([kind, x]) => [kind + ':' + x.id, x.name]), choice,
        (id) => { this.regionalBody = id; this.section(); });
      const match = bodies.find(([kind, x]) => kind + ':' + x.id === choice);
      if (match) {
        const [kind, body] = match;
        const rule = r.horizons?.find((x) => x.kind === kind && x.id === body.id);
        check(regionalSky, 'Configurar horário próprio para ' + body.name, !!rule, (enabled) => {
          this.regionalBody = choice;
          r.horizons ||= [];
          if (enabled) r.horizons.push({ kind, id: body.id, riseSet: { mode: 'auto' } });
          else r.horizons = r.horizons.filter((x) => x.kind !== kind || x.id !== body.id);
          this.section();
        });
        if (rule) {
          rule.name = body.name;
          horizonFields(regionalSky, rule, c.clock, this.redrawHorizon, r.timeOffset || 0);
        }
      }
      regionalSky.open = !!this.regionalBody;
    }
    inlineNumber(card, 'Variação diária da temperatura (0 a 3×)', r.variability ?? 1, (v) => { r.variability = v; }, 0, 3, 'any');
    const station = c.seasons.find((s) => s.id === this.weatherProfile);
    if (c.seasons.length) fieldSelect(card, 'Perfil a editar', [['', 'Perfil-base'], ...c.seasons.map((s) => [s.id, s.name])], station?.id || '',
      (v) => { this.weatherProfile = v; this.section(); });
    else info(card, 'Sem estações, a região usa o perfil-base o ano inteiro.');
    const override = r.seasons.find((s) => s.id === station?.id);
    if (station) {
      check(card, `Clima próprio em ${station.name}`, !!override, (v) => {
        if (v) r.seasons.push({ ...r.base, id: station.id });
        else r.seasons = r.seasons.filter((s) => s.id !== station.id);
        this.section();
      });
      if (!override) { info(card, 'Esta estação usa o perfil-base.'); return; }
    }
    const target = override || r.base;
    fieldSelect(card, 'Aplicar perfil inicial', [['', 'Escolher bioma…'], ...BIOMES.map(([key, name]) => [key, name])], '', (v) => {
      if (v) { Object.assign(target, biome(v)); this.section(); }
    });
    const fields = el(card, 'div', 'brpg-form-row');
    for (const [key, label, lo, hi] of PROFILE_FIELDS) inlineNumber(fields, label, target[key], (v) => { target[key] = v; }, lo, hi, 'any');
  }
}

class NotePicker extends FuzzySuggestModal {
  constructor(app, choose) { super(app); this.choose = choose; this.setPlaceholder('Buscar nota do cofre…'); }
  getItems() { return this.app.vault.getMarkdownFiles(); }
  getItemText(file) { return file.path; }
  onChooseItem(file) { this.choose(file.path); }
}
class EventEditor extends RPGModal {
  constructor(plugin, calendar, date, event = null) {
    super(plugin.app, event ? 'Editar evento' : 'Novo evento');
    this.plugin = plugin;
    this.calendar = copy(calendar);
    this.refDate = { year: date.year, month: date.month, day: date.day };
    this.draft = event ? copy(event) : { id: uid('evento'), title: '', description: '', start: copy(this.refDate),
      end: null, repeat: 'none', seasonId: null, note: '', category: '', color: DEFAULT_COLOR, hidden: false };
  }
  onOpen() {
    const root = this.frame();
    const e = this.draft;
    input(root, 'Título', e.title, (v) => { e.title = v; }, { maxLength: 140 });
    input(root, 'Descrição', e.description, (v) => { e.description = v; }, { multiline: true, maxLength: 8000 });
    const row = el(root, 'div', 'brpg-form-row');
    const category = input(row, 'Categoria', e.category, (v) => { e.category = v; }, { maxLength: 60 });
    const color = input(row, 'Cor', e.color, (v) => { e.color = v; }, { type: 'color' });
    if (this.calendar.eventCategories?.length) fieldSelect(row, 'Aplicar categoria padrão',
      [['', 'Escolher…'], ...this.calendar.eventCategories.map((x) => [x.name, x.name])], '',
      (name) => { const saved = this.calendar.eventCategories.find((x) => x.name === name); if (saved) {
        e.category = category.value = saved.name; e.color = color.value = saved.color;
      } });
    const note = input(row, 'Caminho da nota', e.note, (v) => { e.note = v; }, { maxLength: 1000 });
    button(root, 'Escolher nota do cofre', () => new NotePicker(this.app, (value) => { e.note = value; note.value = value; }).open(), { icon: 'link' });
    check(root, 'Ocultar da visualização por padrão', e.hidden, (v) => { e.hidden = v; });
    fieldSelect(root, 'Recorrência', [['none', 'Uma vez'], ['year', 'A cada ano'], ['pattern', 'Intervalo ou condições'], ['undated', 'Sem data'], ...(this.calendar.seasons.length ? [['season', 'No início de uma estação']] : [])], e.repeat,
      (v) => { e.repeat = v; this.dates(); });
    this.dateRoot = el(root, 'div', 'brpg-form');
    this.dates();
    this.actions(root, async () => {
      e.title = e.title.trim();
      e.category = e.category.trim();
      e.note = e.note.trim();
      const saved = { ...e };
      if (e.repeat === 'season' || e.repeat === 'undated') saved.start = null;
      if (!['none', 'year'].includes(e.repeat)) saved.end = null;
      if (e.repeat !== 'season') saved.seasonId = null;
      if (e.repeat !== 'pattern') delete saved.pattern;
      await this.plugin.editCalendar(this.calendar.id, (c) => {
        const idx = c.events.findIndex((x) => x.id === saved.id);
        if (idx < 0) c.events.push(saved); else c.events[idx] = saved;
      });
    });
  }
  dates() {
    replaceEl(this.dateRoot);
    const e = this.draft, c = this.calendar;
    if (e.repeat === 'season') {
      if (!c.seasons.some((s) => s.id === e.seasonId)) e.seasonId = c.seasons[0].id;
      fieldSelect(this.dateRoot, 'Estação', c.seasons.map((s) => [s.id, s.name]), e.seasonId, (v) => { e.seasonId = v; });
      return;
    }
    if (e.repeat === 'undated') { info(this.dateRoot, 'Aparece na Agenda em “Sem data”, sem ocupar um dia do calendário.'); return; }
    e.start ||= copy(this.refDate);
    if (e.repeat === 'pattern') {
      info(this.dateRoot, 'Início da busca e referência para o intervalo');
      dateFields(this.dateRoot, c, e.start);
      this.patternFields(e, c);
      return;
    }
    info(this.dateRoot, 'Início do evento');
    dateFields(this.dateRoot, c, e.start);
    check(this.dateRoot, 'Tem data de término', !!e.end, (v) => { e.end = v ? copy(e.start) : null; this.dates(); });
    if (e.end) dateFields(this.dateRoot, c, e.end);
  }
  patternFields(event, c) {
    const p = event.pattern ||= { unit: 'day', every: 1, duration: 1, match: 'all', rules: [] };
    const root = el(this.dateRoot, 'div', 'brpg-section');
    el(root, 'h3', '', 'Recorrência e condições');
    const fields = el(root, 'div', 'brpg-form-row');
    inlineNumber(fields, 'A cada', p.every, (v) => { p.every = v; }, 1, 10000);
    fieldSelect(fields, 'Unidade do intervalo', UNITS, p.unit, (v) => { p.unit = v; });
    inlineNumber(fields, 'Duração (dias)', p.duration, (v) => { p.duration = v; }, 1, 366);
    fieldSelect(fields, 'Combinar condições', [['all', 'Todas (E)'], ['any', 'Pelo menos uma (OU)']], p.match, (v) => { p.match = v; });
    info(root, 'Para aplicar só as condições, use a cada 1 dia. Em condições lunares, vale a fase ao meio-dia.');
    const options = (kind) => kind === 'weekday' ? allWeekdays(c).map((w) => [w, w]) :
      kind === 'moon' ? c.moons.filter((m) => !m.hidden).map((m) => [m.id, m.name]) :
      kind === 'season' ? c.seasons.map((s) => [s.id, s.name]) :
      kind === 'month' ? monthOptions(c) : kind === 'event' ? c.events
        .filter((x) => x.id !== event.id && !['pattern', 'undated'].includes(x.repeat)).map((x) => [x.id, x.title]) : [];
    const types = TYPES.filter(([type]) => type === 'day' || options(type).length);
    const fresh = (type) => ({ type, value: type === 'day' ? 1 : options(type)[0]?.[0], phase: 4, after: 1 });
    for (const [i, rule] of p.rules.entries()) {
      const card = el(root, 'div', 'brpg-edit-card brpg-form-row');
      fieldSelect(card, 'Condição ' + (i + 1), types, rule.type, (type) => { p.rules[i] = fresh(type); this.dates(); });
      if (rule.type === 'day') inlineNumber(card, 'Dia do mês', rule.value, (v) => { rule.value = v; }, 1, 340);
      else fieldSelect(card, 'Valor da condição', options(rule.type), rule.value, (v) => { rule.value = v; });
      if (rule.type === 'moon') fieldSelect(card, 'Fase', PHASE_NAMES.map((n, j) => [String(j), n]), String(rule.phase), (v) => { rule.phase = Number(v); });
      if (rule.type === 'event') inlineNumber(card, 'Dias depois', rule.after, (v) => { rule.after = v; }, 0, 5000);
      button(card, 'Remover condição', () => { p.rules.splice(i, 1); this.dates(); }, { icon: 'trash-2', iconOnly: true });
    }
    const bar = el(root, 'div', 'brpg-toolbar');
    button(bar, 'Adicionar condição', () => { p.rules.push(fresh('weekday')); this.dates(); }, { icon: 'plus', disabled: p.rules.length >= 12 });
    const result = el(root, 'div');
    button(bar, 'Prévia de ocorrências', () => {
      replaceEl(result);
      try {
        const engine = new CalendarEngine(c);
        engine.check(event.start);
        validatePattern(c, p);
        const occurrences = previewPattern(engine, event, event.start, engine.yearStart(MAX_YEAR + 1));
        if (!occurrences.length) info(result, 'Sem ocorrência nos primeiros 5.000 dias a partir do início.');
        else {
          const list = el(result, 'ol');
          for (const d of occurrences) el(list, 'li', '', engine.format(d));
        }
      } catch (err) { info(result, err.message); }
    }, { icon: 'list' });
  }

}

class WorldDateEditor extends RPGModal {
  constructor(plugin, cal, chosen) {
    super(plugin.app, 'Definir data do mundo');
    this.plugin = plugin; this.calendar = copy(cal);
    this.date = plugin.worldNow(cal);
    for (const key of ['year','month','day']) if (chosen[key] !== undefined) this.date[key] = chosen[key];
    this.clockMode = clockMode(cal);
  }
  onOpen() {
    const root = this.frame();
    const values = el(root, 'div');
    const draw = () => { replaceEl(values); dateFields(values, this.calendar, this.date, true); };
    draw();
    button(root, 'Alinhar à hora local', () => {
      this.date = alignLocal(this.calendar, this.date, this.plugin.clockNow());
      draw();
    }, { icon: 'clock-3' });
    fieldSelect(root, 'Avanço do relógio', [['real', 'Tempo real'], ['manual', 'Manual']], this.clockMode, (v) => { this.clockMode = v; });
    info(root, 'Alinhar altera apenas a hora. A data do mundo continua sendo a escolhida acima.');
    this.actions(root, () => this.plugin.setWorldDate(this.calendar.id, this.date, this.clockMode));
  }
}
class Confirm extends RPGModal {
  constructor(app, message, act) { super(app, 'Confirmar remoção'); this.message = message; this.act = act; }
  onOpen() { const root = this.frame(); info(root, this.message); this.actions(root, this.act, 'Remover'); }
}
module.exports = { el, button, select, input, info, inlineNumber, replaceEl, CalendarEditor, EventEditor, WorldDateEditor, Confirm };
