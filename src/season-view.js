'use strict';

const { MAX_YEAR } = require('./calendar');
const { el, button, info, CalendarEditor } = require('./ui');
const { seasonSchedule } = require('./seasons');
const { seasonalProfile, seasonTargets } = require('./weather');
const { weatherRegionField, temperature, speed } = require('./weather-view');

const amount = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const days = (n) => `${amount(n)} ${n === 1 ? 'dia' : 'dias'}`;
const percent = (n) => `${Math.round(n)}%`;
function tone(node, s) { node.style.setProperty('--brpg-season-color', s.color); }
function renderSeasons(root, view, c, e) {
  const d = view.selected, p = view.plugin;
  const pane = el(root, 'section', 'brpg-seasons');
  const heading = el(pane, 'div', 'brpg-weather-heading');
  const title = el(heading, 'div');
  el(title, 'h3', 'brpg-section-title', 'Estações do mundo');
  el(title, 'p', 'brpg-hint', e.format(d));
  const schedule = seasonSchedule(c, e, d, MAX_YEAR);
  const { current, next, items, cycleLength, epoch } = schedule;
  const openEditor = () => {
    const editor = new CalendarEditor(p, c, false, 'estacoes');
    editor.seasonEditorId = current?.season.id;
    editor.open();
  };
  button(heading, 'Editar estações', openEditor, { icon: 'settings', iconOnly: true });
  if (!items.length) {
    const empty = el(pane, 'div', 'brpg-weather-empty');
    info(empty, 'Este calendário ainda não tem estações. O clima usa o perfil-base de cada região.');
    button(empty, 'Configurar estações', openEditor, { icon: 'plus' });
    return;
  }
  if (c.weather?.enabled) weatherRegionField(pane, p, c);

  if (current) {
    const card = el(pane, 'div', 'brpg-season-current');
    tone(card, current.season);
    el(card, 'span', 'brpg-eyebrow', 'NA DATA SELECIONADA');
    el(card, 'strong', 'brpg-season-name', current.season.name);
    const day = epoch - current.from + 1;
    el(card, 'span', 'brpg-season-day', `Dia ${amount(day)} de ${amount(current.duration)}`);
    const bar = el(card, 'progress', 'brpg-season-progress');
    bar.max = current.duration; bar.value = day;
    bar.setAttribute('aria-label', 'Progresso da estação');
  } else info(pane, 'A primeira estação começa depois da data selecionada.');

  if (next) {
    const block = el(pane, 'div', 'brpg-season-next');
    const label = el(block, 'div');
    el(label, 'span', 'brpg-eyebrow', 'PRÓXIMA VIRADA');
    el(label, 'strong', '', next.season.name);
    el(label, 'small', '', `${e.format(next.startDate)} · em ${days(next.from - epoch)}`);
    button(block, 'Ver início de ' + next.season.name, () => view.choose(next.startDate), { icon: 'arrow-right', iconOnly: true });
  }

  const climate = el(pane, 'div', 'brpg-season-climate');
  const r = c.weather?.enabled ? c.weather.regions.find((item) => item.id === c.weather.activeId) : null;
  if (r) {
    const actual = seasonalProfile(c, e, r, epoch, MAX_YEAR);
    el(climate, 'strong', '', `Clima de ${r.name}`);
    if (actual.season) el(climate, 'span', '', `Influência nesta data · ${actual.season}`);
    const shift = c.weather.offset;
    const adjustment = shift === 0 ? '' : ` com ${days(Math.abs(shift))} de ${shift > 0 ? 'atraso' : 'adiantamento'}`;
    el(climate, 'small', '', `O clima muda gradualmente entre os perfis sazonais${adjustment}.`);
    button(climate, 'Editar perfil da região', () => {
      const editor = new CalendarEditor(p, c, false, 'clima');
      editor.weatherRegion = r.id; editor.weatherProfile = current?.season.id;
      editor.open();
    }, { icon: 'sliders-horizontal', iconOnly: true });
  } else info(climate, 'A previsão está desativada. Ative o clima para aplicar os efeitos das estações às regiões.');

  const map = el(pane, 'section', 'brpg-season-cycle');
  el(map, 'h4', '', c.seasonMode === 'periodic' ? 'Ciclo contínuo' : 'Ciclo por datas');
  const description = c.seasonMode === 'periodic' ? days(cycleLength) + ' por ciclo' : days(cycleLength) + ' no ano selecionado';
  info(map, description + ' · duração dos trechos mostrada em dias do calendário');
  const strip = el(map, 'div', 'brpg-season-strip');
  strip.setAttribute('aria-hidden', 'true');
  for (const item of items) {
    const segment = el(strip, 'span', item === current ? 'is-current' : '');
    segment.style.setProperty('--brpg-season-span', String(item.duration));
    tone(segment, item.season);
  }
  for (const item of items) {
    const s = item.season;
    const row = el(map, 'article', 'brpg-season-row' + (item === current ? ' is-current' : ''));
    tone(row, s);
    const main = el(row, 'div', 'brpg-season-row-title');
    el(main, 'strong', '', s.name);
    el(main, 'span', 'brpg-hint', days(item.duration));
    if (item.startDate) el(row, 'span', 'brpg-season-date', `Início · ${e.format(item.startDate)}`);
    if (item.endDate) el(row, 'span', 'brpg-season-date', `Até · ${e.format(item.endDate)}`);
    if (r) {
      const profile = seasonTargets(r, s);
      const metrics = el(row, 'div', 'brpg-season-metrics');
      el(metrics, 'span', 'brpg-chip', `${temperature(c, profile.low)} a ${temperature(c, profile.high)}`);
      el(metrics, 'span', 'brpg-chip', `Precipitação ${percent(profile.rain)}`);
      el(metrics, 'span', 'brpg-chip', `Neblina ${percent(profile.fog)}`);
      el(metrics, 'span', 'brpg-chip', `Vento ${speed(c, Math.round(profile.wind))}`);
      el(metrics, 'span', 'brpg-chip', `Umidade ${percent(profile.humidity)}`);
      el(row, 'span', 'brpg-season-date', profile.regional ? 'Perfil regional desta estação' : 'Perfil-base da região');
    }
  }
  if (r) info(map, 'Os valores são referências do perfil, não a previsão de um dia específico.');
}

module.exports = { renderSeasons };
