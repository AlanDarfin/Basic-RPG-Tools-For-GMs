'use strict';

const { setIcon } = require('obsidian');
const { MAX_YEAR } = require('./calendar');
const { el, button, info, CalendarEditor } = require('./ui');
const { seasonSchedule } = require('./seasons');
const { seasonalProfile, seasonTargets } = require('./weather');
const { weatherRegionField, temperature, speed } = require('./weather-view');

const amount = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const days = (n) => `${amount(n)} ${n === 1 ? 'dia' : 'dias'}`;
const percent = (n) => `${Math.round(n)}%`;
function tone(node, s) { node.style.setProperty('--brpg-season-color', s.color); }
function mark(parent, name, classes = 'brpg-icon') {
  const icon = el(parent, 'span', classes);
  icon.setAttribute('aria-hidden', 'true');
  setIcon(icon, name);
}
function shortDate(c, e, date, anchor, withYear = false) {
  const name = c.months[e.monthIndex(date.month)].name;
  return `${date.day} ${name}${withYear || date.year !== anchor ? ' · ano ' + e.yearLabel(date.year) : ''}`;
}
function periodLabel(c, e, item, year) {
  const { startDate: a, endDate: b } = item;
  if (a && b) {
    const crosses = a.year !== b.year;
    const start = shortDate(c, e, a, year, crosses);
    return item.duration === 1 ? start : start + ' – ' + shortDate(c, e, b, year, crosses);
  }
  if (a) return 'Desde ' + shortDate(c, e, a, year);
  return b ? 'Até ' + shortDate(c, e, b, year) : '';
}
function renderSeasons(root, view, c, e) {
  const d = view.selected, p = view.plugin;
  const pane = el(root, 'section', 'brpg-seasons');
  const heading = el(pane, 'div', 'brpg-weather-heading');
  const title = el(heading, 'div');
  el(title, 'h3', 'brpg-section-title', 'Estações do mundo');
  el(title, 'p', 'brpg-hint', e.format(d));
  const { current, next, items, cycleLength, epoch } = seasonSchedule(c, e, d, MAX_YEAR);
  const editSeasons = () => {
    const editor = new CalendarEditor(p, c, false, 'estacoes');
    editor.seasonEditorId = current?.season.id;
    editor.open();
  };
  button(heading, 'Editar estações', editSeasons, { icon: 'settings', iconOnly: true });
  if (!items.length) {
    const empty = el(pane, 'div', 'brpg-weather-empty');
    info(empty, 'Este calendário ainda não tem estações. O clima usa o perfil-base de cada região.');
    button(empty, 'Configurar estações', editSeasons, { icon: 'plus' });
    return;
  }

  const overview = el(pane, 'div', 'brpg-season-overview' + (next ? ' has-next' : ''));
  if (current) {
    tone(overview, current.season);
    const card = el(overview, 'div', 'brpg-season-current');
    el(card, 'span', 'brpg-eyebrow', 'ESTAÇÃO DA DATA');
    el(card, 'strong', 'brpg-season-name', current.season.name);
    const day = epoch - current.from + 1;
    el(card, 'span', 'brpg-season-day', `Dia ${amount(day)} de ${amount(current.duration)}`);
    const bar = el(card, 'progress', 'brpg-season-progress');
    bar.max = current.duration; bar.value = day;
    bar.setAttribute('aria-label', 'Progresso da estação');
  } else {
    const card = el(overview, 'div', 'brpg-season-current');
    el(card, 'span', 'brpg-eyebrow', 'ESTAÇÃO DA DATA');
    el(card, 'strong', '', 'Antes da primeira estação');
  }
  if (next) {
    const link = button(overview, 'Ver início de ' + next.season.name, () => view.choose(next.startDate),
      { className: 'brpg-button brpg-season-next', iconOnly: true });
    const label = el(link, 'span', 'brpg-season-next-copy');
    el(label, 'span', 'brpg-eyebrow', 'PRÓXIMA VIRADA');
    el(label, 'strong', '', next.season.name);
    el(label, 'small', '', `${shortDate(c, e, next.startDate, d.year)} · em ${days(next.from - epoch)}`);
    mark(link, 'arrow-right');
  }

  const climate = el(pane, 'div', 'brpg-season-climate');
  const r = c.weather?.enabled ? c.weather.regions.find((item) => item.id === c.weather.activeId) : null;
  const editClimate = (s) => {
    const editor = new CalendarEditor(p, c, false, 'clima');
    editor.weatherRegion = r?.id;
    editor.weatherProfile = s?.id;
    editor.open();
  };
  if (r) {
    weatherRegionField(climate, p, c, 'Clima regional');
    button(climate, 'Editar perfil da região', () => editClimate(current?.season), { icon: 'sliders-horizontal', iconOnly: true });
    const actual = seasonalProfile(c, e, r, epoch, MAX_YEAR);
    const shift = c.weather.offset;
    const adjustment = shift === 0 ? 'Sem atraso' : `${days(Math.abs(shift))} de ${shift > 0 ? 'atraso' : 'adiantamento'}`;
    const note = el(climate, 'p', 'brpg-hint', [actual.season && `Influência de ${actual.season}`, adjustment].filter(Boolean).join(' · '));
    note.title = 'Os perfis climáticos fazem transição aos poucos, sem mover a estação no calendário.';
  } else {
    info(climate, 'A previsão está desativada neste calendário.');
    button(climate, 'Configurar clima', () => editClimate(), { icon: 'settings', iconOnly: true });
  }

  const map = el(pane, 'section', 'brpg-season-cycle');
  const cycleHead = el(map, 'div', 'brpg-season-cycle-head');
  el(cycleHead, 'h4', 'brpg-section-title', c.seasonMode === 'periodic' ? 'Ciclo contínuo' : 'Ciclo por datas');
  el(cycleHead, 'span', 'brpg-hint', c.seasonMode === 'periodic' ? days(cycleLength) + ' por ciclo' : days(cycleLength) + ' no ano');
  const strip = el(map, 'div', 'brpg-season-strip');
  strip.setAttribute('aria-hidden', 'true');
  for (const item of items) {
    const segment = el(strip, 'span', item === current ? 'is-current' : '');
    segment.style.setProperty('--brpg-season-span', String(item.duration));
    tone(segment, item.season);
  }
  const rows = el(map, 'div', 'brpg-season-rows');
  for (const item of items) {
    const s = item.season;
    const profile = r && seasonTargets(r, s);
    const row = el(rows, 'details', 'brpg-season-row' + (item === current ? ' is-current' : ''));
    row.open = view.expandedSeasons.has(s.id);
    row.addEventListener('toggle', () => {
      if (view.calId !== c.id || row.isConnected === false) return;
      if (row.open) view.expandedSeasons.add(s.id); else view.expandedSeasons.delete(s.id);
    });
    tone(row, s);
    const top = el(row, 'summary', 'brpg-season-row-title');
    el(top, 'span', 'brpg-season-dot').setAttribute('aria-hidden', 'true');
    const copy = el(top, 'span', 'brpg-season-row-copy');
    const name = el(copy, 'span', 'brpg-season-row-name');
    el(name, 'strong', '', s.name);
    if (item === current) el(name, 'small', 'brpg-season-tag', 'Da data');
    el(copy, 'span', 'brpg-season-date', periodLabel(c, e, item, d.year) || days(item.duration));
    if (profile) el(top, 'span', 'brpg-season-range', `${temperature(c, profile.low).split(' ')[0]}–${temperature(c, profile.high)}`);
    else el(top, 'span', 'brpg-season-range', days(item.duration));
    mark(top, 'chevron-down', 'brpg-icon brpg-season-chevron');

    const body = el(row, 'div', 'brpg-season-row-body');
    const dates = el(body, 'div', 'brpg-season-row-dates');
    if (item.startDate) el(dates, 'span', '', `Início · ${e.format(item.startDate)}`);
    if (item.endDate) el(dates, 'span', '', `Até · ${e.format(item.endDate)}`);
    el(dates, 'span', '', `Duração · ${days(item.duration)}`);
    if (profile) {
      const metrics = el(body, 'div', 'brpg-season-metrics');
      el(metrics, 'span', 'brpg-chip', `Precipitação ${percent(profile.rain)}`);
      el(metrics, 'span', 'brpg-chip', `Intensidade ${percent(profile.intensity)}`);
      el(metrics, 'span', 'brpg-chip', `Neblina ${percent(profile.fog)}`);
      el(metrics, 'span', 'brpg-chip', `Vento ${speed(c, Math.round(profile.wind))}`);
      el(metrics, 'span', 'brpg-chip', `Umidade ${percent(profile.humidity)}`);
    }
    const actions = el(body, 'div', 'brpg-toolbar');
    if (item.startDate) button(actions, 'Ver dia inicial', () => view.choose(item.startDate), { icon: 'calendar-days' });
    if (profile) button(actions, 'Editar clima de ' + s.name, () => editClimate(s), { icon: 'sliders-horizontal', iconOnly: true });
  }
  if (r) info(map, 'As temperaturas acima são referências do perfil. Veja a condição da data em Previsão.');
}

module.exports = { renderSeasons };
