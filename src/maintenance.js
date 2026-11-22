'use strict';
const {copy,assert,validateCalendar,CalendarEngine}=require('./calendar');
const {validateSolo,defaultSolo,key}=require('./solo');
const {checkMesa}=require('./mesa');
const {ensureSky}=require('./sky');
const {ensureWeather}=require('./weather');
const {ensureEclipseOrbits}=require('./eclipse');
const {ensureClock}=require('./world-clock');
const FORMAT='basic-rpg-backup', MAX_BYTES=25*1024*1024;
function validateState(source,now=Date.now()){
 const s=copy(source);
 assert(s&&s.version===1&&Array.isArray(s.calendars)&&s.calendars.length>0,'Formato de dados do Basic RPG inválido.');
 const ids=new Set();
 for(const c of s.calendars){
  validateCalendar(c);assert(!ids.has(c.id),'IDs de calendário duplicados.');ids.add(c.id);
  ensureSky(c,new CalendarEngine(c).yearInfo(1).total);ensureEclipseOrbits(c);ensureClock(c,now);ensureWeather(c);validateCalendar(c);
 }
 assert(ids.has(s.activeId),'Calendário ativo inválido.');
 for(const c of s.calendars)if(c.clockLink){
  const parent=s.calendars.find(x=>x.id===c.clockLink.id);
  assert(parent&&parent.id!==c.id&&!parent.clockLink,'Relógio vinculado inválido.');
 }
 if(s.solo!==undefined){validateSolo(s.solo);s.solo.settings={...defaultSolo().settings,...s.solo.settings};}
 if(s.mesa!==undefined)checkMesa(s.mesa);
 return s;
}
function withinBackupLimit(text){
 if(typeof text!=='string'||!text.length||text.length>MAX_BYTES)return false;
 return new TextEncoder().encode(text).byteLength<=MAX_BYTES;
}
function encodeBackup(state,now=Date.now()){
 const text=JSON.stringify({format:FORMAT,version:1,createdAt:new Date(now).toISOString(),state},null,2)+'\n';
 assert(withinBackupLimit(text),'Backup acima do limite de 25 MiB em UTF-8. Faça uma cópia externa do data.json.');
 return text;
}
function decodeBackup(text,now=Date.now()){
 assert(withinBackupLimit(text),'Backup vazio ou acima do limite de 25 MiB em UTF-8.');
 let b;try{b=JSON.parse(text);}catch{throw new Error('O backup não contém JSON válido.');}
 assert(b?.format===FORMAT&&b.version===1&&b.state,'Arquivo não reconhecido como backup completo do Basic RPG.');
 return validateState(b.state,now);
}
function backupStats(s){
 const m=s.mesa||{};
 return {calendars:s.calendars.length,campaigns:m.campaigns?.length||0,entries:m.entries?.length||0,
 sheets:m.sheets?.length||0,encounters:m.encounters?.length||0,maps:m.atlas?.maps?.length||0,dice:s.solo?.dice?.length||0,decks:s.solo?.decks?.length||0};
}
const TYPES={calendar:'Calendário',campaign:'Campanha',entry:'Registro',sheet:'Ficha',encounter:'Encontro',map:'Mapa',cell:'Local no mapa',die:'Dado',deck:'Baralho'};
function searchWorld(state,query='',kind='',campaign='',limit=60){
 const q=key(query).trim(),terms=q.split(/\s+/).filter(Boolean),m=state.mesa||{},out=[];
 const add=(type,item,extra={})=>{
  if(kind&&kind!==type)return;
  if(campaign&&extra.campaign&&extra.campaign!==campaign)return;
  const title=String(item.name||item.title||'').slice(0,120);if(!title)return;
  const description=String(extra.description||'').slice(0,500);
  const hay=key(title+' '+description),name=key(title);
  if(terms.some(t=>!hay.includes(t)))return;
  const score=q?(name===q?100:name.startsWith(q)?60:name.includes(q)?40:10):0;
  out.push({type,id:item.id,title,description,campaign:extra.campaign||'',map:extra.map||'',cell:extra.cell||'',score});
 };
 for(const c of state.calendars||[])add('calendar',c,{description:c.description});
 for(const c of m.campaigns||[])add('campaign',c,{campaign:c.id,description:c.summary});
 for(const [field,type]of [['entries','entry'],['sheets','sheet'],['encounters','encounter']])
  for(const item of m[field]||[])add(type,item,{campaign:item.campaign,description:item.summary||item.description||item.type||item.kind});
 for(const map of m.atlas?.maps||[]){
  add('map',map,{campaign:map.campaign,description:map.description});
  for(const [at,cell]of Object.entries(map.cells||{}))if(cell.label||cell.region)
   add('cell',{id:map.id+':'+at,name:cell.label||cell.region},{campaign:map.campaign,map:map.id,cell:at,description:[map.name,cell.region,at].filter(Boolean).join(' · ')});
 }
 for(const d of state.solo?.dice||[])add('die',d);
 for(const d of state.solo?.decks||[])add('deck',d);
 return out.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,'pt')).slice(0,Math.min(100,Math.max(1,limit)));
}
module.exports={FORMAT,MAX_BYTES,validateState,encodeBackup,decodeBackup,backupStats,TYPES,searchWorld};
