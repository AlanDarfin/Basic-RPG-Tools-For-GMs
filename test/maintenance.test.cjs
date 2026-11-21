'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {makeTemplate}=require('../src/calendar-presets');
const {blankMesa,newCampaign,newEntry,newSheet}=require('../src/mesa');
const {blankAtlas,newMap,setCell}=require('../src/atlas');
const {defaultSolo}=require('../src/solo');
const {encodeBackup,decodeBackup,validateState,backupStats,searchWorld}=require('../src/maintenance');
function fixture(){
 const c=makeTemplate('gregorian',new Date(2024,1,29)),m=blankMesa();
 const camp={...newCampaign(),name:'Crônicas da Névoa',calendar:c.id};m.campaigns.push(camp);
 const e={...newEntry(camp.id),name:'Ponte Antiga',kind:'site'};m.entries.push(e);
 const sheet={...newSheet(camp.id),name:'Guardião'};m.sheets.push(sheet);
 m.atlas=blankAtlas();const map={...newMap(camp.id),name:'Vale das Brumas'};m.atlas.maps.push(map);
 setCell(map,1,2,{label:'Ponte Antiga',region:'Névoa',entry:e.id,secret:'segredo privado'});
 return {state:{version:1,activeId:c.id,calendars:[c],mesa:m,solo:defaultSolo()},camp,e,map};
}
test('backup completo preserva vínculos e segredos sem compartilhar objetos',()=>{
 const {state}=fixture(),out=decodeBackup(encodeBackup(state));
 assert.deepEqual(backupStats(out),{calendars:1,campaigns:1,entries:1,sheets:1,encounters:0,maps:1,dice:0,decks:0});
 assert.equal(out.mesa.atlas.maps[0].cells['1,2'].secret,'segredo privado');
 out.mesa.entries[0].name='Alterado';assert.equal(state.mesa.entries[0].name,'Ponte Antiga');
});
test('backup rejeita JSON inválido, formato externo, calendário duplicado e mapa inválido',()=>{
 const {state}=fixture();
 assert.throws(()=>decodeBackup('{'),/JSON válido/);
 assert.throws(()=>decodeBackup(JSON.stringify(state)),/não reconhecido/);
 state.calendars.push(state.calendars[0]);assert.throws(()=>validateState(state),/duplicados/);
 state.calendars.pop();state.mesa.atlas.maps[0].width=200;assert.throws(()=>decodeBackup(encodeBackup(state)),/mapa inválida/i);
});
test('busca global ignora acentos, prioriza nomes e filtra por tipo e campanha',()=>{
 const {state,camp,map}=fixture();
 const hits=searchWorld(state,'ponte antiga');
 assert.equal(hits.length,2);assert.ok(hits.every(h=>h.score===100));
 const locations=searchWorld(state,'nevoa','cell',camp.id);
 assert.equal(locations[0].map,map.id);assert.equal(locations[0].cell,'1,2');
 assert.equal(searchWorld(state,'ponte','entry','outra').length,0);
 assert.equal(searchWorld(state,'segredo privado').length,0);
 assert.equal(searchWorld(state,'guardiao')[0].type,'sheet');
 assert.equal(searchWorld(state,'','', '',1).length,1);
});
test('dados antigos sem Mesa ou Solo são aceitos',()=>{
 const {state}=fixture();delete state.mesa;delete state.solo;
 assert.equal(decodeBackup(encodeBackup(state)).activeId,state.activeId);
});
