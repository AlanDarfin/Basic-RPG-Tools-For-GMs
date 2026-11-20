'use strict';

const MAX_FACES = 1000, MAX_CARDS = 1000;
const IMAGE_EXT = /\.(?:avif|gif|jpe?g|png|svg|webp|bmp|ico)$/i;
const DICE = [4, 6, 8, 10, 12, 20, 100, 'F'];
const fail = (message) => { throw new Error(message); };
const clean = (v, n = 120) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const key = (v) => clean(v, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const roll = (max, rng = Math.random) => Math.floor(rng() * max) + 1;
const pick = (arr, rng) => arr[roll(arr.length, rng) - 1];
const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;

function imageRef(v) {
  let s = clean(v, 2000);
  if (/^!?\[\[.*\]\]$/.test(s)) s = s.replace(/^!?\[\[|\]\]$/g, '').split('|')[0];
  if (/^https?:\/\//i.test(s)) {
    try { const url = new URL(s); return url.username || url.password ? '' : url.href; } catch { return ''; }
  }
  return !/[:\\\x00-\x1f]/.test(s) && !s.split('/').includes('..') && IMAGE_EXT.test(s) ? s.replace(/^\/+/, '') : '';
}
function pathValue(v, fallback) {
  const s = clean(v, 300).replace(/^\/+|\/+$/g, '');
  return s && !/[:\\\x00-\x1f]/.test(s) && !s.split('/').some((p) => !p || p === '..' || p === '.') ? s : fallback;
}
function defaultSolo() {
  return { dice: [], decks: [], piles: {}, settings: { tableRoot: 'Tables', deckRoot: 'Decks', home: 'dice', inline: false,
    inlineTrack: 'clock', remote: false, jokers: false, tarotFlip: true, bias: false, events: false, chaos: 5,
    hideIdeas: false, templatePrefix: 'template', copyDice: 'plain', copyText: 'plain', copyCard: 'md',
    oracleLanguage: 'pt', highlightBoxes: true } };
}
function validateSolo(s) {
  if (!s || !Array.isArray(s.dice) || !Array.isArray(s.decks) || !s.settings || !s.piles || Array.isArray(s.piles))
    fail('Dados das ferramentas solo inválidos.');
  if (s.dice.length > 100 || s.decks.length > 100 || new Set(s.dice.map(x => x.id)).size !== s.dice.length ||
      new Set(s.decks.map(x => x.id)).size !== s.decks.length) fail('Biblioteca solo inválida ou cheia.');
  s.dice.forEach(validateDie); s.decks.forEach(validateDeck);
  return s;
}
function validateDie(die) {
  if (!clean(die.id) || !clean(die.name)) fail('Dê um nome ao dado.');
  if (!Array.isArray(die.faces) || !integer(die.faces.length, 2, MAX_FACES)) fail('Escolha de 2 a ' + MAX_FACES + ' faces.');
  for (const f of die.faces) {
    if (!f || !['number', 'text', 'image'].includes(f.kind)) fail('Tipo de face inválido.');
    if (f.kind === 'number' && (typeof f.value !== 'number' || !Number.isFinite(f.value) || Math.abs(f.value) > 1e9)) fail('Digite um número entre −1 bilhão e 1 bilhão para a face.');
    if (f.kind === 'text' && !clean(f.label)) fail('Preencha todas as faces de texto.');
    if (f.kind === 'image' && !imageRef(f.image)) fail('Escolha um arquivo de imagem ou uma URL HTTP(S) para cada face de imagem.');
  }
  return die;
}
function numberFace(n) { return { kind: 'number', value: n }; }
function dieRoll(die, quantity, rng = Math.random) {
  validateDie(die);
  if (!integer(quantity, 1, 100)) fail('Role de 1 a 100 dados por vez.');
  const faces = Array.from({ length: quantity }, () => pick(die.faces, rng));
  return { faces, total: faces.every(f => f.kind === 'number') ? faces.reduce((sum, f) => sum + f.value, 0) : null };
}
function parseDice(s) {
  const m = s.trim().match(/^(\d{0,3})d(\d{1,7}|f)(?:\s*([+-])\s*(\d{1,7}))?(?:\/([ad]))?(?:,\s*(#[\da-f]{3,8}|[a-z]{1,20}))?$/i);
  if (!m || !integer(Number(m[1] || 1), 1, 100) || (m[2].toLowerCase() !== 'f' && !integer(Number(m[2]), 2, 1000000))) return null;
  return { amount: Number(m[1] || 1), sides: +m[2] || 3, fudge: m[2].toLowerCase() === 'f', modifier: (m[3] === '-' ? -1 : 1) * (+(m[4] || 0)), mode: (m[5] || '').toLowerCase(), color: m[6] || '' };
}
function rollDice(notation, rng = Math.random) {
  const d = parseDice(notation);
  if (!d) fail('Use uma expressão como 2d20+3 ou 2d6/a.');
  const values = Array.from({ length: d.amount }, () => roll(d.sides, rng) - (d.fudge ? 2 : 0));
  const selected = d.mode === 'a' ? Math.max(...values) : d.mode === 'd' ? Math.min(...values) : values.reduce((a, b) => a + b, 0);
  return { values, total: selected + d.modifier, color: d.color };
}
const sections = { main: 'Principal', extra: 'Extra', side: 'Reserva' };
function makeCard(raw = {}, id = 'card') {
  const title = clean(raw.title || raw.nome);
  const common = { id, title, section: Object.hasOwn(sections, raw.section || '') ? raw.section : 'main' };
  for (const [to, from, length] of [['image','imagem',2000],['type','tipo',120],['text','descricao',8000],['cost','custo',200],
    ['element','elemento',120],['level','nivel',20],['attack','ataque',40],['defense','defesa',40],['source','source',500],['symbol','symbol',8]]) {
    const value = clean(String(raw[to] ?? raw[from] ?? ''), length);
    if (value) common[to] = to === 'image' ? imageRef(value) : value;
  }
  if (!common.title && common.image) common.title = imageTitle(common.image);
  return common;
}
function imageTitle(path) {
  const name = path.split(/[?#]/)[0].split('/').at(-1).replace(/\.[a-z0-9]+$/i, '');
  try { return clean(decodeURIComponent(name)) || 'Carta'; } catch { return clean(name) || 'Carta'; }
}
function validateDeck(d) {
  if (!d || !clean(d.id) || !clean(d.name)) fail('Dê um nome ao baralho.');
  if (!integer(d.orientations, 1, 5)) fail('Modo de rotação inválido.');
  if (!Array.isArray(d.cards) || !integer(d.cards.length, 1, MAX_CARDS)) fail('Um baralho precisa ter de 1 a ' + MAX_CARDS + ' cartas.');
  if (new Set(d.cards.map(x => x.id)).size !== d.cards.length) fail('As cartas precisam ter identificadores distintos.');
  if (d.cards.some(c => !c || !clean(c.id) || !clean(c.title) || !Object.hasOwn(sections, c.section) || (c.image && !imageRef(c.image))))
    fail('Cada carta precisa ter um nome e uma imagem válida, se indicada.');
  if (d.back && !imageRef(d.back)) fail('O verso precisa apontar para uma imagem válida.');
  return d;
}
const ARCANA = [
  ['O Louco','✧','Começos, liberdade, salto de fé'], ['O Mago','⚡','Iniciativa, recursos, transformação'],
  ['A Sacerdotisa','☾','Intuição, silêncio, mistério'], ['A Imperatriz','❋','Criação, abundância, cuidado'],
  ['O Imperador','♜','Estrutura, disciplina, autoridade'], ['O Hierofante','⚿','Tradição, ensino, crenças'],
  ['Os Enamorados','♡','Escolha, vínculo, valores'], ['O Carro','⬖','Direção, determinação, movimento'],
  ['A Força','♌','Coragem, paciência, firmeza'], ['O Eremita','✦','Recolhimento, busca, orientação'],
  ['A Roda da Fortuna','◎','Mudança, sorte, repetição'], ['A Justiça','⚖','Consequências, equilíbrio, verdade'],
  ['O Enforcado','♧','Espera, renúncia, nova perspectiva'], ['A Morte','♰','Fim, transição, renovação'],
  ['A Temperança','≈','Integração, moderação, adaptação'], ['O Diabo','♟','Apego, tentação, sombra'],
  ['A Torre','♜','Ruptura, surpresa, revelação'], ['A Estrela','☆','Esperança, inspiração, recuperação'],
  ['A Lua','☽','Sonhos, insegurança, ilusão'], ['O Sol','☀','Clareza, alegria, vitalidade'],
  ['O Julgamento','♬','Chamado, avaliação, despertar'], ['O Mundo','◉','Conclusão, integração, pertencimento'],
];
function builtinDeck(id, settings) {
  if (id === 'tarot') return { id, name: 'Tarô · Arcanos Maiores', orientations: settings.tarotFlip ? 2 : 1,
    cards: ARCANA.map(([title, symbol, text], i) => makeCard({ title, symbol, text, type: 'Arcano ' + i }, 'arc-' + i)) };
  const cards = ['♠ Espadas','♥ Copas','♦ Ouros','♣ Paus'].flatMap(suit => {
    const [symbol, name] = suit.split(' ');
    return ['A','2','3','4','5','6','7','8','9','10','J','Q','K'].map(rank => makeCard({ title: rank + ' de ' + name, symbol, type: name }, symbol + rank));
  });
  if (settings.jokers) cards.push(makeCard({ title: 'Coringa vermelho', symbol: '★' }, 'joker-red'), makeCard({ title: 'Coringa preto', symbol: '☆' }, 'joker-black'));
  return { id: 'standard', name: 'Baralho padrão', cards, orientations: 1 };
}
function shuffled(list, rng = Math.random) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) { const j = roll(i + 1, rng) - 1; [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function deckIds(deck, section = 'main') { return deck.cards.filter(c => c.section === section).map(c => c.id); }
function freshPile(deck, section, rng) { return { remaining: shuffled(deckIds(deck, section), rng), drawn: [] }; }
function validPile(pile, deck, section) {
  if (!pile || !Array.isArray(pile.remaining) || !Array.isArray(pile.drawn)) return false;
  const ids = new Set(deckIds(deck, section));
  const current = [...pile.remaining, ...pile.drawn.map(x => x?.id)];
  return current.length === ids.size && new Set(current).size === ids.size && current.every(id => ids.has(id)) &&
    pile.drawn.every(x => x && [0, 90, 180, 270].includes(x.angle));
}
function draw(pile, deck, section, number, rng = Math.random) {
  if (!validPile(pile, deck, section)) pile = freshPile(deck, section, rng);
  const angles = [[], [0], [0, 180], [0, 90, 270], [0, 90, 180, 270], [0, 90]][deck.orientations];
  const drawn = pile.remaining.slice(0, number).map(id => ({ id, angle: angles.length === 1 ? 0 : pick(angles, rng) }));
  return { remaining: pile.remaining.slice(drawn.length), drawn: [...drawn.reverse(), ...pile.drawn] };
}
function returnCard(pile, id, rng = Math.random) {
  if (!pile?.drawn?.some(c => c.id === id)) return pile;
  return { remaining: shuffled([...pile.remaining, id], rng), drawn: pile.drawn.filter(c => c.id !== id) };
}
function parseBlocks(markdown) {
  const found = { cards: [], lists: [] };
  if (!/DeckCard|FullDeck/i.test(markdown)) return found;
  const rows = markdown.split(/\r?\n/);
  for (let row = 0; row < rows.length; row++) {
    const m = rows[row].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!m) continue;
    const first = row;
    while (++row < rows.length && !(rows[row].trim().length >= m[1].length &&
      [...rows[row].trim()].every(ch => ch === m[1][0]))) {}
    if (row >= rows.length) break;
    const kind = m[2].trim().toLowerCase();
    const value = rows.slice(first + 1, row).join('\n');
    if (kind === 'deckcard') found.cards.push(value);
    if (kind === 'fulldeck') found.lists.push(value);
  }
  return found;
}
function legacyCard(source, path, id) {
  const data = Object.create(null);
  for (const line of source.split(/\r?\n/)) {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) data[key(m[1])] = m[2].trim();
  }
  return makeCard({ ...data, source: path }, id);
}
function legacyDeck(source, cards, idFor) {
  const index = new Map();
  for (const c of cards) if (c.title && !index.has(key(c.title))) index.set(key(c.title), c);
  const missing = [], result = [];
  let section = 'main';
  const labels = { main: 'main', principal: 'main', extra: 'extra', side: 'side', reserva: 'side' };
  for (let line of source.split(/\r?\n/)) {
    line = line.trim(); if (!line) continue;
    const title = key(line.replace(/^#+\s*/, ''));
    if (line.startsWith('#') && Object.hasOwn(labels, title)) { section = labels[title]; continue; }
    const card = index.get(key(line));
    if (card) result.push({ ...card, id: idFor(), section });
    else missing.push(line);
  }
  return { cards: result, missing };
}
function folderDeck(name, paths, noteSources) {
  const ordered = [...new Set(paths.map(imageRef).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const urls = [];
  let orientations = 1;
  for (const note of noteSources) {
    const flip = note.match(/^\s*flip([234]?)\s*$/im);
    if (flip) orientations = flip[1] === '2' ? 5 : Number(flip[1]) || 2;
    for (const url of note.match(/https?:\/\/[^\s<>)\]]+/gi) || []) {
      const normalized = imageRef(url);
      if (normalized && !urls.includes(normalized)) urls.push(normalized);
    }
  }
  return { name, orientations, cards: [...ordered, ...urls].slice(0, MAX_CARDS).map(image => ({ title: imageTitle(image), image, section: 'main' })) };
}

const LANGUAGES = { pt: ['Português','Sim','Não','e','mas','excepcional','Evento aleatório'],
  en: ['English','Yes','No','and','but','exceptional','Random event'],
  es: ['Español','Sí','No','y','pero','excepcional','Evento aleatorio'],
  fr: ['Français','Oui','Non','et','mais','exceptionnel','Événement aléatoire'],
  de: ['Deutsch','Ja','Nein','und','aber','außergewöhnlich','Zufälliges Ereignis'],
  zh: ['中文','是','不是','和','但是','极端','随机事件'],
  ja: ['日本語','はい','いいえ','と','でも','極端','ランダムイベント'],
  hi: ['हिन्दी','हाँ','नहीं','और','लेकिन','असाधारण','यादृच्छिक घटना'] };
const SIX = ['', 'Não, e', 'Não', 'Não, mas', 'Sim, mas', 'Sim', 'Sim, e'];
const ODDS = ['Impossível', 'Quase impossível', 'Muito improvável', 'Improvável', '50/50', 'Provável', 'Muito provável', 'Quase certo', 'Certo'];
// Fate Chart values used by Solo RPG Toolkit. See THIRD-PARTY-SOLO-LICENSE.
const FATE = [[0,1,81],[1,5,82],[2,10,83],[3,15,84],[5,25,86],[7,35,88],[10,50,91],[13,65,94],[15,75,96],[17,85,98],[18,90,99],[19,95,100],[20,99,101]];
function oracle(type, odds, options, previous = {}, rng = Math.random) {
  const state = { events: previous.events || 0, factor: previous.factor || 0 };
  let answer, values, event = false;
  const check = (n) => roll(100, rng) <= n;
  if (type === 'mythic') {
    const chaos = clamp(Number(options.chaos) || 5, 1, 9), n = roll(100, rng);
    const [low, yes, high] = FATE[clamp(6 + chaos - 5 + Number(odds) - 4, 0, 12)] || FATE[6];
    answer = (n <= yes ? 'Sim' : 'Não') + (n <= low || n >= high ? ' excepcional' : '');
    values = [n]; event = n < 100 && n % 11 === 0 && n % 10 <= chaos;
  } else if (type === 'standard') {
    const extra = options.bias && odds === 'mid';
    const n = roll(100, rng), yes = n <= ({ low: 30, mid: 50, high: 70 }[odds] ?? 50) + (extra ? state.factor : 0);
    if (extra) state.factor = clamp(state.factor + (yes ? -20 : 20), 0, 80);
    answer = yes ? 'Sim' : 'Não'; values = [n];
    const qualifier = check(50) ? (check(50) ? ', e' : ', mas') : '';
    if (check(10)) answer += ' excepcional';
    answer += qualifier;
    if (options.events && check(20)) event = ++state.events >= 3;
  } else {
    values = [roll(6, rng)];
    if (type !== 'standard2' && odds !== 'mid') values.push(roll(6, rng));
    const n = type === 'standard2' ? clamp(values[0] + (Number(odds) || 0), 1, 6) :
      odds === 'low' ? Math.min(...values) : Math.max(...values);
    answer = SIX[n];
    if (type === 'mune' && values.includes(6)) event = ++state.events >= 3;
    if (type === 'standard2' && roll(6, rng) === 6) event = ++state.events >= 3;
  }
  if (event) state.events = 0;
  const detail = event && options.events && /standard/.test(type) ? [
    pick(['positivo','negativo','neutro'], rng), pick(['personagem','facção','ambiente'], rng),
  ].join(' · ') : '';
  const [language, yesWord, noWord, andWord, butWord, extremeWord, eventLabel] =
    (Object.hasOwn(LANGUAGES, options.oracleLanguage) && LANGUAGES[options.oracleLanguage]) || LANGUAGES.pt;
  if (language !== 'Português') {
    answer = answer.replace(/^Sim/, yesWord).replace(/^Não/, noWord).replace(' excepcional', ' ' + extremeWord)
      .replace(/, e$/, ', ' + andWord).replace(/, mas$/, ', ' + butWord);
  }
  return { answer, values, event, eventLabel, detail, state };
}
module.exports = { MAX_FACES, MAX_CARDS, IMAGE_EXT, DICE, ODDS, LANGUAGES, clean, key, clamp, integer, pick, roll, cap, imageRef, pathValue,
  defaultSolo, validateSolo, validateDie, numberFace, dieRoll, parseDice, rollDice, sections, makeCard, validateDeck, imageTitle,
  builtinDeck, deckIds, freshPile, validPile, draw, returnCard, parseBlocks, legacyCard, legacyDeck, folderDeck, oracle };
