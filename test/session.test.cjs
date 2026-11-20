'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {blankMesa,newCampaign,newEntry,newSheet,checkMesa,newEncounter,buildRunning}=require('../src/mesa');
const {blankAtlas,newMap,setCell}=require('../src/atlas');
const {checkSession,newSessionEntry,startSession,setSessionStatus,setSessionLocation,addSessionNote,finishSession,sessionInfo}=require('../src/session');

function fixture(){
 const m=blankMesa(),campaign={...newCampaign(),name:'Crônicas de Arkanis',calendar:'cal1'};
 m.campaigns.push(campaign);m.atlas=blankAtlas();
 const map={...newMap(campaign.id,'hex'),name:'Vale das Brumas'};
 m.atlas.maps.push(map);
 const player={...newSheet(campaign.id),name:'Vera',kind:'player'};
 m.sheets.push(player);
 return {m,campaign,map,player};
}
test('dados da Mesa 1.5 seguem compatíveis sem uma sessão',()=>{
 const {m}=fixture();
 assert.equal(checkSession(m),true);
 assert.equal(checkMesa(m),m);
 assert.equal(sessionInfo(m),null);
});
test('começar sessão cria registro e retoma sem duplicar o modelo',()=>{
 const {m,campaign}=fixture();
 const initial=startSession(m,campaign.id);
 assert.equal(initial.status,'active');
 assert.equal(m.entries.length,1);
 assert.equal(m.entries[0].kind,'session');
 assert.equal(initial.entry,m.entries[0].id);
 assert.equal(checkMesa(m),m);
 const snapshot=JSON.parse(JSON.stringify(m));
 assert.equal(checkMesa(snapshot),snapshot);
 assert.equal(sessionInfo(snapshot,[{id:'cal1'}]).calendar.id,'cal1');
});
test('não permite começar uma segunda sessão antes de encerrar',()=>{
 const {m,campaign}=fixture();
 startSession(m,campaign.id);
 assert.throws(()=>startSession(m,campaign.id),/Finalize/);
 assert.equal(m.entries.length,1);
});
test('sessão existente pertence à campanha e precisa ser do tipo correto',()=>{
 const {m,campaign}=fixture();
 const another={...newCampaign(),name:'Outra campanha'};m.campaigns.push(another);
 const other={...newEntry(another.id),name:'Sessão fora',kind:'session'};m.entries.push(other);
 assert.throws(()=>startSession(m,campaign.id,other.id),/Escolha um registro/);
 assert.equal(m.session,undefined);
 const valid=newSessionEntry(m,campaign.id,{name:'Preparação'});
 startSession(m,campaign.id,valid.id);
 assert.equal(m.entries.length,2);
 assert.equal(m.session.entry,valid.id);
});
test('pausar, retomar e salvar notas no diário de forma persistente',()=>{
 const {m,campaign}=fixture();
 startSession(m,campaign.id);
 setSessionStatus(m,'paused');assert.equal(m.session.status,'paused');
 setSessionStatus(m,'active');
 addSessionNote(m,'O grupo chegou ao portão.');
 addSessionNote(m,'Um guardião apareceu.');
 assert.equal(m.session.journal.length,2);
 assert.equal(checkMesa(m),m);
 const stored=JSON.parse(JSON.stringify(m));
 assert.equal(stored.session.journal[0].text,'Um guardião apareceu.');
 assert.equal(checkMesa(stored),stored);
});
test('local da sessão precisa existir no mapa da mesma campanha',()=>{
 const {m,campaign,map}=fixture();
 const another={...newCampaign(),name:'Outro mundo'};m.campaigns.push(another);
 const foreign={...newMap(another.id),name:'Mapa remoto'};m.atlas.maps.push(foreign);
 startSession(m,campaign.id);
 assert.throws(()=>setSessionLocation(m,foreign.id,'1,1'),/não pertence/);
 assert.throws(()=>setSessionLocation(m,map.id,'40,40'),/coordenadas/);
 setCell(map,3,5,{label:'Ruínas de Solus'});
 setSessionLocation(m,map.id,'3,5');
 assert.equal(checkMesa(m),m);
 const overview=sessionInfo(m);
 assert.equal(overview.map.id,map.id);
 assert.equal(overview.cell.label,'Ruínas de Solus');
 setSessionLocation(m,'');
 assert.equal(m.session.map,'');assert.equal(m.session.cell,'');
});
test('diário e local são arquivados no resumo ao encerrar sessão',()=>{
 const {m,campaign,map}=fixture();
 startSession(m,campaign.id);
 addSessionNote(m,'Fomos até a ponte.');
 setSessionLocation(m,map.id,'3,5');
 const entry=finishSession(m);
 assert.equal(m.session,null);
 assert.match(entry.summary,/Fomos até a ponte/);
 assert.match(entry.summary,/Vale das Brumas/);
 assert.match(entry.summary,/3,5/);
 assert.equal(entry.sessionJournal.length,1);
 assert.equal(entry.sessionJournal[0].text,'Fomos até a ponte.');
 assert.equal(checkMesa(m),m);
});
test('sessões referenciando entradas excluídas ou localização inválida são rejeitadas',()=>{
 const {m,campaign,map}=fixture();
 startSession(m,campaign.id);
 const saved=m.entries[0];
 m.entries=[];assert.throws(()=>checkSession(m),/registro/);
 m.entries.push(saved);
 m.session.map=map.id;m.session.cell='75,1';
 assert.throws(()=>checkSession(m),/Localização/);
 m.session.cell='';m.session.status='desconhecido';
 assert.throws(()=>checkSession(m),/Sessão ativa inválida/);
});
test('resumo de sessão inclui personagem e encontro do próprio grupo',()=>{
 const {m,campaign,player}=fixture();
 startSession(m,campaign.id);
 const encounter={...newEncounter(campaign.id),name:'Ponte',roster:[{sheet:player.id,name:'',side:'players',count:'1',initiative:'10'}]};
 m.encounters.push(encounter);
 m.running=buildRunning(encounter,m,()=>0.4);
 const info=sessionInfo(m,[{id:'cal1'}]);
 assert.equal(info.players.length,1);
 assert.equal(info.running.name,'Ponte');
 assert.equal(info.calendar.id,'cal1');
 assert.equal(checkMesa(m),m);
});

test('o diário estruturado permanece completo quando o resumo atinge o limite',()=>{
 const {m,campaign}=fixture();
 const entry=newSessionEntry(m,campaign.id);
 entry.summary='X'.repeat(9998);
 startSession(m,campaign.id,entry.id);
 for(let i=0;i<20;i++)addSessionNote(m,'Anotação completa '+i);
 finishSession(m);
 assert.equal(m.session,null);
 assert.equal(entry.sessionJournal.length,20);
 assert.equal(entry.sessionJournal[0].text,'Anotação completa 0');
 assert.equal(entry.sessionJournal.at(-1).text,'Anotação completa 19');
 assert.ok(entry.summary.length<=10000);
 assert.equal(checkMesa(m),m);
});
test('sessão arquivada pode ser retomada no mesmo registro com diário preservado',()=>{
 const {m,campaign}=fixture();
 const initial=startSession(m,campaign.id),savedId=initial.entry;
 addSessionNote(m,'Primeira parte');
 finishSession(m);
 startSession(m,campaign.id,savedId);
 addSessionNote(m,'Segunda parte');
 finishSession(m);
 const entry=m.entries.find(x=>x.id===savedId);
 assert.deepEqual(entry.sessionJournal.map(x=>x.text),['Primeira parte','Segunda parte']);
 assert.equal(checkMesa(m),m);
});
