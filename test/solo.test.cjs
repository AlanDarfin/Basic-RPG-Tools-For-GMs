'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeCard, imageRef, rollDice, dieRoll, validateDie, builtinDeck, defaultSolo, validateDeck, draw,
  freshPile, returnCard, validPile, parseBlocks, legacyCard, legacyDeck, folderDeck, oracle } = require('../src/solo');
const { parseTable, tableEngine, choose } = require('../src/solo-tables');
const stream = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const yaml = (s) => Object.fromEntries(s.split('\n').map(row => {
  const i = row.indexOf(':'); return [row.slice(0,i),row.slice(i+1).trim().replace(/^"|"$/g, '')];
}));

test('dados numéricos, Fudge, vantagem, desvantagem e modificador', () => {
  assert.deepEqual(rollDice('3d6-2/d,red', stream(.9, .2, .5)), { values: [6,2,4], total: 0, color: 'red' });
  assert.deepEqual(rollDice('2d20+3/a', stream(.1,.9)).total, 22);
  assert.deepEqual(rollDice('3dF', stream(0,.4,.99)).values, [-1,0,1]);
  for (const expression of ['0d6','101d6','d1','d1234567','3d','2d6,red;']) assert.throws(() => rollDice(expression));
});
test('dado customizado mistura imagens, texto e números e mantém posições repetidas', () => {
  const faces = [{ kind: 'image', image: 'Arte/Triunfo.webp', label: 'Triunfo' }, { kind: 'number', value: 25 }, { kind: 'text', label: '⚔' }];
  const d = validateDie({ id: 'test', name: 'Símbolos', faces: [...faces, faces[0]] });
  assert.deepEqual(dieRoll(d, 4, stream(0,.26,.55,.99)), { faces: [...faces, faces[0]], total: null });
  assert.equal(dieRoll(d, 2, stream(.27)).total, 50);
  assert.throws(() => validateDie({ ...d, faces: [{ kind: 'image', image: 'file:///secret.png' }, faces[0]] }));
  assert.equal(imageRef('![[Artes/Carta.png|100]]'), 'Artes/Carta.png');
  assert.equal(imageRef('../Carta.png'), '');
  assert.equal(imageRef('https://example.org/face.png'), 'https://example.org/face.png');
  assert.equal(imageRef('https://user:pass@example.org/face.png'), '');
});
test('baralhos nativos, orientação, sem reposição e devolução', () => {
  const settings = defaultSolo().settings;
  const standard = builtinDeck('standard', settings);
  assert.equal(standard.cards.length, 52);
  assert.equal(builtinDeck('standard', { ...settings, jokers: true }).cards.length, 54);
  assert.equal(builtinDeck('tarot', settings).cards.length, 22);
  const first = draw(null, standard, 'main', 30, stream(.4));
  const second = draw(first, standard, 'main', 30, stream(.9));
  assert.ok(validPile(second, standard, 'main'));
  assert.equal(second.drawn.length, 52);
  assert.equal(second.remaining.length, 0);
  const id = second.drawn[0].id, returned = returnCard(second, id);
  assert.deepEqual(returned.remaining, [id]);
  assert.equal(draw(returned, standard, 'main', 1).drawn[0].id, id);
  const arc = builtinDeck('tarot', settings);
  const arcPile = freshPile(arc, 'main', stream(.4));
  assert.equal(draw(arcPile, arc, 'main', 1, stream(.99)).drawn[0].angle, 180);
  assert.equal(validPile({ remaining: ['fake'], drawn: [] }, arc, 'main'), false);
});
test('baralho de pasta respeita múltiplas orientações, ordem, URLs e reuso', () => {
  const deck = folderDeck('Criaturas', ['Criaturas/10.png','Criaturas/2.png','Criaturas/2.png','readme.txt'],
    ['flip2\n![](https://example.org/card.png)']);
  assert.equal(deck.orientations, 5);
  assert.deepEqual(deck.cards.map(x => x.title), ['2','10','card']);
  const cards = deck.cards.map((x,i) => makeCard(x, 'c' + i));
  const validated = validateDeck({ id: 'mydeck', ...deck, cards });
  const pile = { drawn: [], remaining: cards.map(c => c.id) };
  assert.equal(draw(pile, validated, 'main', 1, stream(.99)).drawn[0].angle, 90);
});
test('Deck Builder antigo importa todos os atributos, várias cópias e seções', () => {
  const note = '\x60\x60\x60DeckCard\nnome: Dragão\nimagem: ![[Cards/Dragão.png]]\ntipo: Monstro\ndescricao: Efeito: ataque em área\ncusto: 2 fogo\nelemento: Vermelho\nnivel: 3\nataque: 30\ndefesa: 20\n\x60\x60\x60\n' +
    '\x60\x60\x60FullDeck\n# Main\nDragão\nDRAGÃO\n# Extra\nDragão\n# Side\nDragão\nFaltando\n\x60\x60\x60\n';
  const b = parseBlocks(note), c = legacyCard(b.cards[0], 'Notas/A.md', 'old1');
  assert.deepEqual(c, { id: 'old1', title: 'Dragão', section: 'main', image: 'Cards/Dragão.png', type: 'Monstro',
    text: 'Efeito: ataque em área', cost: '2 fogo', element: 'Vermelho', level: '3', attack: '30', defense: '20', source: 'Notas/A.md' });
  let n = 0;
  const imported = legacyDeck(b.lists[0], [c], () => 'i' + ++n);
  assert.deepEqual(imported.missing, ['Faltando']);
  assert.deepEqual(imported.cards.map(c => c.section), ['main','main','extra','side']);
  assert.equal(new Set(imported.cards.map(c => c.id)).size, 4);
  assert.equal(draw(null, { id: 'custom', orientations: 1, cards: imported.cards }, 'extra', 3).drawn.length, 1);
  assert.equal(parseBlocks('~~~~md\n' + note + '~~~~\n').cards.length, 0);
});
test('oráculos implementam o modificador, viés, intervenções, caos e idioma', () => {
  assert.equal(oracle('fu','low',{}, {}, stream(.1,.99)).answer, 'Não, e');
  assert.equal(oracle('fu','high',{}, {}, stream(.1,.99)).answer, 'Sim, e');
  assert.equal(oracle('standard2', 2, {}, {}, stream(.4,.1)).answer, 'Sim');
  assert.equal(oracle('mune','mid',{}, { events: 2 }, stream(.99)).event, true);
  assert.equal(oracle('standard','mid',{ bias: true }, { factor: 20 }, stream(.60,.99,.99)).answer, 'Sim');
  assert.equal(oracle('standard','mid',{ bias: true }, { factor: 20 }, stream(.90,.99,.99)).state.factor, 40);
  const mythic = (chaos, n) => oracle('mythic', 4, { chaos, oracleLanguage: 'en' }, {}, stream((n-1)/100 + .004));
  assert.equal(mythic(5, 55).event, true);
  assert.equal(mythic(4, 55).event, false);
  assert.equal(mythic(5, 55).answer, 'No');
  assert.equal(mythic(7, 55).answer, 'Yes');
});
test('tabelas com pesos, seções, aliases, repetição de resultado e referências fora do diretório', () => {
  const base = parseTable('Tables/Jornada 2d.md',
    '---\nCena ^3: "{Viajantes} segue {relíquia/Pistas} por {/Lore/Vilas}. {<Viajantes} retorna."\n---\n## Viajantes\nAldara ^3\nRita\n', yaml);
  const item = parseTable('Tables/segredos_/Relíquia.md', '# Pistas 3d\nMaçã de cobre\n', yaml);
  const lore = parseTable('Lore/Vilas.md', 'Porto Velho\n', yaml);
  const table = tableEngine([base,item,lore], 'Tables', stream(0,.03,.04,.05));
  assert.equal(base.curve, 2);
  assert.equal(item.sections[1].curve, 3);
  assert.equal(table.output(base), 'Aldara segue Maçã de cobre por Porto Velho. Aldara retorna.');
  assert.equal(table.quick('{segredos/*}'), 'Relíquia');
  assert.match(table.quick('{segredos/!}'), /Pistas/);
  assert.equal(table.quick('{Viajantes|noun}').startsWith('{'), true); // standalone templates need a context for local headings
  assert.equal(choose([{text:'leve',weight:1},{text:'pesado',weight:9}], 1, stream(.49)), 'pesado');
});
test('recorte, alternativas e referências cíclicas permanecem controlados', () => {
  const note = parseTable('Tables/Livro.md', '---\nmode: cutup\n---\nUma longa história sobre o mar aberto.', yaml);
  const cyc = parseTable('Tables/Ciclo.md', '{Ciclo}', yaml);
  const e = tableEngine([note,cyc], 'Tables', stream(0));
  assert.equal(e.output(note), 'Uma longa');
  assert.equal(e.output(cyc), '{Ciclo}');
  assert.match(e.quick('{noun|verb}'), /^[^{}]+$/);
});
