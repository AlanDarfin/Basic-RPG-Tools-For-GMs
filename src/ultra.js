'use strict';
const { copy, uid } = require('./calendar');
const { key, clean, clamp, rollDice, parseDice, pick } = require('./solo');
const { DICT } = require('./solo-tables');
const { requireMesa } = require('./mesa');
const {attribute,resistance,meter,specialRoll,faceText}=require('./combat');

const CONTENT = Object.freeze({
 npc: 'Personagem / NPC', site: 'Local / Povoado', tavern: 'Taverna', hook: 'Gancho de aventura', loot: 'Tesouro', encounter: 'Ideia de encontro'
});
const FIRST = ['Arlen','Vera','Eldric','Liora','Nara','Darian','Mira','Thorne','Kael','Ysara','Malek','Serin','Rhana','Lys','Fenric'];
const LAST = ['dos Vales','da Ponte','Noctis','da Névoa','Ventor','de Cinzabruma','do Norte','Auri','do Ferro'];
const ADJ = ['antiga','perdida','silenciosa','escondida','amaldiçoada','esquecida','radiante','abandonada'];
const NAMES = ['Coroa','Ponte','Lanterna','Vale','Corvo','Carvalho','Rosa','Luar','Último Sol','Viajante'];
const LOCATION = ['vale coberto de névoa','porto distante','passagem entre montanhas','estrada esquecida','vilarejo fortificado','floresta de pinheiros'];
const DETAILS = ['um segredo da família real','uma dívida não paga','um mapa desaparecido','uma relíquia selada','um crime nunca resolvido','um pacto proibido'];
function roll(formula,rng=Math.random) {
  const text=String(formula||'').trim();
  requireMesa(text.length>0 && text.length<=60, 'Expressão de dado inválida.');
  if (/^[-+]?\d{1,7}$/.test(text)) return {total:Number(text),values:[Number(text)]};
  requireMesa(!!parseDice(text), 'Use uma expressão como 1d20+3.');
  return rollDice(text,rng);
}
function record(m, title, detail, type='sistema') {
  m.activity ||= [];
  const item={id:uid('log'),time:new Date().toISOString(),title:clean(title,160),detail:clean(detail,1000),type};
  m.activity.unshift(item);
  m.activity=m.activity.slice(0,150);
  return item;
}
function activeResources(m,sheet) {
  const saved=m.sheetStates?.[sheet.id];
  return sheet.resources.map((r,i) => {
    const found=Array.isArray(saved) ? saved.find(v=>key(v.name)===key(r.name)) : null;
    return {name:r.name,max:r.max,value:clamp(Number.isInteger(found?.value)?found.value:r.value,0,r.max),rest:r.rest||''};
  });
}
function updateSheetResource(m,id,name,delta) {
  const s=m.sheets.find(x=>x.id===id);
  requireMesa(!!s,'Ficha não encontrada na biblioteca.');
  requireMesa(Number.isSafeInteger(delta)&&Math.abs(delta)<=100000,'Ajuste de recurso inválido.');
  const resources=activeResources(m,s);
  const r=resources.find(x=>key(x.name)===key(name));
  requireMesa(!!r,'Recurso não encontrado.');
  r.value=clamp(r.value+delta,0,r.max);
  m.sheetStates ||= {}; m.sheetStates[id]=resources;
  record(m,s.name, r.name+': '+r.value+'/'+r.max,'recurso');
  return r;
}
function restResources(resources) {
  for(const r of resources) {
    const strategy=r.rest || (r.value===0 && r.max>0 ? 'zero':'max');
    if(strategy==='max') r.value=r.max;
    if(strategy==='zero') r.value=0;
  }
  return resources;
}
function restSheet(m,id) {
  const s=m.sheets.find(x=>x.id===id);
  requireMesa(!!s,'Ficha não encontrada.');
  const resources=activeResources(m,s);
  for(const r of resources){
    if(!r.rest){ const original=s.resources.find(x=>key(x.name)===key(r.name));r.rest=original?.value===0?'zero':'max'; }
  }
  restResources(resources);
  m.sheetStates ||= {};m.sheetStates[id]=resources;
  record(m,s.name,'Recursos restaurados segundo as regras configuradas da ficha.','descanso');
  return resources;
}
function executeSheetAction(m,id,actionIndex,rng=Math.random,solo=null) {
  const s=m.sheets.find(x=>x.id===id);
  requireMesa(!!s,'Ficha não encontrada.');
  const action=s.actions[actionIndex];
  requireMesa(!!action,'Ação não encontrada.');
  const cost=actionCost(action);
  const resources=activeResources(m,s);
  const meter=cost&&resources.find(r=>key(r.name)===key(cost.name));
  if(cost)requireMesa(meter&&meter.value>=cost.amount,'Recurso insuficiente: '+cost.name+'.');
  const check=action.roll?roll(action.roll,rng):null;
  const damage=action.damage?roll(action.damage,rng):null;
  const custom=specialRoll(action,solo,rng);
  if(meter)meter.value-=cost.amount;
  if(meter){m.sheetStates ||= {};m.sheetStates[id]=resources;}
  const detail=[s.name+' usa '+action.name,
    check?'teste '+check.total+' ('+check.values.join(', ')+')':'',
    damage?'dano '+damage.total+' ('+damage.values.join(', ')+')':'',
    cost?'gastou '+cost.amount+' '+cost.name:'',custom?custom.name+' · '+custom.faces.map(faceText).join(', '):''].filter(Boolean).join(' · ');
  const entry=record(m,s.name+' · '+action.name,detail,'ação');
  if(custom)entry.customRoll=custom;
  return {check,damage,custom,entry};
}
function armor(target) {
  if(!target?.sheet?.attributes) return null;
  const stat=target.sheet.attributes.find(a=>['ca','ac','armadura','classe de armadura'].includes(key(a.name)));
  const n=stat?Number(stat.value):NaN;
  return Number.isFinite(n)?n:null;
}
function actionCost(action){
  if(!action?.cost) return null;
  const match=String(action.cost).trim().match(/^([^:]{1,100}):([1-9]\d{0,3})$/);
  requireMesa(!!match,'Custo inválido. Use Recurso:quantidade, como Esforço:2.');
  return {name:clean(match[1]),amount:Number(match[2])};
}
function executeAction(m,actorId,actionIndex,targetId='',rng=Math.random,solo=null) {
  const run=m.running;
  requireMesa(!!run,'Nenhum encontro em andamento.');
  const actor=run.members.find(x=>x.id===actorId);
  requireMesa(!!actor,'Participante não encontrado.');
  requireMesa(!actor.effects?.some(e=>e.blocked),'Este participante está impedido de agir por uma condição.');
  const action=actor.sheet?.actions?.[actionIndex];
  requireMesa(!!action,'Escolha uma ação presente na ficha do participante.');
  const target=targetId?run.members.find(x=>x.id===targetId):null;
  requireMesa(!targetId||!!target,'Alvo não encontrado.');
  const cost=actionCost(action),resource=cost?meter(actor,cost.name):null;
  if(cost)requireMesa(resource&&resource.value>=cost.amount,'Recurso insuficiente: '+cost.name+'.');
  const mode=action.resolution||'attack';
  const attack=action.roll?roll(action.roll,rng):null;
  const damage=action.damage?roll(action.damage,rng):null;
  const custom=specialRoll(action,solo,rng);
  const defence=mode==='attack'?(action.defense?attribute(target,action.defense):armor(target)):null;
  const save=target&&mode==='save'?resistance(target,action.saveAttribute,action.saveDC,rng):null;
  const hit=mode==='attack'&&target&&attack?(defence===null?null:attack.total>=defence):null;
  const applicable=!!(damage&&target&&(mode==='attack'?(!attack||hit===true):mode==='save'?!!save&&(!save.passed||action.halfOnSave):true));
  const hp=applicable?(action.targetResource?meter(target,action.targetResource):target.resources.find(r=>['vida','hp','pv','pontos de vida'].includes(key(r.name)))):null;
  if(applicable)requireMesa(hp,'Alvo sem recurso Vida/HP/PV ou recurso alvo configurado.');
  let amount=damage?Math.max(0,Math.floor(damage.total)):0;
  if(mode==='save'&&save?.passed)amount=Math.floor(amount/2);
  if(resource)resource.value-=cost.amount;
  if(hp)hp.value=clamp(hp.value+(mode==='heal'?amount:-amount),0,hp.max);
  const parts=[actor.name+' usa '+action.name,
    attack?'teste '+attack.total+' ('+attack.values.join(', ')+')':'sem teste',
    target?'em '+target.name:'',
    mode==='attack'&&target&&attack?(defence===null?'CA desconhecida: dano não aplicado':hit?'acertou '+(action.defense||'CA')+' '+defence:'errou '+(action.defense||'CA')+' '+defence):'',
    mode==='save'&&target?(save?'resistência '+save.total+' / '+save.dc+(save.passed?' · passou':' · falhou'):'resistência indisponível: dano não aplicado'):'',
    damage?(mode==='heal'?'cura rolada ':'dano rolado ')+damage.total:'',
    applicable?(hp.name+' restante '+hp.value):'',
    cost?'gastou '+cost.amount+' '+cost.name:'',
    custom?custom.name+' · '+custom.faces.map(faceText).join(', '):''
  ].filter(Boolean);
  const item=record(m,actor.name+' · '+action.name,parts.join(' · '),'ação');
  if(custom)item.customRoll=custom;
  return {attack,damage,hit,save,custom,applied:applicable,entry:item};
}
function randomContent(kind,rng=Math.random) {
  requireMesa(Object.hasOwn(CONTENT,kind),'Gerador desconhecido.');
  const one=(list)=>pick(list,rng);
  const person=one(FIRST)+' '+one(LAST);
  let title='', lines=[],entryKind='event';
  if(kind==='npc') { title=person;lines=['Ocupação: '+one(DICT.job),'Traço: '+one(DICT.aspect),'Motivação: '+one(DETAILS)];entryKind='npc'; }
  if(kind==='site') { title=one(NAMES)+' '+one(['da Névoa','de Pedra','do Norte','dos Corvos']);lines=['Localização: '+one(LOCATION),'Marca do lugar: '+one(DETAILS)];entryKind='site'; }
  if(kind==='tavern') { title='A '+one(['Lanterna','Rosa','Coroa','Sombra'])+' '+one(['Partida','Dourada','Quebrada','Silenciosa']);lines=['Dono: '+person,'Especialidade: '+one(DICT.food||['ensopado','vinho de frutas','pão quente']),'Rumor: '+one(DETAILS)];entryKind='site'; }
  if(kind==='hook') {title='O '+one(NAMES)+' '+one(['Desaparecido','Silencioso','Partido']);lines=['Missão: '+one(DICT.job)+' precisa '+one(DICT.verb)+' '+one(DICT.noun),'Complicação: '+one(DETAILS)];entryKind='adventure';}
  if(kind==='loot') {title=one(['Anel','Chave','Máscara','Diário','Espada','Pergaminho'])+' '+one(['Antigo','de Prata','Esquecido','Selado']);lines=['Propriedade: '+one(DICT.adjective),'Origem: '+one(LOCATION)];entryKind='item';}
  if(kind==='encounter') {title='Encontro na '+one(NAMES);lines=['Cenário: '+one(LOCATION),'Obstáculo: '+one(DETAILS),'Grau de ameaça: a definir pelo mestre'];entryKind='scene';}
  return {kind,entryKind,title,body:lines.join('\n')};
}
function getAssets(vault,term='',kind='all',limit=100) {
  const list=vault.getFiles?.() || vault.getMarkdownFiles?.() || [];
  const allowed={
    image:/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i,
    audio:/\.(mp3|ogg|wav|flac|m4a|opus)$/i,
    note:/\.md$/i
  };
  return list.filter(f=>typeof f.path==='string'&&
    (kind==='all'?Object.values(allowed).some(rx=>rx.test(f.path)):allowed[kind]?.test(f.path))&&
    key(f.path).includes(key(term))).slice(0,limit);
}
function formatAsset(path) {
  const cleanPath=String(path).replace(/[\]\r\n]/g,'');
  const embed=!/\.md$/i.test(cleanPath);
  return (embed?'!':'')+'[['+cleanPath+']]';
}
function configObject(source,parseYaml) {
  const text=String(source||'').trim();
  requireMesa(text.length>0&&text.length<=10000,'Bloco vazio ou muito grande.');
  const obj=text.startsWith('{')?JSON.parse(text):parseYaml(text);
  requireMesa(obj&&typeof obj==='object'&&!Array.isArray(obj),'Use YAML ou JSON de objeto.');
  return obj;
}
module.exports={ CONTENT,roll,record,activeResources,updateSheetResource,restResources,restSheet,
  executeAction,executeSheetAction,randomContent,getAssets,formatAsset,configObject };
