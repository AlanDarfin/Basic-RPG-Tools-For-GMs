'use strict';

const { Modal, FuzzySuggestModal, setIcon } = require('obsidian');
const { CalendarEngine, MAX_YEAR, copy, uid, validateCalendar } = require('./calendar');
const { DEFAULT_COLOR } = require('./imports');
const { MAX_SUNS, emptySky } = require('./sky');
const { eclipseDefaults } = require('./eclipse');

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

function dateFields(root, cal, date, clock = false) {
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
  const yearInput = inlineNumber(row, 'Ano', date.year, (v) => { date.year = v; }, 1, MAX_YEAR);
  yearInput.addEventListener('change', clamp);
  fieldSelect(row, 'Mês', monthOptions(cal), date.month, (v) => { date.month = v; clamp(); });
  dayInput = inlineNumber(row, 'Dia', date.day, (v) => { date.day = v; }, 1, days());
  if (clock) {
    inlineNumber(row, 'Hora', date.hour, (v) => { date.hour = v; }, 0, cal.clock.hours - 1);
    inlineNumber(row, 'Minuto', date.minute, (v) => { date.minute = v; }, 0, cal.clock.minutes - 1);
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
    this.tab = start;
    this.draft.sky ||= emptySky(new CalendarEngine(cal).yearStart(2));
  }
  onOpen() {
    const root = this.frame();
    const bar = el(root, 'div', 'brpg-toolbar');
    select(bar, [['geral', 'Geral'], ['meses', 'Meses'], ['extras', 'Dias especiais'], ['luas', 'Luas'], ['sois', 'Sóis'], ['estacoes', 'Estações'], ['eras', 'Eras']],
      this.tab, (v) => { this.tab = v; this.section(); }, 'Seção do editor');
    this.form = el(root, 'div', 'brpg-form');
    this.section();
    this.actions(root, async () => {
      this.draft.name = this.draft.name.trim();
      validateCalendar(this.draft);
      await this.plugin.putCalendar(this.draft, this.isNew);
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
      check(root, 'A semana continua na virada de mês e ano', c.weekOverflow, (v) => { c.weekOverflow = v; });
      const clock = this.group('Relógio do mundo');
      const row = el(clock, 'div', 'brpg-form-row');
      inlineNumber(row, 'Horas por dia', c.clock.hours, (v) => { c.clock.hours = v; }, 1, 100);
      inlineNumber(row, 'Minutos por hora', c.clock.minutes, (v) => { c.clock.minutes = v; }, 1, 100);
      dateFields(this.group('Data e hora atuais'), c, c.current, true);
    } else if (this.tab === 'meses') {
      const root = this.group('Meses', 'A ordem é a ordem do ano. Meses intercalados não consomem dias da semana.');
      c.months.forEach((m, i) => {
        const card = el(root, 'div', 'brpg-edit-card');
        const row = el(card, 'div', 'brpg-form-row');
        input(row, 'Nome', m.name, (v) => { m.name = v; }, { maxLength: 60 });
        inlineNumber(row, 'Dias', m.length, (v) => { m.length = v; }, 1, 240);
        check(card, 'Fora da semana (intercalado)', m.intercalary, (v) => { m.intercalary = v; });
        const actions = el(card, 'div', 'brpg-toolbar');
        const swap = (j) => { [c.months[i], c.months[j]] = [c.months[j], c.months[i]]; this.section(); };
        button(actions, 'Subir mês', () => swap(i - 1), { icon: 'arrow-up', iconOnly: true, disabled: i === 0 });
        button(actions, 'Descer mês', () => swap(i + 1), { icon: 'arrow-down', iconOnly: true, disabled: i + 1 === c.months.length });
        button(actions, 'Remover mês', () => {
          const next = c.months.find((item) => item.id !== m.id);
          c.months.splice(i, 1);
          if (c.current.month === m.id) Object.assign(c.current, { month: next.id, day: 1 });
          this.section();
        }, { icon: 'trash-2', iconOnly: true, disabled: c.months.length === 1 });
      });
      button(root, 'Adicionar mês', () => { c.months.push({ id: uid('mes'), name: `Mês ${c.months.length + 1}`, length: 30, intercalary: false }); this.section(); }, { icon: 'plus' });
    } else if (this.tab === 'extras') {
      const root = this.group('Dias especiais', 'Entram no fim do mês quando a regra vale. Exceção e restauração usam múltiplos do intervalo.');
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
      const root = this.group('Luas', 'Cada lua tem um ciclo independente. Use um deslocamento para alinhar sua lua nova a uma data.');
      c.moons.forEach((m, i) => {
        const eclipse = m.eclipse ||= eclipseDefaults(m, i);
        const card = el(root, 'div', 'brpg-edit-card');
        const row = el(card, 'div', 'brpg-form-row');
        input(row, 'Nome', m.name, (v) => { m.name = v; }, { maxLength: 60 });
        inlineNumber(row, 'Ciclo em dias', m.period, (v) => { m.period = v; }, 1, MAX_YEAR, 'any');
        inlineNumber(row, 'Deslocamento', m.offset, (v) => { m.offset = v; }, -MAX_YEAR, MAX_YEAR, 'any');
        check(card, 'Ocultar no calendário', m.hidden, (v) => { m.hidden = v; });
        const orbit = el(card, 'details', 'brpg-disclosure brpg-eclipse-settings');
        el(orbit, 'summary', 'brpg-summary', 'Órbita e eclipses');
        const fields = el(orbit, 'div', 'brpg-form-row');
        inlineNumber(fields, 'Inclinação orbital (°)', eclipse.inclination, (v) => { eclipse.inclination = v; }, -89, 89, 'any');
        inlineNumber(fields, 'Nó ascendente (°)', eclipse.node, (v) => { eclipse.node = v; }, -360, 360, 'any');
        inlineNumber(fields, 'Raio aparente (°)', eclipse.radius, (v) => { eclipse.radius = v; }, .02, 4, 'any');
        inlineNumber(fields, 'Raio da umbra (°)', eclipse.shadow, (v) => { eclipse.shadow = v; }, .02, 6, 'any');
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
        button(card, 'Remover estação', () => { c.seasons.splice(i, 1); this.section(); }, { icon: 'trash-2' });
      });
      button(root, 'Adicionar estação', () => {
        c.seasons.push({ id: uid('estacao'), name: 'Nova estação', month: c.months[0].id, day: 1, duration: 90, color: DEFAULT_COLOR });
        this.section();
      }, { icon: 'plus' });
    } else {
      const root = this.group('Eras', 'As eras só mudam como o ano aparece. Datas e eventos mantêm a contagem absoluta.');
      c.eras.forEach((x, i) => {
        const card = el(root, 'div', 'brpg-edit-card');
        const row = el(card, 'div', 'brpg-form-row');
        input(row, 'Nome', x.name, (v) => { x.name = v; }, { maxLength: 60 });
        inlineNumber(row, 'Ano de início', x.start, (v) => { x.start = v; }, 1, MAX_YEAR);
        check(card, 'Mostrar como ano 1 na virada da era', x.reset, (v) => { x.reset = v; });
        button(card, 'Remover era', () => { c.eras.splice(i, 1); this.section(); }, { icon: 'trash-2' });
      });
      button(root, 'Adicionar era', () => { c.eras.push({ name: 'Nova era', start: 1, reset: true }); this.section(); }, { icon: 'plus' });
    }
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
    input(row, 'Categoria', e.category, (v) => { e.category = v; }, { maxLength: 60 });
    input(row, 'Cor', e.color, (v) => { e.color = v; }, { type: 'color' });
    const note = input(row, 'Caminho da nota', e.note, (v) => { e.note = v; }, { maxLength: 1000 });
    button(root, 'Escolher nota do cofre', () => new NotePicker(this.app, (value) => { e.note = value; note.value = value; }).open(), { icon: 'link' });
    check(root, 'Ocultar da visualização por padrão', e.hidden, (v) => { e.hidden = v; });
    fieldSelect(root, 'Recorrência', [['none', 'Uma vez'], ['year', 'A cada ano'], ...(this.calendar.seasons.length ? [['season', 'No início de uma estação']] : [])], e.repeat,
      (v) => { e.repeat = v; this.dates(); });
    this.dateRoot = el(root, 'div', 'brpg-form');
    this.dates();
    this.actions(root, async () => {
      e.title = e.title.trim();
      e.category = e.category.trim();
      e.note = e.note.trim();
      const saved = e.repeat === 'season' ? { ...e, start: null, end: null } : { ...e, seasonId: null };
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
    e.start ||= copy(this.refDate);
    info(this.dateRoot, 'Início do evento');
    dateFields(this.dateRoot, c, e.start);
    check(this.dateRoot, 'Tem data de término', !!e.end, (v) => { e.end = v ? copy(e.start) : null; this.dates(); });
    if (e.end) dateFields(this.dateRoot, c, e.end);
  }
}

class WorldDateEditor extends RPGModal {
  constructor(plugin, cal, chosen) {
    super(plugin.app, 'Definir data do mundo');
    this.plugin = plugin; this.calendar = copy(cal);
    this.date = { ...cal.current, ...chosen };
  }
  onOpen() {
    const root = this.frame();
    dateFields(root, this.calendar, this.date, true);
    this.actions(root, () => this.plugin.editCalendar(this.calendar.id, (c) => { c.current = this.date; }));
  }
}
class Confirm extends RPGModal {
  constructor(app, message, act) { super(app, 'Confirmar remoção'); this.message = message; this.act = act; }
  onOpen() { const root = this.frame(); info(root, this.message); this.actions(root, this.act, 'Remover'); }
}
module.exports = { el, button, select, input, info, inlineNumber, replaceEl, CalendarEditor, EventEditor, WorldDateEditor, Confirm };
