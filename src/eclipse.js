'use strict';
// Geometry for a fictional multi-sun sky. All input angle fields are degrees.
const { equatorial } = require('./sky');

const RAD = Math.PI / 180, TAU = Math.PI * 2, EPS = 1e-10;
const DEFAULT_MOONS = new Map([
  ['verika', { inclination: 5.1, node: 42, radius: .43, shadow: .88 }],
  ['neurika', { inclination: 9, node: 138, radius: .23, shadow: .82 }],
  ['menrika', { inclination: 7.2, node: 223, radius: .53, shadow: .97 }],
]);
const mod = (n, t) => ((n % t) + t) % t;
const clamp = (n) => Math.max(-1, Math.min(1, n));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const TYPE_LABELS = Object.freeze({
  solar: { total: 'Solar total', annular: 'Solar anular', partial: 'Solar parcial' },
  lunar: { total: 'Lunar total', partial: 'Lunar parcial', penumbral: 'Lunar penumbral' },
});

function eclipseDefaults(moon, index = 0) {
  return { ...(DEFAULT_MOONS.get(moon.name?.trim().toLowerCase()) || {
    inclination: 5, node: mod(index * 137.5, 360), radius: .4, shadow: .9,
  }) };
}
function ensureEclipseOrbits(calendar) {
  calendar.moons.forEach((m, i) => { if (m.eclipse === undefined) m.eclipse = eclipseDefaults(m, i); });
  return calendar;
}
function validateEclipseOrbit(orbit) {
  if (orbit === undefined) return;
  const fields = [['inclination', -89, 89, 'Inclinação da lua'], ['node', -360, 360, 'Nó da órbita'],
    ['radius', .02, 4, 'Raio aparente da lua'], ['shadow', .02, 6, 'Raio da sombra']];
  for (const [key, lo, hi, name] of fields) {
    if (!Number.isFinite(orbit?.[key]) || orbit[key] < lo || orbit[key] > hi) {
      throw new Error(`${name}: use um número de ${lo} a ${hi}.`);
    }
  }
}
function vector(ra, dec) {
  const c = Math.cos(dec);
  return [c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec)];
}
function moonOrbit(moon, epoch, reference, ref, i) {
  const param = moon.eclipse || eclipseDefaults(moon, i);
  const node = param.node * RAD, incl = param.inclination * RAD, obliquity = reference.tilt * RAD;
  const rotate = ([x, y, z]) => [x, y * Math.cos(obliquity) - z * Math.sin(obliquity), y * Math.sin(obliquity) + z * Math.cos(obliquity)];
  const p = rotate([Math.cos(node), Math.sin(node), 0]);
  const q = rotate([-Math.sin(node) * Math.cos(incl), Math.cos(node) * Math.cos(incl), Math.sin(incl)]);
  const start = mod(ref.longitude + TAU * mod(epoch - moon.offset, moon.period) / moon.period - node, TAU);
  return { ...param, p, q, start, speed: TAU / moon.period };
}
function position(orbit, t) {
  const phase = orbit.start + t * orbit.speed;
  const c = Math.cos(phase), s = Math.sin(phase);
  return orbit.p.map((n, i) => n * c + orbit.q[i] * s);
}

// The dot product against a fixed disk is A·cos(theta)+B·sin(theta).
// Solving its threshold analytically finds even eclipses much shorter than a minute.
function contacts(orbit, target, maxAngle) {
  const a = dot(orbit.p, target), b = dot(orbit.q, target), length = Math.hypot(a, b);
  if (length < Math.cos(maxAngle * RAD)) return [];
  const half = Math.acos(clamp(Math.cos(maxAngle * RAD) / length));
  const center = Math.atan2(b, a);
  const k0 = Math.ceil((orbit.start - center - half) / TAU - EPS);
  const k1 = Math.floor((orbit.start + orbit.speed - center + half) / TAU + EPS);
  const result = [];
  for (let k = k0; k <= k1; k++) {
    const fullPeak = (center + TAU * k - orbit.start) / orbit.speed;
    const radius = half / orbit.speed;
    const lo = fullPeak - radius, hi = fullPeak + radius;
    const start = Math.max(0, lo), end = Math.min(1, hi);
    if (end - start <= EPS) continue;
    const peak = Math.min(end, Math.max(start, fullPeak));
    const distance = Math.acos(clamp(dot(position(orbit, peak), target))) / RAD;
    result.push({ start, end, peak, beginsBefore: lo < -EPS, endsAfter: hi > 1 + EPS, peakInDay: fullPeak >= 0 && fullPeak < 1, distance });
  }
  return result;
}

function overlapFraction(distance, target, blocker) {
  if (distance >= target + blocker) return 0;
  if (distance <= Math.abs(target - blocker)) return Math.min(1, blocker ** 2 / target ** 2);
  const t2 = target ** 2, b2 = blocker ** 2, d2 = distance ** 2;
  const a = t2 * Math.acos(clamp((d2 + t2 - b2) / (2 * distance * target)));
  const b = b2 * Math.acos(clamp((d2 + b2 - t2) / (2 * distance * blocker)));
  const c = .5 * Math.sqrt(Math.max(0, (-distance + target + blocker) * (distance + target - blocker) *
    (distance - target + blocker) * (distance + target + blocker)));
  return Math.min(1, Math.max(0, (a + b - c) / (Math.PI * t2)));
}
function solarType(distance, radiusSun, radiusMoon) {
  if (distance >= radiusSun + radiusMoon) return null;
  if (distance + radiusSun <= radiusMoon) return 'total';
  if (distance + radiusMoon <= radiusSun) return 'annular';
  return 'partial';
}
function lunarType(distance, radiusMoon, umbra, penumbra) {
  if (distance >= radiusMoon + penumbra) return null;
  if (distance + radiusMoon <= umbra) return 'total';
  if (distance < radiusMoon + umbra) return 'partial';
  return 'penumbral';
}
function localAltitude(target, refRA, latitude, fraction) {
  return Math.asin(clamp(dot(vector(refRA + TAU * (fraction - .5), latitude * RAD), target))) / RAD;
}

function eclipsesForDay(calendar, epoch) {
  const sky = calendar.sky;
  const reference = sky?.suns.find((s) => s.id === sky.referenceId);
  if (!reference || !calendar.moons.length) return [];
  const ref = equatorial(sky, reference, epoch);
  const bodies = sky.suns.map((sun) => {
    const pos = equatorial(sky, sun, epoch);
    const sunVector = vector(pos.ra, pos.dec);
    return { sun, r: .4 * sun.size, sunVector, shadowVector: sunVector.map((n) => -n) };
  });
  const found = [];
  for (const [i, moon] of calendar.moons.entries()) {
    if (moon.hidden) continue;
    const orbit = moonOrbit(moon, epoch, reference, ref, i);
    for (const b of bodies) {
      const penumbra = orbit.shadow + 2 * b.r;
      for (const c of contacts(orbit, b.sunVector, b.r + orbit.radius)) {
        const type = solarType(c.distance, b.r, orbit.radius);
        if (!type) continue;
        const altitude = localAltitude(b.sunVector, ref.ra, sky.latitude, c.peak);
        found.push({ ...c, kind: 'solar', type, label: TYPE_LABELS.solar[type], sun: b.sun.name, moon: moon.name,
          altitude, aboveHorizon: altitude >= 0, coverage: overlapFraction(c.distance, b.r, orbit.radius) });
      }
      for (const c of contacts(orbit, b.shadowVector, penumbra + orbit.radius)) {
        const type = lunarType(c.distance, orbit.radius, orbit.shadow, penumbra);
        if (!type) continue;
        const altitude = localAltitude(position(orbit, c.peak), ref.ra, sky.latitude, c.peak);
        found.push({ ...c, kind: 'lunar', type, label: TYPE_LABELS.lunar[type], sun: b.sun.name, moon: moon.name,
          altitude, aboveHorizon: altitude >= 0, coverage: overlapFraction(c.distance, orbit.radius, orbit.shadow) });
      }
    }
  }
  return found.sort((a, b) => a.peak - b.peak || a.sun.localeCompare(b.sun) || a.moon.localeCompare(b.moon));
}
function nextEclipse(calendar, afterEpoch, days = 366, maxEpoch = Infinity) {
  for (let e = afterEpoch + 1; e <= Math.min(afterEpoch + days, maxEpoch); e++) {
    const events = eclipsesForDay(calendar, e).filter((x) => x.peakInDay);
    if (events.length) return { epoch: e, events };
  }
  return null;
}
module.exports = { moonOrbit, position, localAltitude, eclipseDefaults, ensureEclipseOrbits, validateEclipseOrbit, solarType, lunarType, overlapFraction, contacts, eclipsesForDay, nextEclipse };
