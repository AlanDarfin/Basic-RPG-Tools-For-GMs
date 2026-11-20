'use strict';
const { newCalendar, copy, uid, validateCalendar, CalendarEngine } = require('./calendar');
const { gregorian } = require('./interchange');
const arkanis = require('./arkanis.json');

const CALENDAR_TEMPLATES=Object.freeze([
 {id:'arkanis',name:'Arkanis',category:'Fantasia',description:'Mundo de exemplo com 26 meses, semana de 12 dias, três sóis, três luas, estações e eventos.',details:'26 meses · 12 dias/semana · 32 horas/dia'},
 {id:'gregorian',name:'Gregoriano',category:'Histórico',description:'Calendário civil com 12 meses, sete dias por semana e anos bissextos com regra 4/100/400.',details:'12 meses · 7 dias/semana · 24 horas/dia'},
 {id:'thirteen-moons',name:'13 Luas',category:'Fantasia',description:'Treze meses de 28 dias e um dia fora da semana ao fim do ano. Exemplo fictício editável.',details:'13 meses · 7 dias/semana · 365 dias/ano'},
 {id:'lunar-fantasy',name:'Lunar de campanha',category:'Fantasia',description:'Doze meses alternando 30 e 29 dias, com 354 dias/ano. Modelo fictício, não representa um calendário religioso.',details:'12 meses · 7 dias/semana · 354 dias/ano'},
 {id:'solar-eight',name:'Solar de oito dias',category:'Fantasia',description:'Doze meses de 30 dias, semana de 8 dias e cinco dias festivos fora da semana.',details:'12 meses · 8 dias/semana · 365 dias/ano'},
 {id:'blank',name:'Personalizado em branco',category:'Livre',description:'Estrutura neutra para criar um calendário totalmente novo.',details:'4 meses de exemplo · editável'}
]);
const special=(name,month,after,number)=>({
 id:uid('special'),name,month,after,intercalary:true,every:1,except:0,also:0,offset:0,order:number
});
function makeTemplate(id,now=new Date()){
 if(!CALENDAR_TEMPLATES.some(t=>t.id===id))throw new Error('Modelo de calendário não encontrado.');
 if(id==='arkanis'){
   const c=copy(arkanis);c.id=uid('cal');
   c.description=(c.description||'')||'Calendário demonstrativo de Arkanis.';
   return validateCalendar(c);
 }
 if(id==='gregorian'){
   const c=gregorian(now);
   c.id=uid('cal');
   c.description='Modelo civil gregoriano, com anos bissextos segundo a regra de 4/100/400.';
   // A fresh template must begin with the local date; its year has no zero.
   c.firstWeekday=0;c.firstYear=1;
   return validateCalendar(c);
 }
 const c=newCalendar();
 c.id=uid('cal');c.events=[];c.moons=[];c.seasons=[];c.eras=[];
 c.firstYear=1;c.firstWeekday=0;c.weekOverflow=true;
 c.current={year:1,month:c.months[0].id,day:1,hour:0,minute:0};
 c.description=CALENDAR_TEMPLATES.find(t=>t.id===id).description;
 if(id==='thirteen-moons'){
   c.name='13 Luas';c.months=Array.from({length:13},(_,i)=>({id:'lua-'+(i+1),name:'Lua '+(i+1),length:28,intercalary:false}));
   c.week=['Primeiro','Segundo','Terceiro','Quarto','Quinto','Sexto','Sétimo'];
   c.leapDays=[special('Dia fora do tempo',c.months[12].id,28,1)];
   c.moons=[{id:'lua-principal',name:'Lua',period:28,offset:0,granularity:8,rounding:'round',hidden:false}];
 }else if(id==='lunar-fantasy'){
   c.name='Lunar de campanha';
   c.months=Array.from({length:12},(_,i)=>({id:'ciclo-'+(i+1),name:'Ciclo '+(i+1),length:i%2===0?30:29,intercalary:false}));
   c.moons=[{id:'lua-principal',name:'Lua',period:29.5,offset:0,granularity:8,rounding:'round',hidden:false}];
 }else if(id==='solar-eight'){
   c.name='Solar de oito dias';
   c.months=Array.from({length:12},(_,i)=>({id:'estacao-'+(i+1),name:'Mês '+(i+1),length:30,intercalary:false}));
   c.week=['Aurora','Vento','Fogo','Água','Terra','Luz','Sombra','Descanso'];
   c.leapDays=['Festival do Sol','Festival das Águas','Festival da Terra','Festival do Vento','Festival das Estrelas']
    .map((name,i)=>special(name,c.months[11].id,30,i+1));
 }else{
   c.name='Meu mundo';c.description='Calendário simples editável, ponto de partida para criar outro mundo.';
 }
 c.current.month=c.months[0].id;
 c.sky.unitPeriod=new CalendarEngine(c).yearInfo(1).total;
 return validateCalendar(c);
}
module.exports={CALENDAR_TEMPLATES,makeTemplate};
