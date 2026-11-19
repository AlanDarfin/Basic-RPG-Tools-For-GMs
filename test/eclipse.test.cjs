'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CalendarEngine, copy, validateCalendar } = require('../src/calendar');
const { eclipseDefaults, solarType, lunarType, overlapFraction, contacts, eclipsesForDay, nextEclipse } = require('../src/eclipse');
const { formatTime } = require('../src/sky');
const { decodeImport, encodeExport } = require('../src/imports');
const arc = require('../src/arkanis.json');
const e = new CalendarEngine(arc), total = arc.clock.hours * arc.clock.minutes;
const locate = (month, day) => e.epoch({year: 1, month: `mes-${month}`, day});

test('tipos solares e fração de disco vêm da geometria dos dois discos', () => {
  assert.equal(solarType(0, .4, .6), 'total');
  assert.equal(solarType(.01, .4, .2), 'annular');
  assert.equal(solarType(.3, .4, .2), 'partial');
  assert.equal(solarType(1, .4, .2), null);
  assert.equal(overlapFraction(0, .4, .2), .25);
  assert.equal(overlapFraction(0, .4, .6), 1);
  assert.equal(overlapFraction(1, .4, .6), 0);
  assert.ok(overlapFraction(.3, .4, .2) > 0 && overlapFraction(.3, .4, .2) < .25);
});
test('tipos lunares distinguem a umbra da penumbra', () => {
  assert.equal(lunarType(.1,.4,.85,1.2),'total');
  assert.equal(lunarType(.6,.4,.85,1.2),'partial');
  assert.equal(lunarType(1.4,.4,.85,1.2),'penumbral');
  assert.equal(lunarType(2,.4,.85,1.2),null);
});
test('contato analítico detecta eventos abaixo de um minuto', () => {
  const orbit = { p: [1,0,0], q: [0,1,0], start: -.155, speed: 1 };
  const theta = .4 * Math.PI / 180;
  const out = contacts(orbit, [Math.cos(theta),0,Math.sin(theta)], .4000001);
  assert.equal(out.length,1);
  assert.ok(out[0].end - out[0].start < 1 / 2048);
  assert.ok(Math.abs(out[0].peak - .155)<1e-10);
  assert.ok(out[0].peakInDay);
});
test('contato cortado na virada continua no dia seguinte sem duplicar o pico', () => {
  const base = {p:[1,0,0],q:[0,1,0],start:-1.001,speed:1};
  const [first] = contacts(base, [1,0,0], .2);
  const [next] = contacts({...base, start:base.start + 1}, [1,0,0], .2);
  assert.equal(first.end, 1);
  assert.ok(first.endsAfter && !first.peakInDay);
  assert.equal(next.start, 0);
  assert.ok(next.beginsBefore && next.peakInDay);
});
test('Arkanis tem total, anular e lunar total em datas verificadas', () => {
  const totalEvent = eclipsesForDay(arc,locate(17,18)).find((x)=>x.kind==='solar'&&x.type==='total'&&x.sun==='Dinart');
  assert.ok(totalEvent?.aboveHorizon);
  assert.equal(totalEvent.moon,'Verika');
  assert.equal(totalEvent.coverage,1);
  const annular = eclipsesForDay(arc,locate(3,27)).find((x)=>x.kind==='solar'&&x.type==='annular'&&x.sun==='Dinart');
  assert.ok(annular?.aboveHorizon);
  assert.equal(annular.moon,'Neurika');
  assert.ok(annular.coverage>.6 && annular.coverage<1);
  const lunar = eclipsesForDay(arc,locate(4,19)).find((x)=>x.kind==='lunar'&&x.type==='total'&&x.sun==='Reart');
  assert.ok(lunar?.aboveHorizon);
  assert.equal(lunar.moon,'Menrika');
});
test('a geometria ocorre mesmo com o alvo abaixo do horizonte e mantém horários válidos', () => {
  let below=0, above=0;
  for(let i=0;i<1008;i++)for(const x of eclipsesForDay(arc,i)) {
    assert.ok(x.start>=0 && x.peak>=x.start && x.end>=x.peak && x.end<=1);
    assert.ok(Number.isFinite(x.altitude));
    assert.equal(x.aboveHorizon,x.altitude>=0);
    if(x.aboveHorizon)above++;else below++;
    assert.ok(formatTime(x.peak*total,arc.clock,true).includes(':'));
  }
  assert.ok(below>0&&above>0);
});
test('prevê até o limite e pula segmentos sem pico próprio', () => {
  const data = nextEclipse(arc,0,366,1007);
  assert.ok(data.epoch>0);
  assert.ok(data.events.every((x)=>x.peakInDay));
  assert.equal(nextEclipse(arc,0,366,data.epoch-1),null);
  const without=copy(arc);
  for(const m of without.moons)m.hidden=true;
  assert.equal(nextEclipse(without,0,366,1007),null);
});
test('órbitas alteradas são validadas e nomes especiais não interferem no cálculo', () => {
  assert.ok(eclipseDefaults({name:'constructor'},1).inclination>=0);
  const c=copy(arc);
  c.moons[0].eclipse = eclipseDefaults(c.moons[0]);
  assert.doesNotThrow(()=>validateCalendar(c));
  c.moons[0].eclipse.radius=0;
  assert.throws(()=>validateCalendar(c),/Raio/);
});

test('backup guarda parâmetros configurados e materializa padrões em dados antigos', () => {
  const old = copy(arc);
  for (const m of old.moons) delete m.eclipse;
  assert.deepEqual(decodeImport(encodeExport(old)).calendar.moons.map((m) => m.eclipse), arc.moons.map((m) => m.eclipse));
  const c = copy(arc);
  c.moons[0].eclipse.node = 85;
  assert.equal(decodeImport(encodeExport(c)).calendar.moons[0].eclipse.node,85);
  assert.equal(old.moons[0].eclipse,undefined);
});
