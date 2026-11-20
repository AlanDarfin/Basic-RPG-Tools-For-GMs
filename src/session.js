'use strict';
const {uid}=require('./calendar');
const {clean}=require('./solo');
const {requireMesa,newEntry}=require('./mesa');
const {unpack,inMap}=require('./atlas');

const MAX_JOURNAL=120;
const validTimestamp=s=>typeof s==='string'&&s.length<=40&&!Number.isNaN(Date.parse(s));
const nowString=()=>new Date().toISOString();

function checkSession(m){
 for(const entry of m.entries||[]){
   if(entry.sessionJournal!==undefined)
     requireMesa(Array.isArray(entry.sessionJournal)&&entry.sessionJournal.length<=10000&&
       entry.sessionJournal.every(x=>x&&clean(x.id)&&validTimestamp(x.time)&&
         typeof x.text==='string'&&x.text.length<=1200&&!!x.text.trim()),
       'Diário arquivado inválido.');
 }
 const s=m.session;
 if(s===undefined||s===null)return true;
 requireMesa(s&&typeof s==='object'&&!Array.isArray(s)&&clean(s.id)&&
   ['active','paused'].includes(s.status)&&validTimestamp(s.startedAt),'Sessão ativa inválida.');
 const camp=m.campaigns.find(x=>x.id===s.campaign);
 requireMesa(!!camp,'Campanha da sessão não encontrada.');
 const entry=m.entries.find(x=>x.id===s.entry);
 requireMesa(!!entry&&entry.campaign===s.campaign&&entry.kind==='session','O registro de sessão deve existir na mesma campanha.');
 if(s.map){
   const map=m.atlas?.maps.find(x=>x.id===s.map);
   requireMesa(!!map&&map.campaign===s.campaign,'Mapa da sessão não encontrado nessa campanha.');
   if(s.cell){
     const at=unpack(s.cell);
     requireMesa(at&&inMap(map,at.col,at.row),'Localização da sessão inválida.');
   }
 }else requireMesa(!s.cell,'Uma célula da sessão requer um mapa.');
 requireMesa(Array.isArray(s.journal)&&s.journal.length<=MAX_JOURNAL&&s.journal.every(x=>
   x&&clean(x.id)&&validTimestamp(x.time)&&typeof x.text==='string'&&x.text.length<=1200&&!!x.text.trim()),
   'Anotações da sessão inválidas.');
 return true;
}
function nextName(m,campaign){
 const used=m.entries.filter(x=>x.campaign===campaign&&x.kind==='session');
 return 'Sessão '+(used.length+1);
}
function newSessionEntry(m,campaign,options={}){
 requireMesa(m.campaigns.some(c=>c.id===campaign),'Campanha não encontrada.');
 const e=newEntry(campaign);
 e.kind='session';e.name=clean(options.name,120)||nextName(m,campaign);
 if(options.calendar&&options.date&&options.label)
   e.date={calendar:options.calendar,date:options.date,label:clean(options.label,180)};
 m.entries.push(e);
 return e;
}
function startSession(m,campaign,entry='',options={}){
 requireMesa(!m.session,'Finalize a sessão atual antes de iniciar outra.');
 const c=m.campaigns.find(x=>x.id===campaign);
 requireMesa(!!c,'Escolha uma campanha existente.');
 const chosen=entry?m.entries.find(x=>x.id===entry):newSessionEntry(m,campaign,options);
 requireMesa(chosen&&chosen.campaign===campaign&&chosen.kind==='session','Escolha um registro do tipo Sessão da campanha.');
 m.session={id:uid('session'),status:'active',campaign,entry:chosen.id,
   map:'',cell:'',startedAt:nowString(),journal:[]};
 if(options.map)setSessionLocation(m,options.map,options.cell||'');
 checkSession(m);
 return m.session;
}
function setSessionStatus(m,status){
 requireMesa(m.session,'Nenhuma sessão iniciada.');
 requireMesa(['active','paused'].includes(status),'Estado da sessão inválido.');
 m.session.status=status;return m.session;
}
function setSessionLocation(m,mapId='',cell=''){
 requireMesa(m.session,'Inicie uma sessão para marcar a localização.');
 requireMesa(!cell||!!mapId,'Selecione um mapa antes da célula.');
 if(!mapId){m.session.map='';m.session.cell='';return m.session;}
 const map=m.atlas?.maps.find(x=>x.id===mapId);
 requireMesa(map&&map.campaign===m.session.campaign,'Este mapa não pertence à campanha da sessão.');
 if(cell){
   const p=unpack(cell);
   requireMesa(p&&inMap(map,p.col,p.row),'Digite coordenadas válidas no formato coluna,linha.');
 }
 m.session.map=mapId;m.session.cell=cell;return m.session;
}
function addSessionNote(m,text){
 const s=m.session;
 requireMesa(s,'Nenhuma sessão iniciada.');
 const note=clean(text,1200);
 requireMesa(note&&typeof text==='string'&&text.trim().length<=1200,'A anotação precisa ter de 1 a 1200 caracteres.');
 requireMesa(s.journal.length<MAX_JOURNAL,'Diário cheio. Encerre a sessão e comece outro registro.');
 const entry={id:uid('note'),time:nowString(),text:note};
 s.journal.unshift(entry);
 return entry;
}
function finishSession(m){
 const s=m.session;
 requireMesa(!!s,'Nenhuma sessão em andamento.');
 const entry=m.entries.find(e=>e.id===s.entry);
 requireMesa(!!entry,'Registro da sessão não encontrado.');
 const location=s.map?'\nLocal: '+(m.atlas?.maps.find(x=>x.id===s.map)?.name||s.map)+(s.cell?' ('+s.cell+')':''):'';
 const lines=s.journal.slice().reverse().map(n=>'- '+n.time.slice(0,16).replace('T',' ')+' · '+n.text.replace(/\n/g,' / '));
 // Archive the complete structured diary independently of summary size.
 entry.sessionJournal ||= [];
 requireMesa(entry.sessionJournal.length+s.journal.length<=10000,'Diário do registro cheio. Exporte o histórico antes de acrescentar outra sessão.');
 entry.sessionJournal.push(...s.journal.slice().reverse());
 const note=('\n\n### Diário da sessão'+location+'\n'+(lines.length?lines.join('\n'):'Sem anotações.'));
 const max=10000;
 const previous=String(entry.summary||'').slice(0,max);
 const space=Math.max(0,max-previous.length);
 entry.summary=previous+(space>0?note.slice(-space):'');
 m.session=null;
 return entry;
}
function sessionInfo(m,calendars=[]){
 const s=m.session;
 if(!s)return null;
 const campaign=m.campaigns.find(c=>c.id===s.campaign);
 const entry=m.entries.find(e=>e.id===s.entry);
 const map=m.atlas?.maps.find(x=>x.id===s.map)||null;
 const cell=map&&s.cell?map.cells[s.cell]||{}:null;
 const calendar=calendars.find(c=>c.id===campaign?.calendar)||null;
 const running=m.running?.campaign===s.campaign?m.running:null;
 const players=m.sheets.filter(x=>x.campaign===s.campaign&&x.kind==='player');
 return {session:s,campaign,entry,map,cell,calendar,running,players};
}
module.exports={MAX_JOURNAL,checkSession,nextName,newSessionEntry,startSession,
 setSessionStatus,setSessionLocation,addSessionNote,finishSession,sessionInfo};
