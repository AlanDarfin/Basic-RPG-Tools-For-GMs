'use strict';
const { parseYaml, TFile } = require('obsidian');
const { IMAGE_EXT, folderDeck, legacyCard, legacyDeck, parseBlocks, imageRef, key, clean } = require('./solo');
const { parseTable } = require('./solo-tables');

function resolvePath(app, value, source = '') {
  const path = imageRef(value);
  if (!path || /^https?:\/\//i.test(path)) return path;
  const asset = app.vault.getAbstractFileByPath(path) || app.metadataCache?.getFirstLinkpathDest?.(path, source);
  return asset instanceof TFile && IMAGE_EXT.test(asset.path) ? asset.path : path;
}
function imageUrl(app, value, source, remote) {
  const path = resolvePath(app, value, source);
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return remote ? path : '';
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? app.vault.getResourcePath(file) : '';
}
function filesIn(vault, root) {
  return (vault.getFiles?.() || vault.getMarkdownFiles()).filter(f => f.path.startsWith(root + '/'));
}
function imageFiles(vault) { return (vault.getFiles?.() || []).filter(f => IMAGE_EXT.test(f.path)); }
async function loadDeckFolder(vault, path) {
  const files = filesIn(vault, path).filter(f => !f.path.slice(path.length + 1).includes('/'));
  return folderDeck(path.split('/').at(-1), files.filter(f => IMAGE_EXT.test(f.path)).map(f => f.path),
    await Promise.all(files.filter(f => /\.md$/i.test(f.path)).map(f => vault.cachedRead(f))));
}
function deckFolders(vault, root) {
  const found = new Set();
  for (const f of filesIn(vault, root)) if (/\.md$/i.test(f.path) || IMAGE_EXT.test(f.path)) {
    const last = f.path.lastIndexOf('/');
    if (last > root.length) found.add(f.path.slice(0, last));
  }
  return [...found].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
async function loadLegacy(app, uid) {
  const catalog = [], lists = [];
  for (const f of app.vault.getMarkdownFiles()) {
    const found = parseBlocks(await app.vault.cachedRead(f));
    found.cards.forEach(source => {
      const c = legacyCard(source, f.path, uid('card'));
      if (c.title) { if (c.image) c.image = resolvePath(app, c.image, f.path); catalog.push(c); }
    });
    found.lists.forEach((source, i) => lists.push({ id: f.path + '#' + i, name: f.basename + (found.lists.length > 1 ? ' · ' + (i + 1) : ''), source }));
  }
  return { catalog, lists };
}
async function tableNotes(app, root, templatePrefix) {
  const entries = new Map(), vault = app.vault, all = vault.getMarkdownFiles(), tableFiles = all.filter(f => f.path.startsWith(root + '/'));
  async function read(file) {
    if (entries.has(file.path)) return entries.get(file.path);
    const entry = parseTable(file.path, await vault.cachedRead(file), parseYaml);
    if (templatePrefix && templatePrefix !== 'template') {
      const specific = entry.templates.filter(t => key(t.label).startsWith(key(templatePrefix)));
      if (specific.length) entry.templates = specific;
    }
    entry.listed = file.path.startsWith(root + '/');
    entry.hidden = file.path.slice(root.length + 1).split('/').slice(0, -1).some(name => /[._]$/.test(name));
    entries.set(file.path, entry);
    return entry;
  }
  for (const f of tableFiles) await read(f);
  return { entries, async forInput(text = '') {
    const paths = [text, ...[...entries.values()].map(t => t.body + '\n' + t.templates.map(x => x.text).join('\n'))];
    for (let i = 0; i < paths.length && i < 4000; i++) {
      for (const m of paths[i].matchAll(/\{\s*([^{}]{1,200})\s*\}/g)) for (const token of m[1].split('|')) {
        const absolute = clean(token.replace(/^\s*</, ''), 300);
        if (!absolute.startsWith('/')) continue;
        const target = key(absolute.slice(1).replace(/\.md$/i, ''));
        for (const f of all) {
          const p = key(f.path.replace(/\.md$/i, ''));
          const match = p === target || p === target.slice(0, target.lastIndexOf('/')) ||
            (/\/[*!]$/.test(target) && p.startsWith(target.slice(0, -1)));
          if (match && !entries.has(f.path)) {
            const entry = await read(f);
            paths.push(entry.body + '\n' + entry.templates.map(x => x.text).join('\n'));
          }
        }
      }
    }
    return [...entries.values()];
  } };
}
function renameImages(s, oldPath, newPath) {
  const move = (path) => path === oldPath || path?.startsWith(oldPath + '/') ? newPath + path.slice(oldPath.length) : path;
  let edited = false;
  function update(obj, k) { const next = move(obj[k]); if (next !== obj[k]) { obj[k] = next; edited = true; } }
  s.dice.forEach(d => d.faces.forEach(f => update(f, 'image')));
  s.decks.forEach(d => { update(d, 'back'); d.cards.forEach(c => { update(c, 'image'); update(c, 'source'); }); });
  for (const k of ['tableRoot', 'deckRoot']) update(s.settings, k);
  return edited;
}
function legacyIcons(app) {
  const folder = app.vault.configDir;
  if (!folder || !app.vault.adapter?.read) return Promise.resolve(null);
  const path = folder + '/plugins/obsidian-deckbuilder/data.json';
  return app.vault.adapter.read(path).then(raw => {
    const settings = JSON.parse(raw);
    const normalize = (array) => Object.fromEntries((Array.isArray(array) ? array : []).slice(0, 150)
      .map(item => [key(item?.name), imageRef(item?.imagePath)]).filter(([name, image]) => name && image));
    return { mana: normalize(settings.manaTypes), elements: normalize(settings.elementTypes) };
  }).catch(() => null);
}
module.exports = { resolvePath, imageUrl, imageFiles, deckFolders, loadDeckFolder, loadLegacy, tableNotes, renameImages, legacyIcons, legacyDeck };
