'use strict';
const { Plugin, PluginSettingTab, Notice, TFile, normalizePath } = require('obsidian');
const { CalendarEngine, assert, copy, newCalendar, uid, validateCalendar } = require('./calendar');
const { decodeImport, encodeExport } = require('./imports');
const { VIEW, CalendarView } = require('./view');
const { ensureSky } = require('./sky');
const { ensureEclipseOrbits } = require('./eclipse');
const { worldDate, mode: clockMode, anchor, ensureClock, transferDate } = require('./world-clock');
const { el, button, select, info, CalendarEditor, EventEditor, WorldDateEditor, Confirm } = require('./ui');
const arkanis = require('./arkanis.json');

class Settings extends PluginSettingTab {
  constructor(plugin) { super(plugin.app, plugin); this.plugin = plugin; }
  display() {
    const root = this.containerEl, p = this.plugin;
    root.replaceChildren();
    const area = el(root, 'div', 'brpg brpg-settings');
    el(area, 'p', 'brpg-eyebrow', 'FERRAMENTAS DE CAMPANHA');
    el(area, 'h2', 'brpg-heading', 'Calendários');
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
    button(buttons, 'Preset Arkanis', () => p.attempt(async () => {
      const preset = copy(arkanis); preset.id = uid('cal');
      await p.putCalendar(preset, true); this.display();
    }), { icon: 'sparkles' });
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
    info(importBox, 'Aceita um backup do Basic RPG ou um JSON do Fantasy Calendar. Regras não compatíveis são sinalizadas na importação.');
    button(buttons, 'Salvar JSON no cofre', () => p.attempt(async () => {
      const path = await p.exportCalendar(c);
      new Notice(`Backup salvo em ${path}`);
    }), { icon: 'download' });

  }
}

class BasicRPG extends Plugin {
  async onload() {
    this.pending = Promise.resolve();
    this.readOnly = false;
    let saveClock = false;
    try {
      const saved = await this.loadData();
      if (saved == null) {
        const preset = copy(arkanis);
        saveClock = ensureClock(preset, this.clockNow());
        this.state = { version: 1, activeId: preset.id, calendars: [preset] };
      } else {
        assert(saved.version === 1 && Array.isArray(saved.calendars) && saved.calendars.length > 0, 'Dados salvos não reconhecidos.');
        saved.calendars.forEach((c) => {
          validateCalendar(c);
          ensureSky(c, new CalendarEngine(c).yearStart(2)); ensureEclipseOrbits(c);
          if (ensureClock(c, this.clockNow())) saveClock = true;
          validateCalendar(c);
        });
        assert(saved.calendars.some((c) => c.id === saved.activeId), 'Calendário ativo não encontrado.');
        this.state = saved;
      }
    } catch {
      const fallback = copy(arkanis);
      this.state = { version: 1, activeId: fallback.id, calendars: [fallback] };
      this.readOnly = true;
      new Notice('Basic RPG: não foi possível ler os dados. Alterações bloqueadas para não sobrescrever o cofre.', 10000);
    }
    if (saveClock && !this.readOnly) {
      try { await this.saveData(this.state); }
      catch { new Notice('Basic RPG: não foi possível salvar a âncora do relógio. Ela não será preservada até uma gravação bem-sucedida.', 9000); }
    }
    if (typeof window !== 'undefined') {
      this.registerInterval(window.setInterval(() => this.tickClock(), 5000));
      this.registerDomEvent(document, 'visibilitychange', () => { if (!document.hidden) this.tickClock(); });
      this.registerDomEvent(window, 'focus', () => this.tickClock());
    }
    this.registerView(VIEW, (leaf) => new CalendarView(leaf, this));
    this.addRibbonIcon('calendar-days', 'Basic RPG · Calendário', () => this.attempt(() => this.open(false)));
    this.addSettingTab(new Settings(this));
    this.addCommand({ id: 'open-calendar', name: 'Abrir calendário', callback: () => this.attempt(() => this.open(false)) });
    this.addCommand({ id: 'open-sky', name: 'Abrir céu do dia', callback: () => this.attempt(async () => {
      const view = await this.open(false); if (view instanceof CalendarView) { view.mode = 'sky'; view.render(); }
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
    this.onLayoutReady();
  }
  onLayoutReady() {
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
        if (!this.state.calendars.some((c) => c.events.some((e) => e.note === oldPath || e.note.startsWith(oldPath + '/')))) return;
        this.attempt(() => this.change((state) => {
          for (const c of state.calendars) for (const e of c.events) {
            if (e.note === oldPath || e.note.startsWith(oldPath + '/')) e.note = file.path + e.note.slice(oldPath.length);
          }
        }));
      }));
    });
  }
  active() { return this.state.calendars.find((c) => c.id === this.state.activeId) || this.state.calendars[0]; }
  clockNow() { return Date.now(); }
  worldNow(c, engine) { return worldDate(c, this.clockNow(), engine); }
  tickClock() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) if (leaf.view instanceof CalendarView) leaf.view.clockTick();
  }
  setWorldDate(id, date, selectedMode) {
    return this.editCalendar(id, (cal) => anchor(cal, date, selectedMode || clockMode(cal), this.clockNow()));
  }
  attempt(fn) {
    return Promise.resolve().then(fn).catch((error) => {
      new Notice(error instanceof Error ? error.message : String(error), 6500);
    });
  }
  redraw() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) if (leaf.view instanceof CalendarView) leaf.view.render();
  }
  change(fn) {
    const next = this.pending.then(async () => {
      assert(!this.readOnly, 'Dados do Basic RPG em modo de segurança. Nada foi sobrescrito.');
      const draft = copy(this.state);
      const value = fn(draft);
      await this.saveData(draft);
      this.state = draft;
      this.redraw();
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
        validateCalendar(draft);
        s.calendars.push(draft); s.activeId = draft.id;
      } else {
        assert(idx >= 0, 'Esse calendário foi removido.');
        const old = s.calendars[idx];
        // Active editing must anchor to the live time at save, not to the old stored base date.
        const now = this.clockNow();
        const requestedMode = options.clockMode || clockMode(old);
        const clockChanged = old.clock.hours !== draft.clock.hours || old.clock.minutes !== draft.clock.minutes;
        const structureChanged = JSON.stringify(old.months) !== JSON.stringify(draft.months) || JSON.stringify(old.leapDays) !== JSON.stringify(draft.leapDays);
        if (options.explicitDate || clockChanged || structureChanged || requestedMode !== clockMode(old)) {
          const value = options.explicitDate ? draft.current : transferDate(old, draft, worldDate(old, now));
          anchor(draft, value, requestedMode, now);
        } else {
          draft.current = old.current;
          draft.clockSync = old.clockSync;
        }
        draft.events = old.events;
        validateCalendar(draft);
        s.calendars[idx] = draft;
      }
    });
  }
  removeCalendar(id) { return this.change((s) => {
    assert(s.calendars.length > 1, 'Mantenha pelo menos um calendário.');
    s.calendars = s.calendars.filter((c) => c.id !== id);
    if (s.activeId === id) s.activeId = s.calendars[0].id;
  }); }
  newCalendar() { new CalendarEditor(this, newCalendar(), true).open(); }
  async advance(amount) {
    await this.editCalendar(this.active().id, (c) => {
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
  async exportCalendar(c) {
    const clean = c.name.normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'calendario';
    let path = `Basic-RPG-${clean}.json`;
    for (let count = 2; this.app.vault.getAbstractFileByPath(path); count++) path = `Basic-RPG-${clean}-${count}.json`;
    const output = copy(c), now = this.clockNow();
    anchor(output, worldDate(c, now), clockMode(c), now);
    await this.app.vault.create(path, JSON.stringify(encodeExport(output), null, 2) + '\n');
    return path;
  }
}

module.exports = BasicRPG;
