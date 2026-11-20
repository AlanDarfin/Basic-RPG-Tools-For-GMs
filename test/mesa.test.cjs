'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const { blankMesa, newCampaign, newEntry, newEncounter, yamlSheet, checkMesa, checkEncounter, sourceRoster,
  buildRunning, step, changeResource, order, arkanisSheet, find } = require('../src/mesa');

function setup() {
  const m=blankMesa(), c={...newCampaign(),name:'Crônicas de Arkanis'};
  const sheet=yamlSheet({name:'Guardião',hp:'6 (2d6)',ac:13,stats:[1,2,3,4,5,6],xp:50,
    actions:[{name:'Ação teste',desc:'Descrição',roll:'1d6'}],traits:[{name:'Imóvel',desc:'Não se move.'}]},c.id);
  const hero=arkanisSheet(c.id);
  m.campaigns.push(c); m.sheets.push(sheet,hero);
  return {m,c,sheet,hero};
}
test('importa a ficha sem exigir D&D, preserva grupos e cria recursos do modelo',()=>{
  const {sheet,hero}=setup();
  assert.ok(sheet.attributes.some(a=>a.name==='CA' && a.value==='13'));
  assert.ok(sheet.attributes.some(a=>a.name==='CAR' && a.value==='6'));
  assert.equal(sheet.resources[0].max,6);
  assert.equal(sheet.actions[0].roll,'1d6');
  assert.equal(sheet.actions[1].group,'Traço');
  assert.deepEqual(hero.resources.map(x=>x.name),['Vida','Esforço','Impulso','Estresse']);
  assert.throws(()=>yamlSheet({name:'Incompleto',resources:[{name:'Energia',max:2,value:3}]}),/valor entre zero/);
});
test('lista com dado de quantidade, iniciativa agrupada e desempate pela ordem de entrada',()=>{
  const {m,c,sheet}=setup();
  const data={...newEncounter(c.id),name:'Ponte',grouped:true,roster:sourceRoster([
    {sheet:sheet.name,count:'1d4'}, {name:'Guia',count:1,side:'allies',initiative:1},
  ],m,c.id)};
  const rolls=[.76,.15], r=buildRunning(data,m,()=>rolls.shift());
  assert.equal(r.members.length,5);
  assert.deepEqual(r.members.slice(0,4).map(x=>x.name),['Guardião 1','Guardião 2','Guardião 3','Guardião 4']);
  assert.ok(r.members.slice(0,4).every(x=>x.initiative===4));
  assert.equal(r.members[4].initiative,1);
  assert.equal(m.running,null);
  m.running=r; assert.equal(checkMesa(m),m);
  r.members[4].initiative=4; order(r.members);
  assert.equal(r.members.at(-1).name,'Guia');
});
test('turnos avante e para trás preservam identidade e recursos dos clones não afetam a ficha',()=>{
  const {m,c,sheet}=setup();
  const data={...newEncounter(c.id),name:'Ponte',roster:sourceRoster([{sheet:sheet.name,count:2,initiative:10}],m,c.id)};
  const r=buildRunning(data,m);
  const first=r.turn, second=r.members[1].id;
  step(r,-1); assert.equal(r.turn,first);
  step(r); assert.equal(r.turn,second);
  step(r); assert.equal(r.round,2); assert.equal(r.turn,first);
  step(r,-1); assert.equal(r.round,1); assert.equal(r.turn,second);
  changeResource(r,first,0,-40); assert.equal(r.members[0].resources[0].value,0);
  assert.equal(r.members[1].resources[0].value,6);
  assert.equal(sheet.resources[0].value,6);
  changeResource(r,first,0,200); assert.equal(r.members[0].resources[0].value,6);
});
test('protege vínculos, quantidades e nomes ambíguos',()=>{
  const {m,c,sheet}=setup();
  const other={...newCampaign(),name:'Segunda campanha'}; m.campaigns.push(other);
  const e={...newEntry(c.id),name:'Primeira cena'}, f={...newEntry(other.id),name:'Pista'};
  m.entries.push(e,f); checkMesa(m);
  e.links=[f.id]; assert.throws(()=>checkMesa(m),/vínculos/);
  e.links=[]; checkMesa(m);
  const encounter={...newEncounter(c.id),name:'Ponte',roster:sourceRoster([{sheet:sheet.name,count:'1d4-1'}],m,c.id)};
  assert.throws(()=>checkEncounter(encounter),/quantidade/);
  m.sheets.push(yamlSheet({name:sheet.name}));
  assert.throws(()=>find(m.sheets,sheet.name),/mais de um/);
  assert.equal(find(m.sheets,sheet.id),sheet);
});
