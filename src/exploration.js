'use strict';
const {CalendarEngine, MAX_YEAR, validateCalendar, uid}=require('./calendar');
const {TERRAIN, place, unpack, inMap, getCell, distance}=require('./atlas');
const {readMinute, splitMinute, mode:clockMode, anchor}=require('./world-clock');
const {requireMesa}=require('./mesa');
const {setSessionLocation}=require('./session');

const MODES=Object.freeze({
 walk:{name:'A pé',multiplier:1}, mount:{name:'Montado',multiplier:.65},fly:{name:'Voando',multiplier:.5}
});
const MAX_TRIPS=120,MAX_STOPS=24;
function terrain(map,at){const p=unpack(at);return getCell(map,p.col,p.row).terrain||map.defaultTerrain;}
function cellCost(map,at,travelMode){
 const type=terrain(map,at);
 if(type==='wall'||(type==='water'&&travelMode!=='fly'))return Infinity;
 return travelMode==='fly'?1:TERRAIN[type]?.speed??1;
}
function neighbors(map,at,travelMode){
 const p=unpack(at),list=[];
 for(let row=Math.max(0,p.row-1);row<=Math.min(map.height-1,p.row+1);row++)
  for(let col=Math.max(0,p.col-1);col<=Math.min(map.width-1,p.col+1);col++){
   if(row===p.row&&col===p.col)continue;
   const to=place(col,row);
   if(distance(map,at,to)!==1)continue;
   const cost=cellCost(map,to,travelMode);
   if(Number.isFinite(cost))list.push({to,cost});
  }
 return list;
}
function shortestRoute(map,from,to,travelMode='walk'){
 requireMesa(Object.hasOwn(MODES,travelMode),'Modo de deslocamento inválido.');
 const a=unpack(from),b=unpack(to);
 requireMesa(a&&b&&inMap(map,a.col,a.row)&&inMap(map,b.col,b.row),'Coordenadas de viagem inválidas.');
 requireMesa(from!==to,'Escolha outra célula para viajar.');
 requireMesa(Number.isFinite(cellCost(map,to,travelMode)),'O destino não é transitável neste modo.');
 const costs=new Map([[from,0]]),previous=new Map(),todo=new Set([from]);
 let expansions=0;
 while(todo.size){
   let node=null,best=Infinity;
   for(const item of todo)if(costs.get(item)<best){node=item;best=costs.get(item);}
   if(node===null)break;
   todo.delete(node);
   if(node===to)break;
   if(++expansions>1600)throw new Error('O mapa excede o limite de busca da rota.');
   for(const edge of neighbors(map,node,travelMode)){
     const total=best+edge.cost;
     if(total<(costs.get(edge.to)??Infinity)){
       costs.set(edge.to,total);previous.set(edge.to,node);todo.add(edge.to);
     }
   }
 }
 requireMesa(costs.has(to),'Não existe caminho transitável até esse destino.');
 const route=[to];while(route[0]!==from){
   const parent=previous.get(route[0]);
   requireMesa(parent,'Não foi possível reconstruir a rota.');
   route.unshift(parent);
 }
 return {path:route,steps:route.length-1,cost:Math.round(costs.get(to)*100)/100};
}
function stopSummary(map,path){
 const result=[];
 for(const at of path.slice(1)){
   const p=unpack(at),c=getCell(map,p.col,p.row);
   if(!c.label&&!c.entry&&!c.encounter&&!c.table&&!c.submap)continue;
   if(result.length>=MAX_STOPS)break;
   result.push({at,label:c.label||c.region||'Ponto de interesse',
     entry:c.entry||'',encounter:c.encounter||'',table:c.table||'',submap:c.submap||''});
 }
 return result;
}
function previewTravel(m,calendar,options){
 const session=m.session;
 requireMesa(session?.status==='active','Inicie ou retome a sessão antes de viajar.');
 const map=m.atlas?.maps.find(x=>x.id===session.map);
 requireMesa(map&&map.campaign===session.campaign,'Selecione um mapa da campanha na Central de Sessão.');
 requireMesa(!!session.cell,'Marque a posição inicial do grupo no Atlas.');
 const method=options?.travelMode||'walk';
 const destination=String(options?.destination||'');
 const route=shortestRoute(map,session.cell,destination,method);
 const minutesPerUnit=Number(options?.minutesPerUnit??60);
 requireMesa(Number.isSafeInteger(minutesPerUnit)&&minutesPerUnit>=1&&minutesPerUnit<=1440,
   'Use entre 1 e 1440 minutos do mundo por unidade de terreno.');
 const elapsed=Math.max(1,Math.ceil(route.cost*minutesPerUnit*MODES[method].multiplier));
 requireMesa(elapsed<=300000,'Viagem muito longa. Reduza a escala de tempo ou divida a rota em etapas.');
 const advance=options?.advance===true;
 let arrival=null,events=[];
 if(advance){
   requireMesa(!!calendar,'Vincule um calendário à campanha antes de avançar o tempo.');
   requireMesa(!calendar.clockLink&&clockMode(calendar)==='manual',
     'Este calendário usa relógio em tempo real ou vinculado. Altere para modo manual ou viaje sem avançar a data.');
   const engine=new CalendarEngine(calendar),start=engine.epoch(calendar.current)*calendar.clock.hours*calendar.clock.minutes+readMinute(calendar,calendar.current);
   const total=calendar.clock.hours*calendar.clock.minutes;
   const end=start+elapsed;
   requireMesa(Number.isSafeInteger(end)&&end>=0,'Data futura inválida.');
   const date={...engine.fromEpoch(Math.floor(end/total)),...splitMinute(calendar,end%total)};
   arrival=date;
   const startDay=Math.floor(start/total),endDay=Math.floor(end/total);
   const seen=new Set();
   for(let day=startDay+1;day<=endDay&&day<=startDay+14;day++){
     const current=engine.fromEpoch(day);
     for(const event of engine.eventsOn(current)){
       if(!seen.has(event.id)){seen.add(event.id);events.push({id:event.id,title:String(event.title||'Evento').slice(0,160)});}
       if(events.length>=16)break;
     }
     if(events.length>=16)break;
   }
   if(startDay===endDay)for(const event of engine.eventsOn(date)){
     if(!seen.has(event.id)){seen.add(event.id);events.push({id:event.id,title:String(event.title||'Evento').slice(0,160)});}
     if(events.length>=16)break;
   }
 }
 return {...route,from:session.cell,to:destination,map:map.id,minutes:elapsed,minutesPerUnit,
   travelMode:method,advance,arrival,events,stops:stopSummary(map,route.path)};
}
function executeTravel(state,options,now=Date.now()){
 const m=state.mesa,session=m?.session;
 requireMesa(session,'Não há sessão de RPG em andamento.');
 const camp=m.campaigns.find(x=>x.id===session.campaign);
 const cal=state.calendars?.find(x=>x.id===camp?.calendar);
 const plan=previewTravel(m,cal,options);
 // All route checks and clock calculations are finished before any state is changed.
 if(plan.advance){
   const actual=state.calendars.find(x=>x.id===cal.id);
   anchor(actual,plan.arrival,'manual',now);
   validateCalendar(actual);
 }
 const map=m.atlas.maps.find(x=>x.id===plan.map);
 const moveTokens=options.moveTokens===true;
 if(moveTokens){
   const partyIds=new Set(m.sheets.filter(x=>x.kind==='player'&&
     (!x.campaign||x.campaign===session.campaign)).map(x=>x.id));
   for(const token of map.tokens)if(token.at===plan.from&&partyIds.has(token.sheet))token.at=plan.to;
 }
 if(options.reveal===true)
   for(const at of plan.path){const c=map.cells[at];if(c?.fog)delete c.fog;}
 setSessionLocation(m,plan.map,plan.to);
 session.travelLog ||= [];
 requireMesa(session.travelLog.length<MAX_TRIPS,'Histórico de viagens cheio. Encerre a sessão para arquivá-lo.');
 const travel={id:uid('trip'),time:new Date(now).toISOString(),map:map.id,
   from:plan.from,to:plan.to,travelMode:plan.travelMode,steps:plan.steps,
   cost:plan.cost,minutes:plan.minutes,advance:plan.advance,path:plan.path,
   events:plan.events,stops:plan.stops};
 session.travelLog.push(travel);
 session.lastTravel=travel.id;
 return plan;
}
function validateTravel(m){
 const validateList=items=>Array.isArray(items)&&items.length<=10000&&items.every(x=>
   x&&typeof x.id==='string'&&x.id.length<=150&&
   typeof x.time==='string'&&x.time.length<=40&&
   typeof x.map==='string'&&x.map.length<=150&&
   typeof x.from==='string'&&!!unpack(x.from)&&typeof x.to==='string'&&!!unpack(x.to)&&
   Object.hasOwn(MODES,x.travelMode)&&Number.isSafeInteger(x.minutes)&&x.minutes>=1&&x.minutes<=300000&&
   Number.isSafeInteger(x.steps)&&x.steps>=1&&x.steps<=1600&&
   Array.isArray(x.path)&&x.path.length>=2&&x.path.length<=1600&&
   x.path[0]===x.from&&x.path.at(-1)===x.to&&x.path.every(y=>!!unpack(y))&&
   Array.isArray(x.events)&&x.events.length<=16&&Array.isArray(x.stops)&&x.stops.length<=MAX_STOPS);
 if(m.session?.travelLog!==undefined)
   requireMesa(validateList(m.session.travelLog)&&m.session.travelLog.length<=MAX_TRIPS,'Histórico de viagens da sessão inválido.');
 if(m.session?.lastTravel)
   requireMesa(m.session.travelLog?.some(x=>x.id===m.session.lastTravel),'Última viagem inválida.');
 for(const entry of m.entries||[])if(entry.sessionTravel!==undefined)
   requireMesa(validateList(entry.sessionTravel),'Histórico de viagens arquivado inválido.');
 return true;
}
module.exports={MODES,MAX_TRIPS,shortestRoute,stopSummary,previewTravel,executeTravel,validateTravel};
