'use strict';
const { ItemView, Modal, FuzzySuggestModal, Notice, MarkdownView } = require('obsidian');
const { uid, copy } = require('./calendar');
const { el, button, select, input, inlineNumber, info, Confirm } = require('./ui');
const {
  DICE, ODDS, LANGUAGES, MAX_FACES, MAX_CARDS, key, clean, imageRef, pathValue, integer, pick, validateDie, numberFace, dieRoll, rollDice, parseDice,
  sections, validateDeck, makeCard, builtinDeck, deckIds, freshPile, validPile, draw, returnCard, oracle,
} = require('./solo');
const { imageUrl, imageFiles, deckFolders, loadDeckFolder, loadLegacy, tableNotes, legacyIcons, legacyDeck, resolvePath } = require('./solo-vault');
const { DICT, IDEAS, tableEngine } = require('./solo-tables');

const SOLO_VIEW = 'basic-rpg-solo';
const TABS = [['dice','Dados','dice-5'], ['deck','Baralhos','layers'], ['oracle','Oráculos','sparkles'], ['tables','Tabelas','list-ordered']];
const BODIES = [['standard','Padrão'], ['standard2','Padrão II · d6'], ['fu','FU'], ['mune','MUNE'], ['mythic','Mythic']];
const ROTATIONS = [[1,'Sem rotação'], [2,'Em pé ou invertida'], [5,'Em pé ou 90° à direita'], [3,'Em pé, 90° à direita ou à esquerda'], [4,'Quatro direções']];

const row = (root) => el(root, 'div', 'brpg-toolbar brpg-solo-row');
function group(root, title, note) {
  const box = el(root, 'section', 'brpg-solo-section');
  if (title) el(box, 'h3', 'brpg-solo-label', title);
  if (note) info(box, note);
  return box;
}
function choose(root, label, entries, value, update) {
  const labelEl = el(root, 'label', 'brpg-field');
  el(labelEl, 'span', 'brpg-label', label);
  return select(labelEl, entries.map(([v, text]) => [String(v), text]), String(value), update, label);
}
function toggle(root, label, value, update) {
  const wrapper = el(root, 'label', 'brpg-solo-toggle');
  const control = el(wrapper, 'input'); control.type = 'checkbox'; control.checked = !!value;
  el(wrapper, 'span', '', label);
  control.addEventListener('change', () => update(control.checked));
}
function errorText(node, error) { node.textContent = error?.message || String(error); }
function saveButton(root, label, run) { return button(root, label, run, { icon: 'check', className: 'brpg-button mod-cta' }); }
function art(root, plugin, image, alt, source, className = '') {
  const remote = plugin.solo().settings.remote;
  const url = imageUrl(plugin.app, image, source, remote);
  if (!url) {
    if (image) el(root, 'span', 'brpg-solo-art-missing', /^https?:\/\//i.test(image) && !remote ? 'Imagem externa desativada' : 'Imagem não encontrada');
    return null;
  }
  const img = el(root, 'img', className);
  img.alt = alt; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
  img.src = url;
  img.addEventListener('error', () => { img.hidden = true; el(root, 'span', 'brpg-solo-art-missing', 'Imagem indisponível'); });
  return img;
}
class ImagePicker extends FuzzySuggestModal {
  constructor(plugin, callback) { super(plugin.app); this.plugin = plugin; this.callback = callback; this.setPlaceholder('Buscar imagem no cofre…'); }
  getItems() { return imageFiles(this.plugin.app.vault); }
  getItemText(file) { return file.path; }
  onChooseItem(file) { this.callback(file.path); }
}
function imageField(root, plugin, label, value, update) {
  const line = el(root, 'div', 'brpg-solo-image-field');
  const field = input(line, label, value, update, { maxLength: 2000 });
  field.placeholder = 'Caminho da imagem ou URL';
  button(line, 'Escolher imagem no cofre', () => new ImagePicker(plugin, path => { field.value = path; update(path); }).open(),
    { icon: 'image', iconOnly: true });
  return field;
}
function cardFace(root, plugin, card, angle = 0) {
  const frame = el(root, 'div', 'brpg-solo-card-face');
  if (card.image || card.symbol) {
    const picture = el(frame, 'div', 'brpg-solo-card-picture');
    const artwork = card.image ? art(picture, plugin, card.image, card.title, card.source) :
      el(picture, 'span', 'brpg-solo-symbol' + (/[♥♦]/.test(card.symbol) || card.id === 'joker-red' ? ' is-red' : ''), card.symbol);
    if (artwork && angle) artwork.style.transform = 'rotate(' + angle + 'deg)';
  }
  const titleRow = el(frame, 'div', 'brpg-solo-card-title');
  el(titleRow, 'strong', '', card.title);
  const icons = plugin.solo().legacyIcons;
  if (card.element && icons?.elements && Object.hasOwn(icons.elements, key(card.element)))
    art(titleRow, plugin, icons.elements[key(card.element)], card.element, card.source, 'brpg-solo-card-icon');
  const meta = [card.type, card.element, card.level && 'Nível ' + card.level, angle === 180 ? 'Invertida' : angle ? 'Girou ' + angle + '°' : ''].filter(Boolean);
  if (meta.length) el(frame, 'div', 'brpg-solo-card-meta', meta.join(' · '));
  if (card.cost) {
    const cost = el(frame, 'div', 'brpg-solo-card-cost', 'Custo ');
    for (const piece of card.cost.split(',').map(x => x.trim()).filter(Boolean)) {
      const m = piece.match(/^(?:(\d+)\s+)?(.+)$/);
      const name = key(m[2]), count = +(m[1] || 1), icon = icons?.mana && Object.hasOwn(icons.mana, name) && icons.mana[name];
      if (icon && count > 0 && count <= 10) {
        for (let i = 0; i < count; i++) art(cost, plugin, icon, m[2], card.source, 'brpg-solo-card-icon');
      } else el(cost, 'span', '', piece);
    }
  }
  if (card.text) el(frame, 'p', 'brpg-solo-card-text', card.text);
  if (card.attack || card.defense) el(frame, 'div', 'brpg-solo-card-meta', 'ATQ ' + (card.attack || '0') + ' · DEF ' + (card.defense || '0'));
  return frame;
}
function formatCard(card, angle, mode) {
  const orientation = angle ? ' (' + (angle === 180 ? 'invertida' : angle + '°') + ')' : '';
  if (card.image && !/^https?:/i.test(card.image) && mode === 'md') return '![[' + card.image.replace(/[\]\n\r]/g, '') + ']]' + orientation;
  if (card.image && mode === 'path') return card.image;
  if (card.image && mode === 'md') return '![](<'+ card.image.replace(/[<>\n\r]/g, '') + '>)' + orientation;
  return card.title + orientation;
}
function formatResult(text, mode) {
  if (!mode || mode === 'plain') return text;
  if (mode.startsWith('inline')) {
    const [expression, faces] = text.split(' · ', 2);
    const parts = expression.match(/^(.+?)\s+=\s+(-?\d+)$/);
    if (parts && parseDice(parts[1]) && /^-?\d+(?:, -?\d+)*$/.test(faces || '')) {
      const prefix = mode === 'inline-small' ? 'sm' : mode === 'inline-large' ? 'lg' : '';
      const fence = String.fromCharCode(96);
      return fence + '!' + prefix + parts[1] + ' = ' + faces + ' (' + parts[2] + ')' + fence;
    }
    return text;
  }
  const p = { parentheses: ['(', ')'], square: ['[', ']'], curly: ['{', '}'] }[mode.replace('code-', '')];
  if (p) text = p[0] + text + p[1];
  return mode.startsWith('code') ? '`' + text.replaceAll('`', "'") + '`' : text;
}
class SoloModal extends Modal {
  constructor(plugin, title) { super(plugin.app); this.plugin = plugin; this.heading = title; }
  onOpen() {
    this.modalEl.classList.add('brpg-solo-modal');
    this.draw();
  }
  draw() {
    this.contentEl.replaceChildren();
    this.root = el(this.contentEl, 'div', 'brpg brpg-solo-editor');
    el(this.root, 'h2', 'brpg-heading', this.heading);
    this.body = el(this.root, 'div', 'brpg-solo-form');
    this.warning = el(this.root, 'div', 'brpg-solo-warning'); this.warning.setAttribute('role', 'status');
    this.actions = row(this.root);
    this.form();
  }
  async submit(operation) {
    if (this.busy) return;
    this.busy = true; this.warning.textContent = '';
    try { await operation(); this.close(); } catch (e) { errorText(this.warning, e); }
    finally { this.busy = false; }
  }
  footer(label, save) {
    button(this.actions, 'Cancelar', () => this.close());
    saveButton(this.actions, label, () => this.submit(save));
  }
}
class DieEditor extends SoloModal {
  constructor(view, die) {
    super(view.plugin, die ? 'Editar dado' : 'Novo dado');
    this.view = view; this.draft = die ? copy(die) : { id: uid('die'), name: '', faces: Array.from({ length: 6 }, (_, i) => numberFace(i + 1)) };
    this.page = 0;
  }
  form() {
    const d = this.draft, header = row(this.body), step = 12;
    input(header, 'Nome do dado', d.name, v => { d.name = v; }, { maxLength: 120 });
    let count = d.faces.length;
    inlineNumber(header, 'Número de faces', count, v => { count = v; }, 2, MAX_FACES);
    button(header, 'Aplicar quantidade', () => {
      if (!integer(count, 2, MAX_FACES)) return errorText(this.warning, 'Escolha de 2 a ' + MAX_FACES + ' faces.');
      if (count < d.faces.length && d.faces.slice(count).some((f, i) => f.kind !== 'number' || f.value !== count + i + 1)) {
        new Confirm(this.plugin.app, 'Descartar as faces personalizadas além do novo limite?', () => resize()).open();
      } else resize();
      function resize() {
        if (count < d.faces.length) d.faces.length = count;
        while (d.faces.length < count) d.faces.push(numberFace(d.faces.length + 1));
        editor.page = Math.min(editor.page, Math.floor((count - 1) / step)); editor.draw();
      }
    });
    const editor = this;
    const faces = group(this.body, 'Faces do dado', 'Faces com o mesmo número, símbolo ou imagem podem se repetir.');
    for (let i = this.page * step; i < Math.min(d.faces.length, (this.page + 1) * step); i++) {
      const f = d.faces[i], cell = el(faces, 'div', 'brpg-solo-edit-entry');
      el(cell, 'strong', '', 'Face ' + (i + 1));
      choose(cell, 'Tipo da face ' + (i + 1), [['number','Número'],['text','Texto ou símbolo'],['image','Imagem']], f.kind, kind => {
        d.faces[i] = kind === 'number' ? numberFace(i + 1) : { kind, label: '', ...(kind === 'image' && { image: '' }) };
        this.draw();
      });
      if (f.kind === 'number') {
        input(cell, 'Valor', f.value, v => { f.value = v; }, { type: 'number', step: 'any' });
      } else {
        input(cell, f.kind === 'image' ? 'Rótulo da imagem (opcional)' : 'Texto ou símbolo', f.label, v => { f.label = v; }, { maxLength: 120 });
        if (f.kind === 'image') imageField(cell, this.plugin, 'Imagem da face', f.image, v => { f.image = v; });
      }
    }
    if (d.faces.length > step) {
      const pages = row(faces);
      button(pages, 'Faces anteriores', () => { this.page--; this.draw(); }, { icon: 'chevron-left', disabled: !this.page });
      el(pages, 'span', 'brpg-hint', (this.page + 1) + ' / ' + Math.ceil(d.faces.length / step));
      button(pages, 'Próximas faces', () => { this.page++; this.draw(); }, { icon: 'chevron-right', disabled: (this.page + 1) * step >= d.faces.length });
    }
    this.footer('Salvar dado', async () => {
      if (count !== d.faces.length) throw new Error('Toque em Aplicar quantidade antes de salvar.');
      d.name = clean(d.name);
      for (const f of d.faces) if (f.kind === 'image') f.image = imageRef(f.image);
      validateDie(d);
      await this.plugin.changeSolo(s => {
        const i = s.dice.findIndex(x => x.id === d.id);
        if (i < 0) s.dice.push(copy(d)); else s.dice[i] = copy(d);
      });
      this.view.dieId = d.id; this.view.render();
    });
  }
}
class DeckEditor extends SoloModal {
  constructor(view, deck = null) {
    super(view.plugin, deck ? 'Editar baralho' : 'Novo baralho');
    this.view = view; this.section = 'main'; this.warnings = [];
    this.draft = deck ? copy(deck) : { id: uid('deck'), name: '', back: '', orientations: 1, cards: [] };
    this.active = this.draft.cards[0]?.id || '';
    this.initialCards = deck && JSON.stringify(deck.cards.map(c => [c.id, c.section]));
  }
  async applyImport(load) {
    if (this.importing) return;
    this.importing = true; this.warning.textContent = 'Carregando…';
    try { await load(); this.draw(); }
    catch (e) { errorText(this.warning, e); }
    finally { this.importing = false; }
  }
  addCards(cards) {
    const d = this.draft;
    if (d.cards.length + cards.length > MAX_CARDS) throw new Error('Limite de ' + MAX_CARDS + ' cartas por baralho.');
    if (cards.length && (!this.active || !d.cards.some(c => c.id === this.active))) { this.active = cards[0].id; this.section = cards[0].section; }
    d.cards.push(...cards);
  }
  form() {
    const d = this.draft, basics = group(this.body, 'Baralho');
    input(basics, 'Nome do baralho', d.name, v => { d.name = v; }, { maxLength: 120 });
    choose(basics, 'Rotação ao comprar', ROTATIONS, d.orientations, v => { d.orientations = +v; });
    imageField(basics, this.plugin, 'Imagem do verso (opcional)', d.back, v => { d.back = v; });
    const transfer = el(this.body, 'details', 'brpg-disclosure');
    transfer.open = !!this.showImport;
    transfer.addEventListener('toggle', () => { this.showImport = transfer.open; });
    el(transfer, 'summary', '', 'Importar cartas');
    const imports = group(transfer, '', 'Importe imagens, uma lista do Deck Builder ou adicione as cartas manualmente.');
    let path = this.folder || this.view.plugin.solo().settings.deckRoot;
    const folderInput = input(imports, 'Pasta de imagens no cofre', path, v => { this.folder = path = v; }, { maxLength: 300 });
    const options = deckFolders(this.plugin.app.vault, this.plugin.solo().settings.deckRoot);
    if (options.length) choose(imports, 'Pastas encontradas', [['','Selecionar'], ...options.map(x => [x,x])], '', v => {
      if (!v) return;
      this.folder = path = v; folderInput.value = v;
    });
    button(row(imports), 'Adicionar imagens da pasta', () => this.applyImport(async () => {
      const target = pathValue(path);
      if (!target) throw new Error('Informe o caminho da pasta dentro do cofre.');
      const loaded = await loadDeckFolder(this.plugin.app.vault, target);
      if (!loaded.cards.length) throw new Error('Nenhuma imagem ou URL foi encontrada nessa pasta.');
      this.addCards(loaded.cards.map(c => makeCard(c, uid('card'))));
      if (!d.name) d.name = loaded.name;
      if (loaded.orientations !== 1) d.orientations = loaded.orientations;
    }), { icon: 'folder' });
    const legacy = row(imports);
    button(legacy, 'Buscar notas do Deck Builder', () => this.applyImport(async () => {
      this.legacy = await loadLegacy(this.plugin.app, uid);
      if (!this.legacy.catalog.length) throw new Error('Nenhum bloco DeckCard encontrado nas notas do cofre.');
      this.legacyIconValues = await legacyIcons(this.plugin.app);
    }), { icon: 'database' });
    if (this.legacy) {
      const { catalog, lists } = this.legacy;
      let list = lists[0]?.id || '';
      info(imports, catalog.length + ' cartas e ' + lists.length + ' listas antigas encontradas.');
      if (lists.length) choose(imports, 'Lista FullDeck', lists.map(x => [x.id, x.name]), list, v => { list = v; });
      const from = row(imports);
      button(from, 'Importar lista', () => this.applyImport(() => {
        const item = lists.find(x => x.id === list);
        if (!item) throw new Error('Selecione uma lista.');
        const result = legacyDeck(item.source, catalog, () => uid('card'));
        this.warnings = result.missing;
        if (!result.cards.length) throw new Error('Nenhuma carta da lista foi encontrada.');
        this.addCards(result.cards);
        if (!d.name) d.name = item.name;
        this.useLegacyIcons = !!this.legacyIconValues;
      }), { icon: 'list', disabled: !lists.length });
      button(from, 'Adicionar catálogo inteiro', () => this.applyImport(() => {
        this.addCards(catalog.map(c => ({ ...c, id: uid('card') })));
        this.useLegacyIcons = !!this.legacyIconValues;
      }), { icon: 'copy' });
    }
    if (this.warnings.length) info(imports, 'Cartas não encontradas: ' + this.warnings.slice(0, 20).join(', ') + (this.warnings.length > 20 ? '…' : ''));
    const cards = group(this.body, 'Cartas · ' + d.cards.length);
    const navigation = row(cards);
    choose(navigation, 'Seção', Object.entries(sections), this.section, v => {
      this.section = v; this.active = d.cards.find(c => c.section === v)?.id || ''; this.draw();
    });
    button(navigation, 'Adicionar carta', () => {
      try {
        const blank = makeCard({ section: this.section }, uid('card'));
        this.addCards([blank]); this.active = blank.id; this.draw();
      } catch (e) { errorText(this.warning, e); }
    }, { icon: 'plus' });
    const visible = d.cards.filter(c => c.section === this.section);
    const card = visible.find(c => c.id === this.active);
    if (visible.length) {
      choose(cards, 'Carta para editar', visible.map((c, i) => [c.id, (i + 1) + ' · ' + (c.title || 'Sem nome')]), this.active, v => {
        this.active = v; this.draw();
      });
    }
    if (card) {
      const form = el(cards, 'div', 'brpg-solo-edit-entry');
      input(form, 'Nome da carta', card.title, v => { card.title = v; }, { maxLength: 120 });
      imageField(form, this.plugin, 'Imagem da carta', card.image, v => { card.image = v; });
      input(form, 'Descrição / regras', card.text, v => { card.text = v; }, { multiline: true, maxLength: 8000 });
      const more = el(form, 'details', 'brpg-disclosure');
      el(more, 'summary', '', 'Tipo, custo e atributos');
      for (const [property, name] of [['type','Tipo'], ['cost','Custo'], ['element','Elemento'], ['level','Nível'], ['attack','Ataque'], ['defense','Defesa']])
        input(more, name, card[property], v => { card[property] = v; }, { maxLength: 200 });
      choose(more, 'Mover para a seção', Object.entries(sections), card.section, v => {
        card.section = this.section = v; this.draw();
      });
      const manage = row(form);
      button(manage, 'Duplicar carta', () => {
        try {
          const duplicate = { ...card, id: uid('card') };
          this.addCards([duplicate]); this.active = duplicate.id; this.draw();
        } catch (e) { errorText(this.warning, e); }
      }, { icon: 'copy' });
      for (const [delta, name] of [[-1,'Mover para cima'],[1,'Mover para baixo']]) {
        const target = visible[visible.indexOf(card) + delta];
        button(manage, name, () => {
          const a = d.cards.indexOf(card), b = d.cards.indexOf(target);
          [d.cards[a], d.cards[b]] = [d.cards[b], d.cards[a]];
          this.draw();
        }, { icon: delta < 0 ? 'arrow-up' : 'arrow-down', iconOnly: true, disabled: !target });
      }
      button(manage, 'Remover carta', () => new Confirm(this.plugin.app, 'Remover esta carta do baralho?', () => {
        d.cards = d.cards.filter(c => c.id !== card.id);
        this.active = d.cards.find(c => c.section === this.section)?.id || ''; this.draw();
      }).open(), { icon: 'trash-2', iconOnly: true });
    }
    this.footer('Salvar baralho', async () => {
      if (this.importing) throw new Error('Aguarde a importação terminar.');
      if (d.back && !imageRef(d.back)) throw new Error('O verso precisa apontar para uma imagem válida.');
      const output = { ...d, name: clean(d.name), back: imageRef(d.back),
        cards: d.cards.map(c => {
          if (c.image && !imageRef(c.image)) throw new Error('Imagem inválida para “' + (c.title || 'carta sem nome') + '”.');
          const card = makeCard(c, c.id);
          if (card.image) card.image = resolvePath(this.plugin.app, card.image, card.source);
          return card;
        }) };
      validateDeck(output);
      await this.plugin.changeSolo(s => {
        const index = s.decks.findIndex(x => x.id === d.id);
        if (index < 0) s.decks.push(output); else s.decks[index] = output;
        if (this.initialCards !== JSON.stringify(output.cards.map(c => [c.id, c.section]))) delete s.piles[d.id];
        if (this.useLegacyIcons) s.legacyIcons = this.legacyIconValues;
      });
      this.view.deckId = d.id; this.view.section = this.section; this.view.render();
    });
  }
}
class SoloSettings extends SoloModal {
  constructor(view) { super(view.plugin, 'Configurar ferramentas solo'); this.view = view; this.draft = copy(view.plugin.solo().settings); }
  form() {
    const s = this.draft;
    choose(this.body, 'Aba inicial', TABS.map(([id, name]) => [id, name]), s.home, v => { s.home = v; });
    input(this.body, 'Pasta dos baralhos', s.deckRoot, v => { s.deckRoot = v; });
    input(this.body, 'Pasta das tabelas', s.tableRoot, v => { s.tableRoot = v; });
    input(this.body, 'Prefixo de modelos YAML', s.templatePrefix, v => { s.templatePrefix = v; });
    choose(this.body, 'Idioma dos resultados do oráculo', Object.entries(LANGUAGES).map(([id, words]) => [id, words[0]]), s.oracleLanguage, v => { s.oracleLanguage = v; });
    toggle(this.body, 'Destacar caixas de progresso preenchidas', s.highlightBoxes, v => { s.highlightBoxes = v; });
    toggle(this.body, 'Ocultar geradores de ideias nativos', s.hideIdeas, v => { s.hideIdeas = v; });
    toggle(this.body, 'Ativar imagens por URL nos dados e baralhos', s.remote, v => { s.remote = v; });
    toggle(this.body, 'Ativar dados, contadores e relógios nas notas', s.inline, v => { s.inline = v; });
    choose(this.body, 'Progresso sem prefixo', [['clock','Relógio'],['boxes','Caixas'],['limit','Contador com limite']], s.inlineTrack, v => { s.inlineTrack = v; });
    choose(this.body, 'Formato ao copiar dados', [['plain','Texto'],['parentheses','(Texto)'],['square','[Texto]'],['curly','{Texto}'],
      ['code','Código'],['code-parentheses','(Texto) em código'],['code-square','[Texto] em código'],['code-curly','{Texto} em código'],
      ['inline','Dado inline'],['inline-small','Dado inline pequeno'],['inline-large','Dado inline grande']], s.copyDice, v => { s.copyDice = v; });
    toggle(this.body, 'Limpar resultados de dados depois de copiar', s.clearDice, v => { s.clearDice = v; });
    choose(this.body, 'Formato ao copiar oráculo ou tabela', [['plain','Texto'],['code','Código']], s.copyText, v => { s.copyText = v; });
    choose(this.body, 'Formato ao copiar carta', [['md','Imagem do cofre (Markdown)'],['path','Caminho ou URL'],['plain','Nome da carta']], s.copyCard, v => { s.copyCard = v; });
    info(this.body, 'Imagens do cofre funcionam sem internet. Ative URLs apenas se quiser carregar imagens externas.');
    this.footer('Salvar preferências', async () => {
      if (!pathValue(s.deckRoot) || !pathValue(s.tableRoot)) throw new Error('Informe caminhos de pastas relativos ao cofre.');
      s.deckRoot = pathValue(s.deckRoot); s.tableRoot = pathValue(s.tableRoot); s.templatePrefix = clean(s.templatePrefix || 'template', 120);
      await this.plugin.changeSolo(state => { state.settings = copy(s); });
      this.view.tableLibrary = null; this.view.render();
    });
  }
}
class SoloView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf); this.plugin = plugin; this.tab = plugin.solo().settings.home; this.pool = 'primary';
    this.quant = 1; this.customQuant = 1; this.expr = '2d20/a'; this.dieId = ''; this.diceLog = [];
    this.deckId = 'standard'; this.section = 'main'; this.drawCount = 1; this.deckPage = 1; this.folder = null;
    this.oracleId = 'standard'; this.odds = 'mid'; this.question = ''; this.oracleStates = {}; this.oracleLog = [];
    this.tableText = '{noun} · {verb} · {noun}'; this.tableId = ''; this.tableChoice = ''; this.tableLog = []; this.ideas = {};
  }
  getViewType() { return SOLO_VIEW; }
  getDisplayText() { return 'Basic RPG · Kit solo'; }
  getIcon() { return 'dices'; }
  async onOpen() { this.render(); }
  async onClose() { this.closed = true; this.contentEl.replaceChildren(); }
  renderIfTab() { if (!this.closed) this.render(); }
  show(tab) { if (TABS.some(t => t[0] === tab)) this.tab = tab; this.render(); }
  render() {
    if (this.closed) return;
    const root = this.contentEl;
    root.classList.add('brpg', 'brpg-view', 'brpg-solo-view');
    root.replaceChildren();
    const topline = el(root, 'header', 'brpg-solo-header');
    const identity = el(topline, 'div');
    el(identity, 'div', 'brpg-eyebrow', 'BASIC RPG');
    el(identity, 'h2', 'brpg-heading', 'Kit solo');
    const actions = row(topline);
    button(actions, 'Abrir calendário', this.run(() => this.plugin.open(true)), { icon: 'calendar-days', iconOnly: true });
    button(actions, 'Configurar kit solo', () => new SoloSettings(this).open(), { icon: 'settings', iconOnly: true });
    const tabBar = el(root, 'nav', 'brpg-solo-tabs'); tabBar.setAttribute('aria-label', 'Ferramentas solo');
    for (const [id, name, icon] of TABS) {
      const b = button(tabBar, name, () => this.show(id), { icon });
      b.setAttribute('aria-pressed', String(this.tab === id));
    }
    const content = el(root, 'div', 'brpg-solo-content');
    if (this.tab === 'deck') this.renderDeck(content);
    else if (this.tab === 'oracle') this.renderOracle(content);
    else if (this.tab === 'tables') this.renderTables(content);
    else this.renderDice(content);
  }
  run(fn) { return () => this.plugin.attempt(fn); }
  activeEditor() {
    if (!MarkdownView) return null;
    const workspace = this.plugin.app.workspace;
    const active = workspace.getActiveViewOfType?.(MarkdownView)?.editor;
    if (active) return active;
    const editors = (workspace.getLeavesOfType('markdown') || []).map(leaf => leaf.view?.editor).filter(Boolean);
    return editors.length === 1 ? editors[0] : null;
  }
  outputButtons(root, text, afterCopy, image) {
    const actions = row(root), editor = this.activeEditor();
    button(actions, 'Copiar resultado', this.run(async () => {
      await navigator.clipboard.writeText(text);
      new Notice('Copiado.'); afterCopy?.();
    }), { icon: 'copy', iconOnly: true });
    button(actions, 'Inserir na nota', this.run(() => {
      const dest = editor || this.activeEditor();
      if (!dest) throw new Error('Abra o kit na barra lateral com uma nota selecionada ou copie o resultado.');
      dest.replaceSelection(text);
      new Notice('Inserido na nota.');
    }), { icon: 'file-pen-line', iconOnly: true });
    if (image && !/^https?:\/\//i.test(image) && /\.png$/i.test(image) && typeof ClipboardItem !== 'undefined') {
      button(actions, 'Copiar imagem PNG', this.run(async () => {
        const file = this.plugin.app.vault.getAbstractFileByPath(image);
        if (!file) throw new Error('Imagem não encontrada no cofre.');
        const bytes = await this.plugin.app.vault.readBinary(file);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
        new Notice('Imagem copiada.');
      }), { icon: 'image', iconOnly: true });
    }
  }
  palette(b, activation) {
    let timer, held = false, start;
    b.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      held = false; start = [e.clientX, e.clientY];
      timer = setTimeout(() => { held = true; activation(true); }, 520);
    });
    const cancel = () => { clearTimeout(timer); start = null; };
    b.addEventListener('pointermove', e => {
      if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 8) cancel();
    });
    for (const type of ['pointerup','pointercancel','pointerleave']) b.addEventListener(type, cancel);
    b.addEventListener('contextmenu', e => {
      e.preventDefault(); const touching = !!start || e.pointerType === 'touch'; cancel();
      if (!held) { held = touching; activation(true); }
    });
    b.addEventListener('click', e => {
      if (held) { held = false; return; }
      activation(!!e.shiftKey);
    });
  }
  addDice(item, alternative) {
    const pool = (alternative || this.pool === 'secondary') ? 'secondary' : 'primary';
    this.diceLog.unshift({ ...item, pool }); this.diceLog = this.diceLog.slice(0, 30);
    // Keep dice buttons mounted and focused for rapid rolls on keyboard and touch.
    if (this.diceSummary) this.renderDiceSummary(); else this.render();
  }
  numericDice(notation, alt = false) {
    return this.plugin.attempt(() => {
      const r = rollDice(notation);
      this.addDice({ label: notation, total: r.total, color: r.color, faces: r.values.map(numberFace) }, alt);
    });
  }
  renderDice(root) {
    const s = this.plugin.solo(), common = group(root, 'Rolagem rápida');
    const setup = row(common);
    inlineNumber(setup, 'Quantidade', this.quant, v => { this.quant = v; }, 1, 100);
    choose(setup, 'Grupo', [['primary','Principal'],['secondary','Alternativo']], this.pool, v => { this.pool = v; });
    const grid = el(common, 'div', 'brpg-solo-dice-grid');
    for (const n of DICE) {
      const b = button(grid, 'd' + n, () => {}, { icon: 'dice-5' });
      this.palette(b, alt => this.numericDice(String(this.quant) + 'd' + n, alt));
    }
    info(common, 'Shift, clique direito ou toque longo envia a rolagem para o grupo alternativo.');
    const expression = row(common);
    const notation = input(expression, 'Expressão', this.expr, v => { this.expr = v; }, { maxLength: 60 });
    notation.placeholder = '2d20+3/a';
    notation.addEventListener('keydown', e => { if (e.key === 'Enter') this.numericDice(this.expr, e.shiftKey); });
    button(expression, 'Rolar expressão', () => this.numericDice(this.expr), { icon: 'play' });
    const custom = group(root, 'Dados personalizados');
    const actions = row(custom);
    button(actions, 'Novo dado', () => new DieEditor(this).open(), { icon: 'plus', className: 'brpg-button mod-cta' });
    const selected = s.dice.find(x => x.id === this.dieId) || s.dice[0];
    if (selected) {
      this.dieId = selected.id;
      button(actions, 'Editar dado', () => new DieEditor(this, selected).open(), { icon: 'pencil' });
      button(actions, 'Excluir dado', () => new Confirm(this.plugin.app, 'Excluir “' + selected.name + '”?', () =>
        this.plugin.changeSolo(state => { state.dice = state.dice.filter(d => d.id !== selected.id); })).open(), { icon: 'trash-2', iconOnly: true });
      const fields = row(custom);
      choose(fields, 'Dado personalizado', s.dice.map(d => [d.id,d.name + ' · ' + d.faces.length + ' faces']), selected.id, v => { this.dieId = v; this.render(); });
      inlineNumber(fields, 'Quantidade de dados especiais', this.customQuant, v => { this.customQuant = v; }, 1, 100);
      button(fields, 'Rolar dado personalizado', this.run(() => {
        const result = dieRoll(selected, this.customQuant);
        this.addDice({ ...result, label: this.customQuant + ' × ' + selected.name });
      }), { icon: 'dice-6' });
    } else info(custom, 'Dê um nome ao dado e escolha o que vai em cada face. Misture números, símbolos e imagens.');
    this.diceSummary = el(root, 'div');
    this.renderDiceSummary();
  }
  renderDiceSummary() {
    this.diceSummary.replaceChildren();
    const result = group(this.diceSummary, 'Resultados');
    if (!this.diceLog.length) { info(result, 'As rolagens desta sessão aparecem aqui.'); return; }
    const sums = row(result);
    for (const [pool, name] of [['primary','Principal'],['secondary','Alternativo']]) {
      const values = this.diceLog.filter(x => x.pool === pool && x.total !== null).map(x => x.total);
      if (values.length) el(sums, 'span', 'brpg-chip is-' + pool, name + ' · ' + values.reduce((a,b) => a + b, 0).toLocaleString('pt-BR'));
    }
    button(sums, 'Limpar rolagens', () => { this.diceLog = []; this.renderDiceSummary(); }, { icon: 'trash-2', iconOnly: true });
    const log = el(result, 'div', 'brpg-solo-log'); log.setAttribute('aria-live', 'polite');
    this.diceLog.forEach(entry => {
      const item = el(log, 'article', 'brpg-solo-result is-' + entry.pool);
      const title = row(item);
      el(title, 'strong', '', entry.label + (entry.total !== null ? ' = ' + entry.total.toLocaleString('pt-BR') : ''));
      const faceLabel = f => f.kind === 'number' ? String(f.value) : (f.label || (f.image && f.image.split('/').at(-1)) || 'Imagem');
      this.outputButtons(title, formatResult(entry.label + (entry.total !== null ? ' = ' + entry.total : '') + ' · ' + entry.faces.map(faceLabel).join(', '),
        this.plugin.solo().settings.copyDice), () => { if (this.plugin.solo().settings.clearDice) { this.diceLog = []; this.renderDiceSummary(); } });
      const faces = el(item, 'div', 'brpg-solo-faces');
      for (const face of entry.faces) {
        const node = el(faces, 'span', 'brpg-chip');
        if (entry.color) node.style.color = entry.color;
        if (face.kind === 'image') art(node, this.plugin, face.image, faceLabel(face), '', 'brpg-solo-die-face');
        if (face.kind !== 'image' || face.label) el(node, 'span', '', faceLabel(face));
      }
    });
  }
  async loadFolder(id) {
    this.folder = null;
    const path = id.slice(7), d = await loadDeckFolder(this.plugin.app.vault, path);
    if (this.deckId !== id || this.closed) return;
    d.id = id;
    d.cards = d.cards.map(c => makeCard(c, c.image));
    this.folder = d;
    this.renderIfTab();
  }
  renderDeck(root) {
    const s = this.plugin.solo();
    const box = group(root, 'Biblioteca de baralhos');
    const folders = deckFolders(this.plugin.app.vault, s.settings.deckRoot);
    const choices = [['standard','Baralho padrão'], ['tarot','Tarô · Arcanos Maiores'], ...s.decks.map(x => [x.id,x.name]),
      ...folders.map(path => ['folder:' + path, 'Pasta · ' + path.slice(s.settings.deckRoot.length + 1)])];
    if (!choices.some(([id]) => id === this.deckId)) this.deckId = 'standard';
    const id = this.deckId;
    const custom = s.decks.find(d => d.id === id);
    const folder = id.startsWith('folder:');
    const deck = custom || (folder ? this.folder?.id === id && this.folder : builtinDeck(id, s.settings));
    choose(box, 'Baralho ativo', choices, id, v => {
      this.deckId = v; this.section = 'main'; this.deckPage = 1; this.gallery = false;
      this.render();
      if (v.startsWith('folder:')) this.plugin.attempt(() => this.loadFolder(v));
    });
    const actions = row(box);
    button(actions, 'Novo baralho', () => new DeckEditor(this).open(), { icon: 'plus', className: 'brpg-button mod-cta' });
    if (custom) {
      button(actions, 'Editar baralho', () => new DeckEditor(this, deck).open(), { icon: 'pencil' });
      button(actions, 'Exportar baralho JSON', this.run(async () => {
        const filename = await this.plugin.writeExport(deck, 'basic-rpg-baralho', 'json', JSON.stringify({ format: 'basic-rpg-deck', version: 1, deck }, null, 2));
        new Notice('Baralho salvo em ' + filename);
      }), { icon: 'download', iconOnly: true });
      button(actions, 'Excluir baralho', () => new Confirm(this.plugin.app, 'Excluir “' + deck.name + '”?', () =>
        this.plugin.changeSolo(next => { next.decks = next.decks.filter(d => d.id !== id); delete next.piles[id]; })).open(), { icon: 'trash-2', iconOnly: true });
    }
    const file = el(actions, 'input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
    button(actions, 'Importar baralho JSON', () => file.click(), { icon: 'upload', iconOnly: true });
    file.addEventListener('change', () => this.plugin.attempt(async () => {
      const item = file.files?.[0]; file.value = '';
      if (!item) return;
      if (item.size > 5_000_000) throw new Error('O arquivo precisa ter até 5 MB.');
      const data = JSON.parse(await item.text());
      if (data?.format !== 'basic-rpg-deck' || data.version !== 1 || !Array.isArray(data.deck?.cards) || data.deck.cards.length > MAX_CARDS)
        throw new Error('Formato de baralho Basic RPG não reconhecido.');
      const d = { id: uid('deck'), name: clean(data.deck.name), orientations: data.deck.orientations, back: imageRef(data.deck.back),
        cards: data.deck.cards.map(c => makeCard(c || {}, uid('card'))) };
      validateDeck(d);
      await this.plugin.changeSolo(v => { v.decks.push(d); });
      this.deckId = d.id; this.section = d.cards[0].section; this.render();
    }));
    if (id === 'standard') toggle(box, 'Incluir dois coringas', s.settings.jokers, v => this.plugin.attempt(() => this.plugin.changeSolo(next => {
      next.settings.jokers = v; delete next.piles[id];
    })));
    if (id === 'tarot') toggle(box, 'Permitir tarô invertido', s.settings.tarotFlip,
      v => this.plugin.attempt(() => this.plugin.changeSolo(next => { next.settings.tarotFlip = v; })));
    if (!deck) { info(root, 'Carregando o conteúdo da pasta…'); return; }
    if (!deck.cards.length) { info(root, 'Pasta sem imagens ou links.'); return; }
    const sectionsUsed = Object.entries(sections).filter(([sc]) => deck.cards.some(c => c.section === sc));
    if (!sectionsUsed.some(([sc]) => sc === this.section)) this.section = sectionsUsed[0][0];
    const section = this.section, cards = deck.cards.filter(x => x.section === section);
    const existing = s.piles[id]?.[section];
    const pile = validPile(existing, deck, section) ? existing : null;
    const table = group(root, deck.name);
    if (sectionsUsed.length > 1) choose(table, 'Seção do baralho', sectionsUsed, section, v => {
      this.section = v; this.deckPage = 1; this.render();
    });
    const change = fn => this.plugin.changeSolo(next => {
      const stack = next.piles[id]?.[section];
      next.piles[id] ||= {};
      next.piles[id][section] = fn(validPile(stack, deck, section) ? stack : null);
    });
    const stack = el(table, 'div', 'brpg-solo-stack');
    const back = button(stack, 'Comprar carta', this.run(() => {
      if (!integer(this.drawCount, 1, 30)) throw new Error('Escolha de 1 a 30 cartas.');
      this.deckPage = 1;
      return change(old => draw(old, deck, section, this.drawCount));
    }), { icon: 'layers', disabled: pile?.remaining.length === 0, className: 'brpg-button mod-cta brpg-solo-back' });
    if (deck.back) art(back, this.plugin, deck.back, 'Verso de ' + deck.name, '');
    const controls = el(stack, 'div', 'brpg-solo-stack-controls');
    const badges = row(controls);
    el(badges, 'span', 'brpg-chip', (pile?.remaining.length ?? cards.length) + ' no monte');
    el(badges, 'span', 'brpg-chip', (pile?.drawn.length || 0) + ' compradas');
    inlineNumber(controls, 'Cartas por compra', this.drawCount, v => { this.drawCount = v; }, 1, 30);
    const buttons = row(controls);
    button(buttons, 'Reembaralhar seção', () => {
      if (pile?.drawn.length) new Confirm(this.plugin.app, 'Devolver todas as cartas compradas desta seção e embaralhar?', () =>
        change(() => freshPile(deck, section))).open();
      else this.plugin.attempt(() => change(() => freshPile(deck, section)));
    }, { icon: 'shuffle' });
    button(buttons, this.gallery ? 'Mostrar compradas' : 'Ver catálogo', () => {
      this.gallery = !this.gallery; this.deckPage = 1; this.render();
    }, { icon: 'layout-grid' });
    if (folder) button(buttons, 'Atualizar pasta', this.run(() => this.loadFolder(id)), { icon: 'refresh-cw', iconOnly: true });
    const catalog = group(root, this.gallery ? 'Catálogo' : 'Cartas compradas');
    const index = new Map(cards.map(c => [c.id,c]));
    const entries = this.gallery ? cards.map(c => ({ id: c.id, angle: 0 })) : pile?.drawn || [];
    if (!entries.length) info(catalog, 'Compre uma carta para revelar o que saiu.');
    const gallery = el(catalog, 'div', 'brpg-solo-card-grid');
    for (const { id: cardId, angle } of entries.slice(0, 12 * this.deckPage)) {
      const card = index.get(cardId);
      const item = el(gallery, 'article', 'brpg-solo-card');
      cardFace(item, this.plugin, card, angle);
      this.outputButtons(item, formatCard(card, angle, s.settings.copyCard), null, card.image);
      if (!this.gallery) {
        if (deck.orientations !== 1) button(item, 'Girar carta', this.run(() => change(old => {
          if (!old) return freshPile(deck, section);
          const rotation = deck.orientations === 2 ? 180 : 90;
          return { ...old, drawn: old.drawn.map(c => c.id === cardId ? { ...c, angle: (c.angle + rotation) % 360 } : c) };
        })), { icon: 'rotate-cw', iconOnly: true });
        button(item, 'Devolver ao monte', this.run(() => change(old => returnCard(old, cardId))), { icon: 'undo-2', iconOnly: true });
        item.addEventListener('contextmenu', e => { e.preventDefault(); this.plugin.attempt(() => change(old => returnCard(old, cardId))); });
      }
    }
    if (entries.length > 12 * this.deckPage) button(catalog, 'Mostrar mais cartas', () => { this.deckPage++; this.render(); });
  }
  renderOracle(root) {
    const settings = this.plugin.solo().settings, box = group(root, 'Pergunte ao oráculo', 'Faça uma pergunta que possa ser respondida com sim ou não.');
    choose(box, 'Sistema', BODIES, this.oracleId, v => {
      this.oracleId = v; this.odds = v === 'mythic' ? '4' : v === 'standard2' ? '0' : 'mid'; this.render();
    });
    const controls = row(box);
    const choices = this.oracleId === 'mythic' ? ODDS.map((label, i) => [i, label]) : this.oracleId === 'standard2' ?
      [-2,-1,0,1,2].map(n => [n, String(n > 0 ? '+' + n : n)]) : [['low','Improvável'], ['mid','50/50'], ['high','Provável']];
    choose(controls, this.oracleId === 'standard2' ? 'Modificador' : 'Chance de sim', choices, this.odds, v => { this.odds = v; });
    if (this.oracleId === 'mythic') choose(controls, 'Fator de caos', Array.from({ length: 9 }, (_, i) => [i + 1, String(i + 1)]), settings.chaos, v =>
      this.plugin.attempt(() => this.plugin.changeSolo(s => { s.settings.chaos = +v; })));
    if (this.oracleId === 'standard') toggle(box, 'Compensar sequência de respostas negativas', settings.bias, v =>
      this.plugin.attempt(() => this.plugin.changeSolo(s => { s.settings.bias = v; })));
    if (this.oracleId === 'standard' || this.oracleId === 'standard2') toggle(box, 'Detalhar eventos aleatórios', settings.events, v =>
      this.plugin.attempt(() => this.plugin.changeSolo(s => { s.settings.events = v; })));
    const question = input(box, 'Pergunta (opcional)', this.question, v => { this.question = v; }, { maxLength: 500 });
    const ask = () => {
      const id = this.oracleId, result = oracle(id, this.odds, settings, this.oracleStates[id]);
      this.oracleStates[id] = result.state;
      this.oracleLog.unshift({ ...result, question: clean(this.question, 500), system: BODIES.find(([name]) => name === id)[1] });
      this.oracleLog = this.oracleLog.slice(0, 25);
      this.renderOracleLog();
    };
    question.addEventListener('keydown', e => { if (e.key === 'Enter') ask(); });
    button(row(box), 'Consultar oráculo', ask, { icon: 'sparkles', className: 'brpg-button mod-cta' });
    this.oracleResults = el(root, 'div');
    this.renderOracleLog();
  }
  renderOracleLog() {
    this.oracleResults.replaceChildren();
    if (this.oracleLog.length) this.log(this.oracleResults, 'Respostas', this.oracleLog.map(r => {
      const title = r.answer + (r.event ? ' · ' + r.eventLabel : '');
      return { title, detail: [r.question, r.system + ' · ' + r.values.join(', '), r.detail].filter(Boolean).join('\n'),
        text: [r.question, title, r.detail].filter(Boolean).join(' — ') };
    }), () => { this.oracleLog = []; this.renderOracleLog(); });
  }
  log(root, title, values, clear) {
    const box = group(root, title), log = el(box, 'div', 'brpg-solo-log');
    log.setAttribute('aria-live', 'polite');
    if (clear) button(box, 'Limpar histórico', clear, { icon: 'trash-2', iconOnly: true });
    for (const { title, detail, text } of values) {
      const entry = el(log, 'article', 'brpg-solo-result');
      const head = row(entry); el(head, 'strong', '', title);
      this.outputButtons(head, formatResult(text || title, this.plugin.solo().settings.copyText));
      if (detail) el(entry, 'p', 'brpg-solo-multiline', detail);
    }
  }
  renderIdeas(root) {
    root.replaceChildren();
    const id = this.activeIdea, entry = IDEAS[id];
    if (!entry || !this.ideas[id]) return;
    const [title, fields] = entry, selected = this.ideas[id], panel = el(root, 'div', 'brpg-solo-edit-entry');
    const controls = row(panel);
    el(controls, 'strong', '', title);
    const full = fields.map(([label], i) => label + ' · ' + selected[i]).join('\n');
    this.outputButtons(controls, formatResult(full, this.plugin.solo().settings.copyText));
    fields.forEach(([label, dictionary], i) => {
      const line = row(panel);
      el(line, 'span', 'brpg-chip', label);
      el(line, 'span', '', selected[i]);
      button(line, 'Sortear novamente · ' + label, () => {
        selected[i] = pick(DICT[dictionary]); this.renderIdeas(root);
      }, { icon: 'refresh-cw', iconOnly: true });
    });
  }
  async refreshTables() {
    const { tableRoot, templatePrefix } = this.plugin.solo().settings;
    this.tableLibrary = await tableNotes(this.plugin.app, tableRoot, templatePrefix);
  }
  tableResult(title, detail, text) {
    if (!detail) throw new Error('A tabela não tem resultados para esta seleção.');
    this.tableLog.unshift({ title, detail, text: text || detail });
    this.tableLog = this.tableLog.slice(0, 25);
    this.renderTableLog();
  }
  renderTableLog() {
    if (this.tab !== 'tables' || this.closed) return;
    this.tableResults.replaceChildren();
    if (this.tableLog.length) this.log(this.tableResults, 'Resultados', this.tableLog, () => { this.tableLog = []; this.renderTableLog(); });
  }
  renderTables(root) {
    const settings = this.plugin.solo().settings, box = group(root, 'Geradores e tabelas');
    if (!settings.hideIdeas) {
      const generators = row(box);
      for (const [id, [title, fields]] of Object.entries(IDEAS)) {
        button(generators, title, () => {
          this.activeIdea = id; this.ideas[id] = fields.map(([, dictionary]) => pick(DICT[dictionary])); this.renderIdeas(ideaOutput);
        }, { icon: 'sparkles' });
      }
      const ideaOutput = el(box, 'div');
      this.renderIdeas(ideaOutput);
    }
    const table = group(root, 'Tabelas do cofre', 'Pasta ' + settings.tableRoot + ' · Uma entrada por linha. Aceita pesos, seções e modelos YAML.');
    const actions = row(table);
    const update = this.run(async () => { await this.refreshTables(); this.renderIfTab(); });
    button(actions, 'Atualizar tabelas', update, { icon: 'refresh-cw' });
    button(actions, 'Criar nota de tabela', this.run(async () => {
      const vault = this.plugin.app.vault;
      const parts = settings.tableRoot.split('/');
      for (let i = 1; i <= parts.length; i++) {
        const directory = parts.slice(0, i).join('/');
        const existing = vault.getAbstractFileByPath(directory);
        if (!existing) await vault.createFolder(directory);
        else if (!Array.isArray(existing.children)) throw new Error('Já existe um arquivo no caminho ' + directory);
      }
      const base = settings.tableRoot + '/Encontros';
      let name = base + '.md';
      for (let n = 2; vault.getAbstractFileByPath(name); n++) name = base + ' ' + n + '.md';
      await vault.create(name, '---\nGancho: "{viajantes} pede ajuda para {objetivos}."\n---\n\n## Viajantes\nUma cartógrafa ^3\nUm mensageiro\n\n## Objetivos\natravessar a serra\nencontrar uma relíquia\n');
      await this.refreshTables(); this.tableId = name; this.tableChoice = ''; this.renderIfTab();
      await this.plugin.openNote(name);
    }), { icon: 'file-plus' });
    if (!this.tableLibrary) {
      info(table, 'Carregando as tabelas…');
      if (!this.loadingTables) {
        this.loadingTables = true;
        this.refreshTables().then(() => this.renderIfTab(), error => {
          if (table.isConnected !== false) info(table, error?.message || String(error));
        }).finally(() => { this.loadingTables = false; });
      }
    }
    const notes = [...(this.tableLibrary?.entries.values() || [])].filter(t => t.listed && !t.hidden).sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));
    const selected = notes.find(t => t.path === this.tableId) || notes[0];
    if (selected) {
      if (this.tableId !== selected.path) { this.tableId = selected.path; this.tableChoice = ''; }
      choose(table, 'Nota de tabela', notes.map(t => [t.path, t.path.slice(settings.tableRoot.length + 1, -3)]), selected.path, v => {
        this.tableId = v; this.tableChoice = ''; this.render();
      });
      const options = [['','Automático'], ...selected.templates.map((t,i) => ['t:' + i, 'Modelo · ' + t.label]),
        ...selected.sections.flatMap((s,i) => s.rows.length && s.label ? [['s:' + i, 'Seção · ' + s.label]] : [])];
      if (!selected.cutup && options.length > 1) choose(table, 'Modelo ou seção', options, this.tableChoice, v => { this.tableChoice = v; });
      if (selected.cutup) info(table, 'Modo recorte · sorteia um trecho do texto.');
      const controls = row(table);
      button(controls, 'Sortear da tabela', this.run(async () => {
        const all = await this.tableLibrary.forInput();
        this.tableResult(selected.label, tableEngine(all, settings.tableRoot).output(selected, this.tableChoice));
      }), { icon: 'dice-5', className: 'brpg-button mod-cta' });
      button(controls, 'Editar nota da tabela', this.run(() => this.plugin.openNote(selected.path)), { icon: 'file-pen-line', iconOnly: true });
    } else if (this.tableLibrary) info(table, 'Nenhuma tabela encontrada. Crie uma nota ou escolha outra pasta nas configurações.');
    const quick = group(root, 'Modelo rápido', 'Use um dicionário, como {noun}, ou o nome de uma nota / seção, como {Encontros/Viajantes}.');
    input(quick, 'Modelo', this.tableText, v => { this.tableText = v; }, { multiline: true, rows: 3, maxLength: 16000 });
    button(row(quick), 'Gerar texto', this.run(async () => {
      if (!this.tableLibrary) await this.refreshTables();
      const entries = await this.tableLibrary.forInput(this.tableText);
      this.tableResult('Modelo rápido', tableEngine(entries, settings.tableRoot).quick(this.tableText));
    }), { icon: 'shuffle' });
    this.tableResults = el(root, 'div');
    this.renderTableLog();
  }
}
async function openSolo(plugin, tab, main = false) {
  const workspace = plugin.app.workspace, others = workspace.getLeavesOfType(SOLO_VIEW);
  let leaf = main ? others.find(l => l === plugin.mainSoloLeaf || (workspace.rootSplit && l.getRoot?.() === workspace.rootSplit)) : others[0];
  if (!leaf) {
    leaf = (main ? workspace.getLeaf('tab') : workspace.getRightLeaf(false)) || workspace.getLeaf('tab');
    await leaf.setViewState({ type: SOLO_VIEW, active: true });
  }
  if (main) plugin.mainSoloLeaf = leaf;
  await workspace.revealLeaf(leaf);
  if (tab) leaf.view.show(tab);
  return leaf.view;
}
module.exports = { SOLO_VIEW, TABS, SoloView, openSolo, cardFace, art, formatResult };
