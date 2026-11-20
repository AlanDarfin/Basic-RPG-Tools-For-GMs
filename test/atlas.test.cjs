'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {blankMesa,newCampaign,newEntry,newSheet,newEncounter,checkMesa}=require('../src/mesa');
const {
 TERRAIN,blankAtlas,newMap,place,unpack,inMap,getCell,setCell,around,
 terrainSeed,dungeonSeed,distance,routeCost,checkAtlas,
 nodeRef,noteLink,noteRelations,relationGraph,subgraph
}=require('../src/atlas');
function setup(){
 const m=blankMesa(),campaign={...newCampaign(),name:'Arkanis'};
 m.campaigns.push(campaign);
 m.atlas=blankAtlas();
 const entry={...newEntry(campaign.id),kind:'site',name:'Solaris',note:'Mundo/Solaris.md'};
 const npc={...newSheet(campaign.id),name:'Vera',kind:'npc',note:'NPCs/Vera.md'};
 const encounter={...newEncounter(campaign.id),name:'Defesa do forte',roster:[{sheet:npc.id,name:'',side:'enemies',count:'1',initiative:''}]};
 m.entries.push(entry);m.sheets.push(npc);m.encounters.push(encounter);
 const map={...newMap(campaign.id,'hex'),name:'Vale Lunar'};
 m.atlas.maps.push(map);
 return {m,campaign,entry,npc,encounter,map};
}
test('mapa hexagonal aceita terrenos, marcas, notas, fichas, encontros e facções',()=>{
 const {m,map,entry,npc,encounter}=setup();
 setCell(map,3,4,{terrain:'forest',label:'Solaris',entry:entry.id,sheet:npc.id,encounter:encounter.id,
 note:'Mundo/Célula.md',region:'Nortus',faction:'Ordem',secret:'Segredo da trama',fog:true});
 assert.equal(getCell(map,3,4).terrain,'forest');
 assert.equal(checkMesa(m),m);
 assert.equal(m.atlas.maps[0].cells['3,4'].entry,entry.id);
});
test('grades quadradas e hexagonais têm distâncias distintas',()=>{
 const map=newMap('','hex');
 assert.equal(distance(map,'0,0','0,1'),1);
 assert.equal(distance(map,'1,0','1,1'),1);
 assert.equal(distance(map,'0,0','3,0'),3);
 map.grid='square';
 assert.equal(distance(map,'0,0','3,2'),5);
 assert.equal(unpack('7,9').row,9);
 assert.equal(unpack('7,no'),null);
});
test('pincel com raio limita-se às células válidas do mapa',()=>{
 const map={...newMap('','hex'),width:6,height:5};
 const area=around(map,0,0,3);
 assert.ok(area.length>1);assert.ok(area.length<25);
 assert.ok(area.every(c=>inMap(map,c.col,c.row)&&distance(map,{col:0,row:0},c)<=3));
 const rect={...map,grid:'square'};
 assert.equal(around(rect,3,2,1).length,9);
});
test('gera terreno determinístico sem sobrescrever dados de campanha',()=>{
 const {m,map,entry}=setup();
 const a=terrainSeed(map,311),b=terrainSeed(map,311),c=terrainSeed(map,312);
 assert.deepEqual(a,b);assert.notDeepEqual(a,c);
 setCell(map,2,3,{entry:entry.id});
 for(const [at,cell]of Object.entries(a)){const pos=unpack(at);setCell(map,pos.col,pos.row,{terrain:cell.terrain});}
 assert.equal(getCell(map,2,3).entry,entry.id);
 assert.equal(checkAtlas(m.atlas,m),m.atlas);
});
test('masmorra quadriculada cria salas e corredores sem sair dos limites',()=>{
 const map={...newMap('','square'),width:16,height:14};
 const cells=dungeonSeed(map,100);
 assert.ok(Object.values(cells).some(c=>c.terrain==='floor'));
 assert.deepEqual(cells,dungeonSeed(map,100));
 for(const at of Object.keys(cells)){const p=unpack(at);assert.ok(inMap(map,p.col,p.row));}
 assert.throws(()=>dungeonSeed(newMap('','hex'),1),/quadrados/);
});
test('rotas somam passos e custo do terreno de destino',()=>{
 const map=newMap('','hex');
 setCell(map,1,0,{terrain:'forest'});
 const path=['0,0','1,0','2,0'];
 assert.equal(routeCost(map,path),2.5);
 assert.equal(routeCost(map,['0,0']),0);
 assert.throws(()=>routeCost(map,['0,0','99,99']),/coordenadas/);
});
test('mapas em cascata e tokens usam IDs existentes na Mesa',()=>{
 const {m,map,npc}=setup();
 const sub={...newMap(map.campaign,'square'),name:'Torre',parent:map.id,parentCell:'4,3'};
 setCell(map,4,3,{submap:sub.id});
 map.tokens.push({id:'token1',name:'Vera',sheet:npc.id,at:'4,3'});
 m.atlas.maps.push(sub);
 assert.equal(checkAtlas(m.atlas,m),m.atlas);
});
test('mapa rejeita referência inexistente a ficha e encontro',()=>{
 const {m,map}=setup();
 setCell(map,1,1,{sheet:'deleted'});
 assert.throws(()=>checkMesa(m),/Ficha da célula/);
 setCell(map,1,1,{sheet:'',encounter:'deleted'});
 assert.throws(()=>checkAtlas(m.atlas,m),/Encontro da célula/);
});
test('referências de outra campanha são bloqueadas',()=>{
 const {m,map}=setup(),c={...newCampaign(),name:'Outra'};
 m.campaigns.push(c);
 const foreign={...newEntry(c.id),name:'Remoto'};m.entries.push(foreign);
 setCell(map,1,1,{entry:foreign.id});
 assert.throws(()=>checkAtlas(m.atlas,m),/outra campanha/);
});
test('mapas rejeitam coordenadas fora, estruturas grandes e ciclos diretos',()=>{
 const {m,map}=setup();
 assert.throws(()=>setCell(map,100,0,{terrain:'forest'}),/fora/);
 map.width=41;assert.throws(()=>checkAtlas(m.atlas,m),/Configuração/);
 map.width=12;map.parent=map.id;assert.throws(()=>checkAtlas(m.atlas,m),/próprio submapa/);
});
test('vínculos tipados entre entidades geram relações navegáveis',()=>{
 const {m,campaign,entry,npc}=setup();
 m.atlas.relations.push({id:'rel1',campaign:campaign.id,from:nodeRef('entry',entry.id),
  to:nodeRef('sheet',npc.id),type:'ally'});
 assert.equal(checkAtlas(m.atlas,m),m.atlas);
 const g=relationGraph(m,m.atlas,campaign.id);
 assert.ok(g.edges.some(e=>e.type==='ally'));
 const filtered=subgraph(g,nodeRef('entry',entry.id),1,['ally']);
 assert.equal(filtered.edges.length,1);
});
test('relações de frontmatter usam links Obsidian e não nomes soltos',()=>{
 assert.equal(noteLink('[[Cavaleira|Vera]]'),'Cavaleira');
 assert.equal(noteLink('[[Lendas/Arlen#Passado]]'),'Lendas/Arlen');
 assert.equal(noteLink('Ninguém'), '');
 const links=noteRelations([{path:'NPCs/Vera.md',frontmatter:{ally:['[[NPCs/Kael]]'],enemy:'[[NPCs/Bruxo]]',spouse:'Nome sem link'}}]);
 assert.equal(links.length,2);assert.ok(links.some(x=>x.type==='ally'));
});
test('liga notas e entradas da Mesa e resolve relações automaticamente',()=>{
 const {m,campaign,entry}=setup();
 const notes=[
 {path:'Mundo/Solaris.md',frontmatter:{ally:'[[NPCs/Vera]]'}},
 {path:'NPCs/Vera.md',frontmatter:{}}
 ];
 const g=relationGraph(m,m.atlas,campaign.id,notes);
 assert.ok(g.edges.some(e=>e.type==='ally'&&e.from==='note:Mundo/Solaris.md'&&e.to==='note:NPCs/Vera.md'));
 assert.ok(g.edges.some(e=>e.type==='link'&&e.from===nodeRef('entry',entry.id)));
});
test('vínculo automático entre registros respeita limites de profundidade',()=>{
 const {m,campaign,entry}=setup();
 const next={...newEntry(campaign.id),name:'Bosque'};m.entries.push(next);entry.links.push(next.id);
 const g=relationGraph(m,m.atlas,campaign.id);
 const local=subgraph(g,nodeRef('entry',entry.id),1);
 assert.ok(local.nodes.some(n=>n.id===nodeRef('entry',next.id)));
});
