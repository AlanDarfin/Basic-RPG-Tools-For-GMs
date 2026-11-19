'use strict';
const { CalendarEngine, MAX_YEAR, assert, newCalendar } = require('./calendar');
const { defaultWeather, seasonTargets } = require('./weather');

const basicColor = '#7866b3';
const int = (x) => typeof x === 'string' && /^-?\d+$/.test(x) ? Number(x) : x;
function calendarium(raw, parseInterval) {
  const s = raw.static;
  const months = s.months.map((m, i) => {
    return { id: 'mes-' + (i + 1), name: m.name, length: m.length, intercalary: m.type === 'intercalary', ...(m.week?.length ? { week: m.week.map((d) => d.name) } : {}),
      ...(Number(m.interval ?? 1) !== 1 ? { every: Number(m.interval), offset: Number(m.offset || 0) } : {}) };
  });
  const date = (d) => ({ year: int(d.year), month: months[int(d.month)]?.id, day: int(d.day) });
  const fixColor = (v) => typeof v === 'string' && /^#[a-f0-9]{6}$/i.test(v) ? v : basicColor;
  const c = { ...newCalendar(raw.name || 'Calendário importado'), description: typeof raw.description === 'string' ? raw.description.slice(0, 2000) : '', months,
    week: s.weekdays.map((d) => d.name), firstWeekday: Number(s.firstWeekDay || 0) % s.weekdays.length, weekOverflow: s.overflow !== false,
    current: { ...date(raw.current), hour: 0, minute: 0 }, ...(Number(raw.current.year) <= 0 ? { firstYear: -MAX_YEAR } : {}), events: [],
  };
  const warnings = ['O Calendarium não fornece o relógio ou o céu de múltiplos sóis do Basic RPG.'];
  c.leapDays = (s.leapDays || []).map((l, i) => {
    const m = months[l.timespan];
    assert(m && !l.numbered &&
      Array.isArray(l.interval) && !l.interval.some((x) => x.ignore), 'Um dia especial do Calendarium altera uma regra de datas não suportada.');
    return { id: 'extra-' + (i + 1), name: l.name, month: m.id, intercalary: !!l.intercalary,
      offset: Number(l.offset || 0), ...(l.after == null ? {} : { after: l.after }), ...parseInterval(l.interval.map((x) => (x.exclusive ? '!' : '') + x.interval).join(',')) };
  });
  c.moons = (s.moons || []).map((m, i) => ({ id: 'lua-' + (i + 1), name: m.name, period: m.cycle, offset: m.offset || 0, granularity: 8, rounding: 'round', hidden: false }));
  c.seasonMode = raw.seasonal?.type === 'Periodic' ? 'periodic' : 'date';
  c.seasonOffset = raw.seasonal?.offset || 0;
  c.seasons = (raw.seasonal?.seasons || []).map((x, i) => ({
    id: 'estacao-' + (i + 1), name: x.name, color: fixColor(x.color),
    month: months[x.month ?? 0]?.id, day: x.day ?? 1, duration: x.duration ?? 1,
  }));
  c.eras = (s.eras || []).flatMap((era) => {
    if (era.isStartingEra || era.endsYear || era.static || !era.date)
      throw new Error('Uma era do Calendarium muda a estrutura das datas de forma não suportada.');
    assert(months[era.date.month], 'Mês da era não encontrado.');
    return [{ name: era.name, start: era.date.year, reset: false,
      ...(era.date.month !== 0 || era.date.day !== 1 ? { month: months[era.date.month].id, day: era.date.day } : {}) }];
  });
  if (s.useCustomYears) {
    c.namedYears = (s.years || []).map((y, index) => ({ year: index + 1, name: y.name })).filter((x) => typeof x.name === 'string' && x.name.trim());
    warnings.push('Os nomes de anos foram preservados. O limite de anos do Calendarium não é aplicado no Basic RPG.');
  }
  c.eventCategories = (raw.categories || []).map((x) => ({ name: x.name, color: fixColor(x.color), hidden: false }));
  for (const [i, x] of (raw.events || []).entries()) {
    const cat = (raw.categories || []).find((q) => q.id === x.category);
    const common = { id: 'evento-' + (i + 1), title: String(x.name || 'Evento').slice(0, 140), note: String(x.note || '').slice(0, 1000),
      category: cat?.name || '', color: fixColor(cat?.color), hidden: false, description: String(x.description || '').slice(0, 8000), end: null };
    if (x.type === 'Undated') c.events.push({ ...common, repeat: 'undated', start: null });
    else if (x.type === 'Range' && x.end) c.events.push({ ...common, repeat: 'none', start: date(x.date), end: date(x.end) });
    else if (x.type === 'Date') c.events.push({ ...common, repeat: 'none', start: date(x.date) });
    else if (x.type === 'Recurring' && Number.isInteger(x.date?.day) && (!Array.isArray(x.date.year) || x.date.year.every((y) => y == null))) {
      const day = x.date.day;
      const fixedYear = Number.isInteger(x.date.year);
      if (Number.isInteger(x.date.month)) c.events.push({ ...common, repeat: fixedYear ? 'none' : 'year',
        start: date({ ...x.date, year: fixedYear ? x.date.year : 1 }) });
      else if (!fixedYear && (x.date.month == null || Array.isArray(x.date.month) && x.date.month.every((m) => m == null))) {
        const month = new CalendarEngine(c).activeMonths(1).find((m) => m.length >= day);
        if (month) c.events.push({ ...common, repeat: 'pattern', start: { year: 1, month: month.id, day },
          pattern: { unit: 'month', every: 1, duration: 1, match: 'all', rules: [] } });
        else warnings.push('Recorrência sem um dia disponível: ' + common.title);
      } else warnings.push('Recorrência não suportada: ' + common.title);
    } else warnings.push('Evento não suportado: ' + common.title);
  }
  if (raw.seasonal?.weather?.enabled) {
    const w = c.weather = defaultWeather(), settings = raw.seasonal.weather;
    w.enabled = true;
    w.seed = String(settings.seed ?? w.seed);
    if (Number.isFinite(settings.freezingPoint)) w.freeze = settings.freezingPoint;
    if (settings.tempUnits === 'Imperial') w.temperature = 'F';
    if (settings.windUnits === 'Imperial') w.wind = 'mph';
    const r = w.regions[0];
    for (const [i, x] of (raw.seasonal.seasons || []).entries()) {
      const v = x.weather;
      if (Number.isFinite(v?.tempRange?.[0]) && Number.isFinite(v?.tempRange?.[1])) {
        r.seasons.push({ ...r.base, id: c.seasons[i].id, low: v.tempRange[0], high: v.tempRange[1],
          rain: (v.precipitationChance ?? .38) * 100, intensity: (v.precipitationIntensity ?? .4) * 100 });
      }
    }
    warnings.push('A previsão usa o motor do Basic RPG. Nem todos os perfis de clima do Calendarium têm equivalentes.');
  }
  delete c.sky;
  return { calendar: c, warnings };
}

function fantasyExport(c, events = c.events) {
  const e = new CalendarEngine(c), warnings = [], originYear = e.firstYear <= 0 ? 0 : 1;
  const date = (d) => [d.year, e.monthIndex(d.month), d.day];
  const origin = e.yearStart(originYear);
  const shifted = (offset, span) => origin && span > 0 ? ((offset - origin) % span + span) % span : offset;
  const time = { sunrise: { hour: Math.floor(c.clock.hours / 4), minute: 0 }, sunset: { hour: Math.floor(c.clock.hours * .75), minute: 0 } };
  const w = c.weather;
  const settings = { seed: Number.parseInt(w?.seed, 10) || 1, weather_offset: w?.offset || 0,
    season_offset: shifted(c.seasonOffset, c.seasonMode === 'periodic' ? c.seasons.reduce((n, entry) => n + entry.duration, 0) : 0), periodic_seasons: c.seasonMode === 'periodic', color_enabled: true,
    enable_weather: !!(w?.enabled && c.seasons.length), temp_sys: w?.temperature === 'F' ? 'imperial' : 'metric',
    wind_sys: w?.wind === 'mph' ? 'imperial' : 'metric', cinematic: false, preset_order: c.seasons.map((_, i) => i) };
  const byC = (n) => w?.temperature === 'F' ? n * 1.8 + 32 : n;
  const cats = [...new Set(events.map((v) => v.category).filter(Boolean))];
  const mapped = [];
  const and = (entries) => entries.flatMap((v, i) => i ? [['&&'], v] : [v]);
  for (const event of events) {
    let terms, duration = 0;
    if (event.repeat === 'none') {
      terms = [['Date', '0', date(event.start)]];
      if (event.end) duration = e.epoch(event.end) - e.epoch(event.start) + 1;
    } else if (event.repeat === 'season') terms = [['Season','0',[c.seasons.findIndex((s) => s.id === event.seasonId)]], ['Season','8',[1]]];
    else if (event.repeat === 'year' && !event.end) terms = [
      ['Month','0',[e.monthIndex(event.start.month)]], ['Day','0',[event.start.day]], ['Year','2',[event.start.year]],
    ];
    else if (event.repeat === 'pattern' && event.pattern.match === 'all' && event.pattern.every === 1 &&
      ['day', 'month'].includes(event.pattern.unit) && event.pattern.rules.every((r) => ['weekday','month','day','season'].includes(r.type))) {
      duration = event.pattern.duration;
      terms = [['Date', '2', date(event.start)]];
      if (event.pattern.unit === 'month') terms.push(['Day', '0', [event.start.day]]);
      for (const r of event.pattern.rules) {
        terms.push(r.type === 'weekday' ? ['Weekday','0',[r.value]] : r.type === 'month' ? ['Month','0',[e.monthIndex(r.value)]] :
          r.type === 'season' ? ['Season','0',[c.seasons.findIndex((s) => s.id === r.value)]] : ['Day','0',[r.value]]);
      }
    } else { warnings.push('Evento sem equivalente: ' + event.title); continue; }
    mapped.push({ id: mapped.length + 1, name: event.title, description: event.description,
      event_category_id: cats.indexOf(event.category) + 1 || -1,
      data: { conditions: and(terms), has_duration: duration > 1, duration, show_first_last: false,
        limited_repeat: false, limited_repeat_num: 0, connected_events: [], date: [], search_distance: 0 },
      settings: { color: 'Green', text: 'text', hide: event.hidden || !!c.eventCategories?.some((x) => x.name === event.category && x.hidden), hide_full: false, print: false },
    });
  }
  if (c.sky?.suns.length || c.moons.some((m) => m.riseSet)) warnings.push('Órbitas dos sóis, eclipses e horários personalizados dos astros ficam apenas no backup do Basic RPG.');
  if (w?.enabled) warnings.push('Clima transferido como temperatura e precipitação. Ventos, neblina e o modelo de simulação podem diferir.');
  if (c.leapDays.some((v) => !v.intercalary && v.after !== undefined)) warnings.push('O Fantasy Calendar coloca dias extras numerados no fim do mês.');
  if (c.clockLink || c.cycles?.length || c.namedYears?.length || c.dateFormat || c.noteSources?.enabled)
    warnings.push('Vínculos de relógio, ciclos, nomes de anos, formato de data e sincronização de notas ficam no backup do Basic RPG.');
  return { warnings, data: { name: c.name, static_data: {
    year_data: { first_day: ((c.firstWeekday + (c.weekOverflow ? e.yearStart(originYear, true) : 0)) % c.week.length) + 1, overflow: c.weekOverflow, global_week: c.week,
      timespans: c.months.map((m) => ({ name: m.name, length: m.length, type: m.intercalary ? 'intercalary' : 'month', interval: m.every ?? 1, offset: m.offset ?? 0, ...(m.week?.length ? { week: m.week } : {}) })),
      leap_days: c.leapDays.map((v) => ({ name: v.name, timespan: e.monthIndex(v.month), intercalary: v.intercalary,
        day: v.intercalary ? (v.after ?? c.months[e.monthIndex(v.month)].length) : 0, adds_week_day: false, not_numbered: false, week_day: '',
        interval: [v.also || '', v.except ? '!' + v.except : '', v.every].filter(Boolean).join(','), offset: v.offset })),
    },
    clock: { enabled: true, render: true, ...c.clock, offset: 0, crowding: 0 },
    moons: c.moons.map((m) => ({ name: m.name, cycle: m.period, shift: shifted(m.offset, m.period), cycle_rounding: m.rounding, granularity: m.granularity, color: '#ffffff', shadow_color: '#292b4a', hidden: m.hidden })),
    seasons: { global_settings: settings, data: c.seasons.map((v) => ({
      name: v.name, color: [v.color, v.color], time, timespan: v.month ? e.monthIndex(v.month) : 0, day: v.day || 1,
      ...(settings.periodic_seasons ? { transition_length: v.duration, duration: 0, length: v.duration } : {}),
    })), locations: (w?.regions || []).map((r) => ({ name: r.name, settings: { timezone: { hour: Math.trunc((r.timeOffset || 0) * c.clock.hours), minute: Math.round((r.timeOffset || 0) * c.clock.hours * c.clock.minutes) % c.clock.minutes }, season_based_time: true,
      large_noise_frequency: .015, large_noise_amplitude: 5, medium_noise_frequency: .3, medium_noise_amplitude: 2, small_noise_frequency: .8, small_noise_amplitude: 3 },
      seasons: c.seasons.map((s) => { const p = seasonTargets(r, s); return { time, weather: { temp_low: byC(p.low), temp_high: byC(p.high),
        precipitation: p.rain / 100, precipitation_intensity: p.intensity / 100 } }; }) })) },
    eras: c.eras.map((x) => ({ name: x.name, date: { year: x.start, timespan: x.month ? e.monthIndex(x.month) : 0, day: x.day || 1 },
      settings: { restart: x.reset, ends_year: false, starting_era: false } })),
    settings: { layout: 'grid', private: true, comments: 'none', allow_view: true, year_zero_exists: (c.firstYear ?? 1) <= 0, default_category: -1 },
    cycles: { format: '', data: [] },
  }, dynamic_data: { year: c.current.year, timespan: e.monthIndex(c.current.month), day: c.current.day, epoch: e.epoch(c.current) - e.yearStart(originYear),
    hour: c.current.hour, minute: c.current.minute, current_era: -1,
    custom_location: !!w?.regions.length, location: String(Math.max(0, w?.regions.findIndex((r) => r.id === w.activeId) ?? 0)) },
  events: mapped, categories: cats.map((name, i) => ({ name, id: i + 1, settings: { hide: false, color: 'Green', text: 'text' } })) } };
}

function gregorian(date = new Date()) {
  const c = newCalendar('Gregoriano');
  const names = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  c.months = names.map((name, i) => ({ id: 'mes-' + (i + 1), name, length: [31,28,31,30,31,30,31,31,30,31,30,31][i], intercalary: false }));
  c.leapDays = [{ id: 'dia-bissexto', name: 'Dia bissexto', month: 'mes-2', intercalary: false, every: 4, except: 100, also: 400, offset: 0 }];
  c.moons = [{ id: 'lua', name: 'Lua', period: 29.53059, offset: 0, granularity: 8, rounding: 'round', hidden: false }];
  c.sky.unitPeriod = 365.2425;
  c.sky.referenceId = 'sol';
  c.sky.suns = [{ id: 'sol', name: 'Sol', orbit: 1, tilt: 23.44, phase: 280, size: 1, color: '#f7c465' }];
  c.current = { year: date.getFullYear(), month: c.months[date.getMonth()].id, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes() };
  return c;
}

module.exports = { calendarium, fantasyExport, gregorian };
