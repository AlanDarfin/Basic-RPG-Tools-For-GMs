'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {blankMesa,newCampaign,newSheet,newEncounter,sourceRoster,buildRunning,checkMesa}=require('../src/mesa');
const {freshEffect,PRESETS,addEffect,advanceCombat}=require('../src/combat');
const {executeAction,executeSheetAction}=require('../src/ultra');
function fixture(){
 const m=blankMesa(),c={...newCampaign(),name:'Teste'};m.campaigns.push(c);
 const a={...newSheet(c.id),name:'Heroi',kind:'player',initiative:'20',resources:[{name:'Vida',max:20,value:10},{name:'Esforço',max:5,value:5}],actions:[{name:'Ataque',roll:'1d20',damage:'1d6',cost:'Esforço:1',text:'',group:'Ação'}]};
 const b={...newSheet(c.id),name:'Inimigo',initiative:'10',resources:[{name:'Vida',max:20,value:20},{name:'Estresse',max:10,value:10}],attributes:[{name:'Defesa',value:'12'},{name:'Vontade',value:'3'}]};
 m.sheets.push(a,b);m.running=buildRunning({...newEncounter(c.id),name:'Encontro',roster:sourceRoster([{sheet:a.name,side:'players',initiative:20},{sheet:b.name,side:'enemies',initiative:10}],m,c.id)},m);
 return {m,a,b,actor:m.running.members[0],target:m.running.members[1]};
}
test('sangramento aplica dano no fim do turno do dono e expira após dois turnos',()=>{
 const {m,actor,target}=fixture();
 addEffect(m.running,actor.id,{...freshEffect(PRESETS[0]),rounds:2});
 advanceCombat(m,1,()=>0);assert.equal(actor.resources[0].value,9);assert.equal(actor.effects[0].rounds,1);assert.equal(target.resources[0].value,20);
 advanceCombat(m);advanceCombat(m,1,()=>0);assert.equal(actor.resources[0].value,8);assert.equal(actor.effects.length,0);assert.equal(checkMesa(m),m);
 assert.throws(()=>advanceCombat(m,-1),/retroceder/);
});
test('regeneração permanente limita a cura ao máximo',()=>{
 const {m,actor}=fixture();actor.resources[0].value=19;
 addEffect(m.running,actor.id,{...freshEffect(PRESETS[2]),rounds:0});
 advanceCombat(m,1,()=>.99);assert.equal(actor.resources[0].value,20);assert.equal(actor.effects[0].rounds,0);
});
test('atordoamento impede ações até acabar o turno',()=>{
 const {m,actor,target}=fixture();addEffect(m.running,actor.id,freshEffect(PRESETS[3]));
 assert.throws(()=>executeAction(m,actor.id,0,target.id),/impedido/);assert.equal(actor.resources[1].value,5);
 advanceCombat(m);assert.equal(actor.effects.length,0);
});
test('resistência pode remover uma condição antes do dano',()=>{
 const {m,actor,target}=fixture();addEffect(m.running,target.id,{...freshEffect(PRESETS[0]),save:'Vontade',dc:10});
 advanceCombat(m);advanceCombat(m,1,()=>.9);assert.equal(target.resources[0].value,20);assert.equal(target.effects.length,0);
});
test('defesa e recurso personalizados resolvem ações sem depender de CA',()=>{
 const {m,actor,target}=fixture();Object.assign(actor.sheet.actions[0],{defense:'Defesa',targetResource:'Estresse'});
 const r=executeAction(m,actor.id,0,target.id,()=>.9);
 assert.equal(r.hit,true);assert.equal(target.resources[1].value,4);assert.equal(target.resources[0].value,20);
});
test('resistência bem sucedida reduz dano à metade quando configurada',()=>{
 const {m,actor,target}=fixture();Object.assign(actor.sheet.actions[0],{resolution:'save',saveAttribute:'Vontade',saveDC:12,halfOnSave:true});
 const r=executeAction(m,actor.id,0,target.id,()=>.9);
 assert.equal(r.save.passed,true);assert.equal(target.resources[0].value,17);
});
test('resistência desconhecida não aplica dano automaticamente',()=>{
 const {m,actor,target}=fixture();Object.assign(actor.sheet.actions[0],{resolution:'save',saveAttribute:'Inexistente',saveDC:12});
 const r=executeAction(m,actor.id,0,target.id,()=>.9);
 assert.equal(r.applied,false);assert.equal(target.resources[0].value,20);
});
test('cura direta e ausência de recurso alvo não corrompem o estado',()=>{
 const {m,actor,target}=fixture();Object.assign(actor.sheet.actions[0],{resolution:'heal',targetResource:'Vida'});
 executeAction(m,actor.id,0,actor.id,()=>.9);assert.equal(actor.resources[0].value,16);
 actor.sheet.actions[0].targetResource='Inexistente';const old=actor.resources[1].value;
 assert.throws(()=>executeAction(m,actor.id,0,target.id,()=>.9),/recurso/);assert.equal(actor.resources[1].value,old);
});
test('dados de imagem e texto são reutilizados do Kit Solo e não causam dano arbitrário',()=>{
 const {m,a,actor,target}=fixture();const solo={dice:[{id:'symbols',name:'Símbolos',faces:[{kind:'text',label:'Acerto'},{kind:'image',image:'Icones/estrela.png',label:'Estrela'}]}]};
 Object.assign(actor.sheet.actions[0],{customDie:'symbols',dieCount:2,roll:'',damage:''});
 const x=executeAction(m,actor.id,0,target.id,()=>.9,solo);
 assert.equal(x.custom.faces[0].kind,'image');assert.equal(x.custom.total,null);assert.equal(x.applied,false);assert.equal(target.resources[0].value,20);
 Object.assign(a.actions[0],{customDie:'symbols',dieCount:1});
 const result=executeSheetAction(m,a.id,0,()=>0,solo);assert.equal(result.custom.faces[0].label,'Acerto');
 assert.equal(checkMesa(m),m);
});
test('dados antigos mantêm compatibilidade e turno anterior sem efeito',()=>{
 const {m}=fixture();advanceCombat(m);advanceCombat(m,-1);assert.equal(m.running.round,1);assert.equal(m.running.turn,m.running.members[0].id);assert.equal(checkMesa(m),m);
});
