'use strict';
const { assert, copy, validateCalendar, CalendarEngine } = require('./calendar');
const { ensureSky } = require('./sky');
const { ensureEclipseOrbits } = require('./eclipse');
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

function importFantasy(raw) {
  const s = raw.static_data, y = s?.year_data, d = raw.dynamic_data;
  assert(y && d && Array.isArray(y.timespans) && Array.isArray(y.global_week), 'Esse não parece um arquivo do Fantasy Calendar.');
  assert(!s.settings?.year_zero_exists, 'Calendários com ano zero ainda não podem ser importados.');
  const warnings = [];
  const months = y.timespans.map((m, i) => {
    assert(Number(m.interval ?? 1) === 1 && !m.week?.length, `O mês ${m.name} usa recorrência ou semana própria, ainda não suportada.`);
    return { id: `mes-${i+1}`, name: m.name, length: Number(m.length), intercalary: m.type === 'intercalary' };
  });
  const date = (a) => ({ year: Number(a[0]), month: months[Number(a[1])]?.id, day: Number(a[2]) });
  const leapDays = (y.leap_days || []).map((l, i) => {
    const m = months[l.timespan];
    assert(m && !l.adds_week_day && !l.not_numbered && (!l.intercalary || Number(l.day) === m.length),
      `O dia especial ${l.name} usa uma posição ou regra de numeração ainda não suportada.`);
    return { id: `extra-${i+1}`, name: l.name, month: m.id, intercalary: !!l.intercalary,
      ...parseInterval(l.interval), offset: Number(l.offset ?? 0) };
  });
  const periodic = !!s.seasons?.global_settings?.periodic_seasons;
  const seasons = (s.seasons?.data || []).map((v, i) => ({
    id: `estacao-${i+1}`, name: v.name, color: color(Array.isArray(v.color) ? v.color[0] : v.color),
    month: months[Number(v.timespan ?? 0)]?.id, day: Number(v.day ?? 1),
    duration: periodic ? Number(v.transition_length ?? 0) + Number(v.duration ?? 0) : 1,
  }));
  const eras = (s.eras || []).map((e) => {
    const ed = e.date;
    assert(ed && !e.settings?.ends_year && !e.settings?.starting_era && Number(ed.timespan) === 0 && Number(ed.day) === 1,
      `A era ${e.name} usa uma transição dentro do ano ou um ano inicial especial.`);
    return { name: e.name, start: Number(ed.year), reset: !!e.settings?.restart };
  });
  const events = [];
  for (const [i, v] of (raw.events || []).entries()) {
    const rules = v.data?.conditions || [];
    const category = (raw.categories || []).find((x) => x.id === v.event_category_id)?.name;
    const common = { id: `evento-${i+1}`, title: text(v.name, 140) || `Evento ${i+1}`,
      description: plainDescription(v.description), note: '', category: text(category, 60), color: DEFAULT_COLOR,
      hidden: !!(v.settings?.hide || v.settings?.hide_full), repeat: 'none', end: null };
    if (rules.length === 1 && rules[0][0] === 'Date' && String(rules[0][1]) === '0' && rules[0][2]?.length === 3 && !v.data?.has_duration) {
      events.push({ ...common, start: date(rules[0][2]) });
    } else if (rules.length === 3 && rules[0][0] === 'Season' && String(rules[0][1]) === '0'
      && rules[1][0] === '&&' && rules[2][0] === 'Season' && String(rules[2][1]) === '8'
      && Number(rules[2][2]?.[0]) === 1 && seasons[Number(rules[0][2]?.[0])] && !v.data?.has_duration) {
      events.push({ ...common, repeat: 'season', seasonId: seasons[Number(rules[0][2][0])].id, start: null });
    } else {
      warnings.push(`Evento com regra não suportada: ${common.title}`);
    }
  }
  const cal = {
    id: 'importado', name: text(raw.name, 100) || 'Calendário importado', description: '',
    week: y.global_week.slice(), firstWeekday: Number(y.first_day ?? 1) - 1, weekOverflow: y.overflow !== false,
    months, leapDays,
    moons: (s.moons || []).map((m, i) => ({ id: `lua-${i+1}`, name: m.name, period: Number(m.cycle), offset: Number(m.shift ?? 0),
      granularity: Number(m.granularity ?? 8), rounding: m.cycle_rounding || 'round', hidden: !!m.hidden })),
    seasons, seasonMode: periodic ? 'periodic' : 'date', seasonOffset: Number(s.seasons?.global_settings?.season_offset ?? 0), eras,
    clock: { hours: Number(s.clock?.hours || 24), minutes: Number(s.clock?.minutes || 60) },
    current: { ...date([d.year, d.timespan, d.day]), hour: Number(d.hour || 0), minute: Number(d.minute || 0) },
    events,
  };
  if (s.seasons?.global_settings?.enable_weather) warnings.push('O clima e os dados de localização não são importados.');
  validateCalendar(cal);
  ensureSky(cal, new CalendarEngine(cal).yearStart(2));
  ensureEclipseOrbits(cal);
  return { calendar: validateCalendar(cal), warnings };
}

function decodeImport(raw) {
  assert(raw && typeof raw === 'object', 'O arquivo JSON não é um objeto válido.');
  if (raw.format === NATIVE_FORMAT) {
    assert(raw.version === FORMAT_VERSION, 'Versão do backup não suportada.');
    const calendar = validateCalendar(copy(raw.calendar));
    ensureSky(calendar, new CalendarEngine(calendar).yearStart(2));
    ensureEclipseOrbits(calendar);
    return { calendar: validateCalendar(calendar), warnings: [] };
  }
  if (raw.static_data?.year_data) return importFantasy(raw);
  throw new Error('Formato não reconhecido. Use um JSON do Basic RPG ou do Fantasy Calendar.');
}
function encodeExport(calendar) { return { format: NATIVE_FORMAT, version: FORMAT_VERSION, calendar: ensureEclipseOrbits(copy(validateCalendar(calendar))) }; }
module.exports = { decodeImport, encodeExport, importFantasy, parseInterval, DEFAULT_COLOR };
