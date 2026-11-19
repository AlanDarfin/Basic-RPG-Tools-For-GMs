'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(document, tag) { this.ownerDocument = document; this.tag = tag; this.children = []; this.attributes = {};
    this.listeners = {}; this.className = ''; this.value = ''; this.text = ''; this.offsetParent = true;
    this.style = { setProperty() {} };
    this.classList = {
      add: (...parts) => { this.className += ' ' + parts.join(' '); },
      toggle: (part, on) => {
        const items = this.className.split(' ').filter((x) => x && x !== part);
        if (on) items.push(part);
        this.className = items.join(' ');
      },
    }; }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren() { this.children = []; this.text = ''; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.listeners[name] ||= []; this.listeners[name].push(fn); }
  async emit(name) { for (const fn of this.listeners[name] || []) await fn({ target: this }); }
  click() { return this.emit('click'); }
  focus() {}
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((x) => x.textContent).join(''); }
  all(match) { return this.children.flatMap((x) => [...(match(x) ? [x] : []), ...x.all(match)]); }
  querySelector(className) { return this.all((x) => x.className.split(' ').includes(className.slice(1)))[0] || null; }
  querySelectorAll() { return []; }
}
function mock(startingState = null) {
  const document = {
    createElement(tag) { return new Element(document, tag); },
    createElementNS(namespace, tag) { return new Element(document, tag); },
  };
  const notices = [], app = {}, files = new Map(), leaves = [];
  const factories = new Map();
  let modal, settings, rename, opened, rejectSave = false;
  function workLeaf(main) {
    const item = { getRoot: () => main ? app.workspace.rootSplit : {},
      setViewState: async (state) => { item.type = state.type; item.view = factories.get(state.type)(item); await item.view.onOpen(); },
      openFile: async (f) => { opened = f.path; },
    };
    leaves.push(item);
    return item;
  }
  app.workspace = { rootSplit: {}, getLeavesOfType: (v) => leaves.filter((l) => l.type === v), getRightLeaf: () => workLeaf(false),
    getLeaf: () => workLeaf(true), revealLeaf: async () => {}, onLayoutReady: (fn) => fn(),
  };
  class TFile { constructor(name) { this.path = name; } }
  app.vault = { getAbstractFileByPath: (name) => files.get(name), create: async (p, c) => { files.set(p, new TFile(p)); files.get(p).body = c; },
    on: (_, fn) => { rename = fn; return {}; }, getMarkdownFiles: () => [...files.values()],
  };
  class Plugin {
    constructor() { this.app = app; this.commands = []; }
    async loadData() { return startingState; }
    async saveData(s) { if (rejectSave) throw new Error('Disco sem escrita'); this.saved = JSON.parse(JSON.stringify(s)); }
    registerView(id, fn) { factories.set(id, fn); }
    addRibbonIcon() {}
    addSettingTab(tab) { settings = tab; }
    addCommand(cmd) { this.commands.push(cmd); }
    registerEvent() {}
  }
  class Modal {
    constructor() { this.app = app; this.modalEl = document.createElement('div'); this.contentEl = document.createElement('div'); }
    open() { modal = this; this.onOpen?.(); }
    close() { this.onClose?.(); modal = null; }
  }
  const obsidian = {
    Plugin, Modal, FuzzySuggestModal: class extends Modal { setPlaceholder() {} }, TFile, normalizePath: (p) => p,
    PluginSettingTab: class { constructor() { this.containerEl = document.createElement('div'); } },
    ItemView: class { constructor(l) { this.leaf = l; this.app = app; this.contentEl = document.createElement('div'); } },
    Notice: class { constructor(m) { notices.push(m); } }, setIcon() {},
  };
  const mod = { exports: null };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8'),
    { module: mod, require: (id) => { assert.equal(id, 'obsidian'); return obsidian; } });
  return { p: new mod.exports(), files, TFile, leaves, notices, opened: () => opened, modal: () => modal,
    settings: () => settings, rename: (f, p) => rename(f, p), stopSaves: () => { rejectSave = true; } };
}
const plain = (x) => JSON.parse(JSON.stringify(x));
function pickButton(root, label) { return root.all((x) => x.tag === 'button' && x.attributes['aria-label'] === label)[0]; }
function labelInput(root, label) {
  return root.all((x) => x.tag === 'label' && x.children[0]?.textContent === label)[0]?.children[1];
}
async function type(root, label, value) { const x = labelInput(root, label); x.value = value; await x.emit('input'); }

test('ciclo de vida abre calendário, navega sem mudar data, avança e grava', async () => {
  const { p, leaves } = mock();
  await p.onload();
  assert.equal(p.commands.length, 9);
  await p.open(false);
  const view = leaves[0].view, root = view.contentEl;
  assert.match(root.textContent, /1 de Arkanis, ano 1 · 00:00/);
  assert.ok(root.querySelector('.brpg-month-list'));
  await pickButton(root, 'Próximo mês').click();
  assert.equal(view.selected.month, 'mes-2');
  assert.equal(p.active().current.month, 'mes-1');
  await pickButton(root, 'Hoje').click();
  assert.equal(view.selected.month, 'mes-1');
  await p.advance(1);
  assert.equal(view.selected.day, 2);
  assert.equal(p.saved.calendars[0].current.day, 2);
  await p.open(true);
  await p.open(true);
  assert.equal(leaves.length, 2);
});
test('painel de evento salva data e nota, atualiza cronologia, e abre arquivo', async () => {
  const m = mock();
  await m.p.onload();
  await m.p.open(false);
  m.files.set('Sessões/Torre.md', new m.TFile('Sessões/Torre.md'));
  const root = m.leaves[0].view.contentEl;
  await pickButton(root, 'Novo evento').click();
  const form = m.modal().contentEl;
  await type(form, 'Título', 'O retorno de Arkanis');
  await type(form, 'Caminho da nota', 'Sessões/Torre.md');
  await type(form, 'Categoria', 'Sessão');
  await pickButton(form, 'Salvar').click();
  assert.equal(m.p.active().events.at(-1).title, 'O retorno de Arkanis');
  assert.equal(m.modal(), null);
  await pickButton(root, 'Abrir nota').click();
  assert.equal(m.opened(), 'Sessões/Torre.md');
  await pickButton(root, 'Cronologia').click();
  assert.match(root.querySelector('.brpg-timeline').textContent, /O retorno de Arkanis/);
  const target = new m.TFile('Sessões/Torre Antiga.md');
  m.rename(target, 'Sessões/Torre.md');
  await new Promise((r) => setImmediate(r));
  assert.equal(m.p.active().events.at(-1).note, target.path);
});
test('editor cria outro calendário sem alterar Arkanis', async () => {
  const m = mock();
  await m.p.onload();
  m.p.newCalendar();
  const form = m.modal().contentEl;
  await type(form, 'Nome do calendário', 'Alvor da Tripulação');
  await type(form, 'Dias da semana (um por linha)', 'Maré\nCalmaria\nVento');
  await pickButton(form, 'Criar calendário').click();
  assert.equal(m.p.active().name, 'Alvor da Tripulação');
  assert.deepEqual(plain(m.p.active().week), ['Maré', 'Calmaria', 'Vento']);
  assert.equal(m.p.state.calendars[0].name, 'Arkanis');
});
test('erro de armazenamento não avança data nem bloqueia próximas ações', async () => {
  const m = mock();
  await m.p.onload();
  m.stopSaves();
  await assert.rejects(m.p.advance(1), /Disco/);
  assert.equal(m.p.active().current.day, 1);
  await assert.rejects(m.p.advance(1), /Disco/);
});
test('dados não reconhecidos são protegidos contra sobrescrita', async () => {
  const m = mock({ version: 43, calendars: [] });
  await m.p.onload();
  assert.match(m.notices[0], /não foi possível ler/);
  await assert.rejects(m.p.advance(1), /Nada foi sobrescrito/);
  assert.equal(m.p.saved, undefined);
});
test('exporta backup próprio sem sobrescrever outro arquivo', async () => {
  const m = mock();
  await m.p.onload();
  const a = await m.p.exportCalendar(m.p.active()), b = await m.p.exportCalendar(m.p.active());
  assert.equal(a, 'Basic-RPG-Arkanis.json');
  assert.equal(b, 'Basic-RPG-Arkanis-2.json');
  assert.equal(JSON.parse(m.files.get(a).body).calendar.events.length, 8);
  assert.equal(JSON.parse(m.files.get(b).body).format, 'basic-rpg/calendar');
});

test('céu distingue hora simulada da data do mundo e permite editar um sol', async () => {
  const m=mock();
  await m.p.onload(); await m.p.open(false);
  const root=m.leaves[0].view.contentEl;
  await pickButton(root, 'Céu').click();
  assert.match(root.querySelector('.brpg-sky').textContent, /Innart.*Dinart.*Reart/);
  await pickButton(root, 'Hora do mundo').click();
  assert.equal(m.leaves[0].view.skyMinute,0);
  const time=root.all((x)=>x.attributes['aria-label']==='Hora simulada (HH:MM)')[0];
  time.value='16:63'; await time.emit('change');
  assert.equal(m.leaves[0].view.skyMinute,16*64+63);
  assert.equal(m.p.active().current.hour,0);
  await pickButton(root, 'Configurar sóis').click();
  const form=m.modal().contentEl;
  await type(form, 'Latitude do observador (°)', '43');
  await pickButton(form, 'Salvar calendário').click();
  assert.equal(m.p.active().sky.latitude,43);
  assert.equal(m.p.active().events.length,8);
});
test('a versão anterior atualiza Arkanis e mantém data e eventos já salvos', async () => {
  const c=plain(require('../src/arkanis.json'));
  delete c.sky;
  for (const moon of c.moons) delete moon.eclipse;
  c.current.day=13;
  c.events[0].title='Evento preservado';
  const {p}=mock({version:1,activeId:c.id,calendars:[c]});
  await p.onload();
  assert.equal(p.active().sky.suns.length,3);
  assert.equal(p.active().moons[0].eclipse.node,42);
  assert.equal(p.active().current.day,13);
  assert.equal(p.active().events[0].title,'Evento preservado');
});

test('painel lista eclipses e abre o próximo pico sem avançar o mundo', async () => {
  const m = mock();
  await m.p.onload(); await m.p.open(false);
  const view = m.leaves[0].view, root = view.contentEl;
  await pickButton(root,'Céu').click();
  await pickButton(root,'Próximo eclipse').click();
  assert.ok(pickButton(root,'Abrir dia do eclipse'));
  await pickButton(root,'Abrir dia do eclipse').click();
  assert.ok(root.querySelector('.brpg-eclipse-card'));
  assert.ok(view.selected.month!=='mes-1' || view.selected.day>1);
  assert.equal(m.p.active().current.day,1);
  assert.equal(m.p.active().current.hour,0);
  const time=root.all((x)=>x.attributes['aria-label']==='Hora simulada (HH:MM)')[0];
  assert.match(time.value, /^\d\d:\d\d$/);
});

test('reabrir depois de dois dias recupera a data com a âncora persistida', async () => {
  const base = 1800000000000;
  const first = mock();
  first.p.clockNow=()=>base;
  await first.p.onload();
  assert.equal(first.p.saved.calendars[0].clockSync.since,base);
  const next = mock(plain(first.p.saved));
  next.p.clockNow=()=>base + 2.25*86400000;
  await next.p.onload(); await next.p.open(false);
  assert.deepEqual(plain(next.p.worldNow(next.p.active())), {year:1,month:'mes-1',day:3,hour:8,minute:0});
  assert.match(next.leaves[0].view.contentEl.textContent,/3 de Arkanis, ano 1 · 08:00/);
});
test('céu acompanha os minutos reais enquanto a prévia manual fica parada', async () => {
  const {p,leaves}=mock();
  let now=1800000000000;
  p.clockNow=()=>now;
  await p.onload();await p.open(false);
  const view=leaves[0].view, root=view.contentEl;
  await pickButton(root,'Céu').click();
  now+=.5*86400000; p.tickClock();
  assert.match(root.querySelector('.brpg-world-date').textContent,/16:00/);
  assert.equal(view.skyMinute,16*64);
  await pickButton(root,'Meio-dia').click();
  now+=.25*86400000; p.tickClock();
  assert.match(root.querySelector('.brpg-world-date').textContent,/24:00/);
  assert.equal(view.skyMinute,16*64);
  await pickButton(root,'Hora do mundo').click();
  assert.equal(view.skyMinute,24*64);
  assert.equal(root.all((el)=>el.tag==='svg'&&el.attributes.class==='brpg-moon-disc').length,3);
});
test('editar calendário sem mexer no relógio mantém a âncora e a hora live', async () => {
  const m=mock();
  let now=1800000000000;
  m.p.clockNow=()=>now;
  await m.p.onload();
  const cal=m.p.active(), stable=cal.clockSync.since;
  const original=plain(cal); original.name='Novo título';
  now+=40002000;
  const before=m.p.worldNow(cal);
  await m.p.putCalendar(original,false,{clockMode:'real',explicitDate:false});
  const saved=m.p.active();
  assert.equal(saved.clockSync.since,stable);
  assert.deepEqual(plain(m.p.worldNow(saved)),plain(before));
});

test('cronologia agrupa mês e dia, mantém ações recolhidas e abre a data no calendário', async () => {
  const m = mock();
  await m.p.onload(); await m.p.open(false);
  const root = m.leaves[0].view.contentEl;
  await pickButton(root, 'Cronologia').click();
  const timeline = root.querySelector('.brpg-timeline');
  const first = timeline.querySelector('.brpg-timeline-day');
  const events = first.all((x) => x.tag === 'details');
  assert.equal(first.querySelector('.brpg-timeline-date').textContent, '1Hoje');
  assert.equal(events.length, 2);
  assert.match(events[0].children[0].textContent, /Arkas, A Criação/);
  assert.match(events[1].children[0].textContent, /Velanthir.*Início de estação/);
  assert.ok(events.every((x) => !x.open && x.children[0].tag === 'summary' && pickButton(x.children[1], 'Editar evento')));
  const monthFilter = root.all((x) => x.attributes['aria-label'] === 'Mês na cronologia')[0];
  monthFilter.value = 'mes-1'; await monthFilter.emit('change');
  assert.equal(root.querySelector('.brpg-timeline').all((x) => x.tag === 'section').length, 1);
  await pickButton(root, 'Abrir 1 de Arkanis, ano 1 no calendário').click();
  assert.ok(root.querySelector('.brpg-selected'));
  assert.equal(m.leaves[0].view.mode, 'month');
});

test('clima atualiza com o relógio, troca região e navega a previsão sem alterar o mundo', async () => {
  const { p, leaves } = mock();
  let now = 1800000000000;
  p.clockNow = () => now;
  await p.onload(); await p.open(false);
  const root = leaves[0].view.contentEl;
  assert.ok(root.querySelector('.brpg-weather-shortcut'));
  await pickButton(root, 'Clima').click();
  assert.match(root.querySelector('.brpg-weather').textContent, /Clima do dia.*Centrus.*00:00.*Umidade.*Visibilidade.*Próximos dias/);
  assert.equal(root.querySelector('.brpg-weather-outlook').children.length, 5);
  now += .5 * 86400000; p.tickClock();
  assert.match(root.querySelector('.brpg-weather-time').textContent, /16:00/);
  const region = root.all((x) => x.tag === 'select' && x.attributes['aria-label'] === 'Região da campanha')[0];
  region.value = 'nortus'; await region.emit('change');
  assert.equal(p.saved.calendars[0].weather.activeId, 'nortus');
  await pickButton(root, 'Ver clima de 2 de Arkanis, ano 1').click();
  assert.equal(leaves[0].view.selected.day, 2);
  assert.equal(p.worldNow(p.active()).day, 1);
  assert.match(root.querySelector('.brpg-weather-time').textContent, /Prévia ao meio-dia/);
});

test('cria região, edita perfil-base e salva unidades sem reiniciar o relógio', async () => {
  const m = mock();
  await m.p.onload(); await m.p.open(false);
  const root = m.leaves[0].view.contentEl;
  const anchor = m.p.active().clockSync.since;
  await pickButton(root, 'Clima').click();
  await pickButton(root, 'Configurar clima').click();
  const form = m.modal().contentEl;
  await pickButton(form, 'Nova região').click();
  await type(form, 'Nome da região', 'Baía de Sal');
  const chooseBiome = labelInput(form, 'Aplicar perfil inicial');
  chooseBiome.value = 'coast'; await chooseBiome.emit('change');
  await type(form, 'Chance de neblina (%)', '80');
  const scale = labelInput(form, 'Exibir temperatura em');
  scale.value = 'F'; await scale.emit('change');
  await pickButton(form, 'Salvar calendário').click();
  assert.equal(m.modal(), null);
  const c = m.p.active();
  assert.equal(c.weather.regions.at(-1).name, 'Baía de Sal');
  assert.equal(c.weather.regions.at(-1).base.fog, 80);
  assert.equal(c.weather.regions.at(-1).base.humidity, 84);
  assert.equal(c.weather.temperature, 'F');
  assert.equal(c.clockSync.since, anchor);
  assert.match(root.querySelector('.brpg-weather-temperature').textContent, /°F/);
});

test('clima desligado em calendário novo oferece configuração e pode ser ativado sem estações', async () => {
  const m = mock();
  await m.p.onload(); await m.p.open(false);
  m.p.newCalendar();
  await pickButton(m.modal().contentEl, 'Criar calendário').click();
  const root = m.leaves[0].view.contentEl;
  await pickButton(root, 'Clima').click();
  assert.match(root.querySelector('.brpg-weather').textContent, /desativado/);
  await pickButton(root, 'Abrir configurações de clima').click();
  const form = m.modal().contentEl;
  assert.match(form.textContent, /Sem estações/);
  const toggle = form.all((x) => x.tag === 'label' && x.textContent === 'Ativar o clima neste calendário')[0].children[0];
  toggle.checked = true; await toggle.emit('change');
  await pickButton(form, 'Salvar calendário').click();
  assert.equal(m.p.active().weather.enabled, true);
  assert.match(root.querySelector('.brpg-weather').textContent, /Região geral.*perfil-base da região/);
});

test('estações têm atalho, progresso, efeito regional e virada navegável sem avançar o mundo', async () => {
  const m = mock();
  await m.p.onload(); await m.p.open(false);
  const view = m.leaves[0].view, root = view.contentEl;
  assert.ok(root.querySelector('.brpg-season-start'));
  await pickButton(root, 'Velanthir · dia 1').click();
  assert.equal(view.weatherPanel, 'seasons');
  const panel = root.querySelector('.brpg-seasons');
  assert.match(panel.querySelector('.brpg-season-current').textContent, /Velanthir.*Dia 1 de 252/);
  assert.match(panel.querySelector('.brpg-season-next').textContent, /Solanarê.*252 dias/);
  assert.match(panel.querySelector('.brpg-season-climate').textContent, /Clima de Centrus.*Kealyth.*64 dias de atraso/);
  assert.equal(panel.all((x) => x.className.split(' ').includes('brpg-season-row')).length, 4);
  await pickButton(root, 'Ver início de Solanarê').click();
  assert.match(root.querySelector('.brpg-season-current').textContent, /Solanarê.*Dia 1 de 252/);
  assert.equal(m.p.active().current.month, 'mes-1');
  await pickButton(root, 'Previsão').click();
  assert.equal(view.weatherPanel, 'forecast');
  assert.ok(root.querySelector('.brpg-weather'));
});

test('editor de estações grava um ajuste climático sem reiniciar o relógio ou mudar o perfil da região', async () => {
  const m = mock();
  await m.p.onload(); await m.p.open(false);
  const root = m.leaves[0].view.contentEl, anchor = m.p.active().clockSync.since;
  const weather = plain(m.p.active().weather);
  await pickButton(root, 'Clima').click();
  await pickButton(root, 'Estações').click();
  await pickButton(root, 'Editar estações').click();
  const form = m.modal().contentEl;
  const station = form.all((x) => x.tag === 'details' && x.open)[0];
  assert.ok(station);
  await type(station, 'Temperatura (°C)', '-8');
  await type(station, 'Chance de precipitação (p.p.)', '20');
  await pickButton(form, 'Salvar calendário').click();
  assert.equal(m.modal(), null);
  assert.deepEqual(plain(m.p.active().seasons[0].climate), { temperature: -8, rain: 20 });
  assert.equal(m.p.active().clockSync.since, anchor);
  assert.deepEqual(plain(m.p.active().weather), weather);
  assert.match(root.querySelector('.brpg-seasons').textContent, /4 °C a 15 °C.*Precipitação 75%/);
});

test('mundo sem estação pode abrir o editor e cadastrar duas estreias em datas válidas', async () => {
  const m = mock();
  await m.p.onload(); await m.p.open(false);
  m.p.newCalendar();
  await pickButton(m.modal().contentEl, 'Criar calendário').click();
  const root = m.leaves[0].view.contentEl;
  await pickButton(root, 'Clima').click();
  await pickButton(root, 'Estações').click();
  assert.match(root.querySelector('.brpg-seasons').textContent, /ainda não tem estações/);
  await pickButton(root, 'Configurar estações').click();
  const form = m.modal().contentEl;
  await pickButton(form, 'Adicionar estação').click();
  await pickButton(form, 'Adicionar estação').click();
  await pickButton(form, 'Salvar calendário').click();
  assert.deepEqual(plain(m.p.active().seasons.map((s) => s.day)), [1, 2]);
  assert.match(root.querySelector('.brpg-seasons').textContent, /previsão está desativada/);
});
