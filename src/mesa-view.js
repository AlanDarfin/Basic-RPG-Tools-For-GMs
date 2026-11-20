'use strict';
const { ItemView, Modal, MarkdownRenderChild, parseYaml } = require('obsidian');
const { CalendarEngine, copy, uid } = require('./calendar');
const { el, button, select, input, inlineNumber, info, Confirm } = require('./ui');
const { key, clean, rollDice, imageRef } = require('./solo');
const { art } = require('./solo-ui');
const {
  KINDS, ELEMENTS, SIDES, LIMITS, requireMesa, whole, newCampaign, newEntry, newSheet, resource, arkanisSheet,
  newEncounter, find, need, checkSheet, checkEncounter, yamlSheet, sourceRoster, order, buildRunning, step, changeResource,
} = require('./mesa');

const MESA_VIEW = 'basic-rpg-mesa';
const TABS = [['campaigns','Campanhas','map'],['sheets','Fichas','contact-round'],['encounters','Encontros','swords'],['studio','Estúdio','wand-sparkles'],['library','Biblioteca','folder-open']];
const row = (root) => el(root, 'div', 'brpg-toolbar brpg-mesa-row');
function panel(root, title, desc = '') {
  const section = el(root, 'section', 'brpg-mesa-panel');
  el(section, 'h3', 'brpg-section-title', title);
  if (desc) info(section, desc);
  return section;
}
function labelSelect(root, name, options, value, change) {
  const label = el(root, 'label', 'brpg-field');
  el(label, 'span', 'brpg-label', name);
  return select(label, options, value, change, name);
}
function choice(items, empty = 'Nenhum') { return [['',empty], ...items.map(x => [x.id,x.name])]; }
function cta(root, label, action, icon) { return button(root,label,action,{ icon, className: 'brpg-button mod-cta' }); }
function check(root, name, value, onChange) {
  const label = el(root, 'label', 'brpg-mesa-check');
  const field = el(label, 'input'); field.type = 'checkbox'; field.checked = !!value;
  el(label,'span','',name); field.addEventListener('change', () => onChange(field.checked));
}
function disclosure(root, title, open = false) {
  const exp = el(root, 'details', 'brpg-disclosure brpg-mesa-details');
  exp.open = open; el(exp, 'summary', 'brpg-summary', title); return exp;
}
function normalized(obj, fields) {
  for (const k of fields) obj[k] = clean(obj[k], { note:500, image:2000, description:12000, summary:10000 }[k] || 120);
  if (obj.note) obj.note = obj.note.replace(/^\[\[|\]\]$/g, '').split('|')[0];
  return obj;
}
function applySave(list, item) {
  const i = list.findIndex(x => x.id === item.id);
  if (i < 0) list.push(copy(item)); else list[i] = copy(item);
}
function linkedNote(root, plugin, path) {
  if (!path) return;
  button(root, 'Abrir nota', () => plugin.attempt(() => plugin.openNote(path)), { icon:'file-text' });
}
function renderSheet(root, plugin, sheet, { compact = false } = {}) {
  const box = el(root, 'article', 'brpg-mesa-sheet');
  const top = el(box, 'div', 'brpg-mesa-sheet-head');
  const caption = el(top, 'div');
  el(caption, 'p', 'brpg-eyebrow', KINDS[sheet.kind] || 'FICHA');
  el(caption, 'h3', 'brpg-section-title', sheet.name);
  if (sheet.type) el(caption, 'p', 'brpg-hint', sheet.type);
  if (sheet.image && !compact) art(top, plugin, sheet.image, sheet.name, sheet.note, 'brpg-mesa-portrait');
  const stats = el(box, 'div', 'brpg-metadata');
  for (const a of sheet.attributes) el(stats, 'span', 'brpg-chip', a.name + ' ' + a.value);
  if (!compact) {
    for (const r of sheet.resources) el(stats, 'span', 'brpg-chip', r.name + ' ' + r.value + '/' + r.max);
    el(stats, 'span','brpg-chip','Iniciativa · ' + sheet.initiative);
    if (sheet.description) el(box, 'p', 'brpg-mesa-prose', sheet.description);
  }
  const sections = el(box,'div','brpg-mesa-actions');
  if (!compact) linkedNote(sections,plugin,sheet.note);
  const outcome = el(box, 'div', 'brpg-mesa-roll'); outcome.setAttribute('aria-live','polite');
  for (const a of sheet.actions) {
    const line = disclosure(sections, a.name + (a.group && a.group !== 'Ação' ? ' · ' + a.group : ''));
    if (a.text) el(line,'p','brpg-mesa-prose',a.text);
    if (a.roll) button(line,'Rolar ' + a.roll,() => plugin.attempt(() => {
      const r=rollDice(a.roll); outcome.textContent = a.name + ' · ' + r.total + ' (' + r.values.join(', ') + ')';
    }), { icon:'dice-5' });
  }
  if (plugin.ultra && !compact) plugin.ultra.renderSheetTools(box,sheet);
  return box;
}

class MesaModal extends Modal {
  constructor(view, title, data, render, save) {
    super(view.plugin.app); this.view = view; this.titleText = title; this.draft = data;
    this.renderForm = render; this.save = save; this.expanded = {};
  }
  onOpen() { this.modalEl.classList.add('brpg-mesa-modal'); this.draw(); }
  draw() {
    this.contentEl.replaceChildren();
    const outer = el(this.contentEl,'div','brpg brpg-mesa-editor');
    el(outer,'h2','brpg-heading',this.titleText);
    this.error = el(outer,'div','brpg-mesa-error'); this.error.setAttribute('role','status');
    this.renderForm(outer,this.draft,this);
    const controls = row(outer);
    button(controls,'Cancelar',() => this.close());
    cta(controls,'Salvar',async () => {
      if (this.busy) return;
      this.busy = true; this.error.textContent = '';
      try { await this.save(this.draft); this.close(); }
      catch (err) { this.error.textContent = err?.message || String(err); }
      finally { this.busy = false; }
    },'check');
  }
  section(root, label, id, suggested = false) {
    const part = disclosure(root,label,this.expanded[id] ?? suggested);
    part.addEventListener('toggle',() => { this.expanded[id] = part.open; });
    return part;
  }
}
class SheetPreview extends Modal {
  constructor(plugin,sheet) { super(plugin.app); this.plugin=plugin; this.sheet=sheet; }
  onOpen() {
    this.modalEl.classList.add('brpg-mesa-modal');
    renderSheet(el(this.contentEl,'section','brpg'),this.plugin,this.sheet);
    button(el(this.contentEl,'div','brpg'), 'Fechar ficha', () => this.close());
  }
}
function textFields(root, draft, names) {
  for (const [key, label, length, multi] of names) input(root,label,draft[key],v => { draft[key]=v; },{maxLength:length,multiline:!!multi});
}
function editableRows(root, modal, draft, prop, title, addLabel, make, render, limit = LIMITS.fields) {
  const items = draft[prop], container = modal.section(root,title + ' · ' + items.length,prop,false);
  const pending = el(container,'div','brpg-mesa-edit-list');
  for (const [i, item] of items.entries()) {
    const fields = el(pending,'div','brpg-mesa-edit-card');
    render(fields,item,i);
    button(row(fields),'Remover linha ' + (i + 1) + ' de ' + title,() => { items.splice(i,1); modal.draw(); },{icon:'trash-2',iconOnly:true});
  }
  button(row(pending),addLabel,() => {
    if (items.length >= limit) return;
    items.push(make()); modal.expanded[prop]=true; modal.draw();
  },{icon:'plus',disabled:items.length>=limit});
}
class MesaView extends ItemView {
  constructor(leaf,plugin) {
    super(leaf); this.plugin=plugin; this.tab=plugin.mesa().running ? 'encounters' : 'campaigns'; this.campaign=''; this.filter=''; this.sheetType='';
  }
  getViewType() { return MESA_VIEW; }
  getDisplayText() { return 'Basic RPG · Mesa'; }
  getIcon() { return 'swords'; }
  async onOpen() { this.render(); }
  async onClose() { this.closed=true; }
  show(tab) { if (TABS.some(t => t[0]===tab)) this.tab=tab; this.filter=''; this.render(); this.contentEl.scrollTop=0; }
  run(fn) { return () => this.plugin.attempt(fn); }
  edit(title,data,render,save) { new MesaModal(this,title,copy(data),render,save).open(); }
  get m() { return this.plugin.mesa(); }
  selected() { return this.m.campaigns.find(x => x.id===this.campaign); }
  remove(label, fn) { new Confirm(this.plugin.app,label,() => this.plugin.changeMesa(fn)).open(); }
  visible(data) { return key(data.name).includes(key(this.filter)) || key(data.type || data.summary).includes(key(this.filter)); }
  render() {
    if (this.closed) return;
    const root=this.contentEl; root.classList.add('brpg','brpg-view','brpg-mesa');
    const scroll=root.scrollTop || 0;
    root.replaceChildren();
    const head=el(root,'header','brpg-header brpg-mesa-head'), name=el(head,'div');
    el(name,'div','brpg-eyebrow','BASIC RPG'); el(name,'h2','brpg-heading','Mesa');
    const anchors=row(head);
    button(anchors,'Calendário',this.run(() => this.plugin.open(true)),{icon:'calendar-days',iconOnly:true});
    button(anchors,'Kit solo',this.run(() => this.plugin.openSolo(null,true)),{icon:'dices',iconOnly:true});
    const tabs=el(root,'nav','brpg-tabs brpg-mesa-tabs');
    tabs.setAttribute('aria-label','Ferramentas da Mesa');
    for (const [id,label,icon] of TABS) {
      const control=button(tabs,label,() => this.show(id),{icon});
      control.setAttribute('aria-pressed',String(id===this.tab));
    }
    const scope=el(root,'div','brpg-mesa-scope');
    labelSelect(scope,'Campanha',choice(this.m.campaigns,'Sem filtro de campanha'),this.campaign,v => { this.campaign=v; this.render(); });
    const content=el(root,'div','brpg-mesa-content');
    if (this.tab==='campaigns') this.campaignsPane(content);
    else if (this.tab==='sheets') this.sheetsPane(content);
    else if (this.tab==='encounters') this.encountersPane(content);
    else this.plugin.ultra?.render(this,content);
    root.scrollTop=scroll;
  }
  campaignEditor(current) {
    const p=this.plugin;
    this.edit(current?'Editar campanha':'Nova campanha',current||newCampaign(),(root,draft) => {
      textFields(root,draft,[['name','Nome da campanha',120],['summary','Resumo',10000,true],['note','Caminho da nota principal',500]]);
      labelSelect(root,'Calendário do mundo',choice(p.state.calendars,'Nenhum'),draft.calendar,v => { draft.calendar=v; });
    },async draft => {
      normalized(draft,['name','note','summary']);
      requireMesa(draft.name,'Dê um nome à campanha.');
      await p.changeMesa(m => applySave(m.campaigns,draft));
      this.campaign=draft.id; this.render();
    });
  }
  entryEditor(campaign,current) {
    const p=this.plugin;
    this.edit(current?'Editar registro':'Novo registro',current||newEntry(campaign.id),(root,draft,modal) => {
      labelSelect(root,'Tipo de registro',Object.entries(ELEMENTS),draft.kind,v => { draft.kind=v; });
      textFields(root,draft,[['name','Nome do registro',120],['summary','Resumo',10000,true],['note','Caminho da nota',500]]);
      const calendar=p.state.calendars.find(c => c.id===campaign.calendar);
      if (calendar || draft.date) {
        const dates=row(root);
        if (draft.date) el(dates,'span','brpg-chip',draft.date.label);
        if (calendar) button(dates,'Registrar data atual do mundo',() => {
          const date=p.worldNow(calendar);
          draft.date={calendar:calendar.id,date,label:new CalendarEngine(calendar).format(date)};
          modal.draw();
        },{icon:'calendar-days'});
        if (draft.date) button(dates,'Remover data',() => { draft.date=null; modal.draw(); },{icon:'x',iconOnly:true});
      }
      const others=this.m.entries.filter(x => x.campaign===campaign.id && x.id!==draft.id);
      if (others.length) {
        const links=modal.section(root,'Vínculos · ' + draft.links.length,'links');
        for (const e of others) check(links,ELEMENTS[e.kind] + ' · ' + e.name,draft.links.includes(e.id),on => {
          if (on) draft.links.push(e.id); else draft.links=draft.links.filter(i => i!==e.id);
        });
      }
    },draft => {
      normalized(draft,['name','note','summary']);
      requireMesa(draft.name,'Dê um nome ao registro.');
      return p.changeMesa(m => applySave(m.entries,draft));
    });
  }
  campaignsPane(root) {
    const p=this.plugin, current=this.selected(), section=panel(root,'Campanhas');
    cta(row(section),'Nova campanha',() => this.campaignEditor(),'plus');
    if (!current) {
      if (!this.m.campaigns.length) return info(section,'Crie uma campanha e organize aventuras, sessões, cenas, NPCs, pistas e locais.');
      for (const c of this.m.campaigns) button(row(section),c.name,() => { this.campaign=c.id; this.render(); },{icon:'map'});
      return;
    }
    const card=panel(root,current.name);
    if (current.summary) el(card,'p','brpg-mesa-prose',current.summary);
    const controls=row(card);
    linkedNote(controls,p,current.note);
    button(controls,'Editar campanha',() => this.campaignEditor(current),{icon:'pencil'});
    cta(controls,'Novo registro',() => this.entryEditor(current),'plus');
    button(controls,'Excluir campanha',() => this.remove('Excluir a campanha vazia? Nenhuma nota será apagada.',m => {
      requireMesa(![...m.entries,...m.sheets,...m.encounters,m.running].some(x => x?.campaign===current.id),
        'Remova os registros e encontros ou mova as fichas para outra campanha antes de excluir.');
      m.campaigns=m.campaigns.filter(x => x.id!==current.id);
    }),{icon:'trash-2',iconOnly:true});
    const listing=panel(root,'Registros');
    const search=input(listing,'Buscar registros',this.filter,v => { this.filter=v; draw(); },{maxLength:120});
    search.placeholder='Nome ou resumo';
    const category=labelSelect(listing,'Filtrar tipo',[['','Todos'],...Object.entries(ELEMENTS)],this.entryKind||'',v => { this.entryKind=v; draw(); });
    const list=el(listing,'div','brpg-mesa-list');
    const records=this.m.entries.filter(e => e.campaign===current.id);
    const draw=() => {
      list.replaceChildren();
      const matching=records.filter(e => this.visible(e) && (!category.value || e.kind===category.value));
      if (!matching.length) info(list,'Nenhum registro encontrado.');
      for (const e of matching) {
        const entry=disclosure(list,ELEMENTS[e.kind] + ' · ' + e.name + (e.date ? ' · ' + e.date.label : ''),this.focusEntry===e.id);
        this.focusEntry = this.focusEntry===e.id ? '' : this.focusEntry;
        if (e.summary) el(entry,'p','brpg-mesa-prose',e.summary);
        const calendar=e.date && p.state.calendars.find(c => c.id===e.date.calendar);
        const actions=row(entry);
        linkedNote(actions,p,e.note);
        if (calendar) button(actions,'Ver no calendário',this.run(() => p.openDate(calendar.id,e.date.date)),{icon:'calendar-days'});
        button(actions,'Editar registro',() => this.entryEditor(current,e),{icon:'pencil'});
        button(actions,'Criar encontro',() => this.encounterEditor(null,e),{icon:'swords'});
        button(actions,'Excluir registro',() => this.remove('Excluir este registro da campanha?',m => {
          m.entries=m.entries.filter(x => x.id!==e.id);
          for (const r of m.entries) r.links=r.links.filter(id => id!==e.id);
          for (const encounter of m.encounters) if (encounter.entry===e.id) encounter.entry='';
        }),{icon:'trash-2',iconOnly:true});
        const related=records.filter(r => e.links.includes(r.id)||r.links.includes(e.id));
        if (related.length) {
          const links=row(entry);
          el(links,'span','brpg-label','Vínculos');
          for (const r of related) button(links,r.name,() => { this.entryKind='';this.filter='';this.focusEntry=r.id;this.render(); },{icon:'link'});
        }
        const encounters=this.m.encounters.filter(x => x.entry===e.id);
        if (encounters.length) {
          const links=row(entry);
          for (const encounter of encounters) button(links,encounter.name,() => { this.focusEncounter=encounter.id;this.show('encounters'); },{icon:'swords'});
        }
      }
    };
    draw();
  }
  importSheet() {
    this.edit('Importar ficha YAML ou JSON',{ source:'' },(root,draft) => {
      input(root,'Conteúdo da ficha',draft.source,v => { draft.source=v; },{multiline:true,rows:9,maxLength:150000});
      info(root,'Cole o conteúdo do bloco, sem as crases. O importador lê campos como name, hp, ac, stats, actions, traits e reactions.');
    },async draft => {
      const sheet=yamlSheet(parseConfig(draft.source),this.campaign);
      await this.plugin.changeMesa(m => applySave(m.sheets,sheet));
    });
  }
  sheetEditor(current,preset,duplicate) {
    const draft = current || (duplicate ? { ...copy(duplicate), id:uid('sheet'), name:(duplicate.name.slice(0,105)+' (cópia)') } :
      preset ? arkanisSheet(this.campaign) : newSheet(this.campaign));
    this.edit(current?'Editar ficha':'Nova ficha',draft,(root,s,modal) => {
      textFields(root,s,[['name','Nome da ficha',120]]);
      if (current) el(root, 'code', 'brpg-hint', s.id);
      const ids=row(root);
      labelSelect(ids,'Tipo de ficha',Object.entries(KINDS),s.kind,v => { s.kind=v; });
      labelSelect(ids,'Campanha da ficha',choice(this.m.campaigns,'Compartilhada'),s.campaign,v => { s.campaign=v; });
      textFields(root,s,[['type','Classe, origem ou tipo',120],['note','Caminho da nota',500],['image','Caminho do retrato',2000],
        ['initiative','Iniciativa padrão',60],['description','Descrição',12000,true]]);
      editableRows(root,modal,s,'attributes','Atributos','Adicionar atributo',() => ({name:'',value:''}),(fields,a) => {
        textFields(row(fields),a,[['name','Nome do atributo',120],['value','Valor do atributo',160]]);
      });
      editableRows(root,modal,s,'resources','Recursos','Adicionar recurso',() => resource('',1),(fields,r) => {
        textFields(fields,r,[['name','Nome do recurso',120]]);
        const limits=row(fields);
        inlineNumber(limits,'Atual',r.value,v => { r.value=v; },0,999999);
        inlineNumber(limits,'Máximo',r.max,v => { r.max=v; },0,999999);
        labelSelect(fields,'Descanso',[['','Automático'],['max','Restaurar ao máximo'],['zero','Zerar'],['keep','Manter valor']],r.rest||'',v => { r.rest=v; });
      });
      editableRows(root,modal,s,'actions','Ações e traços','Adicionar ação ou traço',() => ({name:'',text:'',roll:'',damage:'',cost:'',group:'Ação'}),(fields,a) => {
        labelSelect(fields,'Grupo',[['Ação','Ação'],['Traço','Traço'],['Reação','Reação']],a.group,v => { a.group=v; });
        textFields(fields,a,[['name','Nome da ação',120],['roll','Rolagem / ataque (opcional)',60],['damage','Dano automático (opcional)',60],['cost','Custo do recurso (Esforço:2)',110],['text','Descrição da ação',5000,true]]);
      });
    },s => {
      normalized(s,['name','description','note','image','initiative','type']);
      requireMesa(!s.image || imageRef(s.image),'Retrato inválido. Use um arquivo de imagem no cofre ou uma URL.');
      checkSheet(s);
      return this.plugin.changeMesa(m => applySave(m.sheets,s));
    });
  }
  sheetsPane(root) {
    const list=panel(root,'Fichas e bestiário');
    const actions=row(list);
    cta(actions,'Nova ficha',() => this.sheetEditor(),'plus');
    button(actions,'Modelo Arkanis',() => this.sheetEditor(null,true),{icon:'sparkles'});
    button(actions,'Importar ficha',() => this.importSheet(),{icon:'upload'});
    const filter=row(list);
    input(filter,'Buscar fichas',this.filter,v => { this.filter=v; draw(); },{maxLength:120});
    labelSelect(filter,'Filtrar fichas',[['','Todas'],...Object.entries(KINDS)],this.sheetType,v => { this.sheetType=v; draw(); });
    const results=el(list,'div','brpg-mesa-list');
    const draw=() => {
      results.replaceChildren();
      const sheets=this.m.sheets.filter(s => this.visible(s) && (!this.campaign || !s.campaign || s.campaign===this.campaign) &&
        (!this.sheetType || s.kind===this.sheetType));
      if (!sheets.length) return info(results,'Nenhuma ficha encontrada. Crie uma ficha ou importe dados de uma ficha existente.');
      for (const s of sheets) {
        const card=el(results,'article','brpg-mesa-card');
        el(card,'strong','',s.name);
        el(card,'span','brpg-hint',[KINDS[s.kind],s.type].filter(Boolean).join(' · '));
        const commands=row(card);
        button(commands,'Abrir ficha',() => new SheetPreview(this.plugin,s).open(),{icon:'eye'});
        button(commands,'Editar ficha',() => this.sheetEditor(s),{icon:'pencil',iconOnly:true});
        button(commands,'Duplicar ficha',() => this.sheetEditor(null,false,s),{icon:'copy',iconOnly:true});
        button(commands,'Excluir ficha',() => this.remove('Excluir esta ficha do bestiário?',m => {
          requireMesa(!m.encounters.some(e => e.roster.some(r => r.sheet===s.id)),
            'Remova a ficha dos encontros salvos antes de excluí-la.');
          m.sheets=m.sheets.filter(x => x.id!==s.id);
        }),{icon:'trash-2',iconOnly:true});
      }
    };
    draw();
  }
  rosterFields(root,line,campaign) {
    const sheets=this.m.sheets.filter(s => !s.campaign || s.campaign===campaign);
    labelSelect(root,'Ficha do participante',choice(sheets,'Participante avulso'),line.sheet,v => { line.sheet=v; });
    textFields(root,line,[['name','Nome ou apelido',120]]);
    const options=row(root);
    labelSelect(options,'Lado',Object.entries(SIDES),line.side,v => { line.side=v; });
    textFields(options,line,[['count','Quantidade ou dado',60],['initiative','Iniciativa (opcional)',60]]);
  }
  freshLine() { return { sheet:'',name:'',side:'enemies',count:'1',initiative:'' }; }
  encounterEditor(current,entry) {
    const data=current || newEncounter(entry?.campaign || this.campaign);
    if (!current) { data.entry=entry?.id || ''; data.roster.push(this.freshLine()); }
    this.edit(current?'Editar encontro':'Novo encontro',data,(root,e,modal) => {
      textFields(root,e,[['name','Nome do encontro',120]]);
      if (current) el(root, 'code', 'brpg-hint', e.id);
      labelSelect(root,'Campanha do encontro',choice(this.m.campaigns,'Sem campanha'),e.campaign,v => {
        e.campaign=v;e.entry='';
        for (const row of e.roster) if (this.m.sheets.some(s => s.id===row.sheet && s.campaign && s.campaign!==v)) row.sheet='';
        modal.draw();
      });
      const entries=this.m.entries.filter(x => e.campaign && x.campaign===e.campaign);
      if (entries.length) labelSelect(root,'Registro vinculado',choice(entries),e.entry,v => { e.entry=v; });
      check(root,'Mesma iniciativa para cópias da mesma linha',e.grouped,v => { e.grouped=v; });
      if (e.roster.length && modal.expanded.roster===undefined) modal.expanded.roster=true;
      editableRows(root,modal,e,'roster','Participantes','Adicionar linha',() => this.freshLine(),(item,line) => this.rosterFields(item,line,e.campaign),LIMITS.members);
    },e => {
      normalized(e,['name']); for (const line of e.roster) normalized(line,['name','count','initiative']);
      checkEncounter(e);
      return this.plugin.changeMesa(m => applySave(m.encounters,e)).then(() => {
        if (!current) { this.campaign=e.campaign; this.show('encounters'); }
      });
    });
  }
  addParticipant() {
    const run=this.m.running, empty=this.freshLine();
    this.edit('Adicionar participante',empty,(root,line) => this.rosterFields(root,line,run.campaign),line => {
      normalized(line,['name','count','initiative']);
      return this.updateRun(run.id,(r,m) => {
        const sample={ ...newEncounter(r.campaign),name:r.name,roster:[line] };
        const next=buildRunning(sample,m);
        requireMesa(r.members.length+next.members.length<=LIMITS.members,'Limite de participantes atingido.');
        const base=Math.max(...r.members.map(x => x.seed))+1;
        for (const member of next.members) { member.seed+=base; r.members.push(member); }
        order(r.members);
      });
    });
  }
  start(e) {
    return this.plugin.changeMesa(m => {
      requireMesa(!m.running,'Finalize o encontro em andamento antes de abrir outro.');
      m.running=buildRunning(e,m);
    });
  }
  updateRun(id,change) {
    return this.plugin.changeMesa(m => {
      requireMesa(m.running?.id===id,'Este encontro já foi encerrado.');
      return change(m.running,m);
    });
  }
  encountersPane(root) {
    const running=this.m.running;
    if (running) this.runningPane(root,running);
    const list=panel(root,'Encontros salvos'), controls=row(list);
    cta(controls,'Novo encontro',() => this.encounterEditor(),'plus');
    const encounters=this.m.encounters.filter(e => !this.campaign || e.campaign===this.campaign);
    if (!encounters.length) return info(list,'Prepare um encontro com fichas do bestiário ou participantes avulsos.');
    const group=el(list,'div','brpg-mesa-list');
    for (const e of encounters) {
      const card=el(group,'article','brpg-mesa-card' + (this.focusEncounter===e.id ? ' is-current' : ''));
      el(card,'strong','',e.name);
      const entry=this.m.entries.find(x => x.id===e.entry);
      el(card,'span','brpg-hint',e.roster.length+' linhas'+(entry?' · '+entry.name:''));
      const commands=row(card);
      button(commands,'Iniciar encontro',this.run(() => this.start(e)),{icon:'play',disabled:!!running});
      button(commands,'Editar encontro',() => this.encounterEditor(e),{icon:'pencil',iconOnly:true});
      button(commands,'Excluir modelo de encontro',() => this.remove('Excluir o modelo deste encontro?',m => {
        m.encounters=m.encounters.filter(x => x.id!==e.id);
      }),{icon:'trash-2',iconOnly:true});
    }
  }
  runningPane(root, running) {
    const where=el(root,'section','brpg-mesa-panel brpg-mesa-running');
    el(where,'p','brpg-eyebrow','ENCONTRO EM ANDAMENTO');
    el(where,'h3','brpg-section-title',running.name);
    const who=running.members.find(x => x.id===running.turn), update=fn => this.updateRun(running.id,fn);
    const status=el(where,'div','brpg-mesa-turn'); status.setAttribute('aria-live','polite');
    el(status,'span','brpg-chip','Rodada '+running.round);
    el(status,'strong','','Vez de '+who.name);
    const commands=row(where);
    button(commands,'Turno anterior',this.run(() => update(r => step(r,-1))),
      {icon:'chevron-left',iconOnly:true,disabled:running.round===1 && who.id===running.members[0].id});
    cta(commands,'Próximo turno',this.run(() => update(r => step(r,1))),'chevron-right');
    button(commands,'Adicionar participante',() => this.addParticipant(),{icon:'user-plus',iconOnly:true});
    button(commands,'Encerrar encontro',() => this.remove('Encerrar o encontro? O modelo salvo será mantido.',m => {
      requireMesa(m.running?.id===running.id,'O encontro já foi encerrado.');
      m.running=null;
    }),{icon:'square',iconOnly:true});
    this.plugin.ultra?.renderCombat(this,where,running);
    const orderList=el(where,'div','brpg-mesa-list');
    for (const member of running.members) {
      const card=el(orderList,'article','brpg-mesa-card'+(member.id===running.turn?' is-current':''));
      if (member.id===running.turn) card.setAttribute('aria-current','step');
      const title=el(card,'div','brpg-mesa-participant');
      const side=el(title,'div');
      el(side,'strong','',member.name);
      el(side,'span','brpg-hint',SIDES[member.side]);
      el(title,'span','brpg-chip','Iniciativa '+member.initiative);
      for (const [i,meter] of member.resources.entries()) {
        const actions=el(card,'div','brpg-mesa-meter');
        el(actions,'span','',meter.name);
        button(actions,'Reduzir '+meter.name,this.run(() => update(r => changeResource(r,member.id,i,-1))),
          {icon:'minus',iconOnly:true,disabled:meter.value===0});
        el(actions,'strong','',meter.value+'/'+meter.max);
        button(actions,'Aumentar '+meter.name,this.run(() => update(r => changeResource(r,member.id,i,1))),
          {icon:'plus',iconOnly:true,disabled:meter.value===meter.max});
      }
      if (member.conditions.length) {
        const chips=el(card,'div','brpg-metadata');
        for (const state of member.conditions) el(chips,'span','brpg-chip',state);
      }
      const options=row(card);
      if (member.sheet) button(options,'Ver ficha',() => new SheetPreview(this.plugin,member.sheet).open(),{icon:'eye',iconOnly:true});
      button(options,'Ajustar participante',() => this.edit('Ajustar participante',{
        name:member.name, initiative:member.initiative, conditions:member.conditions.join(', '), resources:copy(member.resources),
      },(editor,draft) => {
        textFields(editor,draft,[['name','Nome',120],['conditions','Condições separadas por vírgula',1500]]);
        inlineNumber(editor,'Iniciativa',draft.initiative,v => { draft.initiative=v; },-20000000,20000000);
        for (const item of draft.resources) inlineNumber(editor,item.name,item.value,v => { item.value=v; },0,item.max);
      },v => update(r => {
        const target=need(r.members,member.id,'Participante não encontrado.');
        requireMesa(clean(v.name) && whole(v.initiative,-20000000,20000000),'Informe um nome e uma iniciativa inteira.');
        target.name=clean(v.name); target.initiative=v.initiative;
        target.conditions=[...new Set(v.conditions.split(',').map(x => clean(x,60)).filter(Boolean))].slice(0,20);
        target.resources=v.resources; order(r.members);
      })),{icon:'pencil',iconOnly:true});
      button(options,'Remover participante',() => this.remove('Remover '+member.name+' do encontro?',m => {
        const active=m.running;
        requireMesa(active?.id===running.id && active.members.length>1,'Encerre o encontro para remover o último participante.');
        if (active.turn===member.id) step(active);
        active.members=active.members.filter(x => x.id!==member.id);
      }),{icon:'user-minus',iconOnly:true,disabled:running.members.length===1});
    }
  }
}
async function openMesa(plugin, tab, main = true) {
  const ws=plugin.app.workspace, existing=ws.getLeavesOfType(MESA_VIEW);
  let leaf=main ? existing.find(l => l===plugin.mesaMainLeaf || l.getRoot?.()===ws.rootSplit) : existing[0];
  if (!leaf) {
    leaf=(main?ws.getLeaf('tab'):ws.getRightLeaf(false))||ws.getLeaf('tab');
    await leaf.setViewState({type:MESA_VIEW,active:true});
  }
  if (main) plugin.mesaMainLeaf=leaf;
  await ws.revealLeaf(leaf);
  if (tab) leaf.view.show(tab);
  return leaf.view;
}
function parseConfig(source) {
  const text=source.trim();
  requireMesa(text.length>0 && text.length<=150000,'O bloco precisa conter de 1 a 150 mil caracteres.');
  return text.startsWith('{') ? JSON.parse(text) : parseYaml(text);
}
const Child=MarkdownRenderChild||class {};
class MesaEmbed extends Child {
  constructor(host,plugin,source,sheet) { super(host); this.host=host; this.plugin=plugin; this.source=source; this.sheet=sheet; }
  onload() { this.plugin.mesaEmbeds.add(this); this.render(); }
  onunload() { this.plugin.mesaEmbeds.delete(this); }
  render() {
    const p=this.plugin, m=p.mesa();
    this.host.replaceChildren();
    const root=el(this.host,'section','brpg brpg-mesa-embed');
    try {
      const config=parseConfig(this.source);
      requireMesa(config && typeof config==='object' && !Array.isArray(config),'Informe um objeto YAML ou JSON no bloco.');
      if (this.sheet) {
        const data=config.ref ? find(m.sheets,config.ref) : yamlSheet(config);
        requireMesa(data,'Ficha não encontrada. Confira o nome ou ID em ref.');
        renderSheet(root,p,data); return;
      }
      let e;
      if (config.ref) e=find(m.encounters,config.ref);
      else {
        const campaign=config.campaign ? find(m.campaigns,config.campaign) : null;
        requireMesa(!config.campaign || campaign,'Campanha do encontro não encontrada.');
        e={...newEncounter(campaign?.id || ''),name:clean(config.name),grouped:config.grouped===true,
          roster:sourceRoster(config.creatures || config.participants,m,campaign?.id || '')};
        checkEncounter(e);
      }
      requireMesa(e,'Encontro não encontrado. Confira o nome ou ID em ref.');
      const box=panel(root,e.name,e.roster.length+' linhas de participantes');
      button(row(box),'Iniciar encontro',() => p.attempt(async () => {
        await p.changeMesa(state => {
          requireMesa(!state.running,'Finalize o encontro em andamento antes de abrir outro.');
          state.running=buildRunning(e,state);
        });
        await p.openMesa('encounters');
      }),{icon:'play',disabled:!!m.running});
    } catch (e) { info(root,e.message || 'Não foi possível mostrar o bloco.'); }
  }
}
function registerMesaEmbeds(plugin) {
  for (const [name, sheet] of [['brpg-ficha',true],['brpg-encontro',false]]) {
    plugin.registerMarkdownCodeBlockProcessor(name,(source,host,ctx) => ctx.addChild(new MesaEmbed(host,plugin,source,sheet)));
  }
}
function renameMesaNotes(m,oldPath,newPath) {
  const move=value => typeof value==='string' && (value===oldPath || value.startsWith(oldPath+'/')) ? newPath+value.slice(oldPath.length) : value;
  let changed=false;
  for (const item of [...m.campaigns,...m.entries,...m.sheets,...(m.running?.members.map(p => p.sheet).filter(Boolean) || [])]) {
    for (const attr of ['note','image']) {
      const next=move(item[attr]);
      if (next!==item[attr]) { item[attr]=next; changed=true; }
    }
  }
  return changed;
}
module.exports={MESA_VIEW,TABS,MesaView,openMesa,registerMesaEmbeds,renameMesaNotes};
