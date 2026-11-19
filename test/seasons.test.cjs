'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CalendarEngine, MAX_YEAR, newCalendar, copy, validateCalendar } = require('../src/calendar');
const { seasonSchedule } = require('../src/seasons');
const { defaultWeather, weatherDay, seasonTargets, seasonalProfile, ensureWeather } = require('../src/weather');
const { encodeExport, decodeImport } = require('../src/imports');
const preset = require('../src/arkanis.json');

test('mostra o ciclo completo de Arkanis e navega na primeira virada civil', () => {
  const e = new CalendarEngine(preset);
  const result = seasonSchedule(preset, e, preset.current, MAX_YEAR);
  assert.deepEqual(result.items.map((item) => item.season.name), ['Velanthir', 'Solanarê', 'Drosmy', 'Kealyth']);
  assert.deepEqual(result.items.map((item) => item.duration), [252, 252, 252, 252]);
  assert.equal(result.cycleLength, 1008);
  assert.equal(result.current.season.name, 'Velanthir');
  assert.equal(e.epoch(result.next.startDate), 252);
  assert.equal(e.season(result.next.startDate).name, 'Solanarê');
  assert.ok(e.eventsOn(result.next.startDate).some((x) => x.seasonId === result.next.season.id));
});

test('datas fixas usam meses em ordem, atravessam o ano e respeitam dias bissextos', () => {
  const c = newCalendar();
  const [a, b] = c.months;
  c.seasons = [
    { id: 'seca', name: 'Seca', month: b.id, day: 1, color: '#e98139' },
    { id: 'chuva', name: 'Chuva', month: a.id, day: 3, color: '#4d83ca' },
  ];
  c.leapDays.push({ id: 'extra', name: 'Dia extra', month: a.id, every: 2, offset: 0, except: 0, also: 0 });
  const e = new CalendarEngine(validateCalendar(c));
  const initial = seasonSchedule(c, e, c.current, MAX_YEAR);
  assert.equal(initial.current, null);
  assert.equal(initial.next.season.id, 'chuva');
  const afterNewYear = seasonSchedule(c, e, { ...c.current, year: 2 }, MAX_YEAR);
  assert.equal(afterNewYear.current.season.id, 'seca');
  assert.equal(afterNewYear.current.startDate.year, 1);
  assert.equal(afterNewYear.next.startDate.year, 2);
  assert.equal(afterNewYear.next.duration, initial.next.duration + 1);
  const last = seasonSchedule(c, e, e.fromEpoch(e.yearStart(MAX_YEAR + 1) - 1), MAX_YEAR);
  assert.equal(last.next, null);
  assert.equal(last.current.season.id, 'seca');
});

test('viradas fracionárias coincidem com o calendário e o evento ao longo do ciclo', () => {
  const c = copy(preset);
  const durations = [1.1, 5.9, 30.2, 10.8];
  c.seasons.forEach((s, i) => { s.duration = durations[i]; });
  const e = new CalendarEngine(c);
  const limit = e.yearStart(MAX_YEAR + 1);
  for (const offset of [0, .2, -7.75]) {
    c.seasonOffset = offset;
    for (const start of [0, 100, limit - 100]) {
      for (let day = start; day < start + 100; day++) {
        const date = e.fromEpoch(day);
        const result = seasonSchedule(c, e, date, MAX_YEAR);
        const civil = e.season(date);
        assert.equal(result.current.season.id, civil.id);
        assert.equal(day - result.current.from + 1, civil.dayOfSeason);
        assert.ok(day < result.current.until);
        if (!result.next) continue;
        assert.equal(result.current.until, result.next.from);
        const ev = c.events.find((x) => x.seasonId === result.next.season.id);
        assert.equal(e.eventOn(ev, result.next.startDate), true);
      }
    }
    for (const y of [1, 2, MAX_YEAR]) {
      for (const ev of c.events.filter((x) => x.repeat === 'season')) {
        const start = e.firstOccurrenceInYear(ev, y);
        assert.equal(e.eventOn(ev, start), true);
        const first = e.yearStart(y);
        const earlier = Array.from({ length: e.epoch(start) - first }, (_, i) => e.fromEpoch(first + i));
        assert.ok(earlier.every((d) => !e.eventOn(ev, d)));
      }
    }
  }
});

test('uma estação só, um mundo sem estação e limites de data têm previsões navegáveis', () => {
  const c = newCalendar();
  const e = new CalendarEngine(c);
  assert.deepEqual(seasonSchedule(c, e, c.current, MAX_YEAR).items, []);
  c.seasonMode = 'periodic'; c.seasonOffset = 1.5;
  c.seasons = [{ id: 'longa', name: 'Longa', duration: 15, color: '#90bbd1' }];
  const s = seasonSchedule(c, e, c.current, MAX_YEAR);
  assert.equal(s.current.season.id, 'longa');
  assert.equal(s.current.startDate, null);
  assert.equal(s.items.length, 1);
  assert.equal(e.epoch(s.next.startDate), 2);
});

test('ajustes globais chegam à previsão em todas as regiões sem apagar perfis existentes', () => {
  const c = copy(preset);
  ensureWeather(c);
  const e = new CalendarEngine(c);
  const epoch = c.weather.offset, d = e.fromEpoch(epoch);
  const expected = new Map(c.weather.regions.map((r) => [r.id, weatherDay(c, e, d, MAX_YEAR, r.id)]));
  c.seasons[0].climate = { temperature: -10, rain: -20, wind: 8, fog: 15, humidity: 10 };
  validateCalendar(c);
  for (const r of c.weather.regions) {
    const base = r.seasons[0];
    const profile = seasonTargets(r, c.seasons[0]);
    const actual = weatherDay(c, e, d, MAX_YEAR, r.id);
    assert.equal(profile.low, base.low - 10);
    assert.equal(profile.wind, base.wind + 8);
    assert.equal(profile.fog, base.fog + 15);
    assert.equal(actual.low, expected.get(r.id).low - 10);
    assert.equal(actual.chance, Math.max(0, expected.get(r.id).chance - 20));
  }
  const mid = seasonalProfile(c, e, c.weather.regions[1], epoch + 126, MAX_YEAR);
  assert.equal(mid.low, (2 + 19) / 2);
  const after = decodeImport(encodeExport(c)).calendar;
  assert.deepEqual(after.seasons[0].climate, c.seasons[0].climate);
  assert.deepEqual(after.weather, c.weather);
});

test('ajustes valem sobre o perfil-base e preservam faixas de temperatura e percentuais', () => {
  const c = newCalendar();
  c.weather = defaultWeather();
  c.weather.enabled = true;
  const [m] = c.months;
  c.seasons = [{ id: 'alta', name: 'Alta', month: m.id, day: 1, color: '#2563aa',
    climate: { temperature: 90, rain: 100, fog: -100, wind: -200 } }];
  const r = c.weather.regions[0];
  const p = seasonTargets(r, c.seasons[0]);
  assert.equal(p.regional, false);
  assert.deepEqual([p.low, p.high, p.rain, p.fog, p.wind], [99, 111, 100, 0, 0]);
  assert.doesNotThrow(() => validateCalendar(c));
  c.seasons[0].climate.rain = 101;
  assert.throws(() => validateCalendar(c), /fora do limite/);
});
