'use strict';
const { CalendarEngine, MAX_YEAR, clockText }=require('./calendar');
const { CONDITIONS,weatherDay }=require('./weather');
const { el,button,select,input,info,Confirm }=require('./ui');
const { step, requireMesa }=require('./mesa');
const { sessionInfo,startSession,setSessionStatus,setSessionLocation,addSessionNote,finishSession }=require('./session');
const { unpack,place }=require('./atlas');

const row=root=>el(root,'div','brpg-toolbar brpg-session-actions');
function panel(root,title,icon=''){
 const out=el(root,'section','brpg-mesa-panel brpg-session-panel');
 const header=el(out,'div','brpg-session-panel-head');
 if(icon)el(header,'span','brpg-session-panel-icon',icon);
 el(header,'h3','brpg-section-title',title);
 return out;
}
function labelSelect(root,name,opts,value,fn){
 const container=el(root,'label','brpg-field brpg-session-field');
 el(container,'span','brpg-label',name);
 return select(container,opts,value,fn,name);
}
const run=(plugin,fn)=>()=>plugin.attempt(fn);
function stat(root,icon,title,value,detail,action){
 const container=el(root,'div','brpg-session-stat');
 const heading=el(container,'div','brpg-session-stat-top');
 el(heading,'span','brpg-session-stat-icon',icon);
 el(heading,'span','brpg-session-stat-title',title);
 el(container,'strong','brpg-session-stat-value',value);
 if(detail)el(container,'small','brpg-hint',detail);
 if(action)button(container,'Abrir '+title,action,{icon:'arrow-up-right',iconOnly:true});
 return container;
}
function calendarFor(plugin,campaign){
 return plugin.state.calendars.find(c=>c.id===campaign.calendar)||plugin.active();
}
async function openCampaignCalendar(plugin,campaign,weather=false){
 const cal=calendarFor(plugin,campaign);
 if(cal.id!==plugin.active().id)await plugin.setActive(cal.id);
 const view=await plugin.open(true);
 if(weather)view.showWeather('forecast');
 return view;
}
async function openCampaignMap(plugin,campaign,mapId='',cell=''){
 const maps=plugin.mesa().atlas?.maps.filter(m=>m.campaign===campaign.id)||[];
 const picked=mapId||maps[0]?.id||'';
 const view=await plugin.openAtlas('maps',picked);
 view.campaign=campaign.id;
 if(picked)view.mapId=picked;
 view.selected=cell;view.render();
 return view;
}
function makeContext(root,view,campaign,overview){
 const plugin=view.plugin,grid=el(root,'div','brpg-session-context');
 const cal=calendarFor(plugin,campaign);
 let dateText='Calendário não disponível',timeText='',weatherText='Sem previsão',weatherDetail='';
 if(cal){
   const engine=new CalendarEngine(cal);
   const world=plugin.worldNow(cal,engine);
   dateText=engine.format(world);timeText=clockText(world);
   if(cal.weather?.enabled){
     const regionName=overview?.cell?.region||'';
     const weatherRegion=cal.weather.regions?.find(x=>x.name.toLocaleLowerCase('pt-BR')===regionName.toLocaleLowerCase('pt-BR'));
     const day=weatherDay(cal,engine,world,MAX_YEAR,weatherRegion?.id||cal.weather.activeId);
     if(day){
       weatherText=CONDITIONS[day.condition]?.[0]||day.condition;
       const symbol=cal.weather.temperature==='F'?'°F':'°C';
       const transform=n=>Math.round(cal.weather.temperature==='F'?n*1.8+32:n);
       weatherDetail=transform(day.low)+'–'+transform(day.high)+' '+symbol+' · '+day.region;
     }
   }
 }
 const map=overview?.map||null,cell=overview?.cell||null;
 const location=map?(cell?.label||cell?.region|| (overview.session.cell?'Célula '+overview.session.cell:map.name)):'Nenhum mapa selecionado';
 const players=plugin.mesa().sheets.filter(s=>s.kind==='player'&&(!s.campaign||s.campaign===campaign.id)).length;
 const encounter=overview?.running||null;
 stat(grid,'📅','Calendário',dateText,timeText+(campaign.calendar?' · Vinculado':' · Calendário ativo'),
   run(plugin,()=>openCampaignCalendar(plugin,campaign)));
 stat(grid,'🌦','Clima',weatherText,weatherDetail||'Configure o clima no calendário',
   run(plugin,()=>openCampaignCalendar(plugin,campaign,true)));
 stat(grid,'🗺️','Localização',location,map?.name||'Abra o Atlas para definir um local',
   run(plugin,()=>openCampaignMap(plugin,campaign,map?.id||'',overview?.session.cell||'')));
 stat(grid,'⚔️','Encontro',encounter?'Rodada '+encounter.round:'Nenhum encontro ativo',
   encounter?('Turno de '+(encounter.members.find(x=>x.id===encounter.turn)?.name||'participante')):players+' personagem(ns) no bestiário',
   ()=>view.show('encounters'));
}
function renderQuickTools(root,view,campaign){
 const plugin=view.plugin,box=panel(root,'Ferramentas da sessão','⚡'),toolbar=row(box);
 const items=[
  ['Dados','dices',()=>plugin.openSolo('dice',true)],
  ['Oráculos','sparkles',()=>plugin.openSolo('oracle',true)],
  ['Baralhos','layers',()=>plugin.openSolo('deck',true)],
  ['Fichas','contact-round',()=>view.show('sheets')],
  ['Encontros','swords',()=>view.show('encounters')],
  ['Estúdio','wand-sparkles',()=>view.show('studio')],
  ['Atlas','map',()=>openCampaignMap(plugin,campaign,plugin.mesa().session?.map||'',plugin.mesa().session?.cell||'')],
  ['Relações','network',async()=>{const v=await plugin.openAtlas('relations');v.campaign=campaign.id;v.render();}]
 ];
 for(const [name,icon,fn]of items)button(toolbar,name,run(plugin,fn),{icon});
}
function renderJournal(root,view,overview){
 const plugin=view.plugin,s=overview.session,box=panel(root,'Diário rápido','📝');
 info(box,'Anotações ficam vinculadas à sessão. Ao encerrar, o diário é acrescentado ao registro da campanha.');
 input(box,'Anotação',view.sessionNoteDraft||'',v=>{view.sessionNoteDraft=v;},
   {multiline:true,rows:2,maxLength:1200});
 const actions=row(box);
 button(actions,'Registrar anotação',run(plugin,async()=>{
   const text=view.sessionNoteDraft||'';
   await plugin.changeMesa(m=>addSessionNote(m,text));
   view.sessionNoteDraft='';
 }),{icon:'plus',disabled:s.status!=='active'});
 if(overview.entry?.note)button(actions,'Abrir nota da sessão',
   run(plugin,()=>plugin.openNote(overview.entry.note)),{icon:'file-text'});
 const notes=el(box,'details','brpg-disclosure brpg-session-journal');
 el(notes,'summary','brpg-summary','Entradas do diário · '+s.journal.length);
 const entries=el(notes,'div','brpg-session-journal-entries');
 if(!s.journal.length)info(entries,'Nenhuma anotação registrada ainda.');
 for(const item of s.journal.slice(0,12)){
   const line=el(entries,'article','brpg-session-note');
   const time=Number.isNaN(Date.parse(item.time))?item.time:new Date(item.time).toLocaleString('pt-BR');
   el(line,'small','brpg-hint',time);
   el(line,'p','brpg-mesa-prose',item.text);
 }
}
function renderLocation(root,view,overview){
 const plugin=view.plugin,session=overview.session,campaign=overview.campaign;
 const box=panel(root,'Localização da sessão','📍');
 const maps=plugin.mesa().atlas?.maps.filter(m=>m.campaign===campaign.id)||[];
 if(!maps.length){
   info(box,'A campanha ainda não tem mapas. Abra o Atlas para criar um ou escolher um modelo.');
   button(row(box),'Criar ou abrir Atlas',run(plugin,()=>openCampaignMap(plugin,campaign)),{icon:'map'});
   return;
 }
 labelSelect(box,'Mapa',[['','Sem mapa'],...maps.map(m=>[m.id,m.name])],session.map,v=>
   run(plugin,async()=>{await plugin.changeMesa(m=>setSessionLocation(m,v,''));view.sessionCellDraft='';})());
 if(!session.map)return;
 const map=maps.find(x=>x.id===session.map);
 if(!map)return;
 const cells=Object.entries(map.cells).filter(([at,c])=>c.label||c.entry||c.note||c.sheet||c.encounter)
   .slice(0,120).map(([at,c])=>[at,(c.label||c.region||'Local')+' · '+at]);
 labelSelect(box,'Locais marcados',[['','Escolher pelo mapa'],...cells],cells.some(x=>x[0]===session.cell)?session.cell:'',
   at=>{view.sessionCellDraft=at;});
 input(box,'Coordenadas (coluna,linha)',view.sessionCellDraft??session.cell,v=>{view.sessionCellDraft=v;},{maxLength:12});
 const actions=row(box);
 button(actions,'Salvar localização',run(plugin,async()=>{
   const text=(view.sessionCellDraft??session.cell).trim();
   await plugin.changeMesa(m=>setSessionLocation(m,session.map,text));
   view.sessionCellDraft=null;
 }),{icon:'map-pin'});
 button(actions,'Mostrar no mapa',run(plugin,()=>openCampaignMap(plugin,campaign,session.map,session.cell)),{icon:'map'});
}
function renderRunning(root,view,overview){
 const m=view.plugin.mesa(),running=m.running;
 if(!running)return;
 const box=panel(root,'Combate em andamento','⚔️');
 if(running.campaign!==overview.campaign.id){
   info(box,'Existe um encontro ativo em outra campanha. A Mesa mantém um único combate por vez.');
   return;
 }
 const actor=running.members.find(x=>x.id===running.turn);
 const heading=el(box,'div','brpg-session-combat');
 el(heading,'strong','','Rodada '+running.round);
 el(heading,'span','brpg-chip',actor?.name||'Participante');
 const toolbar=row(box);
 button(toolbar,'Abrir combate',()=>view.show('encounters'),{icon:'swords'});
 button(toolbar,'Próximo turno',run(view.plugin,()=>view.plugin.changeMesa(m=>{
   requireMesa(m.running?.id===running.id,'O encontro foi alterado.');
   step(m.running,1);
 })),{icon:'chevron-right',disabled:overview.session.status!=='active'});
}
function renderStart(root,view,campaign){
 const plugin=view.plugin,m=plugin.mesa(),box=panel(root,'Iniciar sessão','▶');
 if(!campaign)return info(box,'Crie uma campanha na aba Campanhas para iniciar uma sessão.');
 info(box,'Crie um registro novo ou retome um registro de sessão existente. O diário e a localização serão restaurados quando reabrir o Obsidian.');
 const entries=m.entries.filter(e=>e.campaign===campaign.id&&e.kind==='session');
 labelSelect(box,'Registro existente',[['','Nova sessão'],...entries.map(e=>[e.id,e.name])],view.sessionEntryDraft||'',
   v=>{view.sessionEntryDraft=v;});
 button(row(box),view.sessionEntryDraft?'Iniciar registro escolhido':'Iniciar nova sessão',run(plugin,async()=>{
   const c=plugin.state.calendars.find(x=>x.id===campaign.calendar);
   let date;
   if(c){const engine=new CalendarEngine(c),now=plugin.worldNow(c,engine);date={calendar:c.id,date:now,label:engine.format(now)};}
   const chosen=view.sessionEntryDraft||'';
   await plugin.changeMesa(m=>startSession(m,campaign.id,chosen,date||{}));
   view.campaign=campaign.id;view.sessionEntryDraft='';view.show('dashboard');
 }),{icon:'play',className:'brpg-button mod-cta'});
}
function renderSessionDashboard(view,root){
 const plugin=view.plugin,m=plugin.mesa(),session=m.session;
 const chosen=m.campaigns.find(x=>x.id===view.campaign)||m.campaigns.find(x=>x.id===session?.campaign)||m.campaigns[0];
 const intro=el(root,'header','brpg-session-intro');
 el(intro,'p','brpg-eyebrow','CENTRAL DE SESSÃO');
 el(intro,'h3','brpg-session-title',chosen?.name||'Sua próxima aventura');
 if(!m.campaigns.length){
   info(root,'Crie sua primeira campanha para reunir mapas, calendário, fichas, dados e encontros numa só tela.');
   button(row(root),'Criar campanha',()=>view.campaignEditor(),{icon:'plus',className:'brpg-button mod-cta'});
   return;
 }
 if(session&&session.campaign!==chosen.id){
   const notice=panel(root,'Outra sessão em andamento','ℹ');
   info(notice,'Há uma sessão ativa ou pausada na campanha '+(m.campaigns.find(x=>x.id===session.campaign)?.name||'desconhecida')+'.');
   button(row(notice),'Abrir sessão atual',()=>{view.campaign=session.campaign;view.render();},{icon:'play'});
   makeContext(root,view,chosen,null);
   renderQuickTools(root,view,chosen);
   return;
 }
 if(!session){
   makeContext(root,view,chosen,null);
   renderStart(root,view,chosen);
   renderQuickTools(root,view,chosen);
   return;
 }
 const overview=sessionInfo(m,plugin.state.calendars);
 const header=panel(root,overview.entry?.name||'Sessão atual','🎲');
 const tag=el(header,'div','brpg-session-status');
 el(tag,'span','brpg-chip',session.status==='active'?'Em andamento':'Pausada');
 el(tag,'span','brpg-hint',overview.campaign?.name||'Campanha');
 const buttons=row(header);
 button(buttons,session.status==='active'?'Pausar sessão':'Retomar sessão',
   run(plugin,()=>plugin.changeMesa(m=>setSessionStatus(m,session.status==='active'?'paused':'active'))),
   {icon:session.status==='active'?'pause':'play'});
 button(buttons,'Encerrar sessão',()=>{
   new Confirm(plugin.app,'Encerrar a sessão? O diário será guardado no registro e o encontro, se houver, permanecerá na Mesa.',
     ()=>plugin.changeMesa(m=>finishSession(m))).open();
 },{icon:'square'});
 if(overview.entry?.note)
   button(buttons,'Abrir nota',run(plugin,()=>plugin.openNote(overview.entry.note)),{icon:'file-text'});
 makeContext(root,view,chosen,overview);
 renderRunning(root,view,overview);
 renderQuickTools(root,view,chosen);
 renderLocation(root,view,overview);
 renderJournal(root,view,overview);
}
module.exports={renderSessionDashboard,calendarFor,openCampaignCalendar,openCampaignMap};
