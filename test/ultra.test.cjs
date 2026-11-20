'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {blankMesa,newCampaign,newSheet,newEncounter,sourceRoster,buildRunning,checkMesa}=require('../src/mesa');
const {roll,randomContent,activeResources,updateSheetResource,restSheet,executeAction,getAssets,formatAsset}=require('../src/ultra');
function fixture(){
  const m=blankMesa();
  const c={...newCampaign(),name:'Crônicas'};m.campaigns.push(c);
  const hero={...newSheet(c.id),name:'Rhana',kind:'player',initiative:'18',
    resources:[{name:'Vida',value:10,max:10,rest:'max'},{name:'Esforço',value:2,max:2,rest:'max'},{name:'Impulso',value:0,max:3,rest:'zero'}],
    actions:[{name:'Golpe',group:'Ação',text:'',roll:'1d20+3',damage:'1d6+1',cost:'Esforço:1'}]};
  const enemy={...newSheet(c.id),name:'Guarda',kind:'creature',initiative:'10',
    attributes:[{name:'CA',value:'14'}],resources:[{name:'Vida',value:8,max:8}],actions:[]};
  m.sheets.push(hero,enemy);
  m.running=buildRunning({...newEncounter(c.id),name:'Portão',roster:sourceRoster([
    {sheet:'Rhana',side:'players',initiative:18},{sheet:'Guarda',side:'enemies',initiative:10}
  ],m,c.id)},m);
  return {m,c,hero,enemy};
}
test('resolver ação valida CA, aplica dano na cópia, consome recurso e registra histórico',()=>{
  const {m,hero,enemy}=fixture();
  const actor=m.running.members.find(x=>x.name==='Rhana');
  const target=m.running.members.find(x=>x.name==='Guarda');
  const random=[0.8,0.4];
  const r=executeAction(m,actor.id,0,target.id,()=>random.shift());
  assert.equal(r.hit,true);
  assert.equal(r.attack.total,20);
  assert.equal(r.damage.total,4);
  assert.equal(target.resources[0].value,4);
  assert.equal(actor.resources[1].value,1);
  assert.equal(hero.resources[1].value,2);
  assert.equal(enemy.resources[0].value,8);
  assert.match(m.activity[0].detail,/Vida restante 4/);
  assert.equal(checkMesa(m),m);
});
test('erro na CA não desconta dano; falta de recurso não muda o encontro',()=>{
  const {m}=fixture(),run=m.running;
  const actor=run.members.find(x=>x.name==='Rhana'),target=run.members.find(x=>x.name==='Guarda');
  const random=[.1,.8];
  const r=executeAction(m,actor.id,0,target.id,()=>random.shift());
  assert.equal(r.hit,false);assert.equal(target.resources[0].value,8);
  actor.resources[1].value=0;
  assert.throws(()=>executeAction(m,actor.id,0,target.id),/insuficiente/);
  assert.equal(m.activity.length,1);
  assert.equal(target.resources[0].value,8);
});
test('sem CA, um ataque não aplica dano automaticamente',()=>{
  const {m}=fixture(),run=m.running;
  const actor=run.members.find(x=>x.name==='Rhana'),target=run.members.find(x=>x.name==='Guarda');
  target.sheet.attributes=[];
  const r=executeAction(m,actor.id,0,target.id,()=>.8);
  assert.equal(r.hit,null);assert.equal(r.applied,false);
  assert.equal(target.resources[0].value,8);
  assert.match(r.entry.detail,/CA desconhecida/);
});
test('recursos ao vivo e descanso são persistidos sem sobrescrever o modelo',()=>{
  const {m,hero}=fixture();
  updateSheetResource(m,hero.id,'Vida',-7);
  updateSheetResource(m,hero.id,'Esforço',-2);
  updateSheetResource(m,hero.id,'Impulso',2);
  assert.deepEqual(activeResources(m,hero).map(x=>x.value),[3,0,2]);
  restSheet(m,hero.id);
  assert.deepEqual(activeResources(m,hero).map(x=>x.value),[10,2,0]);
  assert.deepEqual(hero.resources.map(x=>x.value),[10,2,0]);
  assert.equal(checkMesa(m),m);
});
test('geradores locais cobrem NPC, local, taverna, aventura, tesouro e encontro',()=>{
  for(const kind of ['npc','site','tavern','hook','loot','encounter']){
    const result=randomContent(kind,()=>0.2);
    assert.ok(result.title.length>2);
    assert.ok(result.body.length>10);
    assert.ok(result.entryKind);
  }
  assert.throws(()=>randomContent('__proto__'),/desconhecido/);
});
test('biblioteca local diferencia imagem, áudio e nota sem rede',()=>{
  const vault={getFiles:()=>['Arte/Mapa.png','Audio/Clima.mp3','Sessões/Torre.md','script.exe'].map(path=>({path}))};
  assert.deepEqual(getAssets(vault,'', 'image').map(x=>x.path),['Arte/Mapa.png']);
  assert.deepEqual(getAssets(vault,'', 'audio').map(x=>x.path),['Audio/Clima.mp3']);
  assert.deepEqual(getAssets(vault,'torre','all').map(x=>x.path),['Sessões/Torre.md']);
  assert.equal(formatAsset('Arte/Mapa.png'),'![[Arte/Mapa.png]]');
  assert.equal(formatAsset('Sessões/Torre.md'),'[[Sessões/Torre.md]]');
});
test('motor aceita dados fixos e dados comuns',()=>{
  assert.equal(roll('12').total,12);
  assert.equal(roll('1d6+2',()=>0).total,3);
  assert.throws(()=>roll('1d0'),/expressão/);
});
