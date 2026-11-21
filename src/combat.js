'use strict';
const {uid}=require('./calendar');
const {key,clean,clamp,parseDice,rollDice,dieRoll}=require('./solo');
const ensure=(ok,msg)=>{if(!ok)throw new Error(msg);};
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const formula=x=>typeof x==='string'&&x.length<=60&&!!parseDice(x);
const PRESETS=[
 {name:'Sangramento',rounds:3,resource:'Vida',amount:'1d4',effect:'damage'},
 {name:'Envenenado',rounds:3,resource:'Vida',amount:'1d4',effect:'damage'},
 {name:'Regeneração',rounds:3,resource:'Vida',amount:'1d4',effect:'heal'},
 {name:'Atordoado',rounds:1,resource:'',amount:'',effect:'none',blocked:true},
 {name:'Condição personalizada',rounds:1,resource:'',amount:'',effect:'none'}
];
function freshEffect(preset=PRESETS[4]){
 return {id:uid('effect'),name:preset.name,rounds:preset.rounds,resource:preset.resource,amount:preset.amount,
  effect:preset.effect,blocked:!!preset.blocked,save:'',dc:10};
}
function checkEffect(e){
 ensure(e&&typeof e.id==='string'&&!!e.id&&e.id.length<=150&&typeof e.name==='string'&&!!e.name.trim()&&e.name.length<=120,
  'Nome ou ID de condição inválido.');
 ensure(integer(e.rounds,0,999)&&['none','damage','heal'].includes(e.effect)&&typeof e.blocked==='boolean','Duração ou tipo de efeito inválido.');
 ensure(typeof e.resource==='string'&&e.resource.length<=120&&typeof e.amount==='string'&&
  (e.effect==='none'||(!!e.resource.trim()&&formula(e.amount))),'Informe recurso e dados válidos para o efeito.');
 ensure(typeof e.save==='string'&&e.save.length<=120&&integer(e.dc,-100000,100000),'Teste de resistência inválido.');
 return e;
}
function checkAdvanced(r){
 if(!r)return;
 ensure(r.advancedTurns===undefined||typeof r.advancedTurns==='boolean','Controle de turnos inválido.');
 for(const member of r.members){
  if(member.effects===undefined)continue;
  ensure(Array.isArray(member.effects)&&member.effects.length<=20&&new Set(member.effects.map(e=>e.id)).size===member.effects.length,'Condições automáticas inválidas.');
  member.effects.forEach(checkEffect);
 }
}
function attribute(member,name){
 const a=member?.sheet?.attributes?.find(x=>key(x.name)===key(name));
 if(!a||!String(a.value).trim())return null;
 const n=Number(a.value);
 return Number.isFinite(n)?n:null;
}
function resistance(target,name,dc,rng=Math.random){
 const bonus=attribute(target,name);
 if(bonus===null)return null;
 const check=rollDice('1d20',rng);
 return {total:check.total+bonus,values:check.values,bonus,dc,passed:check.total+bonus>=dc};
}
function meter(member,name){
 return member?.resources?.find(r=>key(r.name)===key(name));
}
function addEffect(r,id,e){
 checkEffect(e);
 const p=r.members.find(p=>p.id===id);ensure(p,'Participante não encontrado.');
 ensure(e.effect==='none'||meter(p,e.resource),'O participante não tem esse recurso.');
 ensure(!e.save||attribute(p,e.save)!==null,'A resistência precisa apontar para um atributo numérico da ficha.');
 p.effects ||= [];
 ensure(p.effects.length<20,'Limite de 20 condições automáticas por participante.');
 p.effects.push({...e});return e;
}
function checkAction(a){
 ensure(!a.defense||(typeof a.defense==='string'&&a.defense.length<=120),'Atributo de defesa inválido.');
 ensure(!a.resolution||['attack','save','direct','heal'].includes(a.resolution),'Modo de resolução inválido.');
 ensure(!a.targetResource||(typeof a.targetResource==='string'&&a.targetResource.length<=120),'Recurso alvo inválido.');
 ensure(a.saveDC===undefined||integer(a.saveDC,-100000,100000),'Dificuldade inválida.');
 ensure(!a.saveAttribute||(typeof a.saveAttribute==='string'&&a.saveAttribute.length<=120),'Atributo de resistência inválido.');
 ensure(a.halfOnSave===undefined||typeof a.halfOnSave==='boolean','Regra de resistência inválida.');
 if(a.resolution==='save')ensure(!!a.saveAttribute&&integer(a.saveDC,-100000,100000),'Informe atributo e dificuldade para a resistência.');
 ensure(!a.customDie||(typeof a.customDie==='string'&&a.customDie.length<=150),'Dado personalizado inválido.');
 ensure(a.dieCount===undefined||integer(a.dieCount,1,20),'Role de 1 a 20 dados personalizados por ação.');
}
function specialRoll(a,solo,rng){
 if(!a.customDie)return null;
 const die=solo?.dice?.find(x=>x.id===a.customDie);
 ensure(die,'O dado personalizado da ação não está na biblioteca do Kit Solo.');
 const result=dieRoll(die,a.dieCount||1,rng);
 return {name:die.name,total:result.total,faces:result.faces.map(f=>({...f}))};
}
function faceText(f){return f.kind==='number'?String(f.value):f.label||f.image||'Face';}
// Resolve effects only at the end of the owner's turn. Resistances are explicit flat bonuses.
function advanceCombat(m,direction=1,rng=Math.random){
 const r=m.running;ensure(r,'Nenhum encontro em andamento.');
 const {step}=require('./mesa');
 const {record}=require('./ultra');
 if(direction<0){
  ensure(!r.advancedTurns,'Não é possível retroceder turnos após efeitos automáticos. Ajuste recursos manualmente.');
  step(r,-1);return [];
 }
 ensure(direction===1,'Direção inválida.');
 const p=r.members.find(x=>x.id===r.turn);ensure(p,'Participante atual não encontrado.');
 if(r.round===999999&&p.id===r.members.at(-1).id)throw new Error('O encontro atingiu o limite de rodadas.');
 const notes=[];
 for(const e of p.effects||[]){
  const save=e.save?resistance(p,e.save,e.dc,rng):null;
  if(save?.passed){notes.push(e.name+' · resistência '+save.total+' / '+e.dc+' · removida');e.expired=true;continue;}
  if(e.save&&save===null)notes.push(e.name+' · resistência indisponível');
  else if(save)notes.push(e.name+' · resistência '+save.total+' / '+e.dc+' · falhou');
  if(e.effect!=='none'){
   const target=meter(p,e.resource);
   if(target){
    const n=Math.max(0,rollDice(e.amount,rng).total),before=target.value;
    target.value=clamp(target.value+(e.effect==='heal'?n:-n),0,target.max);
    notes.push(e.name+' · '+e.resource+' '+(target.value-before>=0?'+':'')+(target.value-before)+' ('+target.value+'/'+target.max+')');
   }else notes.push(e.name+' · recurso não encontrado');
  }
  if(e.rounds>0&&--e.rounds===0){e.expired=true;notes.push(e.name+' · duração encerrada');}
 }
 if(p.effects?.length){r.advancedTurns=true;p.effects=p.effects.filter(e=>!e.expired);}
 if(notes.length)record(m,p.name+' · fim do turno',notes.join(' · '),'condição');
 step(r,1);return notes;
}
module.exports={PRESETS,freshEffect,checkEffect,checkAdvanced,checkAction,attribute,resistance,meter,addEffect,specialRoll,faceText,advanceCombat};
