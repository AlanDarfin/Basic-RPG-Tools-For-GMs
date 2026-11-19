'use strict';
const { MarkdownRenderChild, parseYaml } = require('obsidian');
const { el, button, info } = require('./ui');
const { CalendarEngine, MAX_YEAR, sameDate } = require('./calendar');
const { parseDate } = require('./note-events');
const { weatherDay, CONDITIONS } = require('./weather');
const { temperature, speed } = require('./weather-view');

const Base = MarkdownRenderChild || class {};
class CampaignEmbed extends Base {
  constructor(host, plugin, kind, source) {
    super(host);
    this.host = host; this.plugin = plugin; this.kind = kind; this.source = source;
  }
  onload() { this.plugin.embeds.add(this); this.draw(); }
  onunload() { this.plugin.embeds.delete(this); this.host.replaceChildren(); }
  draw() {
    const { plugin: p, host } = this;
    host.replaceChildren();
    const root = el(host, 'section', 'brpg brpg-embed');
    try {
      const config = this.source.trim() ? parseYaml(this.source) : {};
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Use propriedades YAML na configuração do bloco.');
      const c = p.resolveCalendar(config.calendar);
      const e = new CalendarEngine(c, p.noteIndex.forCalendar(c.id)), world = p.worldNow(c, e);
      const date = config.date == null ? world : parseDate(c, config.date).date;
      this.last = { calendar: c.id, date, dynamic: config.date == null };
      const pane = el(root, 'div', 'brpg-embed-frame');
      el(pane, 'h4', 'brpg-section-title', (this.kind === 'weather' ? 'Clima · ' : '') + c.name);
      if (this.kind === 'weather') {
        info(pane, e.format(date));
        const w = weatherDay(c, e, date, MAX_YEAR);
        if (!w) return info(pane, 'O clima está desativado.');
        const midday = w.at(.5);
        el(pane, 'strong', '', `${CONDITIONS[midday.condition][0]} · ${w.region}`);
        info(pane, `${temperature(c, w.low)} a ${temperature(c, w.high)} · vento ${speed(c, w.wind)} · umidade ${w.humidity}%`);
      } else if (config.view === 'agenda') {
        const start = e.epoch(date), stop = Math.min(e.yearStart(MAX_YEAR + 1), start + 14);
        const list = el(pane, 'ul', 'brpg-embed-agenda');
        for (let at = start; at < stop; at++) {
          const d = e.fromEpoch(at);
          const events = e.eventsOn(d).filter((event) => p.isPublicEvent(c, event)).slice(0, 5);
          for (const event of events) el(list, 'li', '', e.format(d) + ' · ' + event.title);
        }
        if (!list.children.length) info(pane, 'Nenhum evento público nos próximos 14 dias.');
      } else {
        const month = c.months[e.monthIndex(date.month)];
        info(pane, month.name + ' · ano ' + e.yearLabel(date.year));
        const grid = el(pane, 'div', 'brpg-embed-days');
        for (let day = 1; day <= e.monthLength(date.year, date.month); day++) {
          const d = { ...date, day }, n = e.eventsOn(d).filter((event) => p.isPublicEvent(c, event)).length;
          const b = button(grid, e.format(d) + (n ? ' · ' + n + ' eventos' : ''), () => p.attempt(() => p.openDate(c.id, d)), { iconOnly: true });
          el(b, 'span', '', String(day) + (n ? ' •' : ''));
          if (sameDate(d, world)) b.setAttribute('aria-current', 'date');
        }
      }
    } catch (err) { info(root, err.message || 'Não foi possível abrir o bloco.'); }
  }
  tick() {
    if (!this.last?.dynamic) return;
    const c = this.plugin.state.calendars.find((x) => x.id === this.last.calendar);
    if (c && !sameDate(this.last.date, this.plugin.worldNow(c))) this.draw();
  }
}

function registerEmbeds(plugin) {
  for (const [name, type] of [['basic-rpg-calendar', 'calendar'], ['basic-rpg-weather', 'weather']]) {
    plugin.registerMarkdownCodeBlockProcessor?.(name, (source, host, ctx) => ctx.addChild(new CampaignEmbed(host, plugin, type, source)));
  }
}
module.exports = { registerEmbeds };
