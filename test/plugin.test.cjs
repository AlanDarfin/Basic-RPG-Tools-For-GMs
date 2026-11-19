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
    this.classList = { add: (...parts) => { this.className += ' ' + parts.join(' '); } }; }
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
  const document = { createElement(tag) { return new Element(document, tag); } };
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
  assert.equal(p.commands.length, 7);
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
  c.current.day=13;
  c.events[0].title='Evento preservado';
  const {p}=mock({version:1,activeId:c.id,calendars:[c]});
  await p.onload();
  assert.equal(p.active().sky.suns.length,3);
  assert.equal(p.active().current.day,13);
  assert.equal(p.active().events[0].title,'Evento preservado');
});
