'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {blankMesa,newCampaign,newEncounter,buildRunning,checkMesa}=require('../src/mesa');
const {blankAtlas,newMap,setCell}=require('../src/atlas');
const {PRESETS,presetSheet,saveTemplate,instantiateTemplate,adventureDraft,saveAdventure,carryCandidates,finishEncounter}=require('../src/creation');
function fixture(){
 const m=blankMesa(),c={...newCampaign(),name:'Crônicas'};m.campaigns.push(c);m.atlas=blankAtlas();
 const map={...newMap(c.id),name:'Vale'};m.atlas.maps.push(map);
 const hero=presetSheet('hero',c.id);hero.name='Vera';m.sheets.push(hero);
 return {m,c,map,hero};
}
function fight(m,c,hero,count='1'){
 const data={...newEncounter(c.id),name:'Encontro',roster:[{sheet:hero.id,name:'',count,side:'players',initiative:'20'}]};
 return buildRunning(data,m);
}
test('todos os cinco modelos padrão são fichas válidas e independentes',()=>{
 const {m,c}=fixture();
 for(const [id]of PRESETS){const a=presetSheet(id,c.id),b=presetSheet(id,c.id);assert.notEqual(a.id,b.id);m.sheets.push(a,b);}
 assert.equal(checkMesa(m),m);
});
test('modelo pessoal não copia vínculos nem recursos ao vivo e é independente',()=>{
 const {m,c,hero}=fixture();hero.note='Lugar.md';hero.image='Retrato.png';m.sheetStates[hero.id]=hero.resources.map(r=>({...r,value:0}));
 const t=saveTemplate(m,hero,'Meu sistema');
 assert.equal(t.note,'');assert.equal(t.image,'');assert.equal(t.campaign,'');assert.equal(t.resources[0].value,12);
 const a=instantiateTemplate(m,t.id,c.id);a.resources[0].value=1;assert.equal(t.resources[0].value,12);
 assert.notEqual(a.id,hero.id);assert.notEqual(a.id,t.id);assert.equal(checkMesa(m),m);
});
test('aventura encadeada cria cinco registros, ficha e encontro associados à célula',()=>{
 const {m,c,map,hero}=fixture(),d=adventureDraft(()=>.2);d.map=map.id;d.cell='2,3';
 const out=saveAdventure(m,c.id,d);
 assert.equal(m.entries.length,5);assert.equal(m.sheets.length,2);assert.equal(m.encounters.length,1);
 assert.equal(out.adventure.links.length,4);assert.equal(map.cells['2,3'].entry,out.site.id);
 assert.equal(map.cells['2,3'].sheet,out.sheet.id);assert.equal(map.cells['2,3'].encounter,out.encounter.id);
 assert.equal(out.encounter.entry,out.scene.id);assert.equal(out.encounter.roster[0].sheet,hero.id);
 assert.equal(m.running,null);assert.equal(m.atlas.relations.length,1);assert.equal(checkMesa(m),m);
});
test('célula ocupada é preservada e não gera registros parciais',()=>{
 const {m,c,map}=fixture(),d=adventureDraft(()=>.3);d.map=map.id;d.cell='2,3';setCell(map,2,3,{entry:'preexistente'});
 const before=JSON.stringify(m);assert.throws(()=>saveAdventure(m,c.id,d),/já possui/);assert.equal(JSON.stringify(m),before);
});
test('guardar recursos no fim do combate preserva ficha original e carrega valores no próximo combate',()=>{
 const {m,c,hero}=fixture();m.running=fight(m,c,hero);
 m.running.members[0].resources[0].value=3;
 assert.equal(finishEncounter(m,m.running.id,true),1);
 assert.equal(hero.resources[0].value,12);assert.equal(m.sheetStates[hero.id][0].value,3);
 m.running=fight(m,c,hero);assert.equal(m.running.members[0].resources[0].value,3);assert.equal(checkMesa(m),m);
});
test('encerrar normalmente ou com cópias múltiplas não altera progresso',()=>{
 const {m,c,hero}=fixture();m.running=fight(m,c,hero);m.running.members[0].resources[0].value=1;finishEncounter(m,m.running.id);
 assert.equal(m.sheetStates[hero.id],undefined);m.running=fight(m,c,hero,'2');
 assert.equal(carryCandidates(m).length,0);assert.equal(finishEncounter(m,m.running.id,true),0);
 assert.equal(m.sheetStates[hero.id],undefined);
});
