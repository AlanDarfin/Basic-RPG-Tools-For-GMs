'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {blankMesa,newCampaign,newSheet,newEncounter,checkMesa}=require('../src/mesa');
const {blankAtlas,newMap,setCell,place,distance}=require('../src/atlas');
const {makeTemplate}=require('../src/calendar-presets');
const {startSession,setSessionLocation,finishSession}=require('../src/session');
const {MODES,shortestRoute,previewTravel,executeTravel,validateTravel}=require('../src/exploration');

function fixture(type='hex'){
 const m=blankMesa(),campaign={...newCampaign(),name:'Arkanis em viagem'};
 const calendar=makeTemplate('gregorian',new Date(2024,1,28,23,30));
 calendar.clockSync={mode:'manual',since:Date.now()};
 calendar.current={year:2024,month:'mes-2',day:28,hour:23,minute:30};
 campaign.calendar=calendar.id;
 m.campaigns.push(campaign);m.atlas=blankAtlas();
 const map={...newMap(campaign.id,type),name:'Região da campanha'};
 map.defaultTerrain=type==='hex'?'plains':'floor';
 m.atlas.maps.push(map);
 const hero={...newSheet(campaign.id),name:'Vera',kind:'player'};
 m.sheets.push(hero);
 startSession(m,campaign.id);
 setSessionLocation(m,map.id,'0,0');
 map.tokens.push({id:'token1',sheet:hero.id,name:hero.name,at:'0,0'});
 return {state:{mesa:m,calendars:[calendar]},m,calendar,campaign,map,hero};
}
test('rota quadrada desvia de parede e não atravessa água a pé',()=>{
 const {map}=fixture('square');
 setCell(map,1,0,{terrain:'wall'});
 const route=shortestRoute(map,'0,0','2,0','walk');
 assert.equal(route.steps,4);
 assert.equal(route.cost,4);
 assert.equal(route.path.includes('1,0'),false);
 setCell(map,2,0,{terrain:'water'});
 assert.throws(()=>shortestRoute(map,'0,0','2,0','walk'),/não é transitável/);
});
test('rota em hexágonos usa adjacência correta em linhas pares e ímpares',()=>{
 const {map}=fixture();
 const first=shortestRoute(map,'0,0','0,1');
 assert.equal(first.steps,1);
 assert.equal(first.cost,1);
 assert.equal(distance(map,'1,1','2,2'),1);
 const next=shortestRoute(map,'1,1','2,2');
 assert.equal(next.steps,1);
});
test('rota escolhe desvio de baixo custo e modos de transporte diferentes',()=>{
 const {map}=fixture('square');
 setCell(map,1,0,{terrain:'mountain'});
 const walk=shortestRoute(map,'0,0','2,0','walk');
 assert.equal(walk.steps,2);
 assert.equal(walk.cost,4);
 const flying=shortestRoute(map,'0,0','2,0','fly');
 assert.equal(flying.cost,2);
 assert.equal(flying.steps,2);
 assert.throws(()=>shortestRoute(map,'0,0','0,0'),/outra célula/);
 assert.throws(()=>shortestRoute(map,'0,0','50,5'),/Coordenadas/);
});
test('preview do deslocamento calcula duração sem alterar o mundo',()=>{
 const {m,calendar,map}=fixture();
 const before=JSON.stringify(m);
 const info=previewTravel(m,calendar,{destination:'2,0',minutesPerUnit:45,travelMode:'mount',advance:false});
 assert.equal(info.steps,2);
 assert.equal(info.minutes,59);
 assert.deepEqual(info.path,['0,0','1,0','2,0']);
 assert.equal(info.arrival,null);
 assert.equal(JSON.stringify(m),before);
 assert.equal(map.tokens[0].at,'0,0');
});
test('avanço automático do calendário gregoriano atravessa fevereiro bissexto',()=>{
 const {state,calendar,map,hero}=fixture();
 setCell(map,1,0,{fog:true,label:'A ponte'});
 const plan=executeTravel(state,{destination:'1,0',travelMode:'walk',minutesPerUnit:60,
   advance:true,moveTokens:true,reveal:true},Date.parse('2024-02-28T23:30:00.000Z'));
 assert.deepEqual({year:calendar.current.year,month:calendar.current.month,day:calendar.current.day,
   hour:calendar.current.hour,minute:calendar.current.minute},
   {year:2024,month:'mes-2',day:29,hour:0,minute:30});
 assert.equal(plan.minutes,60);
 assert.equal(state.mesa.session.cell,'1,0');
 assert.equal(map.tokens[0].at,'1,0');
 assert.equal(map.cells['1,0'].fog,undefined);
 assert.equal(state.mesa.session.travelLog.length,1);
 assert.equal(checkMesa(state.mesa),state.mesa);
});
test('sem autorização, viagem não mexe no tempo, tokens ou neblina',()=>{
 const {state,map,calendar}=fixture();
 setCell(map,1,0,{fog:true});
 const old=JSON.stringify(calendar.current);
 executeTravel(state,{destination:'1,0',minutesPerUnit:30,advance:false,moveTokens:false,reveal:false});
 assert.equal(JSON.stringify(calendar.current),old);
 assert.equal(map.tokens[0].at,'0,0');
 assert.equal(map.cells['1,0'].fog,true);
});
test('relógio real e calendários vinculados não são alterados pela viagem',()=>{
 const {state,calendar}=fixture();
 calendar.clockSync.mode='real';
 assert.throws(()=>executeTravel(state,{destination:'1,0',advance:true}),/tempo real/);
 assert.equal(state.mesa.session.cell,'0,0');
 executeTravel(state,{destination:'1,0',advance:false});
 assert.equal(state.mesa.session.cell,'1,0');
});
test('percurso identifica encontros e tabelas sem iniciá-los automaticamente',()=>{
 const {state,m,campaign,map}=fixture();
 const enc={...newEncounter(campaign.id),name:'Guardas',roster:[{sheet:m.sheets[0].id,name:'',side:'enemies',count:'1',initiative:'1'}]};
 m.encounters.push(enc);
 setCell(map,1,0,{label:'Portão',encounter:enc.id,table:'Tabelas/Encontros.md'});
 const plan=executeTravel(state,{destination:'2,0',advance:false});
 assert.equal(plan.stops.length,1);
 assert.equal(plan.stops[0].encounter,enc.id);
 assert.equal(plan.stops[0].table,'Tabelas/Encontros.md');
 assert.equal(m.running,null);
 assert.equal(checkMesa(m),m);
});
test('destino inalcançável e relógio incompatível não alteram a sessão',()=>{
 const {state,m,map,calendar}=fixture();
 setCell(map,1,0,{terrain:'wall'});
 setCell(map,0,1,{terrain:'wall'});
 const before=JSON.stringify(state);
 assert.throws(()=>executeTravel(state,{destination:'2,0'}),/Não existe caminho/);
 assert.equal(JSON.stringify(state),before);
 setCell(map,0,1,{terrain:'plains'});
 calendar.clockLink={id:'outro-calendario',offset:0};
 assert.throws(()=>executeTravel(state,{destination:'0,2',advance:true}),/tempo real ou vinculado/);
 assert.equal(m.session.cell,'0,0');
});
test('histórico completo de viagens é arquivado junto ao registro de sessão',()=>{
 const {state,m}=fixture();
 executeTravel(state,{destination:'1,0',advance:false});
 executeTravel(state,{destination:'2,0',advance:false});
 assert.equal(m.session.travelLog.length,2);
 const e=finishSession(m);
 assert.equal(e.sessionTravel.length,2);
 assert.deepEqual(e.sessionTravel.map(t=>t.to),['1,0','2,0']);
 assert.equal(m.session,null);
 assert.equal(checkMesa(m),m);
});
test('registro antigo sem viagens permanece válido',()=>{
 const {m}=fixture();
 delete m.session.travelLog;
 assert.equal(validateTravel(m),true);
 assert.equal(checkMesa(m),m);
});
