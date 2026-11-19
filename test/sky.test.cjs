'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CalendarEngine, newCalendar, copy, validateCalendar } = require('../src/calendar');
const { defaultArkanisSky, ensureSky, validateSky, period, solarPositions, formatTime } = require('../src/sky');
const { decodeImport, encodeExport } = require('../src/imports');
const arkanis = require('../src/arkanis.json');
const clock = arkanis.clock;
const total = clock.hours * clock.minutes;

test('os três sóis seguem os mesmos parâmetros do bot de Arkanis', () => {
  const sky = defaultArkanisSky();
  assert.deepEqual(sky.suns.map((s) => s.name), ['Innart','Dinart','Reart']);
  assert.deepEqual(sky.suns.map((s) => period(sky,s).toFixed(2)), ['217.73','528.24','1008.00']);
  assert.equal(sky.referenceId, 'reart');
  assert.deepEqual(arkanis.sky, sky);
});
test('Reart nasce nos 1.008 dias e 49 têm somente Reart', () => {
  const sky = defaultArkanisSky();
  let alone = 0, noonsWithAll = 0, overlappingOrbits = 0;
  for (let i = 0; i < 1008; i++) {
    const atNoon = solarPositions(sky, i, clock, total / 2);
    const visible = atNoon.filter((s) => s.visibleToday);
    assert.ok(atNoon.find((s) => s.id === 'reart' && s.visibleNow && s.visibleToday));
    if (visible.length === 1) alone++;
    if (visible.length === 3) overlappingOrbits++;
    if (atNoon.every((s) => s.visibleNow)) noonsWithAll++;
  }
  assert.equal(alone, 49);
  assert.equal(overlappingOrbits, 613);
  assert.equal(noonsWithAll, 210);
});
test('a simulação distingue nascer, visibilidade atual e data com só um sol', () => {
  const engine = new CalendarEngine(arkanis);
  const e = engine.epoch({year: 1, month: 'mes-6', day: 27});
  const atNight = solarPositions(arkanis.sky, e, clock, 0);
  const atNoon = solarPositions(arkanis.sky, e, clock, total / 2);
  assert.deepEqual(atNight.filter((s)=>s.visibleToday).map((s)=>s.name), ['Reart']);
  assert.equal(atNight.some((s)=>s.visibleNow), false);
  assert.deepEqual(atNoon.filter((s)=>s.visibleNow).map((s)=>s.name), ['Reart']);
  assert.equal(atNoon[2].transit, 16 * 64);
  assert.deepEqual(atNoon[0].intervals, []);
});
test('faixas de sol nunca saem do relógio, inclusive ao cruzar meia-noite', () => {
  let crossing = false, allDay = false;
  for (let i=0; i<1008; i++) for (const s of solarPositions(arkanis.sky, i, clock, 0)) {
    for (const [a,b] of s.intervals) assert.ok(a >= 0 && b >= a && b <= total);
    if (s.intervals.length === 2) {
      crossing = true; assert.equal(s.intervals[0][0],0); assert.equal(s.intervals[1][1],total);
    }
    if (s.horizon === 'always') { allDay = true; assert.deepEqual(s.intervals,[[0,total]]); }
  }
  assert.ok(crossing && allDay);
  assert.equal(formatTime(16*64+63,clock), '16:63');
  assert.equal(formatTime(total,clock,true), '32:00');
});
test('edição do céu impede que o sol de referência deixe de nascer', () => {
  const sky = defaultArkanisSky();
  assert.doesNotThrow(() => validateSky(sky));
  sky.latitude = 71;
  assert.throws(() => validateSky(sky), /89°/);
  sky.latitude = 48;
  sky.referenceId = 'ausente';
  assert.throws(() => validateSky(sky), /referência/);
  sky.referenceId = 'reart';
  sky.suns[0].name = 'reárt';
  assert.throws(() => validateSky(sky), /nomes diferentes/);
});
test('cadastro vazio é válido, e backup mantém ajustes do céu', () => {
  const original = newCalendar();
  assert.deepEqual(solarPositions(original.sky,0,original.clock,0),[]);
  assert.doesNotThrow(()=>validateCalendar(original));
  const c = copy(arkanis);
  c.sky.suns[2].name = 'Reart Dourado';
  c.sky.latitude=42;
  assert.deepEqual(decodeImport(encodeExport(c)).calendar.sky,c.sky);
});
test('migração repõe sóis em Arkanis antigo sem substituir outros céus', () => {
  const old = copy(arkanis);
  delete old.sky;
  const imported = decodeImport(encodeExport(old)).calendar;
  assert.deepEqual(imported.sky,defaultArkanisSky());
  assert.deepEqual(imported.events,old.events);
  const other = newCalendar();
  delete other.sky;
  ensureSky(other,126);
  assert.equal(other.sky.unitPeriod,126);
  assert.equal(other.sky.suns.length,0);
});
