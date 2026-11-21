'use strict';
const { ensureWeather } = require('./weather');
const { Plugin, PluginSettingTab, Notice, TFile, normalizePath } = require('obsidian');
const { CalendarEngine, MAX_YEAR, sameDate, fold, assert, copy, newCalendar, uid, validateCalendar } = require('./calendar');
const { decodeImport, encodeExport } = require('./imports');
const { VIEW, CalendarView } = require('./view');
const { ensureSky } = require('./sky');
const { ensureEclipseOrbits } = require('./eclipse');
const { worldDate, linkedDate, mode: clockMode, anchor, ensureClock, transferDate } = require('./world-clock');
const {previewTravel,executeTravel}=require('./exploration');
const { el, button, select, info, CalendarEditor, EventEditor, WorldDateEditor, Confirm } = require('./ui');
const arkanis = require('./arkanis.json');
const { NoteIndex, parseDate } = require('./note-events');
const { registerEmbeds } = require('./embeds');
const { observatory } = require('./observatory');
const { weatherDay } = require('./weather');
const { fantasyExport, gregorian } = require('./interchange');
const { CalendarTemplatesModal } = require('./templates-ui');
const { defaultSolo, validateSolo } = require('./solo');
const { SOLO_VIEW, TABS, SoloView, openSolo } = require('./solo-ui');
const { registerSoloInline } = require('./solo-inline');
const { renameImages } = require('./solo-vault');
const { blankMesa, checkMesa } = require('./mesa');
const {encodeBackup,validateState}=require('./maintenance');
const {BackupModal,WorldSearchModal}=require('./maintenance-ui');
const { setup: setupUltra } = require('./ultra-ui');
const { ATLAS_VIEW, AtlasView, openAtlas, setupAtlas, renameAtlasNotes } = require('./atlas-view');
const { MESA_VIEW, TABS: MESA_TABS, MesaView, openMesa, registerMesaEmbeds, renameMesaNotes } = require('./mesa-view');

class Settings extends PluginSettingTab {
  constructor(plugin) { super(plugin.app, plugin); this.plugin = plugin; }
  display() {
    const root = this.containerEl, p = this.plugin;
    root.replaceChildren();
    const area = el(root, 'div', 'brpg brpg-settings');
    el(area, 'p', 'brpg-eyebrow', 'FERRAMENTAS DE CAMPANHA');
    el(area, 'h2', 'brpg-heading', 'Calendários');
    const kit = el(area, 'section', 'brpg-section brpg-settings-current');
    el(kit, 'h3', '', 'Ferramentas de jogo');
    info(kit, 'Prepare campanhas, acompanhe encontros ou abra dados, baralhos, oráculos e tabelas.');
    button(kit, 'Abrir kit solo', () => p.attempt(() => p.openSolo(null, true)), { icon: 'dices' });
    button(kit, 'Abrir Mesa', () => p.attempt(() => p.openMesa()), { icon: 'swords' });
    button(kit, 'Central de Sessão', () => p.attempt(() => p.openMesa('dashboard')), { icon: 'layout-dashboard' });
    button(kit, 'Abrir Atlas', () => p.attempt(() => p.openAtlas()), { icon: 'map' });
    const maintenance=el(area,'section','brpg-section brpg-settings-current');
    el(maintenance,'h3','','Dados e segurança');
    button(maintenance,'Backup e restauração',()=>p.openBackup(),{icon:'database-backup'});
    button(maintenance,'Pesquisa global',()=>p.openWorldSearch(),{icon:'search'});
    const c = p.active();
    const current = el(area, 'section', 'brpg-section brpg-settings-current');
    el(current, 'h3', '', 'Calendário ativo');
    select(current, p.state.calendars.map((x) => [x.id, x.name]), c.id, (v) => p.attempt(async () => {
      await p.setActive(v); this.display();
    }), 'Calendário ativo');
    const facts = el(current, 'div', 'brpg-metadata');
    el(facts, 'span', 'brpg-chip', `${c.months.length} meses`);
    el(facts, 'span', 'brpg-chip', `Semana de ${c.week.length} dias`);
    el(facts, 'span', 'brpg-chip', `${c.sky.suns.length} sóis · ${c.moons.length} luas`);
    el(facts, 'span', 'brpg-chip', clockMode(c) === 'real' ? 'Relógio em tempo real' : 'Relógio manual');
    const row = el(current, 'div', 'brpg-toolbar');
    button(row, 'Abrir calendário', () => p.attempt(() => p.open(true)), { icon: 'calendar-days', className: 'brpg-button mod-cta' });
    button(row, 'Editar calendário', () => new CalendarEditor(p, c).open(), { icon: 'settings' });
    button(row, 'Configurar sóis', () => new CalendarEditor(p, c, false, 'sois').open(), { icon: 'sun' });
    const advanced = el(current, 'details', 'brpg-disclosure');
    el(advanced, 'summary', '', 'Gerenciar calendário');
    const manage = el(advanced, 'div', 'brpg-toolbar');
    button(manage, 'Duplicar', () => p.attempt(async () => {
      const draft = copy(c);
      anchor(draft, p.worldNow(c), clockMode(c), p.clockNow());
      draft.id = uid('cal'); draft.name = (draft.name.slice(0, 88) + ' (cópia)');
      await p.putCalendar(draft, true); this.display();
    }), { icon: 'copy' });
    button(manage, 'Remover calendário', () => new Confirm(p.app, `Remover o calendário “${c.name}” e seus eventos do Basic RPG?`,
      async () => { await p.removeCalendar(c.id); this.display(); }).open(),
      { icon: 'trash-2', disabled: p.state.calendars.length === 1 });
    const importBox = el(area, 'section', 'brpg-section brpg-settings-data');
    el(importBox, 'h3', '', 'Biblioteca e backup');
    const buttons = el(importBox, 'div', 'brpg-toolbar');
    button(buttons, 'Novo calendário', () => p.newCalendar(), { icon: 'plus' });
    button(buttons, 'Galeria de modelos', () => p.openCalendarTemplates(), { icon: 'layout-template' });
    button(buttons, 'Preset Arkanis', () => p.attempt(async () => {
      const preset = copy(arkanis); ensureWeather(preset); preset.id = uid('cal');
      await p.putCalendar(preset, true); this.display();
    }), { icon: 'sparkles' });
    button(buttons, 'Preset Gregoriano', () => p.attempt(async () => {
      await p.putCalendar(gregorian(new Date(p.clockNow())), true); this.display();
    }), { icon: 'globe' });
    const upload = el(importBox, 'input');
    upload.type = 'file'; upload.accept = '.json,application/json'; upload.hidden = true;
    const output = el(importBox, 'div', 'brpg-import-results');
    output.setAttribute('aria-live', 'polite');
    button(buttons, 'Importar JSON', () => upload.click(), { icon: 'upload' });
    upload.addEventListener('change', async () => {
      const file = upload.files?.[0]; upload.value = '';
      if (!file) return;
      try {
        assert(file.size <= 5_000_000, 'O JSON precisa ter até 5 MB.');
        const { calendar, warnings } = decodeImport(JSON.parse(await file.text()));
        calendar.id = uid('cal');
        if (calendar.clockLink && !p.state.calendars.some((x) => x.id === calendar.clockLink.id && !x.clockLink)) {
          delete calendar.clockLink;
          warnings.push('Calendário de referência não encontrado. O relógio foi importado de forma independente.');
        }
        await p.putCalendar(calendar, true);
        this.display();
        const result = this.containerEl.querySelector('.brpg-import-results');
        info(result, `“${calendar.name}” importado como um novo calendário.`);
        if (warnings.length) {
          const list = el(result, 'ul');
          warnings.slice(0, 20).forEach((warning) => el(list, 'li', '', warning));
          if (warnings.length > 20) info(result, `Mais ${warnings.length - 20} avisos omitidos.`);
        }
      } catch (error) {
        output.textContent = error.message || String(error);
      }
    });
    info(importBox, 'Aceita um backup do Basic RPG, do Calendarium ou do Fantasy Calendar. Regras não compatíveis são sinalizadas na importação.');
    button(buttons, 'Salvar JSON no cofre', () => p.attempt(async () => {
      const path = await p.exportCalendar(c);
      new Notice(`Backup salvo em ${path}`);
    }), { icon: 'download' });

  }
}

class BasicRPG extends Plugin {
  async onload() {
    this.pending = Promise.resolve();
    this.noteIndex = new NoteIndex(this);
    this.embeds = new Set();
    this.defaultKit = defaultSolo();
    this.defaultMesa = blankMesa();
    this.mesaEmbeds = new Set();
    this.notified = new Map();
    this.readOnly = false;
    let saveMigration = false;
    try {
      const saved = await this.loadData();
      if (saved == null) {
        const preset = copy(arkanis);
        ensureWeather(preset);
        saveMigration = ensureClock(preset, this.clockNow());
        this.state = { version: 1, activeId: preset.id, calendars: [preset] };
      } else {
        assert(saved.version === 1 && Array.isArray(saved.calendars) && saved.calendars.length > 0, 'Dados salvos não reconhecidos.');
        saved.calendars.forEach((c) => {
          validateCalendar(c);
          ensureSky(c, new CalendarEngine(c).yearInfo(1).total); ensureEclipseOrbits(c);
          const migratedClock = ensureClock(c, this.clockNow());
          if (ensureWeather(c) || migratedClock) saveMigration = true;
          validateCalendar(c);
        });
        assert(saved.calendars.some((c) => c.id === saved.activeId), 'Calendário ativo não encontrado.');
        this.checkLinks(saved);
        if (saved.solo !== undefined) {
          validateSolo(saved.solo);
          saved.solo.settings = { ...this.defaultKit.settings, ...saved.solo.settings };
        }
        if (saved.mesa !== undefined) checkMesa(saved.mesa);
        this.state = saved;
      }
    } catch {
      const fallback = copy(arkanis);
      ensureWeather(fallback);
      this.state = { version: 1, activeId: fallback.id, calendars: [fallback] };
      this.readOnly = true;
      new Notice('Basic RPG: não foi possível ler os dados. Alterações bloqueadas para não sobrescrever o cofre.', 10000);
    }
    if (saveMigration && !this.readOnly) {
      try { await this.saveData(this.state); }
      catch { new Notice('Basic RPG: não foi possível salvar os dados iniciais do relógio ou do clima.', 9000); }
    }
    if (typeof window !== 'undefined') {
      this.registerInterval(window.setInterval(() => this.tickClock(), 5000));
      this.registerDomEvent(document, 'visibilitychange', () => { if (!document.hidden) this.tickClock(); });
      this.registerDomEvent(window, 'focus', () => this.tickClock());
    }
    this.registerView(VIEW, (leaf) => new CalendarView(leaf, this));
    this.addRibbonIcon('calendar-days', 'Basic RPG · Calendário', () => this.attempt(() => this.open(false)));
    this.registerView(SOLO_VIEW, (leaf) => new SoloView(leaf, this));
    this.addRibbonIcon('dices', 'Basic RPG · Kit solo', () => this.attempt(() => this.openSolo()));
    this.addCommand({ id: 'open-solo', name: 'Abrir kit solo', callback: () => this.attempt(() => this.openSolo()) });
    this.addCommand({ id: 'open-solo-main', name: 'Abrir kit solo na área principal', callback: () => this.attempt(() => this.openSolo(null, true)) });
    for (const [id, name] of TABS) this.addCommand({ id: 'solo-' + id, name: 'Kit solo · ' + name, callback: () => this.attempt(() => this.openSolo(id)) });
    this.registerView(MESA_VIEW, leaf => new MesaView(leaf, this));
    this.addRibbonIcon('swords', 'Basic RPG · Mesa', () => this.attempt(() => this.openMesa()));
    this.addCommand({ id:'open-mesa', name:'Abrir Mesa', callback:() => this.attempt(() => this.openMesa()) });
    this.addCommand({ id:'open-session-dashboard', name:'Abrir Central de Sessão', callback:() => this.attempt(() => this.openMesa('dashboard')) });
    this.addCommand({ id:'open-exploration', name:'Exploração · Planejar viagem do grupo', callback:()=>this.attempt(()=>this.openMesa('dashboard')) });
    this.addCommand({ id:'open-mesa-sidebar', name:'Abrir Mesa na barra lateral', callback:() => this.attempt(() => this.openMesa(null,false)) });
    for (const [id,name] of MESA_TABS) this.addCommand({ id:'mesa-'+id, name:'Mesa · '+name, callback:() => this.attempt(() => this.openMesa(id)) });
    this.addSettingTab(new Settings(this));
    this.addCommand({id:'world-backup',name:'Dados · Backup e restauração',callback:()=>this.openBackup()});
    this.addCommand({id:'world-search',name:'Pesquisa global de RPG',callback:()=>this.openWorldSearch()});
    this.addCommand({id:'calendar-templates',name:'Calendário · Escolher modelo',callback:()=>this.openCalendarTemplates()});
    this.addCommand({id:'atlas-template-map',name:'Atlas · Novo mapa a partir de modelo',callback:()=>this.attempt(async()=>{const view=await this.openAtlas('maps');view.editMap();})});
    this.addCommand({ id: 'open-calendar', name: 'Abrir calendário', callback: () => this.attempt(() => this.open(false)) });
    this.addCommand({ id: 'open-sky', name: 'Abrir céu do dia', callback: () => this.attempt(async () => {
      const view = await this.open(false); if (view instanceof CalendarView) { view.mode = 'sky'; view.render(); }
    }) });
    this.addCommand({ id: 'open-weather', name: 'Abrir clima da campanha', callback: () => this.attempt(async () => {
      const view = await this.open(false); if (view instanceof CalendarView) view.showWeather('forecast');
    }) });
    this.addCommand({ id: 'open-seasons', name: 'Abrir estações do mundo', callback: () => this.attempt(async () => {
      const view = await this.open(false); if (view instanceof CalendarView) view.showWeather('seasons');
    }) });
    this.addCommand({ id: 'open-calendar-main', name: 'Abrir calendário na área principal', callback: () => this.attempt(() => this.open(true)) });
    this.addCommand({ id: 'new-event', name: 'Criar evento na data atual', callback: () => {
      const cal = this.active(); new EventEditor(this, cal, this.worldNow(cal)).open();
    } });
    this.addCommand({ id: 'next-world-day', name: 'Avançar um dia no mundo', callback: () => this.attempt(() => this.advance(1)) });
    this.addCommand({ id: 'previous-world-day', name: 'Voltar um dia no mundo', callback: () => this.attempt(() => this.advance(-1)) });
    this.addCommand({ id: 'set-world-date', name: 'Definir data e hora do mundo', callback: () => {
      const cal = this.active(); new WorldDateEditor(this, cal, {}).open();
    } });
    for (const [id, name, mode] of [['open-year', 'Abrir visão anual', 'year'], ['open-agenda', 'Abrir agenda', 'agenda']]) {
      this.addCommand({ id, name, callback: () => this.attempt(async () => { const view = await this.open(false); view.mode = mode; view.render(); }) });
    }
    this.addCommand({ id: 'insert-world-date', name: 'Inserir data do mundo na nota', editorCallback: (editor) => {
      const c = this.active(); editor.replaceSelection(new CalendarEngine(c).format(this.worldNow(c)));
    } });
    this.addCommand({ id: 'rescan-note-events', name: 'Atualizar eventos das notas', callback: () => this.attempt(async () => {
      await this.noteIndex.rebuild(); this.redraw();
    }) });
    registerEmbeds(this);
    registerSoloInline(this);
    registerMesaEmbeds(this);
    setupUltra(this);
    setupAtlas(this);
    // Stable, read-only access for companions such as Basic.
    this.api = Object.freeze({
      version: 1,
      calendars: () => this.state.calendars.map(({ id, name }) => ({ id, name })),
      current: (name) => this.worldNow(this.resolveCalendar(name)),
      day: (name, date) => this.daySnapshot(this.resolveCalendar(name), date),
      maps: () => (this.mesa().atlas?.maps||[]).map(x=>({id:x.id,name:x.name,campaign:x.campaign,grid:x.grid})),
      session: () => {const s=this.mesa().session;return s?{id:s.id,campaign:s.campaign,entry:s.entry,map:s.map,cell:s.cell,status:s.status}:null;},
    });
    this.onLayoutReady();
  }
  onLayoutReady() {
    this.app.workspace.onLayoutReady(() => {
      const cache = this.app.metadataCache;
      if (cache) {
        this.registerEvent(cache.on('changed', (file, data, info) => this.attempt(async () => {
          if (await this.noteIndex.update(file, info, data)) this.redraw();
          else this.redrawAtlas();
        })));
        this.registerEvent(cache.on('deleted', (file) => { if (this.noteIndex.forget(file.path)) this.redraw(); }));
        this.attempt(async () => { await this.noteIndex.rebuild(); this.redraw(); });
      }
      this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
        if (this.state.mesa && (renameMesaNotes(copy(this.state.mesa), oldPath, file.path)||renameAtlasNotes(copy(this.state.mesa), oldPath, file.path)))
          this.attempt(() => this.changeMesa(m => {renameMesaNotes(m, oldPath, file.path);renameAtlasNotes(m, oldPath, file.path);}));
        if (this.state.solo && renameImages(copy(this.state.solo), oldPath, file.path))
          this.attempt(() => this.changeSolo((solo) => renameImages(solo, oldPath, file.path)));
        if (cache && this.state.calendars.some((c) => c.noteSources?.enabled))
          this.attempt(async () => { await this.noteIndex.rebuild(); this.redraw(); });
        if (!this.state.calendars.some((c) => c.events.some((e) => e.note === oldPath || e.note.startsWith(oldPath + '/')))) return;
        this.attempt(() => this.change((state) => {
          for (const c of state.calendars) for (const e of c.events) {
            if (e.note === oldPath || e.note.startsWith(oldPath + '/')) e.note = file.path + e.note.slice(oldPath.length);
          }
        }));
      }));
    });
  }
  resolveCalendar(name) {
    if (name == null || name === '') return this.active();
    const result = this.state.calendars.find((c) => c.id === name || (typeof name === 'string' && fold(c.name) === fold(name)));
    assert(result, 'Calendário não encontrado.');
    return result;
  }
  isPublicEvent(c, event) {
    return !event.hidden && !c.eventCategories?.some((x) => x.hidden && fold(x.name) === fold(event.category));
  }
  daySnapshot(c, value) {
    const e = new CalendarEngine(c, this.noteIndex.forCalendar(c.id)), world = this.worldNow(c, e);
    const date = value == null ? world : parseDate(c, value).date;
    const t = sameDate(world, date) ? world.hour * c.clock.minutes + world.minute : Math.floor(c.clock.hours * c.clock.minutes / 2);
    const o = observatory(c, e.epoch(date)), w = weatherDay(c, e, date, MAX_YEAR);
    return { date: { ...date }, label: e.format(date), season: e.season(date)?.name || null,
      events: e.eventsOn(date).filter((x) => this.isPublicEvent(c, x)).map(({ title, category }) => ({ title, category })),
      suns: o.suns(t).map(({ name, visibleNow, rises, sets }) => ({ name, visibleNow, rises, sets })),
      moons: o.moons(e.moons(date, t / (c.clock.hours * c.clock.minutes)), t)
        .map(({ name, visibleNow, rises, sets, phase, illumination, apparentRadius }) => ({ name, visibleNow, rises, sets, phase, illumination, apparentRadius })),
      weather: w ? { region: w.region, low: w.low, high: w.high, wind: w.wind, ...w.at(t / (c.clock.hours * c.clock.minutes)) } : null };
  }
  async openDate(id, date) {
    this.resolveCalendar(id);
    if (id !== this.state.activeId) await this.setActive(id);
    const view = await this.open(false); view.mode = 'month'; view.detailOpen = true; view.choose(date);
  }

  active() { return this.state.calendars.find((c) => c.id === this.state.activeId) || this.state.calendars[0]; }
  clockNow() { return Date.now(); }
  worldNow(c, engine) {
    const parent = c.clockLink && this.state.calendars.find((x) => x.id === c.clockLink.id);
    return parent ? linkedDate(c, parent, this.clockNow(), engine) : worldDate(c, this.clockNow(), engine);
  }
  checkLinks(state) {
    for (const c of state.calendars) if (c.clockLink) {
      const parent = state.calendars.find((x) => x.id === c.clockLink.id);
      assert(parent && parent.id !== c.id && !parent.clockLink, 'O calendário de referência precisa existir e ter relógio próprio.');
    }
  }
  tickClock() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) if (leaf.view instanceof CalendarView) leaf.view.clockTick();
    for (const view of this.embeds) view.tick();
    for (const c of this.state.calendars) if (c.dayNotices) {
      const e = new CalendarEngine(c, this.noteIndex.forCalendar(c.id)), d = this.worldNow(c, e), today = e.epoch(d);
      const previous = this.notified.get(c.id);
      this.notified.set(c.id, today);
      if (previous === undefined || today <= previous) continue;
      const events = e.eventsOn(d).filter((v) => this.isPublicEvent(c, v));
      if (events.length) new Notice(c.name + ' · ' + e.format(d) + '\n' + events.slice(0, 5).map((v) => v.title).join(' · ')
        + (events.length > 5 ? ' · mais ' + (events.length - 5) : ''), 8000);
    }
  }
  setWorldDate(id, date, selectedMode) {
    return this.editCalendar(id, (cal) => {
      assert(!cal.clockLink, 'Altere a data no calendário de referência ou desvincule o relógio.');
      anchor(cal, date, selectedMode || clockMode(cal), this.clockNow());
    });
  }
  attempt(fn) {
    return Promise.resolve().then(fn).catch((error) => {
      new Notice(error instanceof Error ? error.message : String(error), 6500);
    });
  }
  redraw() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) if (leaf.view instanceof CalendarView) leaf.view.render();
    for (const view of this.embeds) view.draw();
    this.redrawMesa();
  }
  solo() { return this.state.solo || this.defaultKit; }
  openSolo(tab, main = false) { return openSolo(this, tab, main); }
  redrawSolo() {
    for (const leaf of this.app.workspace.getLeavesOfType(SOLO_VIEW)) if (leaf.view instanceof SoloView) leaf.view.renderIfTab();
  }
  changeSolo(fn) {
    return this.change((state) => {
      state.solo ||= defaultSolo();
      const result = fn(state.solo);
      validateSolo(state.solo);
      return result;
    }, false, 'solo');
  }
  openAtlas(panel='maps',mapId='') { return openAtlas(this,panel,mapId); }
  redrawAtlas(){
    for(const leaf of this.app.workspace.getLeavesOfType(ATLAS_VIEW)) if(leaf.view instanceof AtlasView)leaf.view.render();
    for(const embed of this.atlasEmbeds||[])embed.render();
  }
  mesa() { return this.state.mesa || this.defaultMesa; }
  openMesa(tab, main = true) { return openMesa(this, tab, main); }
  redrawMesa() {
    for (const leaf of this.app.workspace.getLeavesOfType(MESA_VIEW)) if (leaf.view instanceof MesaView) leaf.view.render();
    for (const view of this.mesaEmbeds) view.render();
    this.redrawAtlas();
  }
  planTravel(options){
    const s=this.mesa().session;
    assert(s,'Inicie uma sessão primeiro.');
    const camp=this.mesa().campaigns.find(x=>x.id===s.campaign);
    const cal=this.state.calendars.find(x=>x.id===camp?.calendar);
    return previewTravel(this.mesa(),cal,options);
  }
  travelSession(options){
    return this.change(state=>{
      const plan=executeTravel(state,options,this.clockNow());
      checkMesa(state.mesa);
      return plan;
    });
  }
  openBackup(){new BackupModal(this).open();}
  openWorldSearch(){new WorldSearchModal(this).open();}
  async writeBackup(state){
    const now=this.clockNow(),name=new Date(now).toISOString().replace(/[:.]/g,'-');
    return this.writeExport({name},'Basic-RPG-Backup','json',encodeBackup(state,now));
  }
  backupWorld(){
    const next=this.pending.then(()=>{
      assert(!this.readOnly,'Dados em modo de segurança. Preserve o arquivo original.');
      return this.writeBackup(this.state);
    });
    this.pending=next.catch(()=>{});return next;
  }
  restoreWorld(candidate){
    const next=this.pending.then(async()=>{
      assert(!this.readOnly,'Dados em modo de segurança. Restaure externamente com o Obsidian fechado.');
      const restored=validateState(candidate,this.clockNow());
      const path=await this.writeBackup(this.state);
      await this.saveData(restored);
      this.state=restored;this.notified.clear();
      await this.noteIndex.rebuild();this.redraw();this.redrawSolo();
      return path;
    });
    this.pending=next.catch(()=>{});return next;
  }
  changeMesa(fn) {
    return this.change(state => {
      state.mesa ||= blankMesa();
      const result = fn(state.mesa);
      checkMesa(state.mesa);
      return result;
    }, false, 'mesa');
  }
  change(fn, rebuildNotes = false, view = '') {
    const next = this.pending.then(async () => {
      assert(!this.readOnly, 'Dados do Basic RPG em modo de segurança. Nada foi sobrescrito.');
      const draft = copy(this.state);
      const value = fn(draft);
      this.checkLinks(draft);
      await this.saveData(draft);
      this.state = draft;
      if (rebuildNotes) await this.noteIndex.rebuild();
      if (view === 'solo') this.redrawSolo();
      else if (view === 'mesa') this.redrawMesa();
      else this.redraw();
      return value;
    });
    this.pending = next.catch(() => {});
    return next;
  }
  setActive(id) { return this.change((s) => { assert(s.calendars.some((c) => c.id === id), 'Calendário não encontrado.'); s.activeId = id; }); }
  editCalendar(id, fn) {
    return this.change((s) => {
      const c = s.calendars.find((item) => item.id === id);
      assert(c, 'Esse calendário foi removido.');
      fn(c);
      validateCalendar(c);
    });
  }
  putCalendar(cal, isNew, options = {}) {
    return this.change((s) => {
      const idx = s.calendars.findIndex((item) => item.id === cal.id);
      const draft = copy(cal);
      if (isNew) {
        assert(idx < 0, 'Já existe um calendário com este ID.');
        if (options.clockMode) anchor(draft, draft.current, options.clockMode, this.clockNow());
        else ensureClock(draft, this.clockNow());
        ensureWeather(draft);
        validateCalendar(draft);
        s.calendars.push(draft); s.activeId = draft.id;
      } else {
        assert(idx >= 0, 'Esse calendário foi removido.');
        const old = s.calendars[idx];
        // Active editing must anchor to the live time at save, not to the old stored base date.
        const now = this.clockNow();
        const requestedMode = options.clockMode || clockMode(old);
        const clockChanged = old.clock.hours !== draft.clock.hours || old.clock.minutes !== draft.clock.minutes ||
          old.realDayHours !== draft.realDayHours || JSON.stringify(old.clockLink) !== JSON.stringify(draft.clockLink);
        const structureChanged = JSON.stringify(old.months) !== JSON.stringify(draft.months) || JSON.stringify(old.leapDays) !== JSON.stringify(draft.leapDays) || old.firstYear !== draft.firstYear;
        if (options.explicitDate || clockChanged || structureChanged || requestedMode !== clockMode(old)) {
          const value = options.explicitDate ? draft.current : transferDate(old, draft, this.worldNow(old));
          anchor(draft, value, requestedMode, now);
        } else {
          draft.current = old.current;
          draft.clockSync = old.clockSync;
        }
        draft.events = old.events;
        validateCalendar(draft);
        s.calendars[idx] = draft;
      }
    }, true);
  }
  removeCalendar(id) { return this.change((s) => {
    assert(s.calendars.length > 1, 'Mantenha pelo menos um calendário.');
    assert(!s.calendars.some((c) => c.clockLink?.id === id), 'Desvincule os calendários dependentes antes de remover a referência.');
    s.calendars = s.calendars.filter((c) => c.id !== id);
    if (s.activeId === id) s.activeId = s.calendars[0].id;
  }); }
  openCalendarTemplates(){new CalendarTemplatesModal(this).open();}
  newCalendar() { new CalendarEditor(this, newCalendar(), true).open(); }
  async advance(amount) {
    await this.editCalendar(this.active().id, (c) => {
      assert(!c.clockLink, 'Avance a data no calendário de referência.');
      const now = this.clockNow(), engine = new CalendarEngine(c);
      const current = worldDate(c, now, engine);
      anchor(c, { ...current, ...engine.shift(current, amount) }, clockMode(c), now);
    });
  }
  async open(main) {
    const workspace = this.app.workspace;
    const available = workspace.getLeavesOfType(VIEW);
    let leaf = main ? available.find((l) => l === this.mainCalendarLeaf || (workspace.rootSplit && l.getRoot?.() === workspace.rootSplit)) : available[0];
    if (!leaf) {
      leaf = main ? workspace.getLeaf('tab') : workspace.getRightLeaf(false);
      if (!leaf) leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW, active: true });
    }
    if (main) this.mainCalendarLeaf = leaf;
    await workspace.revealLeaf(leaf);
    return leaf.view;
  }
  async openNote(path) {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    assert(file instanceof TFile, 'Nota vinculada não encontrada no cofre.');
    await this.app.workspace.getLeaf('tab').openFile(file);
  }
  async writeExport(c, prefix, ext, content) {
    const clean = c.name.normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'calendario';
    let path = `${prefix}-${clean}.${ext}`;
    for (let count = 2; this.app.vault.getAbstractFileByPath(path); count++) path = `${prefix}-${clean}-${count}.${ext}`;
    await this.app.vault.create(path, content);
    return path;
  }
  snapshot(c) {
    const output = copy(c), now = this.clockNow();
    anchor(output, this.worldNow(c), clockMode(c), now);
    return output;
  }
  exportCalendar(c) {
    return this.writeExport(c, 'Basic-RPG', 'json', JSON.stringify(encodeExport(this.snapshot(c)), null, 2) + '\n');
  }
  async exportFantasy(c) {
    const output = this.snapshot(c), result = fantasyExport(output, [...c.events, ...this.noteIndex.forCalendar(c.id)]);
    return { path: await this.writeExport(c, 'Fantasy-Calendar', 'json', JSON.stringify(result.data, null, 2) + '\n'), warnings: result.warnings };
  }
  exportPlayer(c) {
    const { label, season, events } = this.daySnapshot(c), escape = (v) => String(v).replace(/[\r\n]+/g, ' ')
      .replace(/[&<>]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[x])
      .replace(/[\\`*_#|!\[\]()]/g, (x) => '\\' + x);
    const body = ['# ' + escape(c.name), '', escape(label), ...(season ? ['', 'Estação · ' + escape(season)] : []), '',
      '## Eventos do dia', '', ...(events.length ? events.map((v) => '- ' + escape(v.title)) : ['Sem eventos públicos.'])].join('\n');
    return this.writeExport(c, 'Jogadores', 'md', body + '\n');
  }
}

module.exports = BasicRPG;
