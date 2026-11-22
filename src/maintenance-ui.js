'use strict';
const {Modal,Notice,TFile}=require('obsidian');
const {el,button,input,select,info}=require('./ui');
const {decodeBackup,backupStats,TYPES,searchWorld,MAX_BYTES}=require('./maintenance');
const {assert}=require('./calendar');
const run=(p,fn)=>()=>p.attempt(fn);
class BackupModal extends Modal{
 constructor(p){super(p.app);this.p=p;this.path='';this.candidate=null;this.confirm='';this.inspection=0;}
 onOpen(){this.draw();}
 draw(){
  const p=this.p,root=this.contentEl;root.replaceChildren();
  const box=el(root,'section','brpg brpg-maintenance');
  el(box,'h2','brpg-heading','Backup e restauração');
  info(box,'O backup completo contém calendários, campanhas, sessões, fichas, mapas e ferramentas solo, incluindo segredos do mestre. Não contém o conteúdo das notas, imagens ou outros arquivos do cofre.');
  button(box,'Criar backup completo',run(p,async()=>{const path=await p.backupWorld();new Notice('Backup salvo: '+path);}),{icon:'download',disabled:p.readOnly});
  const files=(p.app.vault.getFiles?.()||[]).filter(f=>/^Basic-RPG-Backup-.*\.json$/i.test(f.path)).sort((a,b)=>b.path.localeCompare(a.path));
  select(box,[['','Escolher backup do cofre'],...files.map(f=>[f.path,f.path])],this.path,v=>{this.path=v;this.candidate=null;this.confirm='';this.inspection++;this.draw();},'Backup do cofre');
  input(box,'Caminho do arquivo JSON',this.path,v=>{this.path=v;this.candidate=null;this.confirm='';this.inspection++;},{maxLength:500});
  button(box,'Inspecionar backup',run(p,async()=>{
   const request=++this.inspection,path=this.path;
   this.candidate=null;this.confirm='';this.draw();
   const f=p.app.vault.getAbstractFileByPath(path);assert(f instanceof TFile,'Arquivo não encontrado.');
   assert((f.stat?.size??0)<=MAX_BYTES,'Backup acima do limite de 25 MiB.');
   const source=await p.app.vault.cachedRead(f);
   if(request!==this.inspection||path!==this.path)return;
   this.candidate=decodeBackup(source,p.clockNow());this.draw();
  }),{icon:'file-search'});
  if(this.candidate){
   const stats=backupStats(this.candidate);const facts=el(box,'div','brpg-metadata');
   for(const [key,label]of Object.entries({calendars:'Calendários',campaigns:'Campanhas',entries:'Registros',sheets:'Fichas',encounters:'Encontros',maps:'Mapas',dice:'Dados',decks:'Baralhos'}))
    el(facts,'span','brpg-chip',label+' '+stats[key]);
   info(box,'A restauração substitui todos os dados atuais; primeiro será gravado um backup de segurança. Não mescla campanhas. Digite RESTAURAR para confirmar.');
   const field=input(box,'Confirmação',this.confirm,v=>{this.confirm=v;go.disabled=v!=='RESTAURAR'||p.readOnly;},{maxLength:20});
   const go=button(box,'Restaurar backup',run(p,async()=>{
    assert(this.confirm==='RESTAURAR'&&this.candidate,'Inspecione e confirme primeiro.');
    const path=await p.restoreWorld(this.candidate);
    this.close();new Notice('Backup restaurado. Cópia anterior: '+path,8000);
   }),{icon:'history',disabled:this.confirm!=='RESTAURAR'||p.readOnly});
  }
  if(p.readOnly)info(box,'Modo de segurança: a gravação está bloqueada. Preserve o data.json original e restaure uma cópia externa com o Obsidian fechado.');
 }
}
class WorldSearchModal extends Modal{
 constructor(p){super(p.app);this.p=p;this.query='';this.kind='';this.campaign='';}
 onOpen(){
  const p=this.p,root=this.contentEl;root.replaceChildren();
  const box=el(root,'section','brpg brpg-maintenance');
  el(box,'h2','brpg-heading','Pesquisa global de RPG');
  input(box,'Pesquisar',this.query,v=>{this.query=v;draw();},{maxLength:120});
  select(box,[['','Todos os tipos'],...Object.entries(TYPES)],this.kind,v=>{this.kind=v;draw();},'Tipo');
  select(box,[['','Todas as campanhas'],...p.mesa().campaigns.map(c=>[c.id,c.name])],this.campaign,v=>{this.campaign=v;draw();},'Campanha');
  const results=el(box,'div','brpg-world-results');
  const draw=()=>{
   results.replaceChildren();
   const hits=searchWorld(p.state,this.query,this.kind,this.campaign);
   if(!hits.length)return info(results,'Nenhum resultado encontrado.');
   for(const hit of hits){
    const item=el(results,'article','brpg-world-result');
    el(item,'strong','',hit.title);el(item,'small','brpg-hint',TYPES[hit.type]+(hit.campaign?' · '+(p.mesa().campaigns.find(c=>c.id===hit.campaign)?.name||''):''));
    if(hit.description)el(item,'p','brpg-hint',hit.description);
    button(item,'Abrir',run(p,async()=>{
     await openResult(p,hit);this.close();
    }),{icon:'arrow-up-right'});
   }
  };draw();
 }
}
async function openResult(p,h){
 if(h.type==='calendar'){await p.setActive(h.id);await p.open(true);return;}
 if(h.type==='map'||h.type==='cell'){
  const v=await p.openAtlas('maps',h.map||h.id);v.campaign=h.campaign;v.mapId=h.map||h.id;v.selected=h.cell||'';v.render();return;
 }
 if(h.type==='die'||h.type==='deck'){await p.openSolo(h.type==='die'?'dice':'deck',true);return;}
 const tab=h.type==='sheet'?'sheets':h.type==='encounter'?'encounters':'campaigns';
 const v=await p.openMesa(tab);v.campaign=h.campaign||'';
 if(h.type==='entry')v.focusEntry=h.id;
 if(h.type==='encounter')v.focusEncounter=h.id;
 v.filter=h.type==='sheet'?h.title:'';v.render();
}
module.exports={BackupModal,WorldSearchModal,openResult};
