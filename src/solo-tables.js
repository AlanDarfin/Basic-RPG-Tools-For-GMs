'use strict';
const { key, pick, roll, cap, clean } = require('./solo');

const words = (source) => source.split('|');
const DICT = {
  noun: words('relíquia|viajante|tempestade|promessa|espelho|santuário|feiticeira|estandarte|desfiladeiro|fortaleza|testamento|peregrino|segredo|criatura|juramento|corvo|fogueira|ilha|estandarte|coroa|enchente|ponte|masmorra|caravana|manuscrito|fonte|chave|tesouro|taça|máscara'),
  verb: words('proteger|roubar|revelar|perseguir|enganar|encontrar|convocar|destruir|negociar|desafiar|resgatar|atravessar|isolar|ocultar|fugir|contratar|lamentar|profetizar|enterrar|vingar|ameaçar|prever|trair|conquistar|investigar|reconstruir|lembrar'),
  adjective: words('antigo|enigmático|selado|selvagem|radiante|efêmero|sombrio|condenado|pálido|escondido|desolado|impecável|retorcido|nebuloso|agreste|solene|amaldiçoado|abandonado|erosivo|imprevisível'),
  adverb: words('silenciosamente|às pressas|de surpresa|devagar|sem querer|por acaso|com solenidade|às escondidas|relutantemente|às cegas|a contragosto|de longe|com entusiasmo|tarde demais'),
  job: words('cartógrafa|boticário|escriba|caçador de monstros|mensageira|vigia|ferreira|arquivista|curandeira|barqueiro|aprendiz de magia|estalajadeira|tecelão|joalheira|mercador|agrimensora|capitã|hortelão|arquiteta|guardião'),
  aspect: words('misterioso|protetor|arrogante|perceptivo|obstinado|generoso|ingênuo|impulsivo|reservado|intimidador|exilado|pessimista|paciente|ambicioso|meticuloso|pragmático|eloquente|nostálgico'),
  skill: words('rastreamento|alquimia|negociação|furtividade|rituais|sobrevivência|pontaria|arrombamento|heráldica|navegação|espionagem|forja|oratório|criptografia|esgrima|cavalaria|medicina|apicultura'),
  name: words('Maelis|Ilven|Rhana|Tavio|Neris|Damar|Íria|Valen|Araçá|Iara|Sorel|Cauê|Orinna|Evren|Nadir|Altair|Alba|Mairon|Ravi|Melian|Eloá|Cira|Renard|Inara'),
  'town name': words('Brumavela|Vale de Sal|Pedra Rubra|Vilar do Norte|Cruz de Cobre|Baía do Corvo|Aurária|Entremares|Cimo do Cedro|Linha Verde|Ponte da Lua|Foz do Ferro|Areia Alta|Porto do Sino|Fundo dos Ecos|Pedra de Mel'),
  building: words('mercado itinerante|torre de vigia|casa de banhos|biblioteca|oficina de vidro|templo vazio|porto fluvial|taverna|jardim suspenso|cripta|ponte levadiça|moinho de vento|pátio de armas|aqueduto'),
  wilderness: words('ruínas inundadas|caminho de geada|pântano de névoa|bosque petrificado|penhasco com ninhos|campo de pedras cantantes|pequena clareira|planalto de sal|caverna azulada|árvore queimada|riacho subterrâneo|deserto florido'),
};
const ALIASES = { substantivo: 'noun', verbo: 'verb', adjetivo: 'adjective', adverbio: 'adverb', profissao: 'job',
  occupation: 'job', descriptor: 'aspect', 'in wild': 'wilderness', 'in town': 'building', aspecto: 'aspect', habilidade: 'skill', nome: 'name', cidade: 'town name', edificio: 'building', ermo: 'wilderness' };
const IDEAS = {
  plot: ['Gancho de história', [['Sujeito', 'noun'], ['Ação', 'verb'], ['Objetivo', 'noun']]],
  npc: ['Personagem', [['Nome', 'name'], ['Ocupação', 'job'], ['Aspecto', 'aspect'], ['Habilidade', 'skill']]],
  place: ['Lugar', [['Nome', 'town name'], ['Descrição', 'adjective'], ['Na cidade', 'building'], ['Nos arredores', 'wilderness']]],
};
function weightedLine(s) {
  const m = s.trim().match(/^(.*?)\s+\^(\d{1,6})$/);
  return m ? { text: m[1].trim(), weight: +m[2] } : { text: s.trim(), weight: 1 };
}
function diceLabel(s) {
  const m = s.match(/^(.+?)\s+(\d{1,2})d$/i);
  return { label: m ? m[1].trim() : s, curve: m ? Math.max(1, Math.min(20, +m[2])) : 1 };
}
function choose(rows, curve = 1, rng = Math.random) {
  const total = rows.reduce((sum, r) => sum + r.weight, 0);
  if (!total) return '';
  let index = 0;
  for (let i = 0; i < curve; i++) index += rng();
  let offset = index / curve * total;
  for (const row of rows) { offset -= row.weight; if (offset < 0) return row.text; }
  return rows.at(-1).text;
}
function parseTable(file, source, yaml) {
  const normalized = String(source).replace(/\r\n/g, '\n');
  const fm = normalized.match(/^\uFEFF?---\s*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  let properties = {};
  if (fm) { try { properties = yaml(fm[1]) || {}; } catch { /* keep body accessible */ } }
  const body = fm ? normalized.slice(fm[0].length) : normalized;
  const filename = file.split('/').at(-1).replace(/\.md$/i, '');
  const { label, curve } = diceLabel(filename);
  let active = { label: '', curve, rows: [] }, fence = '';
  const sections = [active];
  for (let row of body.split('\n')) {
    const delimiter = row.match(/^\s*(`{3,}|~{3,})/);
    if (delimiter) { if (!fence) fence = delimiter[1]; else if (fence[0] === delimiter[1][0] && fence.length <= delimiter[1].length) fence = ''; continue; }
    if (fence) continue;
    row = row.trim();
    const h = row.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (h) { active = { ...diceLabel(h[1]), rows: [] }; sections.push(active); continue; }
    if (!row || /^<!--/.test(row)) continue;
    const entry = weightedLine(row.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, ''));
    if (entry.text && entry.weight) active.rows.push(entry);
  }
  const templates = Object.entries(properties).filter(([name, value]) => key(name) !== 'mode' && typeof value === 'string' && value.trim())
    .map(([name, value]) => ({ ...weightedLine(name), label: weightedLine(name).text, text: value, capital: /^\p{Lu}/u.test(name) }))
    .filter(x => x.weight);
  return { path: file, label, curve, sections, templates, cutup: key(properties.mode) === 'cutup', body };
}
function tableEngine(entries, root, rng = Math.random) {
  let steps = 0;
  function cut(table) {
    const tokens = table.body.match(/\S+/g) || [];
    if (!tokens.length) return '';
    const start = roll(tokens.length, rng) - 1;
    return tokens.slice(start, start + roll(7, rng) + 1).join(' ');
  }
  function section(table, name) {
    if (table.cutup) return cut(table);
    if (name) {
      const s = table.sections.find(s => key(s.label) === key(name));
      return s ? choose(s.rows, s.curve, rng) : '';
    }
    return choose(table.sections.flatMap(x => x.rows), table.curve, rng);
  }
  const relPath = (t) => t.path.startsWith(root + '/') ? t.path.slice(root.length + 1).replace(/\.md$/i, '') : t.path.replace(/\.md$/i, '');
  function resolve(token, table) {
    const options = token.split('|').map(s => s.trim()).filter(Boolean);
    if (options.length > 1) return resolve(pick(options, rng), table);
    const name = key(options[0] || '');
    if (!name) return '';
    if (table?.sections.some(x => x.label && key(x.label) === name)) return section(table, name);
    const path = name.replace(/^\//, '').replace(/\.md$/i, '');
    const source = entries.find(t => name.startsWith('/') ? key(t.path.replace(/\.md$/i, '')) === path :
      key(t.relAlias || relPath(t)) === path || key(t.label) === path);
    if (source) return section(source);
    if (name.includes('/')) {
      const i = name.lastIndexOf('/'), parent = name.slice(0, i), leaf = name.slice(i + 1);
      const match = entries.find(t => key(t.path.replace(/\.md$/i, '')) === parent.replace(/^\//, '') ||
        (t.path.startsWith(root + '/') && (key(relPath(t)) === parent || key(t.label) === parent)));
      if (match && leaf !== '*' && leaf !== '!') return section(match, leaf);
      const folder = folderEntries(parent);
      if (folder.length && leaf === '*') return pick(folder, rng).label;
      if (folder.length && leaf === '!') return pick(folder, rng).body.trim();
    }
    const folder = folderEntries(name);
    if (folder.length) {
      const available = folder.filter(t => t.cutup || t.sections.some(s => s.rows.length));
      if (available.length) return section(pick(available, rng));
    }
    if (name === 'a') return 'um';
    const builtin = DICT[ALIASES[name] || name];
    return Array.isArray(builtin) ? pick(builtin, rng) : '';
  }
  function folderEntries(name) {
    const target = name.replace(/^\//, '');
    return entries.filter(t => name.startsWith('/') ? key(t.path).startsWith(target + '/') :
      t.path.startsWith(root + '/') && key(relPath(t)).split('/').slice(0, -1).some((folder, i, all) =>
        all.slice(0, i + 1).join('/') === target || folder.replace(/[._]$/, '') === target));
  }
  function expand(text, table, memory = new Map(), depth = 0) {
    if (depth > 6) return text;
    return text.slice(0, 16000).replace(/\{\s*([^{}]{1,200})\s*\}/g, (match, original) => {
      if (++steps > 300) return match;
      const token = original.trim().replace(/^</, ''), memo = key(token);
      if (original.trim().startsWith('<') && memory.has(memo)) return memory.get(memo);
      const raw = resolve(token, table);
      if (!raw) return match;
      const result = expand(raw, table, memory, depth + 1);
      memory.set(memo, result);
      return result;
    }).slice(0, 16000);
  }
  function output(table, selected = '') {
    steps = 0;
    if (table.cutup) return cut(table);
    const chosen = selected.startsWith('t:') ? table.templates[+selected.slice(2)] : null;
    if (selected.startsWith('s:')) return expand(section(table, table.sections[+selected.slice(2)]?.label), table);
    if (chosen) return chosen.capital ? cap(expand(chosen.text, table)) : expand(chosen.text, table);
    if (table.templates.length) {
      const picked = choose(table.templates.map((t, i) => ({ text: String(i), weight: t.weight })), 1, rng);
      return output(table, 't:' + picked);
    }
    return expand(section(table), table);
  }
  return { output, quick: (str) => { steps = 0; return expand(clean(str, 16000)); } };
}
module.exports = { DICT, IDEAS, parseTable, tableEngine, choose };
