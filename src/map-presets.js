'use strict';
// All built-in templates are cloned on creation. They do not modify existing maps.
// The Earth grid is a stylized 40×22 landmask derived from Natural Earth 1:110m
// public-domain land polygons (https://www.naturalearthdata.com/about/terms-of-use/).
// Simplified for fantasy worldbuilding: not suitable for navigation or accurate borders.
const { newMap, terrainSeed, dungeonSeed, place } = require('./atlas');

const MAP_TEMPLATES=Object.freeze([
 {id:'world-earth',name:'Mapa-múndi · Terra alternativa',description:'Continentes reconhecíveis em hexágonos, com biomas e regiões editáveis. Sem fronteiras nem cidades fixas.',grid:'hex',size:'40 × 22',category:'Mundo'},
 {id:'archipelago',name:'Arquipélago',description:'Ilhas e oceanos para exploração naval, com terreno gerado a partir de uma semente.',grid:'hex',size:'28 × 18',category:'Mundo'},
 {id:'regional',name:'Região de aventura',description:'Mapa hexagonal de exploração com floresta, colinas e pontos de interesse de exemplo.',grid:'hex',size:'22 × 16',category:'Região'},
 {id:'dungeon',name:'Masmorra gerada',description:'Salas e corredores em uma planta quadrada editável.',grid:'square',size:'18 × 16',category:'Cena'},
 {id:'empty-hex',name:'Hexágonos em branco',description:'Terreno neutro para criar seu próprio mundo ou região.',grid:'hex',size:'12 × 10',category:'Vazio'},
 {id:'empty-square',name:'Quadrados em branco',description:'Grade vazia para interiores e mapas de combate.',grid:'square',size:'12 × 10',category:'Vazio'},
]);
// '~' water, P plains, F forest, H hills, M mountain, D desert, I ice
const EARTH_ROWS=Object.freeze([
'~~~~~~~~~IIIIIIIIII~~~~~~~~~~~~~~~~~~~~~',
'~~~~~~IIIII~~IIII~~~~~~~~~~~~IIIII~II~~~',
'IIIIIIIIIII~I~II~~I~~IIIIIIIIIIIIIIIIIII',
'~~~~MMMMMH~PP~~~~~~~~FFPPFFFFFFFFFFF~P~~',
'~~~~~~MMMFFFFH~~~~~~FFFFPPFFFFFFFFFF~~~~',
'~~~~~~PPFFFF~~~~~~~F~FF~PPPMMMMPPPH~~~~~',
'~~~~~~~DDFFF~~~~~~~HPH~~PPPPMMMMPPHP~~~~',
'~~~~~~~DP~P~~~~~~~DDDDDDDDDMMMMPP~~~~~~~',
'~~~~~~~~PH~~~~~~~~DDDDDDDDD~PP~P~~~~~~~~',
'~~~~~~~~~~~H~~~~~~PPPPPPP~~~P~~F~~~~~~~~',
'~~~~~~~~~~~MMFF~~~~~~FFFPP~~~~~F~F~~~~~~',
'~~~~~~~~~~~MMFPH~~~~~FFP~~~~~~~FF~~F~~~~',
'~~~~~~~~~~~MMFFP~~~~~~PPP~~~~~~~~~~~~~~~',
'~~~~~~~~~~~~MPP~~~~~~PPP~~~~~~~~~DDDD~~~',
'~~~~~~~~~~~~MPP~~~~~~~PP~~~~~~~~~DDDDH~~',
'~~~~~~~~~~~~MH~~~~~~~~~~~~~~~~~~~~~PP~~~',
'~~~~~~~~~~~~M~~~~~~~~~~~~~~~~~~~~~~~~~~H',
'~~~~~~~~~~~M~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
'~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
'~~~~~~~~~~~~I~~~~~~~~~~~~~~~~~~I~~~~~~~~',
'~~~~~~I~~IIII~~~~~IIIIIIIIIIIIIIIIIIIIII',
'~~IIIIIIIIII~~IIIIIIIIIIIIIIIIIIIIIIII~~'
]);
const SYMBOL_TERRAIN=Object.freeze({P:'plains',F:'forest',H:'hills',M:'mountain',D:'desert',I:'ice'});
function worldGeo(col,row){
 return {lon:-180+360*(col+.5+(row%2)*.5)/40.5,lat:85-170*(row+.5)/22};
}
function continent(lon,lat){
 if(lat < -60)return 'Antártida';
 if(lon < -33)return lat>12?'América do Norte':'América do Sul';
 if(lon>105&&lat<0)return 'Oceania';
 if(lon>-20&&lon<43&&lat<35&&lat>-40)return 'África';
 if(lon>-15&&lon<45&&lat>=35)return 'Europa';
 if(lon>=40)return 'Ásia';
 return 'Oceano Ártico';
}
function makeWorld(map){
 map.width=40;map.height=22;map.defaultTerrain='water';
 for(let row=0;row<22;row++){
   const line=EARTH_ROWS[row];
   if(line.length!==40)throw new Error('Modelo da Terra inválido.');
   for(let col=0;col<40;col++){
     const terrain=SYMBOL_TERRAIN[line[col]];
     if(!terrain)continue;
     const point=worldGeo(col,row);
     map.cells[place(col,row)]={terrain,region:continent(point.lon,point.lat)};
   }
 }
 // The labels are decorative named regions, not geospatial or political borders.
 const targets=[
  ['América do Norte',-105,42],['América do Sul',-64,-16],['Europa',12,50],
  ['África',19,1],['Ásia',100,41],['Oceania',133,-24],['Antártida',15,-74]
 ];
 for(const [name,lon,lat] of targets){
   const candidates=[];
   for(const [at,cell]of Object.entries(map.cells)){
     if(cell.region!==name)continue;
     const [col,row]=at.split(',').map(Number),g=worldGeo(col,row);
     candidates.push({at,score:Math.pow((g.lon-lon)*Math.cos(lat*Math.PI/180),2)+Math.pow(g.lat-lat,2)});
   }
   candidates.sort((a,b)=>a.score-b.score);
   if(candidates.length)map.cells[candidates[0].at].label=name;
 }
 map.description='Mapa de exemplo: continentes da Terra em uma projeção simplificada. Personalize países, estados e cidades sem alterar o mundo original.';
 return map;
}
function makeArchipelago(map){
 map.width=28;map.height=18;map.defaultTerrain='water';
 const islands=[[6,6,4.2,3.5],[18,9,5.1,4.5],[22,3,2.6,2.1],[10,14,2.3,2.4]];
 for(let row=0;row<map.height;row++)for(let col=0;col<map.width;col++){
   let score=0;
   for(const [x,y,rx,ry]of islands){
     const dist=Math.pow((col-x)/rx,2)+Math.pow((row-y)/ry,2);
     score=Math.max(score,1-dist);
   }
   const noise=(Math.sin(col*7.3+row*1.9)+Math.sin(col*1.3-row*3.7))*.045;
   if(score+noise<.15)continue;
   const terrain=score>.78?'mountain':score>.55?'hills':score>.33?'forest':'plains';
   map.cells[place(col,row)]={terrain,region:'Ilhas do Horizonte'};
 }
 for(const [col,row,label]of [[6,6,'Ilha Grande'],[18,9,'Ilha das Brumas'],[22,3,'Farol']]){
   const at=place(col,row);
   if(map.cells[at])map.cells[at].label=label;
 }
 return map;
}
function makeRegional(map,seed){
 map.width=22;map.height=16;map.defaultTerrain='plains';
 map.cells=terrainSeed(map,seed);
 // The generated cells remain completely editable.
 const labels=[[3,7,'Vila Inicial'],[14,4,'Bosque Antigo'],[18,12,'Ruínas']];
 for(const [col,row,label]of labels){
   map.cells[place(col,row)]={...(map.cells[place(col,row)]||{}),label,region:'Região inicial'};
 }
 return map;
}
function createMapTemplate(templateId,campaign='',options={}){
 const template=MAP_TEMPLATES.find(x=>x.id===templateId);
 if(!template)throw new Error('Modelo de mapa desconhecido.');
 const map=newMap(campaign,template.grid);
 map.name=template.name;map.template=template.id;
 const seed=Number.isInteger(options.seed)?options.seed:2026;
 if(template.id==='world-earth')makeWorld(map);
 else if(template.id==='archipelago')makeArchipelago(map);
 else if(template.id==='regional')makeRegional(map,seed);
 else if(template.id==='dungeon'){
   map.width=18;map.height=16;map.cells=dungeonSeed(map,seed);
 }else if(template.id==='empty-square'){
   map.defaultTerrain='floor';
 }
 return map;
}
module.exports={MAP_TEMPLATES,EARTH_ROWS,createMapTemplate,worldGeo,continent};
