'use strict';
const { assert, copy, validateCalendar, CalendarEngine, MAX_YEAR } = require('./calendar');
const { ensureSky } = require('./sky');
const { ensureEclipseOrbits } = require('./eclipse');
const { calendarium } = require('./interchange');
const { MAX_REGIONS, MAX_OFFSET, defaultWeather, region, ensureWeather } = require('./weather');
const NATIVE_FORMAT = 'basic-rpg/calendar';
const FORMAT_VERSION = 1;
const DEFAULT_COLOR = '#7866b3';
const color = (candidate, fallback = DEFAULT_COLOR) => typeof candidate === 'string' && /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
const text = (v, length) => typeof v === 'string' ? v.trim().slice(0, length) : '';
function plainDescription(value) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text(value, 16000).replace(/<br\s*\/?\s*>|<\/p>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => entities[n]).slice(0, 8000);
}
function parseInterval(value) {
  const parts = String(value ?? 1).split(',').map((s) => s.trim());
  assert(parts.every((n) => /^!?[1-9][0-9]*$/.test(n)), 'Há uma regra de dia especial do Fantasy Calendar que esta versão não interpreta.');
  const positives = parts.filter((n) => !n.startsWith('!')).map(Number).sort((a, b) => a - b);
  const negatives = parts.filter((n) => n.startsWith('!')).map((n) => Number(n.slice(1)));
  assert(positives.length && positives.length <= 2 && negatives.length <= 1 && (positives.length === 1 || negatives.length === 1),
    'Regra de dia especial não suportada. Use um intervalo, uma exceção e uma restauração.');
  return { every: positives[0], except: negatives[0] || 0, also: positives[1] || 0 };
}

function importFantasyWeather(cal, seasonData, dynamic, warnings) {
  const g = seasonData?.global_settings;
  if (typeof g?.enable_weather !== 'boolean') { ensureWeather(cal); return; }
  const settings = defaultWeather();
  settings.enabled = g.enable_weather;
  if (typeof g.seed === 'number' || typeof g.seed === 'string') settings.seed = String(g.seed).trim().slice(0, 80) || settings.seed;
  if (Number.isInteger(Number(g.weather_offset)) && Math.abs(Number(g.weather_offset)) <= MAX_OFFSET) settings.offset = Number(g.weather_offset);
  else if (g.weather_offset !== undefined) warnings.push('O deslocamento de clima não suportado foi mantido em zero.');
  const imperialTemp = ['imperial', 'both_i'].includes(g.temp_sys);
  if (imperialTemp) settings.temperature = 'F';
  if (['imperial', 'both_i'].includes(g.wind_sys)) settings.wind = 'mph';
  const locations = Array.isArray(seasonData.locations) ? seasonData.locations : [];
  const seen = new Set();
  const imported = [];
  let skipped = 0, invalidProfile = false;
  const numeric = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim())) ? Number(v) : NaN;
  const pct = (v) => {
    const n = numeric(v);
    return n >= 0 && n <= 1 ? Math.round(n * 10000) / 100 : NaN;
  };
  const toC = (v) => imperialTemp ? Math.round((numeric(v) - 32) * 500 / 9) / 100 : numeric(v);
  for (const [i, loc] of locations.slice(0, MAX_REGIONS).entries()) {
    const name = text(loc?.name, 60) || ('Região ' + (i + 1));
    const key = name.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    const r = region('fc-regiao-' + (i + 1), name);
    const zone = loc?.settings?.timezone;
    if (zone) {
      const offset = (Number(zone.hour || 0) * cal.clock.minutes + Number(zone.minute || 0)) / (cal.clock.hours * cal.clock.minutes);
      if (Number.isFinite(offset) && Math.abs(offset) <= .5 && offset) r.timeOffset = offset;
    }
    for (const [j, s] of cal.seasons.entries()) {
      const data = loc?.seasons?.[j]?.weather;
      if (!data) continue;
      const low = toC(data.temp_low), high = toC(data.temp_high), rain = pct(data.precipitation), intensity = pct(data.precipitation_intensity);
      if (!(low >= -120 && low <= high && high <= 120 && Number.isFinite(rain) && Number.isFinite(intensity))) { invalidProfile = true; continue; }
      r.seasons.push({ ...r.base, id: s.id, low, high, rain, intensity,
        humidity: 52 + Math.round(rain * .42), fog: 12 + Math.round(rain * .55) });
    }
    imported.push(r);
  }
  if (imported.length) {
    settings.regions = imported;
    const index = numeric(dynamic.location);
    const requested = Number.isInteger(index) && index >= 0 && dynamic.custom_location === true ? 'fc-regiao-' + (index + 1) : '';
    settings.activeId = imported.find((r) => r.id === requested)?.id || imported[0].id;
  }
  cal.weather = settings;
  if (g.enable_weather) {
    if (!imported.length || dynamic.custom_location === false) warnings.push('Presets de localização do Fantasy Calendar não são importados. Selecione ou configure uma região no Basic RPG.');
    if (imported.length) warnings.push('Temperaturas, precipitação e regiões personalizadas importadas. A previsão usa o motor do Basic RPG, sem as curvas de ruído ou a programação sazonal de nascer e pôr do Fantasy Calendar.');
  }
  if (locations.length > MAX_REGIONS || skipped) warnings.push('Algumas regiões foram omitidas por exceder o limite ou repetir um nome.');
  if (invalidProfile) warnings.push('Perfis sazonais de clima inválidos não foram importados. Essas estações usarão o perfil-base.');
}
function importFantasy(raw) {
  const s = raw.static_data, y = s?.year_data, d = raw.dynamic_data;
  assert(y && d && Array.isArray(y.timespans) && Array.isArray(y.global_week), 'Esse não parece um arquivo do Fantasy Calendar.');

  const warnings = [];
  const months = y.timespans.map((m, i) => {
    return { id: `mes-${i+1}`, name: m.name, length: Number(m.length), intercalary: m.type === 'intercalary', ...(m.week?.length ? { week: m.week } : {}),
      ...(Number(m.interval ?? 1) !== 1 ? { every: Number(m.interval), offset: Number(m.offset || 0) } : {}) };
  });
  const date = (a) => ({ year: Number(a[0]), month: months[Number(a[1])]?.id, day: Number(a[2]) });
  const leapDays = (y.leap_days || []).map((l, i) => {
    const m = months[l.timespan];
    assert(m && !l.adds_week_day && !l.not_numbered,
      `O dia especial ${l.name} usa uma posição ou regra de numeração ainda não suportada.`);
    return { id: `extra-${i+1}`, name: l.name, month: m.id, intercalary: !!l.intercalary,
      ...parseInterval(l.interval), offset: Number(l.offset ?? 0), ...(l.intercalary && l.day !== undefined ? { after: Number(l.day) } : {}) };
  });
  const periodic = !!s.seasons?.global_settings?.periodic_seasons;
  const seasons = (s.seasons?.data || []).map((v, i) => ({
    id: `estacao-${i+1}`, name: v.name, color: color(Array.isArray(v.color) ? v.color[0] : v.color),
    month: months[Number(v.timespan ?? 0)]?.id, day: Number(v.day ?? 1),
    duration: periodic ? Number(v.transition_length ?? 0) + Number(v.duration ?? 0) : 1,
  }));
  const eras = (s.eras || []).map((e) => {
    const ed = e.date;
    assert(ed && !e.settings?.ends_year && !e.settings?.starting_era && months[Number(ed.timespan)],
      `A era ${e.name} encurta um ano ou usa um ano inicial especial.`);
    return { name: e.name, start: Number(ed.year), reset: !!e.settings?.restart,
      ...(Number(ed.timespan) !== 0 || Number(ed.day) !== 1 ? { month: months[Number(ed.timespan)].id, day: Number(ed.day) } : {}) };
  });
  const allYears = [Number(d.year), ...eras.map((era) => era.start)];
  for (const event of raw.events || []) {
    for (const term of event.data?.conditions || []) {
      if (term[0] === 'Date' || term[0] === 'Year' && ['0', '2'].includes(String(term[1]))) allYears.push(Number(term[2]?.[0]));
    }
  }
  const firstYear = s.settings?.year_zero_exists ? Math.min(0, ...allYears.filter(Number.isSafeInteger)) : 1;
  const events = [], structure = new CalendarEngine({ months, leapDays, events, firstYear });
  const origin = firstYear <= 0 ? structure.yearStart(0) : 0;
  const shifted = (offset, span) => origin && span > 0 ? ((offset + origin) % span + span) % span : offset;
  for (const [i, v] of (raw.events || []).entries()) {
    const rules = v.data?.conditions || [];
    const category = (raw.categories || []).find((x) => x.id === v.event_category_id)?.name;
    const common = { id: `evento-${i+1}`, title: text(v.name, 140) || `Evento ${i+1}`,
      description: plainDescription(v.description), note: '', category: text(category, 60), color: DEFAULT_COLOR,
      hidden: !!(v.settings?.hide || v.settings?.hide_full), repeat: 'none', end: null };
    if (rules.length === 1 && rules[0][0] === 'Date' && String(rules[0][1]) === '0' && rules[0][2]?.length === 3) {
      const start = date(rules[0][2]), span = v.data?.has_duration ? Number(v.data.duration) : 1;
      assert(Number.isSafeInteger(span) && span > 0, 'Duração de evento inválida: ' + common.title);
      events.push({ ...common, start, end: span === 1 ? null : structure.shift(start, span - 1) });
    } else if (rules.length === 3 && rules[0][0] === 'Season' && String(rules[0][1]) === '0'
      && rules[1][0] === '&&' && rules[2][0] === 'Season' && String(rules[2][1]) === '8'
      && Number(rules[2][2]?.[0]) === 1 && seasons[Number(rules[0][2]?.[0])] && !v.data?.has_duration) {
      events.push({ ...common, repeat: 'season', seasonId: seasons[Number(rules[0][2][0])].id, start: null });
    } else if (rules.length === 5 && rules[0][0] === 'Month' && String(rules[0][1]) === '0' && rules[1][0] === '&&' &&
      rules[2][0] === 'Day' && String(rules[2][1]) === '0' && rules[3][0] === '&&' &&
      rules[4][0] === 'Year' && String(rules[4][1]) === '2' && !v.data?.has_duration && !v.data?.limited_repeat) {
      events.push({ ...common, repeat: 'year', start: date([rules[4][2][0], rules[0][2][0], rules[2][2][0]]) });
    } else if (rules[0]?.[0] === 'Date' && String(rules[0][1]) === '2' && rules[0][2]?.length === 3 && !v.data?.limited_repeat &&
      rules.every((r, j) => j === 0 || (j % 2 ? r[0] === '&&' : ['Day', 'Month', 'Weekday', 'Season'].includes(r[0]) && String(r[1]) === '0'))) {
      const duration = v.data?.has_duration ? Number(v.data.duration) : 1;
      const mapped = rules.slice(1).filter((_, j) => j % 2).map(([type, , [a]]) => ({
        type: type.toLowerCase(), value: type === 'Month' ? months[Number(a)]?.id : type === 'Season' ? seasons[Number(a)]?.id :
          type === 'Day' ? Number(a) : a,
      }));
      if (duration >= 1 && duration <= 366 && mapped.length <= 12) events.push({ ...common, repeat: 'pattern', start: date(rules[0][2]),
        pattern: { unit: 'day', every: 1, duration, match: 'all', rules: mapped } });
      else warnings.push('Padrão de evento não suportado: ' + common.title);
    } else {
      warnings.push(`Evento com regra não suportada: ${common.title}`);
    }
  }
  const cal = {
    id: 'importado', name: text(raw.name, 100) || 'Calendário importado', description: '',
    week: y.global_week.slice(), firstWeekday: (() => {
      const n = y.global_week.length, normal = Number(y.first_day ?? 1) - 1 - (origin && y.overflow !== false ? structure.yearStart(0, true) : 0);
      return ((normal % n) + n) % n;
    })(), weekOverflow: y.overflow !== false,
    months, leapDays, ...(firstYear !== 1 ? { firstYear } : {}),
    moons: (s.moons || []).map((m, i) => ({ id: `lua-${i+1}`, name: m.name, period: Number(m.cycle), offset: shifted(Number(m.shift ?? 0), Number(m.cycle)),
      granularity: Number(m.granularity ?? 8), rounding: m.cycle_rounding || 'round', hidden: !!m.hidden })),
    seasons, seasonMode: periodic ? 'periodic' : 'date', seasonOffset: shifted(Number(s.seasons?.global_settings?.season_offset ?? 0), periodic ? seasons.reduce((n, entry) => n + entry.duration, 0) : 0), eras,
    clock: { hours: Number(s.clock?.hours || 24), minutes: Number(s.clock?.minutes || 60) },
    current: { ...date([d.year, d.timespan, d.day]), hour: Number(d.hour || 0), minute: Number(d.minute || 0) },
    events,
  };
  importFantasyWeather(cal, s.seasons, d, warnings);
  validateCalendar(cal);
  ensureSky(cal, new CalendarEngine(cal).yearInfo(1).total);
  ensureEclipseOrbits(cal);
  return { calendar: validateCalendar(cal), warnings };
}

function decodeImport(raw) {
  assert(raw && typeof raw === 'object', 'O arquivo JSON não é um objeto válido.');
  if (raw.format === NATIVE_FORMAT) {
    assert(raw.version === FORMAT_VERSION, 'Versão do backup não suportada.');
    const calendar = validateCalendar(copy(raw.calendar));
    ensureSky(calendar, new CalendarEngine(calendar).yearInfo(1).total);
    ensureEclipseOrbits(calendar);
    ensureWeather(calendar);
    return { calendar: validateCalendar(calendar), warnings: [] };
  }
  if (raw.static_data?.year_data) return importFantasy(raw);
  if (Array.isArray(raw.static?.months) && Array.isArray(raw.static?.weekdays) && raw.current) {
    const result = calendarium(raw, parseInterval), c = validateCalendar(result.calendar);
    ensureSky(c, new CalendarEngine(c).yearInfo(1).total); ensureEclipseOrbits(c); ensureWeather(c);
    return result;
  }
  throw new Error('Formato não reconhecido. Use um JSON do Basic RPG, do Calendarium ou do Fantasy Calendar.');
}
function encodeExport(calendar) {
  const snapshot = ensureEclipseOrbits(copy(validateCalendar(calendar)));
  ensureWeather(snapshot);
  return { format: NATIVE_FORMAT, version: FORMAT_VERSION, calendar: snapshot };
}
module.exports = { decodeImport, encodeExport, importFantasy, parseInterval, DEFAULT_COLOR };
