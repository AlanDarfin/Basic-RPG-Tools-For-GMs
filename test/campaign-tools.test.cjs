'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CalendarEngine, newCalendar, validateCalendar, copy, MAX_YEAR } = require('../src/calendar');
const { ensureWeather } = require('../src/weather');
const { observatory, horizonLabel } = require('../src/observatory');
const { parseClockTime } = require('../src/horizon');
const { decodeImport, encodeExport } = require('../src/imports');
const { fantasyExport, gregorian } = require('../src/interchange');
const { parseDate, deriveNoteEvents, NoteIndex } = require('../src/note-events');
const { previewPattern } = require('../src/recurrence');
const { anchor, worldDate, linkedDate, REAL_DAY_MS } = require('../src/world-clock');
const preset = require('../src/arkanis.json');
const event = (c, repeat = 'none', data = {}) => ({ id: 'r1', title: 'Encontro', note: '', description: '', category: '', hidden: false,
  color: '#ce6271', repeat, start: c.current, end: null, ...data });
const pattern = (more = {}) => ({ unit: 'day', every: 1, duration: 1, match: 'all', rules: [], ...more });

test('horários de nascer e pôr de uma lua variam pela órbita ao avançar um dia', () => {
  const c = copy(preset), e = new CalendarEngine(c);
  for (const testDay of [0, 1, 50, 333]) {
    const o = observatory(c, testDay), d = e.fromEpoch(testDay);
    const data = o.moons(e.moons(d), 789);
    assert.equal(data.length, 3);
    for (const x of data) {
      for (const n of [...x.rises, ...x.sets]) assert.ok(n >= 0 && n <= 2048);
      assert.ok(x.intervals.every(([a, b]) => b >= a));
      assert.match(horizonLabel(x, c.clock), /Nasce|horizonte/);
    }
  }
  const d = e.fromEpoch(1);
  assert.notDeepEqual(observatory(c, 0).moons(e.moons(c.current), 0)[0].rises, observatory(c, 1).moons(e.moons(d), 0)[0].rises);
});

test('horários fixos atravessam meia-noite para sol e lua e se mantêm no backup', () => {
  const c = copy(preset), fixed = { mode: 'fixed', rise: parseClockTime('28:00', c.clock), set: parseClockTime('03:12', c.clock) };
  c.sky.suns[2].riseSet = fixed;
  c.moons[0].riseSet = fixed;
  const restored = decodeImport(encodeExport(c)).calendar, e = new CalendarEngine(restored);
  const o = observatory(restored, 1), p = e.moons(e.fromEpoch(1));
  assert.equal(o.suns(0)[2].visibleNow, true);
  assert.equal(o.suns(16 * 64)[2].visibleNow, false);
  assert.equal(o.moons(p, 29 * 64)[0].visibleNow, true);
  assert.equal(o.moons(p, 4 * 64)[0].visibleNow, false);
  assert.equal(horizonLabel(o.moons(p, 0)[0], c.clock), 'Nasce 28:00 · Põe-se 03:12');
  c.moons[0].riseSet.set = c.moons[0].riseSet.rise;
  assert.throws(() => validateCalendar(c), /horários válidos e diferentes/);
});

test('configuração regional não muda a órbita principal e preserva visibilidade própria', () => {
  const c = copy(preset);
  ensureWeather(c);
  const r = c.weather.regions.find((r) => r.id === c.weather.activeId);
  const o = observatory(c, 0), before = o.suns(11 * 64)[2];
  r.latitude = 67;
  r.timeOffset = -.1;
  r.horizons = [{ kind: 'sun', id: 'reart', riseSet: { mode: 'fixed', rise: .5, set: .75 } }];
  const local = observatory(validateCalendar(c), 0);
  assert.equal(local.name, 'Centrus');
  assert.equal(local.offset, -.1 * 2048);
  assert.equal(local.suns(11 * 64)[2].visibleNow, false);
  assert.equal(local.suns(17 * 64)[2].visibleNow, true);
  assert.equal(local.suns(17 * 64)[2].period, before.period);
  assert.equal(c.sky.suns[2].riseSet, undefined);
});

test('recorrência semanal conta dias da semana, sem um feriado fora dela', () => {
  const c = newCalendar();
  const start = c.current;
  c.leapDays.push({ id: 'feriado', name: 'Feriado', month: start.month, intercalary: true, after: 4, every: 1, offset: 0, except: 0, also: 0 });
  const match = event(c, 'pattern', { pattern: pattern({ unit: 'week', every: 2 }) });
  c.events.push(match);
  const e = new CalendarEngine(validateCalendar(c));
  assert.deepEqual(previewPattern(e, match, start, 35, 3).map((d) => e.epoch(d)), [0, 15, 29]);
  assert.equal(e.dayMeta(e.fromEpoch(4)).weekday, null);
  assert.equal(e.dayMeta(e.fromEpoch(5)).index, 4);
});

test('combina condições e duração e conta dias a partir do início de outro evento', () => {
  const c = newCalendar(), e = new CalendarEngine(c);
  c.events.push(event(c, 'none', { id: 'festa', start: e.fromEpoch(3), end: e.fromEpoch(5) }));
  const conjunction = event(c, 'pattern', { pattern: pattern({ rules: [
    { type: 'event', value: 'festa', after: 5 }, { type: 'weekday', value: 'Terça' },
  ], duration: 2 }) });
  c.events.push(conjunction);
  validateCalendar(c);
  assert.deepEqual(previewPattern(e, conjunction, c.current, 30).map((d) => e.epoch(d)), [8]);
  assert.ok(e.eventsOn(e.fromEpoch(9)).includes(conjunction));
  assert.ok(!e.eventsOn(e.fromEpoch(10)).includes(conjunction));
  conjunction.pattern.rules[0].value = conjunction.id;
  assert.throws(() => validateCalendar(c), /condição aponta/);
});

test('extrai propriedades, datas parciais e linhas das notas sem misturar pastas ou calendários', () => {
  const c = copy(preset);
  c.noteSources = { enabled: true, folder: 'Campanha', parseTitle: true, inline: true };
  const file = { path: 'Campanha/1-01-01 - Sessão.md', basename: '1-01-01 - Sessão' };
  assert.equal(parseDate(c, '1-Arkanis-07').date.month, 'mes-1');
  const fm = { 'fc-date': [{ month: 'Arkanis', day: 7 }, { day: 12 }], 'fc-category': 'Sessão', 'fc-calendar': ['Arkanis'] };
  const events = deriveNoteEvents(c, file, fm, 'brpg: 1-01-08 | Duelo\n```txt\nbrpg: 1-01-09 | Exemplo\n```');
  assert.deepEqual(events.map((v) => [v.repeat, v.start.day]), [['year', 7], ['pattern', 12], ['none', 8]]);
  assert.ok(events.every((x) => x.autoNote && x.note === file.path));
  assert.equal(deriveNoteEvents(c, { ...file, path: 'Campanhas/fora.md' }, fm).length, 0);
  assert.equal(deriveNoteEvents(c, file, { ...fm, 'fc-calendar': 'Outro mundo' }).length, 0);
  assert.equal(deriveNoteEvents(c, file)[0].title, 'Sessão');
});

test('índice atualiza e remove eventos de notas sem alterar eventos persistidos', async () => {
  const c = copy(preset), file = { path: 'Campanha/Cena.md' };
  c.noteSources = { enabled: true, folder: 'Campanha', parseTitle: false, inline: false };
  const fm = { 'fc-date': '1-01-06' };
  const p = { state: { calendars: [c] }, app: { vault: { getMarkdownFiles: () => [file] }, metadataCache: { getFileCache: () => ({ frontmatter: fm }) } } };
  const i = new NoteIndex(p);
  await i.rebuild();
  assert.equal(i.forCalendar(c.id)[0].start.day, 6);
  await i.update(file, { frontmatter: { 'fc-date': '1-01-08' } });
  assert.equal(i.forCalendar(c.id)[0].start.day, 8);
  i.forget(file.path);
  assert.equal(i.forCalendar(c.id).length, 0);
  assert.equal(c.events.length, 8);
});

test('mês com semana própria, dia especial e era dentro do ano mantêm contagem na exportação', () => {
  const c = newCalendar(), month = c.months[0];
  month.week = ['Vento', 'Lua', 'Sol'];
  c.leapDays.push({ id: 'ponte', name: 'Ponte', month: month.id, after: 2, intercalary: true, every: 1, offset: 0, except: 0, also: 0 });
  c.eras = [{ name: 'A Queda', start: 1, month: month.id, day: 4, reset: true }];
  const e = new CalendarEngine(validateCalendar(c));
  assert.equal(e.dayMeta(e.fromEpoch(2)).special.name, 'Ponte');
  assert.equal(e.dayMeta(e.fromEpoch(3)).weekday, 'Sol');
  assert.doesNotMatch(e.format(e.fromEpoch(2)), /A Queda/);
  assert.match(e.format(e.fromEpoch(3)), /A Queda/);
  const out = decodeImport(fantasyExport(c).data).calendar, other = new CalendarEngine(out);
  assert.equal(other.dayMeta(other.fromEpoch(3)).weekday, 'Sol');
  assert.match(other.format(other.fromEpoch(3)), /A Queda/);
});

test('exporta data, clima e eventos compatíveis do Fantasy Calendar e avisa quando omite regras', () => {
  const c = copy(preset), e = new CalendarEngine(c);
  ensureWeather(c);
  c.events.push(event(c, 'none', { id: 'duração', title: 'Caravana', end: e.fromEpoch(5) }));
  c.events.push(event(c, 'year', { id: 'anual', title: 'Feira Anual' }));
  c.events.push(event(c, 'undated', { id: 'ideia', title: 'Ideia', start: null }));
  const out = fantasyExport(c);
  assert.ok(out.warnings.some((x) => x.includes('Ideia')));
  const { calendar } = decodeImport(out.data);
  assert.deepEqual(calendar.current, c.current);
  assert.equal(calendar.weather.regions[1].name, 'Centrus');
  assert.equal(calendar.events.find((e) => e.title === 'Caravana').end.day, 6);
  assert.equal(calendar.events.find((e) => e.title === 'Feira Anual').repeat, 'year');
});

test('lê backup nativo do Calendarium e mantém eventos sem data e aniversários', () => {
  const input = { name: 'Importado', current: { year: 3, month: 0, day: 2 },
    static: { weekdays: [{ name: 'Sol' }], months: [{ name: 'Vale', length: 30, interval: 1 }], firstWeekDay: 0,
      useCustomYears: true, years: [{ name: 'Alvor' }] },
    events: [{ type: 'Recurring', name: 'Festa', date: { day: 7, month: 0, year: [null, null] } },
      { type: 'Undated', name: 'Prólogo' }] };
  const { calendar } = decodeImport(input);
  const e = new CalendarEngine(calendar);
  assert.equal(e.yearLabel(1), 'Alvor');
  assert.equal(calendar.events[1].repeat, 'undated');
  assert.equal(e.eventsOn({ ...calendar.current, day: 7 })[0].title, 'Festa');
});

test('horas reais configuráveis e conversão entre relógios preservam a fração do dia', () => {
  const c = newCalendar(), child = newCalendar(), at = 1800000000000;
  c.realDayHours = 12;
  anchor(c, c.current, 'real', at);
  assert.equal(worldDate(c, at + REAL_DAY_MS).day, 3);
  child.clock = { hours: 32, minutes: 64 };
  child.clockLink = { id: c.id, offset: 1 };
  assert.deepEqual(linkedDate(child, c, at + REAL_DAY_MS / 4), { year: 1, month: child.current.month, day: 2, hour: 16, minute: 0 });
});

test('o preset gregoriano aceita 29 de fevereiro e anos nomeados não movem datas', () => {
  const c = gregorian(new Date(2024, 1, 29, 15, 0));
  c.namedYears = [{ year: 2024, name: 'Ano da Aurora' }];
  c.dateFormat = '{dia}/{mes} · {ano} ({numero})';
  c.cycles = [{ name: 'Zodíaco', unit: 'year', span: 1, offset: 0, labels: ['Lua', 'Lobo'] }];
  const e = new CalendarEngine(validateCalendar(c));
  assert.equal(e.format(c.current), '29/Fevereiro · Ano da Aurora (2024)');
  assert.deepEqual(e.cyclesOn(c.current), [{ name: 'Zodíaco', label: 'Lobo' }]);
  assert.equal(e.epoch(c.current), e.epoch(e.fromEpoch(e.epoch(c.current))));
});

test('meses recorrentes e dias especiais se combinam sem perder a ordem civil', () => {
  const c = newCalendar(), lim = c.months[1];
  lim.every = 4; lim.offset = 1;
  c.leapDays.push({ id: 'raro', name: 'Dia Raro', month: lim.id, every: 3, offset: 1, except: 9, also: 0, intercalary: false });
  const e = new CalendarEngine(validateCalendar(c));
  const annual = c.months.filter((m) => m.id !== lim.id).reduce((n, m) => n + m.length, 0);
  let days = 0;
  for (let year = 1; year <= 100; year++) {
    assert.equal(e.yearStart(year), days);
    const appears = (year - 1) % 4 === 0;
    days += annual + (appears ? lim.length + Number((year - 1) % 3 === 0 && (year - 1) % 9 !== 0) : 0);
  }
  const next = e.monthShift({ year: 2, month: c.months[0].id, day: 10 }, 1);
  assert.equal(next.month, c.months[2].id);
  const other = decodeImport(fantasyExport(c).data).calendar, b = new CalendarEngine(other);
  assert.equal(b.yearStart(100), e.yearStart(100));
});

test('ano zero e anos negativos podem cruzar viradas, luas e estações por data', () => {
  const c = newCalendar();
  c.firstYear = -2;
  c.current.year = -2;
  c.months[1].every = 2;
  c.seasons = [{ id: 'clara', name: 'Clara', month: c.months[0].id, day: 3, color: '#ce6271' }];
  const e = new CalendarEngine(validateCalendar(c));
  assert.equal(e.epoch(c.current), 0);
  assert.equal(e.fromEpoch(e.yearStart(0)).year, 0);
  assert.equal(e.fromEpoch(e.yearStart(0) - 1).year, -1);
  assert.equal(e.season(c.current), null);
  assert.equal(e.season(e.fromEpoch(e.yearStart(0))).name, 'Clara');
  assert.ok(e.monthLength(0, c.months[1].id));
  assert.equal(e.monthLength(-1, c.months[1].id), 0);
  assert.equal(parseDate(c, '-2-01-01').date.year, -2);
  const snapshot = decodeImport(encodeExport(c)).calendar;
  assert.equal(snapshot.firstYear, -2);
  assert.equal(new CalendarEngine(snapshot).epoch(snapshot.current), 0);
});

test('a origem do ano zero não desloca semana nem lua na ida e volta do Fantasy Calendar', () => {
  const c = copy(preset);
  c.firstYear = -8;
  c.current.year = -8;
  const before = new CalendarEngine(c);
  const other = decodeImport(fantasyExport(validateCalendar(c)).data).calendar, after = new CalendarEngine(other);
  assert.equal(other.current.year, -8);
  assert.equal(before.dayMeta(c.current).weekday, after.dayMeta(other.current).weekday);
  assert.deepEqual(before.moons(c.current).map((m) => m.phase), after.moons(other.current).map((m) => m.phase));
});
