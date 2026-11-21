'use strict';
const { copy, uid } = require('./calendar');
const { key, clean, clamp, parseDice, rollDice } = require('./solo');

const KINDS = Object.freeze({ player: 'Personagem de jogador', npc: 'NPC', creature: 'Criatura' });
const ELEMENTS = Object.freeze({ adventure: 'Aventura', chapter: 'Capítulo', session: 'Sessão', scene: 'Cena', event: 'Evento',
  npc: 'NPC', faction: 'Facção', site: 'Local', clue: 'Pista', item: 'Objeto', subplot: 'Subtrama' });
const SIDES = Object.freeze({ players: 'Jogadores', enemies: 'Adversários', allies: 'Aliados', neutral: 'Neutros' });
const LIMITS = { campaigns: 100, entries: 1000, sheets: 700, encounters: 300, members: 120, fields: 30 };
const whole = (v, min = -999999, max = 999999) => Number.isSafeInteger(v) && v >= min && v <= max;
function requireMesa(ok, message) { if (!ok) throw new Error(message); }
function blankMesa() { return { version: 1, campaigns: [], entries: [], sheets: [], encounters: [], running: null, activity: [], sheetStates: {} }; }
function newCampaign() { return { id: uid('camp'), name: '', note: '', summary: '', calendar: '' }; }
function newEntry(campaign) { return { id: uid('entry'), campaign, name: '', kind: 'session', note: '', summary: '', links: [], date: null }; }
function newSheet(campaign = '') {
  return { id: uid('sheet'), campaign, name: '', kind: 'creature', type: '', note: '', description: '', image: '', initiative: '1d20',
    attributes: [], resources: [], actions: [] };
}
function resource(name, max, value = max) { return { name, max, value }; }
function arkanisSheet(campaign) {
  return { ...newSheet(campaign), name: 'Ficha de Arkanis', kind: 'player', resources: [
    resource('Vida', 10), resource('Esforço', 5), resource('Impulso', 5, 0), resource('Estresse', 5, 0),
  ] };
}
function newEncounter(campaign = '') { return { id: uid('enc'), campaign, entry: '', name: '', grouped: false, roster: [] }; }
const find = (items, identifier, predicate = () => true) => {
  const k = key(identifier);
  const matched = items.filter(e => predicate(e) && (e.id === identifier || key(e.name) === k));
  const exact = matched.find(e => e.id === identifier);
  if (!exact && matched.length > 1) throw new Error('Há mais de um resultado com esse nome. Use o ID.');
  return exact || matched[0];
};
function need(items, identifier, message) {
  const data = items.find(x => x.id === identifier);
  requireMesa(data, message);
  return data;
}
function numeric(v, fallback) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v !== 'string' || !v.trim()) return fallback;
  const m = v.trim().match(/^[+-]?\d{1,8}/);
  return m ? Number(m[0]) : fallback;
}
function rows(items) { return Array.isArray(items) ? items.slice(0, LIMITS.fields) : []; }
function textPath(v) { return clean(v, 500).replace(/^!?\[\[|\]\]$/g, '').split('|')[0]; }
function yamlSheet(data, campaign = '') {
  requireMesa(data !== null && typeof data === 'object' && !Array.isArray(data), 'Use um objeto YAML ou JSON para a ficha.');
  const d = { ...newSheet(campaign), name: clean(data.name || data.nome), kind: Object.hasOwn(KINDS, data.kind) ? data.kind : 'creature',
    type: clean(data.type || data.tipo), description: clean(data.description || data.descricao, 12000),
    note: textPath(data.note || data.nota), image: textPath(Array.isArray(data.image) ? data.image[0] : data.image),
    initiative: clean(typeof data.initiative === 'number' ? String(data.initiative) : data.initiative || '1d20', 60) };
  for (const x of rows(data.attributes)) {
    if (x?.name && ['number','string'].includes(typeof x.value)) d.attributes.push({ name: clean(x.name), value: clean(String(x.value), 160) });
  }
  for (const [label, attr] of [['CA','ac'],['Nível','level'],['ND','cr'],['XP','xp'],['Deslocamento','speed']]) {
    const value = data[attr];
    if (typeof value === 'number' || typeof value === 'string') d.attributes.push({ name: label, value: clean(String(value), 160) });
  }
  if (Array.isArray(data.stats)) ['FOR','DES','CON','INT','SAB','CAR'].forEach((name,i) => {
    if (typeof data.stats[i] === 'number') d.attributes.push({ name, value: String(data.stats[i]) });
  });
  d.attributes = d.attributes.slice(0, LIMITS.fields);
  for (const x of rows(data.resources)) {
    if (!x?.name) continue;
    const max = numeric(x.max, 0);
    d.resources.push(resource(clean(x.name), max, numeric(x.value, max)));
  }
  if (data.hp != null && !d.resources.some(r => ['vida','pv','hp'].includes(key(r.name)))) {
    const hp = numeric(data.hp, null);
    if (hp !== null && d.resources.length < LIMITS.fields) d.resources.unshift(resource('Vida', hp));
  }
  for (const [group, items] of [['Ação', data.actions], ['Traço', data.traits], ['Reação', data.reactions]]) {
    for (const x of rows(items)) {
      if (x?.name) d.actions.push({ name: clean(x.name), text: clean(x.text || x.desc || x.description, 5000), roll: clean(x.roll, 60), damage: clean(x.damage, 60), cost: clean(x.cost, 110), group,
      ...Object.fromEntries(['resolution','defense','targetResource','saveAttribute','saveDC','halfOnSave','customDie','dieCount'].filter(k=>x[k]!==undefined).map(k=>[k,x[k]])) });
    }
  }
  d.actions = d.actions.slice(0, LIMITS.fields);
  return checkSheet(d);
}
function isInit(s) { return !!parseDice(s) || /^[-+]?\d{1,6}$/.test(s); }
function calcInit(formula, rng) { return parseDice(formula) ? rollDice(formula, rng).total : Number(formula); }
function checkResource(r) {
  requireMesa(r && clean(r.name) && whole(r.max, 0, 999999) && whole(r.value, 0, r.max) && (!r.rest || ['max','zero','keep'].includes(r.rest)), 'Cada recurso precisa de nome e de um valor entre zero e o máximo, com regra de descanso válida.');
}
function checkSheet(s) {
  requireMesa(s && clean(s.id) && clean(s.name) && Object.hasOwn(KINDS, s.kind), 'Preencha o nome e o tipo da ficha.');
  requireMesa(typeof s.initiative === 'string' && isInit(s.initiative), 'Use iniciativa como 1d20+2 ou um número fixo.');
  for (const field of ['attributes','resources','actions']) requireMesa(Array.isArray(s[field]) && s[field].length <= LIMITS.fields, 'Limite de campos da ficha atingido.');
  for (const a of s.attributes) requireMesa(a && clean(a.name) && typeof a.value === 'string', 'Cada atributo precisa de um nome.');
  s.resources.forEach(checkResource);
  requireMesa(new Set(s.resources.map(r => key(r.name))).size === s.resources.length, 'Não repita nomes de recursos na mesma ficha.');
  for (const a of s.actions) requireMesa(a && clean(a.name) && (!a.roll || !!parseDice(a.roll)) && (!a.damage || !!parseDice(a.damage)) && (!a.cost || /^.{1,100}:[1-9]\d{0,3}$/.test(a.cost)), 'Ação inválida: use rolagens como 1d20+3, dano como 1d6 e custo como Esforço:2.');
  for(const a of s.actions)require('./combat').checkAction(a);
  return s;
}
function checkEncounter(e) {
  requireMesa(e && clean(e.id) && clean(e.name), 'Dê um nome ao encontro.');
  requireMesa(Array.isArray(e.roster) && e.roster.length > 0 && e.roster.length <= LIMITS.members, 'Inclua pelo menos um participante.');
  e.roster.forEach(r => {
    requireMesa(r && (clean(r.sheet) || clean(r.name)), 'Escolha uma ficha ou dê um nome ao participante.');
    requireMesa(Object.hasOwn(SIDES, r.side), 'Lado do participante inválido.');
    const formula = typeof r.count === 'string' && parseDice(r.count);
    requireMesa((/^\d{1,3}$/.test(r.count) && whole(+r.count, 1, LIMITS.members)) ||
      (formula && !formula.fudge && !formula.mode && formula.amount * formula.sides + formula.modifier <= LIMITS.members &&
      formula.amount + formula.modifier >= 1), 'Use de 1 a 120 participantes por linha ou uma expressão de quantidade válida, como 1d4.');
    requireMesa(!r.initiative || (typeof r.initiative === 'string' && isInit(r.initiative)), 'Iniciativa inválida. Use 1d20+2 ou um número.');
  });
  return e;
}
function checkMesa(m) {
  requireMesa(m?.version === 1, 'Formato de Mesa não reconhecido.');
  require('./session').checkSession(m);
  if(m.atlas !== undefined)require('./atlas').checkAtlas(m.atlas,m);
  for (const field of ['campaigns','entries','sheets','encounters']) {
    const a = m[field];
    requireMesa(Array.isArray(a) && a.length <= LIMITS[field] && a.every(x => x && clean(x.id) && clean(x.name)) &&
      new Set(a.map(x => x.id)).size === a.length, 'Biblioteca da Mesa inválida ou cheia.');
  }
  if (m.activity !== undefined) requireMesa(Array.isArray(m.activity) && m.activity.length <= 150 && m.activity.every(a => a && clean(a.id) && clean(a.title) && typeof a.detail === 'string'), 'Histórico da Mesa inválido.');
  if (m.sheetStates !== undefined) requireMesa(m.sheetStates && typeof m.sheetStates === 'object' && !Array.isArray(m.sheetStates) && Object.keys(m.sheetStates).length <= LIMITS.sheets && Object.values(m.sheetStates).every(resources => Array.isArray(resources) && resources.length <= LIMITS.fields && resources.every(r => { try { checkResource(r); return true; } catch { return false; } })), 'Recursos persistidos inválidos.');
  require('./creation').checkTemplates(m);
  const campaigns = new Set(m.campaigns.map(c => c.id));
  const entries = new Map(m.entries.map(e => [e.id,e]));
  const sheets = new Map(m.sheets.map(s => [s.id,s]));
  for (const e of m.entries) {
    requireMesa(campaigns.has(e.campaign) && Object.hasOwn(ELEMENTS,e.kind), 'O registro precisa pertencer a uma campanha.');
    requireMesa(Array.isArray(e.links) && e.links.length <= 80 && e.links.every(id => id !== e.id && entries.get(id)?.campaign === e.campaign),
      'Os vínculos precisam apontar para registros diferentes da mesma campanha.');
    if (e.date) {
      const { calendar, date, label } = e.date;
      requireMesa(clean(calendar) && clean(label) && date && whole(date.year,-100000,100000) &&
        clean(date.month) && whole(date.day,1,100000), 'Data do registro inválida.');
    }
  }
  m.sheets.forEach(s => { checkSheet(s); requireMesa(!s.campaign || campaigns.has(s.campaign), 'Campanha da ficha não encontrada.'); });
  m.encounters.forEach(e => {
    checkEncounter(e);
    requireMesa(!e.campaign || campaigns.has(e.campaign), 'Campanha do encontro não encontrada.');
    requireMesa(!e.entry || entries.get(e.entry)?.campaign === e.campaign, 'Escolha um registro da campanha deste encontro.');
    for (const line of e.roster) requireMesa(!line.sheet || (sheets.has(line.sheet) && (!sheets.get(line.sheet).campaign || sheets.get(line.sheet).campaign === e.campaign)),
      'Ficha do encontro não encontrada na biblioteca compartilhada ou na campanha.');
  });
  if (m.running !== null) {
    const f = m.running, list = f?.members;
    requireMesa(f && clean(f.name) && Array.isArray(list) && list.length > 0 && list.length <= LIMITS.members &&
      whole(f.round, 1, 999999) && list.some(p => p?.id === f.turn) && new Set(list.map(p => p.id)).size === list.length, 'Encontro em andamento inválido.');
    for (const p of list) {
      requireMesa(p && clean(p.name) && whole(p.initiative, -20000000, 20000000) && Object.hasOwn(SIDES,p.side) &&
        Array.isArray(p.conditions) && p.conditions.length <= 20 && Array.isArray(p.resources) && p.resources.length <= LIMITS.fields, 'Participante inválido.');
      p.resources.forEach(checkResource);
      if (p.sheet) checkSheet(p.sheet);
    }
    require('./combat').checkAdvanced(f);
  }
  return m;
}
function sourceRoster(list, m, campaign = '') {
  const asRow = (name, count = '1', fields = {}) => {
    const sheet = find(m.sheets, name, s => !s.campaign || s.campaign === campaign);
    return { sheet: sheet?.id || '', name: clean(fields.name || (!sheet && name) || ''), count: String(count),
      side: Object.hasOwn(SIDES, fields.side) ? fields.side : 'enemies',
      initiative: fields.initiative === undefined ? '' : String(fields.initiative) };
  };
  requireMesa(Array.isArray(list) && list.length <= LIMITS.members, 'Use uma lista de participantes.');
  return list.map(x => {
    if (typeof x === 'string') return asRow(x);
    requireMesa(x && typeof x === 'object' && !Array.isArray(x), 'Participante inválido no bloco.');
    if (x.sheet || x.name) return asRow(x.sheet || x.name, x.count ?? '1', x);
    const pairs = Object.entries(x);
    requireMesa(pairs.length === 1 && typeof pairs[0][1] === 'string', 'Use nome da ficha ou uma entrada como 3: Goblin.');
    return asRow(pairs[0][1], pairs[0][0]);
  });
}
function order(members) { return members.sort((a,b) => (b.initiative - a.initiative) || (a.seed - b.seed)); }
function buildRunning(data, m, rng = Math.random) {
  checkEncounter(data);
  const members = [];
  for (const line of data.roster) {
    const s = line.sheet ? need(m.sheets, line.sheet, 'Ficha de participante não encontrada.') : null;
    const n = parseDice(line.count) ? rollDice(line.count, rng).total : +line.count;
    requireMesa(whole(n, 1, LIMITS.members) && members.length + n <= LIMITS.members, 'Um encontro tem no máximo 120 participantes.');
    const initiative = line.initiative || s?.initiative || '1d20', label = clean(line.name || s?.name);
    const shared = data.grouped ? calcInit(initiative, rng) : null;
    for (let i = 0; i < n; i++) {
      members.push({ id: uid('turn'), name: n === 1 ? label : label + ' ' + (i + 1), initiative: shared ?? calcInit(initiative, rng),
        seed: members.length, side: line.side, resources: s?.kind==='player'&&line.side==='players'&&n===1 ? require('./ultra').activeResources(m,s) : copy(s?.resources || []), conditions: [], sheet: s ? copy(s) : null });
    }
  }
  order(members);
  return { id: uid('run'), from: data.id, campaign: data.campaign, entry: data.entry, name: data.name, round: 1, turn: members[0].id, members };
}
function step(r, direction = 1) {
  const at = r.members.findIndex(p => p.id === r.turn), next = at + direction;
  if (next < 0) {
    if (r.round === 1) return;
    r.round--; r.turn = r.members.at(-1).id;
  } else if (next >= r.members.length) {
    requireMesa(r.round < 999999, 'O encontro atingiu o limite de rodadas.');
    r.round++; r.turn = r.members[0].id;
  } else r.turn = r.members[next].id;
}
function changeResource(r, id, i, delta) {
  const p = need(r.members, id, 'Participante não encontrado.'), meter = p.resources[i];
  requireMesa(meter && whole(delta), 'Ajuste de recurso inválido.');
  meter.value = clamp(meter.value + delta, 0, meter.max);
}
module.exports = { KINDS, ELEMENTS, SIDES, LIMITS, requireMesa, whole, blankMesa, newCampaign, newEntry, newSheet, resource, arkanisSheet,
  newEncounter, find, need, isInit, checkSheet, checkEncounter, checkMesa, yamlSheet, sourceRoster, order, buildRunning, step, changeResource };
