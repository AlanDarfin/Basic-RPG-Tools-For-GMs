'use strict';
const { uid } = require('./calendar');
const { clean, key } = require('./solo');
const TERRAIN=Object.freeze({
  plains:{name:'Planície',color:'#ac9b63',icon:'·',speed:1},
  forest:{name:'Floresta',color:'#456e54',icon:'♣',speed:1.5},
  hills:{name:'Colinas',color:'#92785c',icon:'⌃',speed:1.5},
  mountain:{name:'Montanha',color:'#655c67',icon:'▲',speed:3},
  water:{name:'Água',color:'#3a6384',icon:'≈',speed:4},
  swamp:{name:'Pântano',color:'#66775b',icon:'≋',speed:2},
  desert:{name:'Deserto',color:'#c49d64',icon:'☼',speed:2},
  road:{name:'Estrada',color:'#9e866a',icon:'═',speed:.75},
  wall:{name:'Parede',color:'#514b52',icon:'▧',speed:999},
  floor:{name:'Piso',color:'#b0a496',icon:'',speed:1}
});
const RELATION_TYPES=Object.freeze({
 ally:'Aliado',enemy:'Inimigo',friend:'Amigo',rival:'Rival',
 family:'Família',parent:'Progenitor',child:'Filho',spouse:'Cônjuge',
 mentor:'Mentor',student:'Aprendiz',member:'Membro',leader:'Líder',
 controls:'Controla',located:'Localizado em',knows:'Conhece',link:'Conexão'
});
const RELATION_KEYS=Object.freeze(['ally','enemy','friend','rival','family','parent','child','spouse','mentor','student','member','leader','controls','located','knows']);
const MAX_MAPS=60,MAX_CELLS=1600,MAX_LINKS=1500;
const assert=(test,msg)=>{if(!test)throw new Error(msg);};
const int=(n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b;
const place=(col,row)=>col+','+row;
const unpack=(p)=>{const m=/^(\d{1,2}),(\d{1,2})$/.exec(p||'');return m?{col:+m[1],row:+m[2]}:null;};
const blankAtlas=()=>({maps:[],relations:[]});
function newMap(campaign='',grid='hex'){
 return {id:uid('map'),campaign,name:'',grid,width:12,height:10,defaultTerrain:grid==='square'?'wall':'plains',
  parent:'',parentCell:'',background:'',cells:{},paths:[],tokens:[],playerCell:'',revealed:false};
}
function inMap(map,col,row){return int(col,0,map.width-1)&&int(row,0,map.height-1);}
function getCell(map,col,row){return map.cells[place(col,row)]||{};}
function setCell(map,col,row,patch){
 assert(inMap(map,col,row),'Coordenadas fora do mapa.');
 const code=place(col,row),existing=map.cells[code]||{};
 const next={...existing,...patch};
 for(const [k,v] of Object.entries(next))if(v===undefined||v===null||v===''||(k==='fog'&&v===false))delete next[k];
 if(!Object.keys(next).length)delete map.cells[code];else map.cells[code]=next;
 return next;
}
function axial(col,row){return {q:col-(row-(row&1))/2,r:row};}
function distance(map,a,b){
 const x=typeof a==='string'?unpack(a):a,y=typeof b==='string'?unpack(b):b;
 assert(x&&y,'Coordenadas inválidas.');
 if(map.grid==='square')return Math.abs(x.col-y.col)+Math.abs(x.row-y.row);
 const h=axial(x.col,x.row),t=axial(y.col,y.row);
 return (Math.abs(h.q-t.q)+Math.abs(h.r-t.r)+Math.abs(h.q+h.r-t.q-t.r))/2;
}
function around(map,col,row,radius=0){
 const coords=[];
 for(let r=Math.max(0,row-radius);r<=Math.min(map.height-1,row+radius);r++)
  for(let q=Math.max(0,col-radius);q<=Math.min(map.width-1,col+radius);q++)
   if(map.grid==='square'?Math.max(Math.abs(q-col),Math.abs(r-row))<=radius:distance(map,{col,row},{col:q,row:r})<=radius)
    coords.push({col:q,row:r});
 return coords;
}
function terrainSeed(map,seed=1234){
 let state=(Number(seed)>>>0)||1;
 const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
 const keys=['plains','plains','forest','forest','hills','mountain','water','swamp','desert'];
 const initial=new Array(map.width*map.height);
 for(let row=0;row<map.height;row++)for(let col=0;col<map.width;col++){
   const n=Math.max(0,Math.min(8,Math.floor(random()*9)));
   initial[row*map.width+col]=keys[n];
 }
 const next=initial.map((type,i)=>{
   const row=Math.floor(i/map.width),col=i%map.width;
   const neighbors=around(map,col,row,1).map(n=>initial[n.row*map.width+n.col]);
   const count=new Map();
   for(const x of neighbors)count.set(x,(count.get(x)||0)+1);
   const common=[...count].sort((a,b)=>b[1]-a[1])[0];
   return common&&common[1]>=4?common[0]:type;
 });
 const cell={};
 for(let row=0;row<map.height;row++)for(let col=0;col<map.width;col++){
   const type=next[row*map.width+col];
   if(type!==map.defaultTerrain)cell[place(col,row)]={terrain:type};
 }
 return cell;
}
function dungeonSeed(map,seed=1234){
 assert(map.grid==='square','Masmorras usam mapas quadrados.');
 const cells={}; let state=(Number(seed)>>>0)||1;
 const rand=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
 const rooms=[];const count=Math.min(10,Math.max(2,Math.floor(map.width*map.height/45)));
 for(let i=0;i<count;i++){
   const w=Math.min(2+Math.floor(rand()*4),map.width-2),h=Math.min(2+Math.floor(rand()*4),map.height-2);
   if(w<2||h<2)break;
   const col=1+Math.floor(rand()*Math.max(1,map.width-w-1)),row=1+Math.floor(rand()*Math.max(1,map.height-h-1));
   for(let r=row;r<row+h;r++)for(let q=col;q<col+w;q++)cells[place(q,r)]={terrain:'floor'};
   rooms.push({col:Math.floor(col+w/2),row:Math.floor(row+h/2)});
 }
 for(let i=1;i<rooms.length;i++){
   const a=rooms[i-1],b=rooms[i];let q=a.col,r=a.row;
   while(q!==b.col){cells[place(q,r)]={terrain:'floor'};q+=Math.sign(b.col-q);}
   while(r!==b.row){cells[place(q,r)]={terrain:'floor'};r+=Math.sign(b.row-r);}
   cells[place(q,r)]={terrain:'floor'};
 }
 if(rooms.length){cells[place(rooms[0].col,rooms[0].row)]={terrain:'floor',label:'Entrada'};
  const last=rooms.at(-1);cells[place(last.col,last.row)]={terrain:'floor',label:'Saída'};}
 return cells;
}
function mapPathDistance(map,path){
 if(!Array.isArray(path)||path.length<2)return 0;
 return path.slice(1).reduce((sum,p,i)=>sum+distance(map,path[i],p),0);
}
function routeCost(map,waypoints){
 if(!waypoints?.length)return 0;
 let total=0;
 for(let i=1;i<waypoints.length;i++){
   const b=unpack(waypoints[i]),a=unpack(waypoints[i-1]);
   assert(a&&b&&inMap(map,a.col,a.row)&&inMap(map,b.col,b.row),'Rota possui coordenadas inválidas.');
   const unit=distance(map,a,b),terrain=getCell(map,b.col,b.row).terrain||map.defaultTerrain;
   total+=unit*(TERRAIN[terrain]?.speed||1);
 }
 return Math.round(total*100)/100;
}
function safeNote(s){
 return typeof s==='string'&&s.length<=500&&!s.split('/').includes('..')&&!/[\\\x00-\x1f]/.test(s);
}
function checkAtlas(atlas,m){
 assert(atlas&&Array.isArray(atlas.maps)&&Array.isArray(atlas.relations)&&atlas.maps.length<=MAX_MAPS&&atlas.relations.length<=MAX_LINKS,'Atlas inválido ou cheio.');
 assert(new Set(atlas.maps.map(x=>x.id)).size===atlas.maps.length,'Mapas duplicados.');
 const maps=new Map(atlas.maps.map(x=>[x.id,x])),campaigns=new Set(m.campaigns.map(x=>x.id)),
  entries=new Map(m.entries.map(x=>[x.id,x])),sheets=new Map(m.sheets.map(x=>[x.id,x])),encounters=new Map(m.encounters.map(x=>[x.id,x]));
 for(const map of atlas.maps){
   assert(clean(map.id)&&clean(map.name)&&['hex','square'].includes(map.grid)&&int(map.width,3,40)&&int(map.height,3,40)&&map.width*map.height<=MAX_CELLS,'Configuração de mapa inválida.');
   assert(!map.campaign||campaigns.has(map.campaign),'Campanha do mapa não encontrada.');
   assert(Object.hasOwn(TERRAIN,map.defaultTerrain),'Terreno padrão inválido.');
   assert(safeNote(map.background||'')&& (!map.parent||maps.has(map.parent)), 'Vínculo do mapa inválido.');
   assert(map.parent!==map.id,'Um mapa não pode ser seu próprio submapa.');
   if(map.parentCell){const parent=maps.get(map.parent),cell=unpack(map.parentCell);assert(parent&&cell&&inMap(parent,cell.col,cell.row),'Coordenadas do mapa pai inválidas.');}
   if(map.parent)assert(maps.get(map.parent).campaign===map.campaign,'Submapas precisam pertencer à mesma campanha.');
   assert(map.cells&&typeof map.cells==='object'&&!Array.isArray(map.cells)&&Object.keys(map.cells).length<=MAX_CELLS,'Mapa possui células inválidas.');
   for(const [pos,cell]of Object.entries(map.cells)){
     const at=unpack(pos);assert(at&&inMap(map,at.col,at.row)&&cell&&typeof cell==='object'&&!Array.isArray(cell),'Célula fora dos limites.');
     assert(!cell.terrain||Object.hasOwn(TERRAIN,cell.terrain),'Terreno inválido.');
     for(const field of ['label','region','faction','text','secret','icon','table'])assert(!cell[field]||(typeof cell[field]==='string'&&cell[field].length<=(field==='text'||field==='secret'?3000:500)), 'Texto de célula inválido.');
     assert(!cell.note||safeNote(cell.note),'Nota da célula inválida.');
     assert(!cell.tile||(safeNote(cell.tile)&&/\.(?:png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(cell.tile)), 'Textura da célula inválida.');
     assert(!cell.entry||entries.get(cell.entry)?.campaign===map.campaign,'Registro da célula pertence a outra campanha.');
     assert(!cell.sheet||(sheets.has(cell.sheet)&&(!sheets.get(cell.sheet).campaign||sheets.get(cell.sheet).campaign===map.campaign)),'Ficha da célula não encontrada.');
     assert(!cell.encounter||encounters.get(cell.encounter)?.campaign===map.campaign,'Encontro da célula pertence a outra campanha.');
     assert(!cell.submap||(maps.has(cell.submap)&&maps.get(cell.submap).campaign===map.campaign&&cell.submap!==map.id),'Submapa da célula inválido.');
     assert(!cell.fog||typeof cell.fog==='boolean','Névoa inválida.');
     assert(!cell.secret||typeof cell.secret==='string','Segredo de célula inválido.');
   }
   assert(Array.isArray(map.paths)&&map.paths.length<=100&&map.paths.every(x=>Array.isArray(x)&&x.length<=200&&x.every(pos=>{const a=unpack(pos);return a&&inMap(map,a.col,a.row);})), 'Rotas inválidas.');
   assert(Array.isArray(map.tokens)&&map.tokens.length<=80,'Tokens do mapa inválidos.');
   for(const token of map.tokens){
     const at=unpack(token.at);
     assert(clean(token.id)&&clean(token.name)&&at&&inMap(map,at.col,at.row)&&(!token.sheet||sheets.has(token.sheet)),'Token do mapa inválido.');
   }
 }
 const ids=new Set(atlas.relations.map(x=>x.id));assert(ids.size===atlas.relations.length,'Relações duplicadas.');
 const validRef=(ref,campaign)=>{
   if(typeof ref!=='string'||ref.length>600)return false;
   const i=ref.indexOf(':');if(i<=0)return false;
   const type=ref.slice(0,i),id=ref.slice(i+1);
   if(type==='entry')return entries.get(id)?.campaign===campaign;
   if(type==='sheet')return !!sheets.get(id)&&(!sheets.get(id).campaign||sheets.get(id).campaign===campaign);
   if(type==='map')return maps.get(id)?.campaign===campaign;
   if(type==='note')return !!id&&safeNote(id);
   return false;
 };
 for(const edge of atlas.relations)
   assert(clean(edge.id)&&Object.hasOwn(RELATION_TYPES,edge.type)&&campaigns.has(edge.campaign)&&
     validRef(edge.from,edge.campaign)&&validRef(edge.to,edge.campaign)&&edge.from!==edge.to,'Relação inválida ou desconectada da campanha.');
 return atlas;
}
const nodeRef=(type,id)=>type+':'+id;
function allNodes(m,atlas,campaign){
 const nodes=[];
 for(const x of m.entries)if(!campaign||x.campaign===campaign)nodes.push({id:nodeRef('entry',x.id),label:x.name,kind:x.kind,note:x.note,campaign:x.campaign});
 for(const x of m.sheets)if(!campaign||!x.campaign||x.campaign===campaign)nodes.push({id:nodeRef('sheet',x.id),label:x.name,kind:'sheet',note:x.note,campaign:x.campaign});
 for(const x of atlas.maps)if(!campaign||x.campaign===campaign)nodes.push({id:nodeRef('map',x.id),label:x.name,kind:'map',note:'',campaign:x.campaign});
 return nodes;
}
function noteLink(value){
 if(typeof value!=='string')return '';
 const match=/!?\[\[([^\]]+)\]\]/.exec(value);
 return match?match[1].split('|')[0].split('#')[0].trim():'';
}
function noteRelations(notes,allowed=RELATION_KEYS){
 const output=[];
 for(const note of notes){
   if(!note?.path||!note.frontmatter)continue;
   for(const kind of allowed){
     const v=note.frontmatter[kind],list=Array.isArray(v)?v:v?[v]:[];
     for(const item of list){
       const path=noteLink(item);
       if(path)output.push({from:nodeRef('note',note.path),to:nodeRef('note',path),type:kind,automatic:true});
     }
   }
 }
 return output;
}
function relationGraph(m,atlas,campaign='',notes=[]){
 const map=new Map(allNodes(m,atlas,campaign).map(x=>[x.id,x]));
 const edges=[];
 const noteIndex=new Map(notes.map(x=>[key(x.path.replace(/\.md$/i,'')),x.path]));
 const getNote=(path)=>{
   const short=path.replace(/\.md$/i,'');
   return noteIndex.get(key(short))||noteIndex.get(key(short.split('/').at(-1)))||path;
 };
 const add=(from,to,type,automatic=false)=>{
   if(from===to)return;
   if(from.startsWith('note:'))from=nodeRef('note',getNote(from.slice(5)));
   if(to.startsWith('note:'))to=nodeRef('note',getNote(to.slice(5)));
   for(const id of [from,to])if(!map.has(id)){
     const [kind,...rest]=id.split(':'),raw=rest.join(':');
     map.set(id,{id,label:raw.split('/').at(-1).replace(/\.md$/i,''),kind,note:kind==='note'?raw:''});
   }
   edges.push({from,to,type,automatic});
 };
 for(const x of m.entries){
   if(campaign&&x.campaign!==campaign)continue;
   for(const link of x.links||[])if(m.entries.some(e=>e.id===link))
     add(nodeRef('entry',x.id),nodeRef('entry',link),'link',true);
   if(x.note)add(nodeRef('entry',x.id),nodeRef('note',x.note),'link',true);
 }
 for(const x of m.sheets)if(x.note&&(!campaign||!x.campaign||x.campaign===campaign))
   add(nodeRef('sheet',x.id),nodeRef('note',x.note),'link',true);
 for(const x of atlas.maps)if(!campaign||x.campaign===campaign){
   for(const cell of Object.values(x.cells)){
     const from=nodeRef('map',x.id);
     if(cell.entry)add(from,nodeRef('entry',cell.entry),'located',true);
     if(cell.sheet)add(from,nodeRef('sheet',cell.sheet),'located',true);
     if(cell.note)add(from,nodeRef('note',cell.note),'located',true);
   }
 }
 for(const r of atlas.relations)if(!campaign||r.campaign===campaign)add(r.from,r.to,r.type,false);
 const knownNotes=new Set();
 for(const n of map.values())if(n.note)knownNotes.add(key(n.note.replace(/\.md$/i,'')));
 for(const edge of noteRelations(notes))if(knownNotes.has(key(edge.from.slice(5).replace(/\.md$/i,'')))||!campaign)
   add(edge.from,edge.to,edge.type,true);
 const unique=new Map();
 for(const e of edges){
  const code=e.from+'|'+e.to+'|'+e.type;
  if(!unique.has(code))unique.set(code,e);
 }
 return {nodes:[...map.values()],edges:[...unique.values()]};
}
function subgraph(graph,focus='',depth=2,filter=[]){
 const filtered=graph.edges.filter(e=>!filter.length||filter.includes(e.type));
 if(!focus)return {nodes:graph.nodes.filter(n=>filtered.some(e=>e.from===n.id||e.to===n.id)).slice(0,80),
  edges:filtered.slice(0,200)};
 const seen=new Set([focus]),frontier=[focus];
 for(let i=0;i<Math.min(5,Math.max(1,depth));i++){
   const next=[];
   for(const e of filtered)if(seen.has(e.from)&&!seen.has(e.to)){next.push(e.to);seen.add(e.to);}
     else if(seen.has(e.to)&&!seen.has(e.from)){next.push(e.from);seen.add(e.from);}
   frontier.push(...next);
   if(!next.length)break;
 }
 const nodes=graph.nodes.filter(n=>seen.has(n.id)).slice(0,80),ids=new Set(nodes.map(n=>n.id));
 return {nodes,edges:filtered.filter(e=>ids.has(e.from)&&ids.has(e.to)).slice(0,200)};
}
module.exports={TERRAIN,RELATION_TYPES,RELATION_KEYS,blankAtlas,newMap,place,unpack,inMap,getCell,setCell,axial,distance,around,
 terrainSeed,dungeonSeed,mapPathDistance,routeCost,safeNote,checkAtlas,nodeRef,allNodes,noteLink,noteRelations,relationGraph,subgraph};
