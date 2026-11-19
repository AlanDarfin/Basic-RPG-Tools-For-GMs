'use strict';
const { el } = require('./ui');

const SVG_NS = 'http://www.w3.org/2000/svg';
function element(parent, tag, attributes) {
  const node = parent.ownerDocument.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  parent.appendChild(node);
  return node;
}
function moonDisc(parent, moon) {
  const ratio = Math.min(1, Math.max(0, moon.illumination));
  const svg = element(parent, 'svg', { viewBox: '0 0 36 36', class: 'brpg-moon-disc', 'aria-hidden': 'true', focusable: 'false' });
  element(svg, 'circle', { cx: 18, cy: 18, r: 14, class: 'brpg-moon-shadow' });
  if (ratio >= .9999) element(svg, 'circle', { cx: 18, cy: 18, r: 14, class: 'brpg-moon-lit' });
  else if (ratio > .0001) {
    const rx = Math.abs(1 - 2 * ratio) * 14;
    const waxing = moon.waxing;
    const outer = waxing ? 1 : 0;
    const inner = waxing ? (ratio < .5 ? 0 : 1) : (ratio < .5 ? 1 : 0);
    const back = rx > .001 ? `A ${rx.toFixed(3)} 14 0 0 ${inner} 18 4` : 'L 18 4';
    element(svg, 'path', { class: 'brpg-moon-lit', d: `M 18 4 A 14 14 0 0 ${outer} 18 32 ${back} Z` });
  }
  element(svg, 'circle', { cx: 18, cy: 18, r: 14, class: 'brpg-moon-outline' });
  return svg;
}
function sunDisc(parent, sun) {
  const node = el(parent, 'span', 'brpg-sun-disc' + (sun.visibleNow ? ' is-above' : ''));
  node.style.setProperty('--brpg-star-color', sun.color);
  node.style.setProperty('--brpg-star-scale', String(.47 + .46 * Math.min(sun.size, 1.8)));
  node.setAttribute('aria-hidden', 'true');
  el(node, 'span');
  return node;
}
module.exports = { moonDisc, sunDisc };
