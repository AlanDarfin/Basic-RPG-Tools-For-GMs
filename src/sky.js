'use strict';

// Same circular-orbit model and constants as the Arkanis Discord project.
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const MAX_SUNS = 8;
const mod = (n, t) => ((n % t) + t) % t;
const clamp = (n) => Math.max(-1, Math.min(1, n));

function defaultArkanisSky() {
  return {
    latitude: 48, unitPeriod: 1008, referenceId: 'reart',
    suns: [
      { id: 'innart', name: 'Innart', orbit: .36, tilt: 62, phase: 245, size: .42, color: '#f4ce87' },
      { id: 'dinart', name: 'Dinart', orbit: .65, tilt: 55, phase: 105, size: .72, color: '#f4a963' },
      { id: 'reart', name: 'Reart', orbit: 1, tilt: 19, phase: 0, size: 1, color: '#f08163' },
    ],
  };
}
function emptySky(year = 360) { return { latitude: 0, unitPeriod: year, referenceId: null, suns: [] }; }
function looksLikeArkanis(c) {
  return c.id === 'arkanis-preset' || (c.week?.length === 12 &&
    c.months?.length === 26 && c.months[0]?.name === 'Arkanis' && c.months[18]?.name === 'Skaryel');
}
function ensureSky(c, year) {
  if (c.sky === undefined) c.sky = looksLikeArkanis(c) ? defaultArkanisSky() : emptySky(year);
  return c;
}
function bound(n, lo, hi, label) {
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${label}: use um número de ${lo} a ${hi}.`);
}
function validateSky(sky) {
  if (!sky || !Array.isArray(sky.suns) || sky.suns.length > MAX_SUNS) throw new Error('Configure de zero a oito sóis.');
  bound(sky.latitude, -89, 89, 'Latitude');
  bound(sky.unitPeriod, 1, 100000, 'Período de referência do sistema');
  const ids = new Set(), names = new Set();
  for (const sun of sky.suns) {
    if (!sun || typeof sun.id !== 'string' || !sun.id.trim() || ids.has(sun.id)) throw new Error('Os sóis precisam de IDs diferentes.');
    ids.add(sun.id);
    if (typeof sun.name !== 'string' || !sun.name.trim() || sun.name.length > 60) throw new Error('Cada sol precisa de um nome de até 60 caracteres.');
    const n = sun.name.normalize('NFKD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
    if (names.has(n)) throw new Error('Os sóis precisam de nomes diferentes.');
    names.add(n);
    if (typeof sun.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(sun.color)) throw new Error('Cor do sol inválida.');
    bound(sun.orbit, .04, 12, 'Semieixo relativo');
    bound(sun.tilt, -89, 89, 'Inclinação orbital');
    bound(sun.phase, -360, 360, 'Fase inicial');
    bound(sun.size, .05, 4, 'Tamanho relativo');
  }
  const reference = sky.suns.find((s) => s.id === sky.referenceId);
  if (sky.suns.length) {
    if (!reference) throw new Error('Escolha um sol de referência.');
    if (Math.abs(sky.latitude) + Math.abs(reference.tilt) > 89) throw new Error('Latitude absoluta + inclinação absoluta do sol de referência não podem passar de 89°. Assim ele nasce todos os dias.');
  } else if (sky.referenceId !== null) throw new Error('Sóis ausentes não podem servir de referência.');
  return sky;
}
function period(sky, sun) { return sky.unitPeriod * sun.orbit ** 1.5; }
function equatorial(sky, sun, epoch) {
  const p = period(sky, sun);
  const lon = TAU * (mod(epoch, p) / p) + sun.phase * RAD;
  const tilt = sun.tilt * RAD;
  return { ra: Math.atan2(Math.sin(lon) * Math.cos(tilt), Math.cos(lon)), dec: Math.asin(clamp(Math.sin(lon) * Math.sin(tilt))), period: p };
}
function solarPositions(sky, epoch, clock, now) {
  if (!sky?.suns.length) return [];
  const total = clock.hours * clock.minutes;
  now = mod(now, total);
  const lat = sky.latitude * RAD;
  const reference = sky.suns.find((s) => s.id === sky.referenceId);
  const referenceRA = equatorial(sky, reference, epoch).ra;
  return sky.suns.map((sun) => {
    const eq = equatorial(sky, sun, epoch);
    const base = Math.sin(lat) * Math.sin(eq.dec), amplitude = Math.cos(lat) * Math.cos(eq.dec);
    const transit = mod(total / 2 + (eq.ra - referenceRA) * total / TAU, total);
    const angle = mod(TAU * (now - transit) / total + Math.PI, TAU) - Math.PI;
    const altitude = Math.asin(clamp(base + amplitude * Math.cos(angle))) / RAD;
    const horizon = base + amplitude <= 0 ? 'never' : base - amplitude >= 0 ? 'always' : 'normal';
    const visibleNow = horizon === 'always' || (horizon === 'normal' && altitude >= 0);
    let from = null, to = null, intervals = [];
    if (horizon === 'always') intervals = [[0, total]];
    if (horizon === 'normal') {
      const half = Math.acos(clamp(-base / amplitude)) * total / TAU;
      from = mod(transit - half, total); to = mod(transit + half, total);
      intervals = from <= to ? [[from, to]] : [[0, to], [from, total]];
    }
    const label = horizon === 'never' ? 'Não nasce neste dia' : horizon === 'always' ? 'Acima do horizonte o dia todo' :
      !visibleNow ? 'Abaixo do horizonte' : Math.abs(angle) < TAU / 40 ? 'No ponto mais alto' : angle < 0 ? 'Subindo' : 'Descendo';
    return { ...sun, period: eq.period, altitude, transit, horizon, from, to, intervals, visibleToday: horizon !== 'never', visibleNow, label,
      reference: sun.id === sky.referenceId };
  });
}
function formatTime(value, clock, allowEnd = false) {
  const rounded = Math.round(value), total = clock.hours * clock.minutes;
  const minutes = allowEnd && rounded === total ? total : mod(rounded, total);
  return [Math.floor(minutes / clock.minutes), minutes % clock.minutes].map((n) => String(n).padStart(2, '0')).join(':');
}

module.exports = { MAX_SUNS, defaultArkanisSky, emptySky, ensureSky, validateSky, period, solarPositions, formatTime };
