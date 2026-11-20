'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CalendarEngine, validateCalendar } = require('../src/calendar');
const { CALENDAR_TEMPLATES, makeTemplate } = require('../src/calendar-presets');
const { MAP_TEMPLATES, EARTH_ROWS, createMapTemplate } = require('../src/map-presets');
const { blankMesa, newCampaign } = require('../src/mesa');
const { checkAtlas, blankAtlas, newMap, subgraph } = require('../src/atlas');

test('todos os exemplos de calendário abrem, validam e têm datas válidas', () => {
  assert.equal(CALENDAR_TEMPLATES.length,6);
  for(const model of CALENDAR_TEMPLATES){
    const calendar=makeTemplate(model.id,new Date(2024,1,29,12,45));
    assert.equal(validateCalendar(calendar),calendar,model.id);
    const engine=new CalendarEngine(calendar);
    assert.ok(engine.yearInfo(calendar.current.year).total>0,model.id);
    assert.doesNotThrow(()=>engine.epoch(calendar.current),model.id);
    assert.ok(calendar.id,model.id);
  }
});
test('o modelo gregoriano obedece bissextos 4/100/400 e usa a data de referência', () => {
  const calendar=makeTemplate('gregorian',new Date(2024,1,29,17,30));
  const engine=new CalendarEngine(calendar);
  assert.equal(calendar.current.day,29);
  assert.equal(calendar.current.year,2024);
  assert.equal(calendar.week.length,7);
  assert.equal(engine.monthLength(2024,'mes-2'),29);
  assert.equal(engine.monthLength(2025,'mes-2'),28);
  assert.equal(engine.monthLength(2000,'mes-2'),29);
  assert.equal(engine.monthLength(2100,'mes-2'),28);
  assert.equal(engine.yearInfo(2024).total,366);
  assert.equal(engine.yearInfo(2025).total,365);
});
test('13 Luas usa o dia fora da semana e o solar usa semana de oito dias',()=>{
  const lunar=makeTemplate('thirteen-moons'),sun=makeTemplate('solar-eight');
  assert.equal(lunar.months.length,13);
  assert.equal(lunar.week.length,7);
  assert.equal(new CalendarEngine(lunar).yearInfo(1).total,365);
  assert.equal(lunar.leapDays.length,1);
  assert.equal(lunar.leapDays[0].intercalary,true);
  assert.equal(sun.week.length,8);
  assert.equal(new CalendarEngine(sun).yearInfo(1).total,365);
  assert.equal(sun.leapDays.length,5);
});
test('lunar de campanha tem 354 dias e modelos novos não compartilham dados',()=>{
  const a=makeTemplate('lunar-fantasy'),b=makeTemplate('lunar-fantasy');
  assert.equal(new CalendarEngine(a).yearInfo(1).total,354);
  assert.notEqual(a.id,b.id);
  a.months[0].name='Outro nome';
  assert.equal(b.months[0].name,'Ciclo 1');
  const arkanisA=makeTemplate('arkanis'),arkanisB=makeTemplate('arkanis');
  assert.notEqual(arkanisA.id,arkanisB.id);
  assert.equal(arkanisB.months.length,26);
  assert.throws(()=>makeTemplate('missing'),/não encontrado/);
});
test('mapa-múndi tem 40×22 hexágonos, continentes, oceanos e biomas',()=>{
  assert.equal(EARTH_ROWS.length,22);
  assert.ok(EARTH_ROWS.every(row=>row.length===40));
  const map=createMapTemplate('world-earth','');
  assert.equal(map.grid,'hex');
  assert.equal(map.width,40);assert.equal(map.height,22);
  assert.equal(map.defaultTerrain,'water');
  assert.ok(Object.keys(map.cells).length>160);
  const regions=new Set(Object.values(map.cells).map(c=>c.region));
  for(const region of ['América do Norte','América do Sul','Europa','África','Ásia','Oceania','Antártida'])
   assert.ok(regions.has(region),region);
  const biomes=new Set(Object.values(map.cells).map(c=>c.terrain));
  for(const land of ['ice','forest','mountain','desert','plains'])assert.ok(biomes.has(land),land);
  const m=blankMesa();m.atlas=blankAtlas();map.name='Terra alternativa';m.atlas.maps.push(map);
  assert.equal(checkAtlas(m.atlas,m),m.atlas);
});
test('todos os modelos de mapa passam validação e são independentes',()=>{
 const m=blankMesa(),c={...newCampaign(),name:'Região de testes'};m.campaigns.push(c);m.atlas=blankAtlas();
 for(const template of MAP_TEMPLATES){
   const map=createMapTemplate(template.id,c.id,{seed:4321});
   assert.ok(map.name.length>0);
   m.atlas.maps.push(map);
   assert.equal(checkAtlas(m.atlas,m),m.atlas,template.id);
 }
 const world=createMapTemplate('world-earth');
 const worldB=createMapTemplate('world-earth');
 assert.notEqual(world.id,worldB.id);
 world.cells['2,2']={terrain:'floor'};
 assert.notDeepEqual(world.cells,worldB.cells);
 assert.throws(()=>createMapTemplate('invalid'),/desconhecido/);
});
test('gráfico limita profundidade por camadas e nunca inclui arestas desconectadas',()=>{
 const graph={nodes:['a','b','c','d','e'].map(id=>({id})),edges:[
   {from:'a',to:'b',type:'ally'},{from:'b',to:'c',type:'ally'},
   {from:'c',to:'d',type:'ally'},{from:'d',to:'e',type:'ally'}
 ]};
 assert.deepEqual(subgraph(graph,'a',1).nodes.map(x=>x.id),['a','b']);
 assert.deepEqual(subgraph(graph,'a',2).nodes.map(x=>x.id),['a','b','c']);
 assert.deepEqual(subgraph(graph,'a',4).nodes.map(x=>x.id),['a','b','c','d','e']);
 assert.deepEqual(subgraph(graph,'a',1,['enemy']).nodes.map(x=>x.id),['a']);
 const global=subgraph(graph,'',2);
 assert.ok(global.edges.every(e=>global.nodes.some(n=>n.id===e.from)&&global.nodes.some(n=>n.id===e.to)));
});
test('Atlas rejeita ciclos indiretos de submapas A → B → C → A',()=>{
 const m=blankMesa(),c={...newCampaign(),name:'Círculos'};m.campaigns.push(c);
 const a={...newMap(c.id),name:'Mapa A'},b={...newMap(c.id),name:'Mapa B'},d={...newMap(c.id),name:'Mapa C'};
 a.parent=b.id;a.parentCell='1,1';b.parent=d.id;b.parentCell='1,1';d.parent=a.id;d.parentCell='1,1';
 m.atlas={maps:[a,b,d],relations:[]};
 assert.throws(()=>checkAtlas(m.atlas,m),/Ciclo de submapas/);
 d.parent='';d.parentCell='';
 assert.equal(checkAtlas(m.atlas,m),m.atlas);
});
