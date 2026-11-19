'use strict';
const { el, button, info } = require('./ui');

const SVG_NS = 'http://www.w3.org/2000/svg';
function element(parent, tag, attributes) {
  const node = parent.ownerDocument.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  parent.appendChild(node);
  return node;
}
function gridIcon(parent) {
  const svg = element(parent, 'svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' });
  element(svg, 'rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 });
  element(svg, 'path', { d: 'M3 12h18M12 3v18' });
}
function moonDisc(parent) {
  const svg = element(parent, 'svg', { viewBox: '0 0 36 36', class: 'brpg-moon-disc', 'aria-hidden': 'true', focusable: 'false' });
  element(svg, 'circle', { cx: 18, cy: 18, r: 14, class: 'brpg-moon-shadow' });
  const lit = element(svg, 'path', { class: 'brpg-moon-lit' });
  element(svg, 'circle', { cx: 18, cy: 18, r: 14, class: 'brpg-moon-outline' });
  return (moon) => {
    const ratio = Math.min(1, Math.max(0, moon.illumination));
    if (ratio >= .9999) { lit.setAttribute('d', 'M 18 4 A 14 14 0 0 1 18 32 A 14 14 0 0 1 18 4 Z'); return; }
    if (ratio <= .0001) { lit.setAttribute('d', ''); return; }
    const rx = Math.abs(1 - 2 * ratio) * 14;
    const outer = moon.waxing ? 1 : 0;
    const inner = moon.waxing ? (ratio < .5 ? 0 : 1) : (ratio < .5 ? 1 : 0);
    const back = rx > .001 ? `A ${rx.toFixed(3)} 14 0 0 ${inner} 18 4` : 'L 18 4';
    lit.setAttribute('d', `M 18 4 A 14 14 0 0 ${outer} 18 32 ${back} Z`);
  };
}
function sunDisc(parent, sun) {
  const node = el(parent, 'span', 'brpg-sun-disc');
  node.style.setProperty('--brpg-star-color', sun.color);
  node.style.setProperty('--brpg-star-scale', String(.47 + .46 * Math.min(sun.size, 1.8)));
  node.setAttribute('aria-hidden', 'true');
  el(node, 'span');
  return (next) => node.classList.toggle('is-above', next.visibleNow);
}
const lightPercent = (moon) => `${Math.round(moon.illumination * 100)}%`;
const sunLabel = (sun) => sun.visibleNow ? 'No céu' : sun.visibleToday ? 'Abaixo do horizonte' : 'Não nasce';
function overviewGroup(parent, name, bodies, type) {
  if (!bodies.length) return [];
  const group = el(parent, 'section', 'brpg-celestial-group');
  el(group, 'h3', 'brpg-section-title', name);
  const grid = el(group, 'div', 'brpg-celestial-grid');
  return bodies.map((body) => {
    const tile = el(grid, 'article', 'brpg-celestial-tile');
    const paint = type === 'sun' ? sunDisc(tile, body) : moonDisc(tile);
    el(tile, 'strong', '', body.name);
    const label = el(tile, 'small', 'brpg-celestial-state');
    const light = type === 'moon' ? el(tile, 'small', 'brpg-celestial-illumination') : null;
    return (next) => {
      paint(next);
      label.textContent = type === 'sun' ? sunLabel(next) : next.phase;
      if (light) light.textContent = lightPercent(next);
      else {
        tile.title = next.label;
        tile.classList.toggle('is-above', next.visibleNow);
      }
    };
  });
}
function skyOverview(parent, suns, moons) {
  const solar = overviewGroup(parent, 'Sóis', suns, 'sun');
  const lunar = overviewGroup(parent, 'Luas', moons, 'moon');
  if (!suns.length && !moons.length) info(parent, 'Nenhum sol ou lua visível configurado.');
  return (nextSuns, nextMoons) => {
    solar.forEach((paint, i) => paint(nextSuns[i]));
    lunar.forEach((paint, i) => paint(nextMoons[i]));
  };
}

function focusSky(parent, suns, moons, open) {
  if (!suns.length && !moons.length) return () => {};
  const strip = el(parent, 'div', 'brpg-focus-sky');
  const count = el(strip, 'span', 'brpg-focus-hour');
  const group = (name, bodies, type) => {
    if (!bodies.length) return () => {};
    const opener = button(strip, name, open, { className: 'brpg-button brpg-focus-body brpg-focus-' + type, iconOnly: true });
    el(opener, 'span', 'brpg-focus-body-label', name);
    const row = el(opener, 'span', 'brpg-focus-discs');
    const handles = bodies.map((body) => {
      const holder = el(row, 'span', 'brpg-focus-disc');
      const paint = type === 'suns' ? sunDisc(holder, body) : moonDisc(holder);
      return (next) => {
        paint(next);
        return holder.title = `${next.name} · ${type === 'suns' ? sunLabel(next) : next.phase + ', ' + lightPercent(next) + ' iluminada'}`;
      };
    });
    return (next) => {
      const list = handles.map((paint, i) => paint(next[i]));
      opener.setAttribute('aria-label', `Ver ${name.toLocaleLowerCase('pt-BR')} no céu. ${list.join('. ')}`);
      opener.title = list.join(' | ');
    };
  };
  const solar = group('Sóis', suns, 'suns');
  const lunar = group('Luas', moons, 'moons');
  return (nextSuns, nextMoons, hour) => {
    solar(nextSuns); lunar(nextMoons);
    count.textContent = hour;
  };
}

module.exports = { focusSky, skyOverview, gridIcon };
