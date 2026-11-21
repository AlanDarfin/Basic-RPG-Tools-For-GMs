'use strict';
const {copy,uid}=require('./calendar');
const {clean,key,clamp}=require('./solo');
const {newSheet,arkanisSheet,checkSheet,newEntry,newEncounter,checkEncounter,requireMesa,LIMITS}=require('./mesa');
const {unpack,inMap,setCell}=require('./atlas');

const PRESETS=[
 ['arkanis','Arkanis'],['hero','Herói genérico'],['npc','NPC de interação'],['creature','Criatura de combate'],['investigator','Investigador']
];
function presetSheet(id,campaign=''){
 requireMesa(PRESETS.some(p=>p[0]===id),'Modelo inexistente.');
 if(id==='arkanis')return arkanisSheet(campaign);
 const s=newSheet(campaign);
 const res=(name,max,value=max,rest='max')=>({name,max,value,rest});
 const attr=(name,value)=>({name,value:String(value)});
 const action=(name,roll,damage='',cost='',extra={})=>({name,roll,damage,cost,text:'',group:'Ação',...extra});
 if(id==='hero'){
  s.name='Herói';s.kind='player';s.attributes=[attr('Defesa',12),attr('Força',2),attr('Vontade',1)];
  s.resources=[res('Vida',12),res('Energia',6)];s.actions=[action('Golpe','1d20+2','1d6','',{defense:'Defesa'}),action('Recuperar','','1d4','Energia:1',{resolution:'heal'})];
 }else if(id==='npc'){
  s.name='NPC';s.kind='npc';s.attributes=[attr('Defesa',10),attr('Persuasão',2),attr('Vontade',1)];
  s.resources=[res('Vida',8)];s.actions=[action('Negociar','1d20+2')];
 }else if(id==='creature'){
  s.name='Criatura';s.attributes=[attr('CA',12),attr('Vontade',0)];s.resources=[res('Vida',8)];s.actions=[action('Ataque','1d20+2','1d6')];
 }else{
  s.name='Investigador';s.kind='player';s.attributes=[attr('Defesa',10),attr('Investigação',3),attr('Vontade',2)];
  s.resources=[res('Vida',8),res('Estresse',10,0,'zero')];s.actions=[action('Investigar','1d20+3'),action('Resistir','1d20+2')];
 }
 s.type='Exemplo editável';return checkSheet(s);
}
function templateList(m){return m.sheetTemplates||[];}
function checkTemplates(m){
 const t=templateList(m);
 requireMesa(Array.isArray(t)&&t.length<=100,'Biblioteca de modelos inválida ou cheia.');
 const ids=new Set();
 for(const s of t){
  checkSheet(s);requireMesa(!s.campaign&&!s.note&&!s.image&&!ids.has(s.id),'Modelo de ficha inválido ou duplicado.');ids.add(s.id);
 }
}
function saveTemplate(m,source,name){
 const s=copy(source);s.id=uid('template');s.name=clean(name);s.campaign='';s.note='';s.image='';
 checkSheet(s);m.sheetTemplates ||= [];
 requireMesa(m.sheetTemplates.length<100,'Limite de 100 modelos.');
 m.sheetTemplates.push(s);return s;
}
function instantiateTemplate(m,id,campaign){
 if(PRESETS.some(p=>p[0]===id))return presetSheet(id,campaign);
 const original=templateList(m).find(x=>x.id===id);requireMesa(original,'Modelo removido.');
 const s=copy(original);s.id=uid('sheet');s.campaign=campaign||'';return s;
}
function adventureDraft(rng=Math.random){
 const {randomContent}=require('./ultra');
 const hook=randomContent('hook',rng),site=randomContent('site',rng),npc=randomContent('npc',rng),loot=randomContent('loot',rng),scene=randomContent('encounter',rng);
 return {title:hook.title,hook:hook.body,site:site.title,siteText:site.body,npc:npc.title,npcText:npc.body,
 clue:loot.title,clueText:loot.body,scene:scene.title,sceneText:scene.body,map:'',cell:''};
}
function saveAdventure(m,campaign,draft,date=null){
 requireMesa(m.campaigns.some(x=>x.id===campaign),'Escolha uma campanha.');
 requireMesa(m.entries.length+5<=LIMITS.entries&&m.sheets.length<LIMITS.sheets&&m.encounters.length<LIMITS.encounters,'Biblioteca cheia.');
 const fields=['title','site','npc','clue','scene'];
 for(const f of fields)requireMesa(!!clean(draft[f]),'Preencha os nomes da aventura, local, NPC, pista e cena.');
 let map,coord;
 if(draft.map||draft.cell){
  map=m.atlas?.maps.find(x=>x.id===draft.map&&x.campaign===campaign);coord=unpack(draft.cell);
  requireMesa(map&&coord&&inMap(map,coord.col,coord.row),'Escolha uma célula válida da campanha.');
  const cell=map.cells[draft.cell]||{};
  requireMesa(!cell.entry&&!cell.sheet&&!cell.encounter,'A célula já possui vínculos. Escolha outra para não sobrescrevê-los.');
 }
 const create=(kind,name,summary)=>({...newEntry(campaign),kind,name:clean(name),summary:clean(summary,10000)});
 const adventure=create('adventure',draft.title,draft.hook);
 adventure.date=date?copy(date):null;
 const site=create('site',draft.site,draft.siteText),npc=create('npc',draft.npc,draft.npcText),clue=create('clue',draft.clue,draft.clueText),scene=create('scene',draft.scene,draft.sceneText);
 adventure.links=[site.id,npc.id,clue.id,scene.id];site.links=[npc.id,clue.id,scene.id];scene.links=[npc.id,clue.id,site.id];npc.links=[site.id];clue.links=[site.id];
 const sheet=presetSheet('npc',campaign);sheet.name=npc.name;sheet.description=npc.summary;sheet.type='NPC da aventura';
 const roster=m.sheets.filter(s=>s.campaign===campaign&&s.kind==='player').slice(0,30).map(s=>({sheet:s.id,name:'',side:'players',count:'1',initiative:''}));
 const encounter={...newEncounter(campaign),name:scene.name,entry:scene.id,roster:[...roster,{sheet:sheet.id,name:'',side:'neutral',count:'1',initiative:''}]};
 checkSheet(sheet);checkEncounter(encounter);
 m.entries.push(adventure,site,npc,clue,scene);m.sheets.push(sheet);m.encounters.push(encounter);
 if(map)setCell(map,coord.col,coord.row,{entry:site.id,sheet:sheet.id,encounter:encounter.id,label:map.cells[draft.cell]?.label||site.name});
 if(m.atlas){
  m.atlas.relations.push({id:uid('rel'),campaign,from:'sheet:'+sheet.id,to:'entry:'+site.id,type:'located',label:''});
 }
 return {adventure,site,npc,clue,scene,sheet,encounter};
}
// Copy back only unique, explicitly selected player instances; originals remain templates.
function carryCandidates(m,r=m.running){
 if(!r)return [];
 const counts=new Map();for(const p of r.members)if(p.sheet?.id)counts.set(p.sheet.id,(counts.get(p.sheet.id)||0)+1);
 return r.members.filter(p=>p.side==='players'&&p.sheet?.kind==='player'&&counts.get(p.sheet.id)===1&&m.sheets.some(s=>s.id===p.sheet.id&&s.kind==='player'&&(!s.campaign||s.campaign===r.campaign)));
}
function finishEncounter(m,id,persist=false){
 requireMesa(m.running?.id===id,'O encontro já foi encerrado.');
 const candidates=persist?carryCandidates(m):[];
 for(const p of candidates){
  const sheet=m.sheets.find(s=>s.id===p.sheet.id);
  m.sheetStates ||= {};
  m.sheetStates[sheet.id]=sheet.resources.map(r=>{
   const live=p.resources.find(x=>key(x.name)===key(r.name));
   const stored=m.sheetStates[sheet.id]?.find(x=>key(x.name)===key(r.name));
   return {...r,value:clamp(live?.value??stored?.value??r.value,0,r.max)};
  });
 }
 const count=candidates.length;
 m.running=null;return count;
}
module.exports={PRESETS,presetSheet,templateList,checkTemplates,saveTemplate,instantiateTemplate,adventureDraft,saveAdventure,carryCandidates,finishEncounter};
