'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const { CalendarEngine, copy, validateCalendar, MAX_YEAR } = require('../src/calendar');
const { REAL_DAY_MS, worldDate, anchor, ensureClock, alignLocal, transferDate } = require('../src/world-clock');
const { decodeImport, encodeExport } = require('../src/imports');
const preset=require('../src/arkanis.json');
const t=1800000000000;
function seed() { const c=copy(preset); ensureClock(c,t); return c; }

test('1 dia real equivale a 1 dia de Arkanis e não depende de ticks',()=>{
 const c=seed();
 assert.deepEqual(worldDate(c,t), c.current);
 assert.deepEqual(worldDate(c,t+REAL_DAY_MS/2),{year:1,month:'mes-1',day:1,hour:16,minute:0});
 assert.deepEqual(worldDate(c,t+REAL_DAY_MS*2.25),{year:1,month:'mes-1',day:3,hour:8,minute:0});
 assert.deepEqual(worldDate(c,t+REAL_DAY_MS-1),{year:1,month:'mes-1',day:1,hour:31,minute:63});
 assert.deepEqual(worldDate(c,t+REAL_DAY_MS),{year:1,month:'mes-1',day:2,hour:0,minute:0});
 assert.equal(c.current.day,1);
});
test('relógio passa de mês e ano sem tarefa em segundo plano',()=>{
 const c=seed(); const e=new CalendarEngine(c);
 anchor(c,{...e.fromEpoch(1007),hour:31,minute:63},'real',t);
 const d=worldDate(c,t+43_000);
 assert.deepEqual(d,{year:2,month:'mes-1',day:1,hour:0,minute:0});
 anchor(c,{year:MAX_YEAR,month:'mes-26',day:45,hour:31,minute:63},'real',t);
 assert.deepEqual(worldDate(c,t+REAL_DAY_MS*200),c.current);
});
test('manual pausa sem jogar data para trás e voltar ao vivo cria outra âncora',()=>{
 const c=seed();
 const now=worldDate(c,t+REAL_DAY_MS/2);
 anchor(c,now,'manual',t+REAL_DAY_MS/2);
 assert.deepEqual(worldDate(c,t+REAL_DAY_MS*3),now);
 anchor(c,now,'real',t+REAL_DAY_MS*3);
 assert.deepEqual(worldDate(c,t+REAL_DAY_MS*3.5),{year:1,month:'mes-1',day:2,hour:0,minute:0});
});
test('alinhar hora real mantém data do mundo e converte o meio-dia local',()=>{
 const c=seed(), midday=new Date(2026,10,19,12,0,0,0).getTime();
 assert.deepEqual(alignLocal(c,{year:4,month:'mes-2',day:5,hour:0,minute:17},midday),
   {year:4,month:'mes-2',day:5,hour:16,minute:0});
 const d=transferDate(c,{clock:{hours:24,minutes:60}}, {year:4,month:'mes-2',day:5,hour:16,minute:0});
 assert.deepEqual(d,{year:4,month:'mes-2',day:5,hour:12,minute:0});
});
test('backup próprio mantém a âncora e relógio legado ganha âncora sem trocar o dia',()=>{
 const c=seed();
 const imported=decodeImport(encodeExport(c)).calendar;
 assert.deepEqual(imported.clockSync,c.clockSync);
 assert.equal(worldDate(imported,t+REAL_DAY_MS*5).day,6);
 const prev=copy(preset);
 prev.current.day=21;
 assert.equal(ensureClock(prev,t),true);
 assert.equal(ensureClock(prev,t+20),false);
 assert.equal(worldDate(prev,t).day,21);
});
test('dados de relógio inválidos não são aceitos',()=>{
 const c=seed();
 c.clockSync.since=NaN;
 assert.throws(()=>validateCalendar(c),/Âncora/);
});
