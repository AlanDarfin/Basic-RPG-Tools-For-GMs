'use strict';

const { CalendarEngine, MAX_YEAR } = require('./calendar');
const REAL_DAY_MS = 86_400_000;

function totalMinutes(c) { return c.clock.hours * c.clock.minutes; }
function readMinute(c, date) { return date.hour * c.clock.minutes + date.minute; }
function splitMinute(c, value) { return { hour: Math.floor(value / c.clock.minutes), minute: value % c.clock.minutes }; }
function mode(c) { return c.clockSync?.mode || 'manual'; }
function worldDate(c, now, engine = new CalendarEngine(c)) {
  const base = c.current;
  if (mode(c) !== 'real') return { ...base };
  const total = totalMinutes(c);
  const elapsed = Math.max(0, now - c.clockSync.since);
  const days = Math.floor(elapsed / REAL_DAY_MS);
  const delta = days * total + Math.floor((elapsed - days * REAL_DAY_MS) * total / REAL_DAY_MS);
  if (!delta) return { ...base };
  const minute = Math.min(engine.yearStart(MAX_YEAR + 1) * total - 1, engine.epoch(base) * total + readMinute(c, base) + delta);
  return { ...engine.fromEpoch(Math.floor(minute / total)), ...splitMinute(c, minute % total) };
}
function anchor(c, date, clockMode, now) {
  c.current = { year: date.year, month: date.month, day: date.day, hour: date.hour, minute: date.minute };
  c.clockSync = { mode: clockMode, since: now };
  return c;
}
function ensureClock(c, now) {
  if (c.clockSync !== undefined) return false;
  anchor(c, c.current, 'real', now);
  return true;
}
function transferDate(from, to, date) {
  const elapsed = readMinute(from, date);
  return { ...date, ...splitMinute(to, Math.floor(elapsed * totalMinutes(to) / totalMinutes(from))) };
}
function alignLocal(c, date, now) {
  const real = new Date(now);
  const localTime = ((real.getHours() * 60 + real.getMinutes()) * 60 + real.getSeconds()) * 1000 + real.getMilliseconds();
  return { ...date, ...splitMinute(c, Math.floor(localTime * totalMinutes(c) / REAL_DAY_MS)) };
}
module.exports = { REAL_DAY_MS, totalMinutes, readMinute, splitMinute, mode, worldDate, anchor, ensureClock, transferDate, alignLocal };
