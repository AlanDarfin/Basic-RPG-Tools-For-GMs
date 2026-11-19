'use strict';

const { setIcon } = require('obsidian');
const { MAX_YEAR, sameDate } = require('./calendar');
const { el, button, select, info, CalendarEditor } = require('./ui');
const { readMinute } = require('./world-clock');
const { formatTime } = require('./sky');
const { CONDITIONS, weatherDay } = require('./weather');

const localized = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
function temperature(c, n) {
  const scale = c.weather.temperature;
  return `${Math.round(scale === 'F' ? n * 1.8 + 32 : n)} °${scale}`;
}
function speed(c, n) {
  return c.weather.wind === 'mph' ? `${Math.round(n / 1.609344)} mph` : `${n} km/h`;
}
function mark(parent, icon, classes = 'brpg-icon') {
  const span = el(parent, 'span', classes);
  span.setAttribute('aria-hidden', 'true');
  setIcon(span, icon);
  return span;
}
function conditionIcon(parent, day, classes) {
  return mark(parent, CONDITIONS[day.condition][1], classes);
}
function range(c, day) { return `${temperature(c, day.low)} a ${temperature(c, day.high)}`; }
function weatherShortcut(parent, c, day, open, showRegion = false) {
  const [condition, icon] = CONDITIONS[day.condition];
  return button(parent, `${condition} · ${range(c, day)}${showRegion ? ' · ' + day.region : ''}`, open,
    { icon, className: 'brpg-button brpg-weather-shortcut' });
}
function fact(parent, icon, label, value, note) {
  const tile = el(parent, 'div', 'brpg-weather-fact');
  const heading = el(tile, 'div', 'brpg-weather-fact-label');
  mark(heading, icon);
  el(heading, 'span', '', label);
  el(tile, 'strong', '', value);
  if (note) el(tile, 'small', '', note);
}

function renderWeather(root, view, c, e) {
  const d = view.selected, p = view.plugin;
  const pane = el(root, 'section', 'brpg-weather');
  const heading = el(pane, 'div', 'brpg-weather-heading');
  const title = el(heading, 'div');
  el(title, 'h3', 'brpg-section-title', 'Clima do dia');
  el(title, 'p', 'brpg-hint', e.format(d));
  const configure = () => new CalendarEditor(p, c, false, 'clima').open();
  button(heading, 'Configurar clima', configure, { icon: 'settings', iconOnly: true });
  const day = weatherDay(c, e, d, MAX_YEAR);
  if (!day) {
    const blank = el(pane, 'div', 'brpg-weather-empty');
    mark(blank, 'cloud-sun');
    info(blank, 'O clima está desativado neste calendário.');
    button(blank, 'Abrir configurações de clima', configure, { icon: 'settings' });
    return null;
  }

  const w = c.weather;
  const selectors = el(pane, 'label', 'brpg-weather-region');
  const regionLabel = el(selectors, 'span', 'brpg-weather-region-label');
  mark(regionLabel, 'map-pin');
  el(regionLabel, 'span', '', 'Região da campanha');
  select(selectors, w.regions.map((r) => [r.id, r.name]), w.activeId,
    (activeId) => p.attempt(() => p.editCalendar(c.id, (cal) => { cal.weather.activeId = activeId; })), 'Região da campanha');

  const isToday = sameDate(d, view.savedToday), total = c.clock.hours * c.clock.minutes;
  const hero = el(pane, 'article', 'brpg-weather-hero');
  const icon = el(hero, 'span', 'brpg-weather-symbol');
  icon.setAttribute('aria-hidden', 'true');
  const heroText = el(hero, 'div', 'brpg-weather-hero-text');
  const headline = el(heroText, 'strong', 'brpg-weather-condition');
  const hTime = el(heroText, 'small', 'brpg-weather-time');
  const degrees = el(hero, 'div', 'brpg-weather-degrees');
  const current = el(degrees, 'strong', 'brpg-weather-temperature');
  el(degrees, 'span', '', range(c, day));
  const paint = (n) => {
    const now = day.at(n / total);
    if (hero.dataset) hero.dataset.condition = now.condition;
    setIcon(icon, CONDITIONS[now.condition][1]);
    headline.textContent = CONDITIONS[now.condition][0];
    current.textContent = temperature(c, now.temperature);
    hTime.textContent = `${isToday ? 'Hora do mundo' : 'Prévia ao meio-dia'} · ${formatTime(n, c.clock)}`;
    return now.visibility;
  };

  const facts = el(pane, 'div', 'brpg-weather-facts');
  fact(facts, 'wind', 'Vento', day.wind ? `${speed(c, day.wind)} · ${day.direction}` : 'Calmaria',
    day.gust ? `Rajadas de ${speed(c, day.gust)}` : '');
  fact(facts, 'droplets', 'Umidade', `${day.humidity}%`, `Nuvens em ${day.cloud}% do céu`);
  fact(facts, 'umbrella', 'Precipitação', day.wet ? 'Prevista no dia' : 'Dia seco',
    `Chance de ${day.chance}%${day.wet ? ' · intensidade ' + day.intensity + '%' : ''}`);
  const vis = el(facts, 'div', 'brpg-weather-fact');
  const visLabel = el(vis, 'div', 'brpg-weather-fact-label');
  mark(visLabel, 'eye'); el(visLabel, 'span', '', 'Visibilidade');
  const value = el(vis, 'strong');
  const hint = el(vis, 'small');
  function update(n) {
    const km = paint(n);
    value.textContent = km >= 20 ? '20 km ou mais' : `${localized(km)} km`;
    hint.textContent = day.fog ? 'Neblina prevista neste dia' : day.wet ? 'Reduzida pela precipitação' : 'Sem neblina prevista';
  }
  update(isToday ? readMinute(c, view.savedToday) : Math.floor(total / 2));

  const hours = el(pane, 'section', 'brpg-weather-block');
  el(hours, 'h4', '', 'Ao longo do dia');
  const slices = el(hours, 'div', 'brpg-weather-slices');
  for (const [name, t] of [['Madrugada', .13], ['Manhã', .29], ['Tarde', .67], ['Noite', .92]]) {
    const minute = Math.floor(t * total);
    const part = day.at(minute / total);
    const tile = el(slices, 'div', 'brpg-weather-slice');
    el(tile, 'strong', '', name);
    el(tile, 'small', '', formatTime(minute, c.clock));
    conditionIcon(tile, part, 'brpg-weather-mini-icon');
    el(tile, 'span', '', temperature(c, part.temperature));
    el(tile, 'small', 'brpg-weather-slice-state', CONDITIONS[part.condition][0]);
  }

  const end = Math.min(day.day + 5, e.yearStart(MAX_YEAR + 1) - 1);
  if (end > day.day) {
    const outlook = el(pane, 'section', 'brpg-weather-block');
    el(outlook, 'h4', '', 'Próximos dias');
    const rows = el(outlook, 'div', 'brpg-weather-outlook');
    for (let epoch = day.day + 1; epoch <= end; epoch++) {
      const date = e.fromEpoch(epoch), next = weatherDay(c, e, date, MAX_YEAR);
      const m = c.months[e.monthIndex(date.month)];
      const b = button(rows, `Ver clima de ${e.format(date)}`, () => view.choose(date), { className: 'brpg-button brpg-weather-next', iconOnly: true });
      conditionIcon(b, next);
      const left = el(b, 'span', 'brpg-weather-next-date');
      el(left, 'strong', '', `${date.day} de ${m.name}`);
      el(left, 'small', '', CONDITIONS[next.condition][0]);
      el(b, 'span', 'brpg-weather-next-temp', range(c, next));
    }
  }
  info(pane, `Simulação do mundo · ${day.season ? 'clima de ' + day.season : 'perfil-base da região'}`);
  return isToday ? update : null;
}

module.exports = { renderWeather, weatherShortcut };
