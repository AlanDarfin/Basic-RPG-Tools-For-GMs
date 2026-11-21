'use strict';
const {setIcon}=require('obsidian');
const { CalendarEngine, MAX_YEAR, clockText }=require('./calendar');
const { CONDITIONS,weatherDay }=require('./weather');
const { el,button,select,input,info,Confirm }=require('./ui');
const { step, requireMesa,buildRunning }=require('./mesa');
const {advanceCombat}=require('./combat');
const {MODES}=require('./exploration');
const { sessionInfo,startSession,setSessionStatus,setSessionLocation,addSessionNote,finishSession }=require('./session');
const { unpack,place }=require('./atlas');

const row=root=>el(root,'div','brpg-toolbar brpg-session-actions');
function iconEl(root,name){const span=el(root,'span','brpg-session-icon');setIcon(span,name);return span;}
function panel(root,title,icon=''){
 const out=el(root,'section','brpg-mesa-panel brpg-session-panel');
 const header=el(out,'div','brpg-session-panel-head');
 if(icon)iconEl(header,icon);
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
 iconEl(heading,icon);
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
 stat(grid,'calendar-days','Calendário',dateText,timeText+(campaign.calendar?' · Vinculado':' · Calendário ativo'),
   run(plugin,()=>openCampaignCalendar(plugin,campaign)));
 stat(grid,'cloud-sun','Clima',weatherText,weatherDetail||'Configure o clima no calendário',
   run(plugin,()=>openCampaignCalendar(plugin,campaign,true)));
 stat(grid,'map','Localização',location,map?.name||'Abra o Atlas para definir um local',
   run(plugin,()=>openCampaignMap(plugin,campaign,map?.id||'',overview?.session.cell||'')));
 stat(grid,'swords','Encontro',encounter?'Rodada '+encounter.round:'Nenhum encontro ativo',
   encounter?('Turno de '+(encounter.members.find(x=>x.id===encounter.turn)?.name||'participante')):players+' personagem(ns) no bestiário',
   ()=>view.show('encounters'));
}
function renderQuickTools(root,view,campaign){
 const plugin=view.plugin,box=panel(root,'Ferramentas da sessão','zap'),toolbar=row(box);
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
 const plugin=view.plugin,s=overview.session,box=panel(root,'Diário rápido','notebook-pen');
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
 const box=panel(root,'Localização da sessão','map-pin');
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

function travelCheckbox(root,label,value,onChange){
 const wrap=el(root,'label','brpg-session-travel-option');
 const tick=el(wrap,'input');tick.type='checkbox';tick.checked=!!value;
 el(wrap,'span','',label);tick.addEventListener('change',()=>onChange(tick.checked));
 return tick;
}
function travelOptions(view){
 view.travelSettings ||= {travelMode:'walk',minutesPerUnit:60,advance:false,reveal:false,moveTokens:true};
 return {...view.travelSettings,destination:view.travelToDraft||''};
}
function renderTravel(root,view,overview){
 const plugin=view.plugin,s=overview.session,map=overview.map;
 const box=panel(root,'Exploração e viagens','route');
 if(!map||!s.cell){
   info(box,'Marque o mapa e a posição inicial do grupo. Depois será possível planejar uma rota até qualquer célula acessível.');
   button(row(box),'Escolher posição no Atlas',run(plugin,()=>openCampaignMap(plugin,overview.campaign,s.map||'',s.cell)),{icon:'map'});
   return;
 }
 if(s.status!=='active')info(box,'A sessão está pausada. Retome-a antes de movimentar o grupo.');
 const opts=view.travelSettings ||= {travelMode:'walk',minutesPerUnit:60,advance:false,reveal:false,moveTokens:true};
 const invalidate=()=>{view.travelPreview=null;};
 info(box,'Origem · '+s.cell+(map.cells[s.cell]?.label?' · '+map.cells[s.cell].label:'')+' · '+map.name);
 const target=row(box);
 input(target,'Destino (coluna,linha)',view.travelToDraft||'',v=>{view.travelToDraft=v;invalidate();},{maxLength:8});
 const places=Object.entries(map.cells).filter(([at,c])=>at!==s.cell&&(c.label||c.entry||c.note||c.encounter)).slice(0,100);
 labelSelect(box,'Destinos marcados',[['','Selecionar um lugar'],...places.map(([at,c])=>[at,(c.label||c.region||'Local')+' · '+at])],
   places.some(([at])=>at===view.travelToDraft)?view.travelToDraft:'',
   v=>{view.travelToDraft=v;invalidate();view.render();});
 const settings=el(box,'div','brpg-session-travel-settings');
 labelSelect(settings,'Deslocamento',Object.entries(MODES).map(([id,item])=>[id,item.name]),opts.travelMode,
   v=>{opts.travelMode=v;invalidate();});
 input(settings,'Minutos do mundo por unidade',opts.minutesPerUnit,v=>{opts.minutesPerUnit=v;invalidate();},
   {type:'number',min:1,max:1440,step:1});
 const checks=el(box,'div','brpg-session-travel-checks');
 travelCheckbox(checks,'Avançar calendário manual',opts.advance,v=>{opts.advance=v;invalidate();});
 travelCheckbox(checks,'Mover tokens dos jogadores na origem',opts.moveTokens,v=>{opts.moveTokens=v;invalidate();});
 travelCheckbox(checks,'Revelar células percorridas',opts.reveal,v=>{opts.reveal=v;invalidate();});
 const commands=row(box);
 button(commands,'Pré-visualizar rota',run(plugin,()=>{
   const plan=plugin.planTravel(travelOptions(view));
   view.travelPreview=plan;view.render();
 }),{icon:'route',disabled:s.status!=='active',className:'brpg-button mod-cta'});
 button(commands,'Escolher destino no mapa',run(plugin,()=>openCampaignMap(plugin,overview.campaign,map.id,view.travelToDraft||'')),{icon:'map'});
 const plan=view.travelPreview;
 const current=travelOptions(view);
 if(plan&&plan.from===s.cell&&plan.map===map.id&&plan.to===current.destination&&
    plan.minutesPerUnit===current.minutesPerUnit&&plan.travelMode===current.travelMode&&plan.advance===current.advance){
   const preview=el(box,'section','brpg-session-travel-preview');
   el(preview,'strong','','Rota calculada · '+plan.steps+' passos');
   info(preview,plan.cost+' unidades de terreno · '+plan.minutes+' minutos do mundo'+
     (plan.advance?' · relógio avança':' · sem alterar o relógio'));
   if(plan.arrival){
     const cal=plugin.state.calendars.find(c=>c.id===overview.campaign.calendar);
     if(cal)info(preview,'Chegada prevista: '+new CalendarEngine(cal).format(plan.arrival)+' · '+clockText(plan.arrival));
   }
   if(plan.stops.length)info(preview,'Pontos de interesse: '+plan.stops.map(x=>x.label).slice(0,7).join(' · '));
   if(plan.events.length)info(preview,'Eventos do calendário: '+plan.events.map(x=>x.title).join(' · '));
   button(row(preview),'Confirmar deslocamento',run(plugin,async()=>{
     await plugin.travelSession(current);
     view.travelPreview=null;view.travelToDraft='';
   }),{icon:'check',className:'brpg-button mod-cta',disabled:s.status!=='active'});
 }else if(plan){
   view.travelPreview=null;
 }
 const last=(s.travelLog||[]).at(-1);
 if(last){
   const history=el(box,'details','brpg-disclosure brpg-session-travel-history');
   el(history,'summary','brpg-summary','Última viagem · '+last.from+' → '+last.to);
   info(history,last.steps+' passos · '+last.minutes+' minutos'+(last.advance?' · tempo avançado':' · tempo preservado'));
   if(last.events.length)info(history,'Eventos: '+last.events.map(x=>x.title).join(' · '));
   for(const stop of last.stops){
     const rowEl=el(history,'div','brpg-session-travel-stop');
     el(rowEl,'span','',stop.label+' ('+stop.at+')');
     if(stop.encounter){
       const saved=plugin.mesa().encounters.find(e=>e.id===stop.encounter&&e.campaign===s.campaign);
       if(saved)button(rowEl,'Iniciar '+saved.name,()=>{
         new Confirm(plugin.app,'Iniciar o encontro '+saved.name+'? Isso vai substituir o combate atual apenas se não houver outro ativo.',
           ()=>plugin.changeMesa(m=>{
             requireMesa(m.session?.status==='active','Retome a sessão antes de iniciar o encontro.');
             requireMesa(!m.running,'Finalize o encontro atual antes de iniciar outro.');
             const encounter=m.encounters.find(e=>e.id===saved.id&&e.campaign===m.session.campaign);
             requireMesa(!!encounter,'Encontro removido.');
             m.running=buildRunning(encounter,m);
           })).open();
       },{icon:'swords',disabled:!!plugin.mesa().running||s.status!=='active'});
     }
     if(stop.table)button(rowEl,'Abrir tabela',run(plugin,()=>plugin.openNote(stop.table)),{icon:'list-ordered'});
   }
   if(!last.stops.length&&!last.events.length)info(history,'Nenhum encontro ou evento registrado no caminho.');
 }
}

function renderRunning(root,view,overview){
 const m=view.plugin.mesa(),running=m.running;
 if(!running)return;
 const box=panel(root,'Combate em andamento','swords');
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
   advanceCombat(m,1);
 })),{icon:'chevron-right',disabled:overview.session.status!=='active'});
}
function renderStart(root,view,campaign){
 const plugin=view.plugin,m=plugin.mesa(),box=panel(root,'Iniciar sessão','play');
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
   const notice=panel(root,'Outra sessão em andamento','info');
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
 const header=panel(root,overview.entry?.name||'Sessão atual','dices');
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
 renderTravel(root,view,overview);
 renderJournal(root,view,overview);
}
module.exports={renderSessionDashboard,calendarFor,openCampaignCalendar,openCampaignMap};
