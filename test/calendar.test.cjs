'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { CalendarEngine, MAX_YEAR, copy, newCalendar, validateCalendar, sameDate, clockText } = require('../src/calendar');
const { decodeImport, encodeExport, importFantasy, parseInterval } = require('../src/imports');
const preset = require('../src/arkanis.json');
const date = (year, month, day) => ({ year, month, day });
const base = () => newCalendar('Campanha');
const event = (start, fields = {}) => ({
  id: 'e', title: 'Sessão', description: '', note: '', category: '', color: '#7866b3', hidden: false,
  repeat: 'none', start, end: null, ...fields,
});

test('preset de Arkanis preserva os nomes, relógio e data de campanha', () => {
  const c = validateCalendar(copy(preset)), e = new CalendarEngine(c);
  assert.equal(c.months.length, 26);
  assert.equal(c.months[18].name, 'Skaryel');
  assert.equal(c.months[18].length, 42);
  assert.equal(c.week.length, 12);
  assert.equal(c.week[11], 'Aplurge');
  assert.equal(e.yearStart(2), 1008);
  assert.deepEqual(c.clock, { hours: 32, minutes: 64 });
  assert.equal(e.epoch(c.current), 0);
  assert.equal(clockText(c.current), '00:00');
  assert.equal(c.events.length, 8);
  assert.equal(e.moons(c.current).length, 3);
});
test('conversão de época e datas em três anos e no limite superior', () => {
  const e = new CalendarEngine(preset);
  for (let i = 0; i < 3024; i++) assert.equal(e.epoch(e.fromEpoch(i)), i);
  const last = e.yearStart(MAX_YEAR + 1) - 1;
  assert.equal(e.epoch(e.fromEpoch(last)), last);
  assert.throws(() => e.fromEpoch(last + 1), /Posição/);
  assert.throws(() => e.fromEpoch(-1), /Posição/);
});
test('passagem de ano respeita os 1.008 dias', () => {
  const e = new CalendarEngine(preset);
  assert.deepEqual(e.shift(date(1, 'mes-26', 45), 1), date(2, 'mes-1', 1));
  assert.deepEqual(e.shift(date(2, 'mes-1', 1), -1), date(1, 'mes-26', 45));
});
test('datas especiais avançam época e podem ficar fora da semana', () => {
  const c = base();
  const m = c.months[0].id;
  c.leapDays.push({ id: 'extra', name: 'Solstício', month: m, every: 1, offset: 0, except: 0, also: 0, intercalary: true });
  const e = new CalendarEngine(validateCalendar(c));
  assert.equal(e.monthLength(1, m), 31);
  assert.equal(e.dayMeta(date(1, m, 31)).weekday, null);
  assert.equal(e.dayMeta(date(1, m, 31)).special.name, 'Solstício');
  assert.equal(e.dayMeta(date(1, c.months[1].id, 1)).index, 30 % 7);
  assert.equal(e.rows(1, m).at(-1).special.day, 31);
});
test('mês intercalado não consome dias na semana', () => {
  const c = base();
  c.months[0].intercalary = true;
  const e = new CalendarEngine(validateCalendar(c));
  assert.equal(e.dayMeta(c.current).weekday, null);
  assert.equal(e.dayMeta(date(1, c.months[1].id, 1)).index, 0);
  assert.equal(e.epoch(date(1, c.months[1].id, 1)), 30);
});
test('semana pode recomeçar no primeiro dia de cada mês', () => {
  const c = base();
  c.week = ['Leste', 'Oeste', 'Norte'];
  c.firstWeekday = 2;
  c.weekOverflow = false;
  const e = new CalendarEngine(validateCalendar(c));
  assert.equal(e.dayMeta(date(3, c.months[1].id, 1)).weekday, 'Norte');
});
test('bissexto suporta 4, exceção 100 e restauração 400', () => {
  const c = base(), m = c.months[0].id;
  c.leapDays.push({ id: 'x', name: 'Dia extra', month: m, every: 4, offset: 0, except: 100, also: 400, intercalary: false });
  const e = new CalendarEngine(validateCalendar(c));
  assert.deepEqual([4, 5, 100, 400, 800].map((y) => e.monthLength(y, m)), [31, 30, 30, 31, 31]);
  assert.equal(e.yearStart(401) - e.baseDays * 400, 97);
});
test('regra com deslocamento vale no ano certo e na posição correta', () => {
  const c = base(), m = c.months[0].id;
  c.leapDays.push({ id: 'x', name: 'Dia extra', month: m, every: 3, offset: 1, except: 0, also: 0, intercalary: false });
  const e = new CalendarEngine(validateCalendar(c));
  assert.deepEqual([1, 2, 3, 4].map((y) => e.monthLength(y, m)), [31, 30, 30, 31]);
  assert.equal(e.yearStart(5) - e.baseDays * 4, 2);
});
test('comparação de datas não depende do horário', () => assert.ok(sameDate({ ...preset.current, hour: 4 }, preset.current)));
test('pular para um mês menor ajusta só o dia em exibição', () => {
  const e = new CalendarEngine(preset);
  assert.deepEqual(e.monthShift(date(1, 'mes-11', 54), 1), date(1, 'mes-12', 39));
});
test('fases das luas repetem após 144 dias', () => {
  const e = new CalendarEngine(preset);
  const first = e.fromEpoch(2), last = e.fromEpoch(146);
  assert.deepEqual(e.moons(first).map((x) => x.phase), e.moons(last).map((x) => x.phase));
  assert.equal(e.moons(e.fromEpoch(36))[0].phase, 'Cheia');
});
test('estações de Arkanis e os eventos de início atravessam anos', () => {
  const e = new CalendarEngine(preset);
  for (const year of [1, 2, 400]) for (const [idx, m] of [1, 8, 14, 21].entries()) {
    const d = date(year, `mes-${m}`, 1);
    const s = e.season(d);
    assert.equal(s.name, preset.seasons[idx].name);
    assert.equal(s.dayOfSeason, 1);
    assert.ok(e.eventsOn(d).some((x) => x.title === s.name));
    assert.deepEqual(e.firstOccurrenceInYear(preset.events[idx], year), d);
  }
});
test('estações por data herdam a estação do ano anterior', () => {
  const c = base(), m = c.months[0].id;
  c.seasons.push({ id: 's', name: 'Chuva', month: m, color: '#444444', day: 2, duration: 60 });
  const e = new CalendarEngine(validateCalendar(c));
  assert.equal(e.season(date(1, m, 1)), null);
  assert.equal(e.season(date(2, m, 1)).name, 'Chuva');
});
test('eras alteram apresentação sem alterar a época', () => {
  const c = base();
  c.eras.push({ name: 'D. F.', start: 100, reset: true });
  const e = new CalendarEngine(validateCalendar(c));
  assert.equal(e.yearLabel(102), '3 D. F.');
  assert.equal(e.epoch(date(102, c.months[0].id, 1)), 101 * e.baseDays);
});
test('evento anual de dois dias pode cruzar a virada', () => {
  const c = base(), e = new CalendarEngine(c);
  const start = date(1, c.months.at(-1).id, 33), end = date(2, c.months[0].id, 1);
  const annual = event(start, { repeat: 'year', end });
  c.events.push(annual);
  validateCalendar(c);
  assert.equal(e.eventsOn(date(3, c.months[0].id, 1)).length, 1);
  assert.equal(e.eventsOn(date(3, c.months[0].id, 2)).length, 0);
  assert.deepEqual(e.firstOccurrenceInYear(annual, 3), date(3, c.months[0].id, 1));
});
test('encurtar mês não invalida silenciosamente eventos', () => {
  const c = base();
  c.events.push(event(date(1, c.months[0].id, 30)));
  validateCalendar(c);
  c.months[0].length = 29;
  assert.throws(() => validateCalendar(c), /Dia em Alvor/);
});
test('eventos com data invertida são rejeitados', () => {
  const c = base();
  c.events.push(event(date(1, c.months[0].id, 2), { end: c.current }));
  assert.throws(() => validateCalendar(c), /anterior/);
});
test('backup próprio tem round-trip independente do estado original', () => {
  const after = decodeImport(encodeExport(preset));
  assert.deepEqual(after.calendar, preset);
  after.calendar.name = 'Editado';
  assert.equal(preset.name, 'Arkanis');
  assert.deepEqual(after.warnings, []);
  assert.throws(() => decodeImport({ format: 'basic-rpg/calendar', version: 9, calendar: preset }), /Versão/);
});
function fc() {
  return { name: 'Ensaio', dynamic_data: { year: 1, timespan: 0, day: 1, hour: 0, minute: 0 },
    static_data: { year_data: { first_day: 1, overflow: true, global_week: ['Norte', 'Sul'],
      timespans: [{ name: 'Primeiro', length: 17, interval: 1 }], leap_days: [] },
      moons: [], eras: [], seasons: { data: [], global_settings: {} }, clock: { hours: 10, minutes: 100 } },
    events: [{ name: 'Abertura', description: '<p>Teste &amp; texto</p>', data: { conditions: [['Date', '0', [1, 0, 1]]] } }], categories: [] };
}
test('importação do Fantasy Calendar preserva data e relógio e converte descrições em texto', () => {
  const { calendar } = importFantasy(fc());
  const e = new CalendarEngine(calendar);
  assert.equal(calendar.clock.minutes, 100);
  assert.equal(e.eventsOn(calendar.current)[0].description, 'Teste & texto\n');
});
test('importação sinaliza evento não suportado sem o atribuir a uma data errada', () => {
  const doc = fc();
  doc.events.push({ name: 'Regra da Lua', data: { conditions: [['Moon', '1', [0, 2]]] } });
  const parsed = decodeImport(doc);
  assert.equal(parsed.calendar.events.length, 1);
  assert.match(parsed.warnings[0], /Regra da Lua/);
});
test('importação não aproxima silenciosamente meses recorrentes', () => {
  const doc = fc();
  doc.static_data.year_data.timespans[0].interval = 2;
  assert.throws(() => importFantasy(doc), /recorrência/);
});
test('importação interpreta regras de intervalo do formato de origem', () => {
  assert.deepEqual(parseInterval('400,!100,4'), { every: 4, except: 100, also: 400 });
  assert.throws(() => parseInterval('+10,3'), /regra/);
});
test('o bundle instala sem módulos externos além de obsidian', () => {
  const vm = require('node:vm');
  const mod = { exports: null }, calls = [];
  const obsidian = { Plugin: class {}, PluginSettingTab: class {}, Modal: class {}, ItemView: class {}, FuzzySuggestModal: class {} };
  const bundle = fs.readFileSync(require('node:path').join(__dirname, '..', 'main.js'), 'utf8');
  vm.runInNewContext(bundle, { module: mod, require(id) { calls.push(id); return obsidian; } });
  assert.equal(typeof mod.exports, 'function');
  assert.ok(calls.length > 0 && calls.every((id) => id === 'obsidian'));
});
