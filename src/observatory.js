'use strict';
const { solarPositions, equatorial, formatTime } = require('./sky');
const { moonOrbit, position, localAltitude } = require('./eclipse');
const { applyHorizon, sampledHorizon, horizonAt } = require('./horizon');

function observer(c) {
  const regional = c.weather?.regions.find((r) => r.id === c.weather.activeId);
  const latitude = regional?.latitude, overrides = regional?.horizons || [];
  const rules = new Map(overrides.map((x) => [x.kind + ':' + x.id, x.riseSet]));
  return { sky: { ...c.sky, latitude: latitude ?? c.sky.latitude,
    suns: c.sky.suns.map((sun) => ({ ...sun, riseSet: rules.get('sun:' + sun.id) || sun.riseSet })) },
    rules, offset: (regional?.timeOffset || 0) * c.clock.hours * c.clock.minutes,
    name: regional && (latitude !== undefined || overrides.length || regional.timeOffset) ? regional.name : '' };
}
function observatory(c, epoch) {
  const { sky, name, rules, offset } = observer(c), total = c.clock.hours * c.clock.minutes;
  const reference = sky.suns.find((x) => x.id === sky.referenceId) || {
    phase: 0, tilt: 0, orbit: 1,
  };
  const ref = equatorial(sky, reference, epoch);
  const moons = new Map();
  for (const [i, moon] of c.moons.entries()) if (!moon.hidden) {
    const orbit = moonOrbit(moon, epoch, reference, ref, i);
    const altitude = (t) => localAltitude(position(orbit, t), ref.ra, sky.latitude, t);
    const window = applyHorizon(rules.get('moon:' + moon.id) || moon.riseSet, sampledHorizon(altitude, total), total);
    moons.set(moon.id, { ...window, altitude });
  }
  return {
    name, offset,
    suns: (minute) => solarPositions(sky, epoch, c.clock, minute),
    moons: (phases, minute) => phases.map((p) => {
      const m = moons.get(p.id);
      return { ...p, ...m, altitude: m.altitude(minute / total), visibleNow: horizonAt(m, minute) };
    }),
  };
}
function horizonLabel(body, clock) {
  if (body.horizon === 'never') return 'Fora do horizonte o dia todo';
  if (body.horizon === 'always') return 'Acima do horizonte o dia todo';
  const times = (list) => list.map((n) => formatTime(Math.min(clock.hours * clock.minutes - 1, n), clock)).join(', ');
  return `Nasce ${times(body.rises) || '—'} · Põe-se ${times(body.sets) || '—'}`;
}
module.exports = { observatory, horizonLabel, observer };
