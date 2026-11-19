'use strict';

// Snap only floating-point roundoff at integer boundaries before locating the
// first calendar day of a season that can begin between two civil days.
function civilDay(epoch) {
  const nearest = Math.round(epoch);
  const days = Math.max(1, Math.abs(epoch)) * 16 * Number.EPSILON;
  return Math.abs(epoch - nearest) <= days ? nearest : Math.ceil(epoch);
}
function periodicPhase(c, day) {
  if (!c.seasons.length) return null;
  const offsets = [0];
  for (const s of c.seasons) offsets.push(offsets[offsets.length - 1] + s.duration);
  const span = offsets[offsets.length - 1];
  let turn = Math.floor((day - c.seasonOffset) / span);
  const origin = (i) => c.seasonOffset + i * span;
  if (civilDay(origin(turn)) > day) turn--;
  else if (civilDay(origin(turn + 1)) <= day) turn++;
  const start = origin(turn);
  const startOf = (index) => origin(turn + Math.floor(index / c.seasons.length)) + offsets[index % c.seasons.length];
  const index = c.seasons.findIndex((_, i) => day < civilDay(startOf(i + 1)));
  const season = c.seasons[index];
  const rawStart = start + offsets[index];
  return { index, season, elapsed: Math.max(0, day - rawStart), startOf, span };
}

function seasonSchedule(c, engine, date, maxYear) {
  const epoch = engine.epoch(date);
  const limit = engine.yearStart(maxYear + 1);
  const toDate = (day) => day >= 0 && day < limit ? engine.fromEpoch(day) : null;
  const window = (season, from, until) => ({
    season, from, until, duration: until - from, startDate: toDate(from), endDate: toDate(until - 1),
  });
  const items = [];
  const count = c.seasons.length;
  if (!count) return { current: null, next: null, items, cycleLength: 0, epoch };
  if (c.seasonMode === 'periodic') {
    const { index, startOf, span } = periodicPhase(c, epoch);
    for (let step = 0; step < Math.max(count, 2); step++) {
      const s = c.seasons[(index + step) % count];
      items.push(window(s, civilDay(startOf(index + step)), civilDay(startOf(index + step + 1))));
    }
    return { current: items[0], next: items[1]?.startDate ? items[1] : null,
      items: items.slice(0, count), cycleLength: span, epoch };
  }

  const sorted = c.seasons.slice().sort((a, b) => engine.monthIndex(a.month) - engine.monthIndex(b.month) || a.day - b.day);
  const points = [];
  for (let year = Math.max(1, date.year - 1); year <= Math.min(maxYear + 1, date.year + 2); year++) {
    for (const season of sorted) {
      const sourceYear = Math.min(year, maxYear);
      const month = engine.yearInfo(sourceYear).months[engine.monthIndex(season.month)];
      points.push({ season, day: engine.yearStart(year) + month.start + season.day - 1 });
    }
  }
  let index = points.findIndex((item) => item.day > epoch);
  if (index === -1) index = points.length - 1;
  const start = index > 0 ? index - 1 : 0;
  for (let i = start; i < Math.min(start + Math.max(count, 2), points.length - 1); i++) {
    const item = points[i];
    items.push(window(item.season, item.day, points[i + 1].day));
  }
  const current = items[0]?.from <= epoch ? items[0] : null;
  const upcoming = current ? items[1] : items[0];
  return { current, next: upcoming?.startDate ? upcoming : null, items: items.slice(0, count),
    cycleLength: engine.yearInfo(date.year).total, epoch };
}

module.exports = { civilDay, periodicPhase, seasonSchedule };
