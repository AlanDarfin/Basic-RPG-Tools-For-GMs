'use strict';

const { periodicPhase } = require('./seasons');

// Fictional weather. Units in the model are Celsius, km/h, percent and km.
const MAX_REGIONS = 32, MAX_OFFSET = 100000;
const PROFILE_FIELDS = [
  ['low', 'Mínima média (°C)', -120, 120],
  ['high', 'Máxima média (°C)', -120, 120],
  ['rain', 'Chance de precipitação (%)', 0, 100],
  ['intensity', 'Intensidade da precipitação (%)', 0, 100],
  ['humidity', 'Umidade típica (%)', 0, 100],
  ['wind', 'Vento típico (km/h)', 0, 200],
  ['fog', 'Chance de neblina (%)', 0, 100],
];
const SEASON_MODIFIERS = [
  ['temperature', 'Temperatura (°C)', -100, 100],
  ['rain', 'Chance de precipitação (p.p.)', -100, 100],
  ['intensity', 'Intensidade da precipitação (p.p.)', -100, 100],
  ['humidity', 'Umidade (p.p.)', -100, 100],
  ['wind', 'Vento (km/h)', -200, 200],
  ['fog', 'Chance de neblina (p.p.)', -100, 100],
];
const BIOMES = [
  ['temperate', 'Temperado', [9, 21, 38, 40, 65, 17, 25]],
  ['humid', 'Quente e úmido', [22, 32, 65, 70, 81, 13, 40]],
  ['arid', 'Árido', [14, 35, 7, 30, 29, 23, 3]],
  ['cold', 'Frio', [-14, 1, 40, 55, 72, 23, 30]],
  ['coast', 'Costa úmida', [11, 21, 54, 55, 84, 21, 64]],
];
const profile = (values) => Object.fromEntries(PROFILE_FIELDS.map(([key], i) => [key, values[i]]));
function biome(key = 'temperate') { return profile((BIOMES.find((x) => x[0] === key) || BIOMES[0])[2]); }
function region(id, name, preset) { return { id, name, base: biome(preset), seasons: [] }; }
function defaultWeather() {
  return { enabled: false, seed: 'Basic RPG', offset: 0, freeze: 0, temperature: 'C', wind: 'kmh',
    activeId: 'clima-geral', regions: [region('clima-geral', 'Região geral')] };
}
function isArkanis(c) {
  return c.id === 'arkanis-preset' || (c.week?.length === 12 && c.months?.length === 26 &&
    c.months[0]?.name === 'Arkanis' && c.months[18]?.name === 'Skaryel');
}
function arkanisWeather(c) {
  const rows = [
    ['solus', 'Solus', 'arid', [[18,31,16,44,46,16,14], [25,42,6,35,30,19,4], [20,34,25,55,54,20,18], [11,26,18,40,50,16,14]]],
    ['centrus', 'Centrus', 'temperate', [[12,23,55,48,77,13,51], [19,32,34,70,63,17,18], [10,22,61,55,85,17,63], [2,13,42,45,80,12,57]]],
    ['nortus', 'Nortus', 'cold', [[-5,8,49,40,76,24,34], [6,18,42,55,72,21,23], [-4,7,59,65,81,28,48], [-21,-8,52,72,76,32,38]]],
  ];
  return { ...defaultWeather(), enabled: true, seed: '1789259899', offset: 64, activeId: 'centrus',
    regions: rows.map(([id, name, preset, values]) => ({ ...region(id, name, preset),
      seasons: c.seasons.slice(0, 4).map((s, i) => ({ id: s.id, ...profile(values[i]) })) })) };
}
function ensureWeather(c) {
  if (c.weather !== undefined || !isArkanis(c)) return false;
  c.weather = arkanisWeather(c);
  return true;
}
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function requireWeather(ok, message) { if (!ok) throw new Error(message); }
function validateSeasonClimate(modifiers, seasonName) {
  if (modifiers === undefined) return;
  requireWeather(isRecord(modifiers), 'Ajuste de clima da estação inválido.');
  for (const [key, value] of Object.entries(modifiers)) {
    const def = SEASON_MODIFIERS.find((item) => item[0] === key);
    requireWeather(def && Number.isFinite(value) && value >= def[2] && value <= def[3],
      'Ajuste climático fora do limite em ' + seasonName + '.');
  }
}
function validateWeather(w, seasons) {
  if (w === undefined) return;
  const validText = (s, limit) => typeof s === 'string' && !!s.trim() && s.length <= limit;
  requireWeather(isRecord(w) && typeof w.enabled === 'boolean' && validText(w.seed, 80), 'Clima: informe uma semente de até 80 caracteres.');
  requireWeather(Number.isInteger(w.offset) && Math.abs(w.offset) <= MAX_OFFSET, 'Clima: o deslocamento precisa ser um inteiro entre −100000 e 100000 dias.');
  requireWeather(Number.isFinite(w.freeze) && w.freeze >= -100 && w.freeze <= 100, 'Clima: o ponto de congelamento deve ficar entre −100 e 100 °C.');
  requireWeather(['C', 'F'].includes(w.temperature) && ['kmh', 'mph'].includes(w.wind), 'Clima: unidades inválidas.');
  requireWeather(Array.isArray(w.regions) && w.regions.length > 0 && w.regions.length <= MAX_REGIONS, 'Clima: configure de uma a 32 regiões.');
  const ids = new Set(), names = new Set(), seasonIds = new Set(seasons.map((s) => s.id));
  const validProfile = (p, name) => {
    requireWeather(isRecord(p), `Clima de ${name}: perfil inválido.`);
    for (const [key, label, lo, hi] of PROFILE_FIELDS) {
      requireWeather(Number.isFinite(p[key]) && p[key] >= lo && p[key] <= hi, `Clima de ${name}: ${label} precisa ficar entre ${lo} e ${hi}.`);
    }
    requireWeather(p.low <= p.high, `Clima de ${name}: a mínima não pode ser maior que a máxima.`);
  };
  for (const r of w.regions) {
    requireWeather(isRecord(r) && validText(r.id, 100) && validText(r.name, 60), 'Clima: cada região precisa de um nome de até 60 caracteres.');
    const name = r.name.normalize('NFKD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
    requireWeather(!ids.has(r.id) && !names.has(name), 'Clima: as regiões precisam ter IDs e nomes diferentes.');
    ids.add(r.id); names.add(name);
    validProfile(r.base, r.name);
    requireWeather(Array.isArray(r.seasons) && r.seasons.length <= seasonIds.size, 'Clima: perfis sazonais inválidos.');
    const used = new Set();
    for (const s of r.seasons) {
      requireWeather(isRecord(s) && seasonIds.has(s.id) && !used.has(s.id), 'Clima: cada perfil sazonal deve apontar para uma estação diferente que exista.');
      used.add(s.id);
      validProfile(s, r.name + ' / ' + seasons.find((item) => item.id === s.id).name);
    }
  }
  requireWeather(ids.has(w.activeId), 'Clima: selecione uma região que exista.');
}
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const blend = (a, b, t) => a + (b - a) * t;
const eased = (t) => t * t * (3 - 2 * t);
const mod = (n, m) => ((n % m) + m) % m;
function hash(s) {
  let n = 2166136261;
  for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619);
  return n;
}
function random(seed, at, channel) {
  let x = seed ^ Math.imul(at, 0x9e3779b1) ^ Math.imul(channel, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
function noise(seed, day, span, channel) {
  const x = day / span, i = Math.floor(x);
  return blend(random(seed, i, channel), random(seed, i + 1, channel), eased(x - i));
}

// Climate periods are distinct from event dates. Weather offsets can cross a year
// boundary without shifting the season, events or astronomical clock.
function climatePhase(c, e, day, maxYear) {
  if (!c.seasons.length) return { from: null, to: null, mix: 0 };
  let from, to, mix;
  if (c.seasonMode === 'periodic') {
    const { index, season, elapsed } = periodicPhase(c, day);
    from = season;
    to = c.seasons[(index + 1) % c.seasons.length];
    mix = elapsed / season.duration;
  } else {
    const limit = e.yearStart(maxYear + 1);
    const year = e.fromEpoch(clamp(day, 0, limit - 1)).year;
    const yearOf = (y) => y === 0 ? 1 : y === maxYear + 1 ? maxYear : y;
    const points = [];
    for (const y of [year - 1, year, year + 1]) {
      const sourceYear = yearOf(y);
      const origin = y === 0 ? -e.yearInfo(1).total : e.yearStart(y);
      for (const s of c.seasons) points.push({ s, at: origin + e.yearInfo(sourceYear).months[e.monthIndex(s.month)].start + s.day - 1 });
    }
    points.sort((a, b) => a.at - b.at);
    let i = points.findIndex((p) => p.at > day);
    if (i < 0) i = points.length - 1;
    const a = points[Math.max(0, i - 1)], b = points[i];
    from = a.s; to = b.s; mix = a.at === b.at ? 0 : clamp((day - a.at) / (b.at - a.at));
  }
  return { from, to, mix: eased(mix) };
}
function seasonTargets(region, season) {
  const own = region.seasons.find((p) => p.id === season?.id);
  const base = own || region.base, mods = season?.climate ?? {};
  const targets = PROFILE_FIELDS.map(([key, , low, high]) => {
    const delta = mods[key === 'low' || key === 'high' ? 'temperature' : key] ?? 0;
    return [key, clamp(base[key] + delta, low, high)];
  });
  return { regional: !!own, ...Object.fromEntries(targets) };
}
function seasonalProfile(c, engine, r, epoch, maxYear) {
  // Extrapolate the calendar at its limits instead of pinning the whole offset
  // to the very first or last day.
  let shifted = epoch - c.weather.offset;
  if (c.seasonMode === 'date' && c.seasons.length) {
    const limit = engine.yearStart(maxYear + 1);
    if (shifted < 0) shifted = mod(shifted, engine.yearInfo(1).total) - engine.yearInfo(1).total;
    else if (shifted >= limit) shifted = limit + mod(shifted - limit, engine.yearInfo(maxYear).total);
  }
  const { from, to, mix } = climatePhase(c, engine, shifted, maxYear);
  const a = seasonTargets(r, from), b = seasonTargets(r, to);
  return { season: from?.name ?? '', ...Object.fromEntries(PROFILE_FIELDS.map(([key]) => [key, blend(a[key], b[key], mix)])) };
}

const CONDITIONS = {
  clear: ['Céu limpo', 'sun'], partly: ['Parcialmente nublado', 'cloud-sun'], cloud: ['Nublado', 'cloud'],
  mist: ['Neblina', 'cloud-fog'], fog: ['Nevoeiro denso', 'cloud-fog'], drizzle: ['Garoa', 'cloud-drizzle'],
  rain: ['Chuva', 'cloud-rain'], downpour: ['Chuva forte', 'cloud-rain-wind'], storm: ['Tempestade', 'cloud-lightning'],
  flurry: ['Neve fraca', 'cloud-snow'], snow: ['Neve', 'snowflake'], blizzard: ['Nevasca', 'cloud-snow'],
  sleet: ['Chuva e neve', 'cloud-snow'], gale: ['Vento forte', 'wind'],
};
const DIRECTIONS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
function weatherDay(c, engine, date, maxYear, id = c.weather?.activeId) {
  if (!c.weather?.enabled) return null;
  const r = c.weather.regions.find((item) => item.id === id);
  if (!r) return null;
  const day = engine.epoch(date), p = seasonalProfile(c, engine, r, day, maxYear);
  const seed = hash(JSON.stringify([c.weather.seed, r.id]));
  const front = noise(seed, day, 5, 1), daily = random(seed, day, 2);
  const chance = p.rain / 100;
  // A slow-moving front clusters wet days without changing the mean chance.
  const wet = p.intensity > 0 && daily < chance + (front - .5) * 1.4 * Math.min(chance, 1 - chance);
  const severity = wet ? clamp(p.intensity / 100 * (.38 + random(seed, day, 3) * .98), .03, 1) : 0;
  const spread = (noise(seed, day, 4, 4) - .5) * 8 + (random(seed, day, 5) - .5) * 3;
  const low = Math.round(p.low + spread);
  const high = Math.max(low, Math.round(p.high + spread - severity * Math.min(4, (p.high - p.low) / 4)));
  const humidity = Math.round(clamp(p.humidity + (front - .5) * 23 + severity * 21, 0, 100));
  const cloud = Math.round(clamp((wet ? 67 + severity * 32 : 15 + humidity * .6 + (front - .4) * 57), 0, 100));
  const wind = p.wind === 0 ? 0 : Math.round(p.wind * (.28 + noise(seed, day, 4, 6) * .92 + severity * .68));
  const gust = wind === 0 ? 0 : wind + Math.round(wind * (.16 + random(seed, day, 7) * .55 + severity * .38));
  const direction = wind ? DIRECTIONS[Math.floor((noise(seed, day, 6, 8) * 7 + random(seed, day, 9)) % 8)] : '';
  const fog = !wet && humidity >= 60 && wind < 34 && random(seed, day, 10) < p.fog / 100;
  const denseFog = fog && humidity >= 83 && wind < 20;
  const freeze = c.weather.freeze;
  const dry = wind >= 53 ? 'gale' : cloud >= 69 ? 'cloud' : cloud >= 29 ? 'partly' : 'clear';
  const wetCondition = (temp, mid = false) => {
    if (temp <= freeze) return severity >= .71 && gust >= 48 ? 'blizzard' : severity < .24 ? 'flurry' : 'snow';
    if (temp <= freeze + 2 && low <= freeze) return 'sleet';
    if (severity >= .78 && (gust >= 49 || temp > freeze + 14) && mid) return 'storm';
    return severity >= .64 ? 'downpour' : severity < .24 ? 'drizzle' : 'rain';
  };
  const at = (fraction) => {
    const f = clamp(fraction);
    const t = clamp((1 - Math.cos(2 * Math.PI * (f - .19))) / 2);
    const temperature = Math.round(blend(low, high, t));
    const fogNow = fog && (f < .31 || f >= .88);
    const condition = wet ? wetCondition(temperature, f >= .3 && f <= .81) : fogNow ? (denseFog ? 'fog' : 'mist') : dry;
    const visibility = fogNow ? (denseFog ? .3 : 1.8) : wet ? Math.round(blend(14, 1, severity)) : 20;
    return { temperature, condition, visibility };
  };
  return { region: r.name, season: p.season, day, low, high, humidity, cloud, wind, gust, direction,
    fog, wet, intensity: Math.round(severity * 100), chance: Math.round(p.rain),
    condition: wet ? wetCondition(high, true) : fog ? denseFog ? 'fog' : 'mist' : dry, at };
}

module.exports = { BIOMES, MAX_REGIONS, MAX_OFFSET, PROFILE_FIELDS, SEASON_MODIFIERS, CONDITIONS, biome, region, defaultWeather,
  arkanisWeather, ensureWeather, validateWeather, validateSeasonClimate, seasonTargets, seasonalProfile, weatherDay };
