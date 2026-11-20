'use strict';
const { TERRAIN,place,unpack,getCell }=require('./atlas');
const NS='http://www.w3.org/2000/svg';
function svgEl(root,tag,attrs={},content){
  const node=root.ownerDocument.createElementNS(NS,tag);
  for(const [k,v]of Object.entries(attrs))if(v!==undefined&&v!==null)node.setAttribute(k,String(v));
  if(content!==undefined)node.textContent=content;
  root.appendChild(node);return node;
}
function center(map,col,row,unit=26){
  if(map.grid==='square')return {x:unit*(2*col+1),y:unit*(2*row+1)};
  return {x:unit*(Math.sqrt(3)*(col+.5*(row&1))+.95),y:unit*(1.5*row+1)};
}
function extent(map,unit=26){
  if(map.grid==='square')return {width:map.width*unit*2,height:map.height*unit*2};
  return {width:unit*(Math.sqrt(3)*(map.width+.6)+1.1),height:unit*(map.height*1.5+.6)};
}
function hexPoints(x,y,unit){
  return Array.from({length:6},(_,i)=>{
    const a=(i*60-30)*Math.PI/180;
    return (x+unit*Math.cos(a)).toFixed(2)+','+(y+unit*Math.sin(a)).toFixed(2);
  }).join(' ');
}
function renderMapCanvas(host,map,{mode='inspect',gm=true,zoom=1,selected='',paintTerrain='forest',onPick,onPaint,background=''}) {
  host.replaceChildren();
  const viewport=host.ownerDocument.createElement('div');
  viewport.className='brpg-atlas-map-scroll';host.appendChild(viewport);
  const unit=26, bounds=extent(map,unit);
  const svg=svgEl(viewport,'svg',{viewBox:'0 0 '+bounds.width+' '+bounds.height,
    width:Math.round(bounds.width*zoom),height:Math.round(bounds.height*zoom),
    role:'img','aria-label':map.name+', '+map.width+' por '+map.height+' células'});
  svg.classList.add('brpg-atlas-svg');
  if(mode==='terrain'||mode==='fog')svg.classList.add('is-painting');
  if(background){const image=svgEl(svg,'image',{href:background,x:0,y:0,width:bounds.width,height:bounds.height,
    preserveAspectRatio:'xMidYMid slice',opacity:.68});image.style.pointerEvents='none';}
  const floor=svgEl(svg,'g',{'class':'brpg-atlas-floor'});
  const cellNodes=new Map();
  for(let row=0;row<map.height;row++)for(let col=0;col<map.width;col++){
    const at=place(col,row),c=getCell(map,col,row),pos=center(map,col,row,unit);
    const blocked=c.fog&&!gm,terrain=blocked?'':(c.terrain||map.defaultTerrain),swatch=TERRAIN[terrain]||TERRAIN.plains;
    const g=svgEl(floor,'g',{'data-pos':at,'class':'brpg-atlas-tile'+(at===selected?' is-selected':'')+
      (blocked?' is-fog':'')+(c.entry||c.sheet||c.note?' has-link':'')});
    const common={fill:blocked?'#17171d':swatch.color,'fill-opacity':background&&!blocked?.74:1,stroke:at===selected?'var(--interactive-accent)':'var(--background-modifier-border)', 'stroke-width':at===selected?3:1.1};
    const shape=map.grid==='square'?svgEl(g,'rect',{x:pos.x-unit+1,y:pos.y-unit+1,width:unit*2-2,height:unit*2-2,...common}):
      svgEl(g,'polygon',{points:hexPoints(pos.x,pos.y,unit-1),...common});
    const label=blocked?'?':c.icon||swatch.icon||'';
    if(label)svgEl(g,'text',{x:pos.x,y:pos.y+2,'text-anchor':'middle',
      'dominant-baseline':'middle','font-size':(c.icon?'15':'13'),
      'pointer-events':'none',fill:'var(--text-normal)'},label);
    if((c.label||c.region)&&!blocked){
      const short=(c.label||c.region).slice(0,11);
      svgEl(g,'text',{x:pos.x,y:pos.y+16,'text-anchor':'middle','font-size':'7.5',
        'pointer-events':'none',fill:'var(--text-normal)'},short);
    }
    if((c.faction||c.submap)&&!blocked){
      svgEl(g,'circle',{cx:pos.x+unit*.62,cy:pos.y-unit*.57,r:3.2,fill:c.submap?'#f6b65c':'#ad82da',
        'pointer-events':'none'});
    }
    svgEl(g,'title',{},(blocked?'Inexplorado':c.label||swatch.name)+' · '+at);
    cellNodes.set(at,{g,shape});
  }
  // Route lines live above terrain and below tokens. Their coordinates match both grid types.
  const roads=svgEl(svg,'g',{'class':'brpg-atlas-routes','pointer-events':'none'});
  for(const path of map.paths||[]){
    const points=path.map(at=>unpack(at)).filter(Boolean).map(pos=>center(map,pos.col,pos.row,unit));
    if(points.length<2)continue;
    if(!gm&&path.some(at=>{const p=unpack(at);return p&&getCell(map,p.col,p.row).fog;}))continue;
    svgEl(roads,'polyline',{points:points.map(x=>x.x+','+x.y).join(' '),fill:'none',
      stroke:'#ffe5a5','stroke-width':4,'stroke-linecap':'round','stroke-linejoin':'round',opacity:.9});
  }
  const tokens=svgEl(svg,'g',{'class':'brpg-atlas-tokens','pointer-events':'none'});
  const occupied=new Map();
  for(const token of map.tokens||[]){
    const pos=unpack(token.at);if(!pos)continue;
    if(getCell(map,pos.col,pos.row).fog&&!gm)continue;
    const n=(occupied.get(token.at)||0);occupied.set(token.at,n+1);
    const p=center(map,pos.col,pos.row,unit),dx=(n%2?1:-1)*6,dy=n>1?10:-7;
    svgEl(tokens,'circle',{cx:p.x+dx,cy:p.y+dy,r:9,fill:'#533449',stroke:'#f0c9dd','stroke-width':1.4});
    svgEl(tokens,'text',{x:p.x+dx,y:p.y+dy+1,'font-size':10,'text-anchor':'middle',
      'dominant-baseline':'middle',fill:'#fff'},token.name?.slice(0,1).toUpperCase()||'●');
  }
  let painting=false,pending=new Set();
  const posFromEvent=e=>{
    let target=e.target;
    while(target&&target!==svg&&!target.getAttribute?.('data-pos'))target=target.parentElement;
    return target?.getAttribute?.('data-pos')||'';
  };
  const stage=(at)=>{
    if(!at||pending.has(at))return;
    pending.add(at);
    const box=cellNodes.get(at);
    if(!box)return;
    if(mode==='terrain')box.shape.setAttribute('fill',TERRAIN[paintTerrain]?.color||TERRAIN.plains.color);
    else if(mode==='fog')box.shape.setAttribute('opacity','.5');
  };
  const finish=()=>{
    if(!painting)return;
    painting=false;
    const coords=[...pending];pending=new Set();
    if(coords.length)onPaint?.(coords);
  };
  if(mode==='terrain'||mode==='fog'){
    svg.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      const at=posFromEvent(e);
      if(!at)return;
      painting=true;pending=new Set();
      stage(at);e.preventDefault();
    });
    svg.addEventListener('pointermove',e=>{
      if(painting)stage(posFromEvent(e));
    });
    svg.addEventListener('pointerup',finish);
    svg.addEventListener('pointercancel',()=>{painting=false;pending.clear();});
    svg.addEventListener('pointerleave',finish);
  }else{
    svg.addEventListener('click',e=>{const at=posFromEvent(e);if(at)onPick?.(at);});
  }
  return {svg,viewport};
}
module.exports={svgEl,center,extent,hexPoints,renderMapCanvas};
