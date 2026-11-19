'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CalendarEngine, MAX_YEAR, copy, newCalendar, validateCalendar } = require('../src/calendar');
const { CONDITIONS, arkanisWeather, defaultWeather, ensureWeather, weatherDay, seasonalProfile } = require('../src/weather');
const { encodeExport, decodeImport } = require('../src/imports');
const preset = require('../src/arkanis.json');

function arkanis() { const c = copy(preset); ensureWeather(c); return c; }
function local() { const c = newCalendar(); c.weather = defaultWeather(); c.weather.enabled = true; return c; }
const signature = ({ at, ...day }) => ({ ...day, night: at(.13), afternoon: at(.67) });

test('Arkanis antigo ganha as três regiões e não sobrescreve clima já configurado', () => {
  const c = copy(preset), date = copy(c.current), events = copy(c.events);
  assert.equal(ensureWeather(c), true);
  assert.deepEqual(c.weather, arkanisWeather(c));
  assert.equal(c.weather.activeId, 'centrus');
  assert.equal(c.weather.offset, 64);
  assert.deepEqual(c.weather.regions.map((r) => r.name), ['Solus', 'Centrus', 'Nortus']);
  c.weather.enabled = false;
  assert.equal(ensureWeather(c), false);
  assert.equal(c.weather.enabled, false);
  assert.deepEqual(c.current, date);
  assert.deepEqual(c.events, events);
  assert.equal(ensureWeather(newCalendar()), false);
});

test('mesma data e semente preservam a previsão no backup e nomes não mudam os sorteios', () => {
  const c = arkanis(), e = new CalendarEngine(c), date = e.fromEpoch(867);
  const before = weatherDay(c, e, date, MAX_YEAR, 'nortus');
  c.weather.regions.at(-1).name = 'Nortus antigo';
  const backup = decodeImport(encodeExport(c)).calendar;
  const after = weatherDay(backup, new CalendarEngine(backup), date, MAX_YEAR, 'nortus');
  assert.deepEqual(signature(after), { ...signature(before), region: 'Nortus antigo' });
  backup.weather.seed = 'outra semente';
  const reseeded = weatherDay(backup, new CalendarEngine(backup), date, MAX_YEAR, 'nortus');
  assert.notDeepEqual(signature(after), signature(reseeded));
});

test('regiões têm clima diferente com faixas e estados válidos em todo o ano de Arkanis', () => {
  const c = arkanis(), e = new CalendarEngine(c), labels = new Set();
  const average = {};
  for (const { id } of c.weather.regions) {
    let sum = 0;
    for (let i = 0; i < e.yearStart(2); i++) {
      const d = weatherDay(c, e, e.fromEpoch(i), MAX_YEAR, id);
      sum += d.high;
      assert.ok(d.low <= d.high && d.wind <= d.gust);
      for (const percent of [d.humidity, d.cloud, d.chance, d.intensity]) assert.ok(percent >= 0 && percent <= 100);
      for (const frac of [0, .19, .4, .69, .93]) {
        const now = d.at(frac);
        assert.ok(now.temperature >= d.low && now.temperature <= d.high);
        assert.ok(now.visibility > 0 && CONDITIONS[now.condition]);
        labels.add(now.condition);
      }
    }
    average[id] = sum / e.yearStart(2);
  }
  assert.ok(average.solus > average.centrus + 4 && average.centrus > average.nortus + 4);
  for (const label of ['mist', 'fog', 'rain', 'snow']) assert.ok(labels.has(label), label);
});

test('respeita chuva zero ou garantida, calmaria e ponto de congelamento', () => {
  const c = local();
  const e = new CalendarEngine(c), d = c.current;
  const p = c.weather.regions[0].base;
  Object.assign(p, { low: 7, high: 10, rain: 0, intensity: 100, wind: 0, fog: 0 });
  let result = weatherDay(c, e, d, MAX_YEAR);
  assert.equal(result.wet, false);
  assert.equal(result.wind, 0);
  assert.equal(result.direction, '');
  p.rain = 100; c.weather.freeze = 18;
  result = weatherDay(c, e, d, MAX_YEAR);
  assert.equal(result.wet, true);
  assert.match(result.at(.67).condition, /snow|flurry|blizzard/);
  c.weather.freeze = -40;
  assert.match(weatherDay(c, e, d, MAX_YEAR).at(.67).condition, /rain|drizzle|downpour|storm/);
  p.intensity = 0;
  assert.equal(weatherDay(c, e, d, MAX_YEAR).wet, false);
  c.weather.enabled = false;
  assert.equal(weatherDay(c, e, d, MAX_YEAR), null);
});

test('estações por duração se interpolam e o atraso não altera a data civil', () => {
  const c = arkanis(), e = new CalendarEngine(c), r = c.weather.regions[1];
  const day = e.fromEpoch(252), late = e.fromEpoch(316);
  assert.equal(e.season(day).name, 'Solanarê');
  assert.equal(seasonalProfile(c, e, r, 252, MAX_YEAR).season, 'Velanthir');
  assert.equal(seasonalProfile(c, e, r, 316, MAX_YEAR).high, r.seasons[1].high);
  assert.equal(weatherDay(c, e, late, MAX_YEAR).season, 'Solanarê');
  const mid = seasonalProfile(c, e, r, 126 + 64, MAX_YEAR);
  assert.equal(mid.high, (r.seasons[0].high + r.seasons[1].high) / 2);
});

test('estações por data consideram a virada e inserções bissextas', () => {
  const c = local(), [m, other] = c.months;
  c.seasons = [{ id: 'warm', name: 'Quente', month: m.id, day: 7, color: '#ff7788' },
    { id: 'cold', name: 'Fria', month: other.id, day: 3, color: '#7788ff' }];
  c.leapDays.push({ id: 'extra', name: 'Extra', month: m.id, every: 2, offset: 0, except: 0, also: 0 });
  const r = c.weather.regions[0];
  r.seasons = [{ id: 'warm', ...r.base, high: 30 }, { id: 'cold', ...r.base, high: 14 }];
  const e = new CalendarEngine(validateCalendar(c));
  assert.equal(seasonalProfile(c, e, r, 0, MAX_YEAR).season, 'Fria');
  assert.equal(seasonalProfile(c, e, r, e.epoch({ year: 2, month: other.id, day: 3 }) - 1, MAX_YEAR).season, 'Quente');
  assert.equal(seasonalProfile(c, e, r, e.epoch({ year: 2, month: other.id, day: 3 }), MAX_YEAR).high, 14);
  const last = e.fromEpoch(e.yearStart(MAX_YEAR + 1) - 1);
  c.weather.offset = -100000;
  assert.ok(Number.isFinite(weatherDay(c, e, last, MAX_YEAR).high));
  c.weather.offset = 100000;
  assert.ok(Number.isFinite(weatherDay(c, e, c.current, MAX_YEAR).high));
});

test('validação rejeita região ativa inexistente, faixas invertidas e estação duplicada', () => {
  const c = arkanis();
  c.weather.activeId = 'missing';
  assert.throws(() => validateCalendar(c), /região que exista/);
  c.weather.activeId = 'centrus';
  c.weather.regions[0].base.low = 80;
  assert.throws(() => validateCalendar(c), /mínima/);
  c.weather.regions[0].base.low = 0;
  c.weather.regions[0].seasons[1].id = c.weather.regions[0].seasons[0].id;
  assert.throws(() => validateCalendar(c), /estação diferente/);
});

test('importa clima do Fantasy Calendar com região selecionada, Fahrenheit e proporções', () => {
  const season = { name: 'Fria', timespan: 0, day: 1 };
  const doc = { name: 'Importado', dynamic_data: { year: 1, timespan: 0, day: 1, location: '1', custom_location: true },
    static_data: { year_data: { timespans: [{ name: 'Primeiro', length: 20 }], global_week: ['Lua'] },
      seasons: { data: [season], global_settings: { enable_weather: true, weather_offset: 14, seed: 4321, temp_sys: 'imperial', wind_sys: 'imperial' },
        locations: ['Baixa', 'Porto'].map((name) => ({ name,
          seasons: [{ weather: { temp_low: 32, temp_high: 68, precipitation: .4, precipitation_intensity: .75 } }] })) } } };
  const { calendar: c, warnings } = decodeImport(doc);
  assert.equal(c.weather.enabled, true);
  assert.equal(c.weather.temperature, 'F');
  assert.equal(c.weather.wind, 'mph');
  assert.equal(c.weather.seed, '4321');
  assert.equal(c.weather.offset, 14);
  assert.equal(c.weather.activeId, 'fc-regiao-2');
  assert.equal(c.weather.regions[1].name, 'Porto');
  const { low, high, rain, intensity } = c.weather.regions[1].seasons[0];
  assert.deepEqual({ low, high, rain, intensity }, { low: 0, high: 20, rain: 40, intensity: 75 });
  assert.match(warnings.join(' '), /motor do Basic RPG/);
  doc.static_data.seasons.locations[1].seasons[0].weather.temp_low = null;
  const corrupt = decodeImport(doc);
  assert.equal(corrupt.calendar.weather.regions[1].seasons.length, 0);
  assert.match(corrupt.warnings.join(' '), /inválidos/);
});
