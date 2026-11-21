'use strict';
const { ItemView,Modal,MarkdownRenderChild,parseYaml,TFile,normalizePath }=require('obsidian');
const { el,button,input,select,info,Confirm }=require('./ui');
const { copy,uid }=require('./calendar');
const { key,clean }=require('./solo');
const { newEntry,find,requireMesa,buildRunning }=require('./mesa');
const { randomContent }=require('./ultra');
const {setSessionLocation}=require('./session');
const {previewTravel}=require('./exploration');
const { parseTable,tableEngine }=require('./solo-tables');
const { MAP_TEMPLATES, createMapTemplate }=require('./map-presets');
const {
  TERRAIN,RELATION_TYPES,RELATION_KEYS,blankAtlas,newMap,place,unpack,inMap,getCell,setCell,around,
  terrainSeed,dungeonSeed,routeCost,relationGraph,subgraph,nodeRef,safeNote
}=require('./atlas');
const { svgEl,renderMapCanvas }=require('./atlas-canvas');
const ATLAS_VIEW='basic-rpg-atlas',PANELS=[['maps','Mapas','map'],['relations','Relações','network']];
function row(parent){return el(parent,'div','brpg-toolbar brpg-atlas-row');}
function panel(parent,title,hint=''){
 const box=el(parent,'section','brpg-atlas-panel');
 el(box,'h3','brpg-section-title',title);
 if(hint)info(box,hint);
 return box;
}
function labelled(parent,label,options,current,change){
 const box=el(parent,'label','brpg-field');
 el(box,'span','brpg-label',label);
 return select(box,options,current,change,label);
}
function checkbox(parent,title,initial,onChange){
 const box=el(parent,'label','brpg-atlas-checkbox');
 const input=el(box,'input');input.type='checkbox';input.checked=!!initial;
 el(box,'span','',title);input.addEventListener('change',()=>onChange(input.checked));return input;
}
function action(plugin,fn){return ()=>plugin.attempt(fn);}
function trim(s,n=120){return clean(String(s??''),n);}
function modal(view,title,draft,draw,save){
 class Editor extends Modal{
   constructor(){super(view.plugin.app);this.data=copy(draft);this.busy=false;}
   onOpen(){this.modalEl.addClass('brpg-atlas-modal');this.paint();}
   paint(){
     this.contentEl.replaceChildren();
     const root=el(this.contentEl,'div','brpg brpg-atlas-editor');
     el(root,'h2','brpg-heading',title);
     const error=el(root,'p','brpg-atlas-error');error.setAttribute('role','status');
     draw(root,this.data,()=>this.paint());
     const buttons=row(root);
     button(buttons,'Cancelar',()=>this.close());
     button(buttons,'Salvar',action(view.plugin,async()=>{
       if(this.busy)return;this.busy=true;
       try {await save(this.data);this.close();}
       catch(e){error.textContent=e.message||String(e);}
       finally{this.busy=false;}
     }),{icon:'check',className:'brpg-button mod-cta'});
   }
 }
 new Editor().open();
}
const opts=(items,empty='Nenhum')=>[['',empty],...items.map(x=>[x.id,x.name])];
const svgClick=(el,fn)=>{el.setAttribute('tabindex','0');el.setAttribute('role','button');
 el.addEventListener('click',fn);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn();}});};
function mapNotes(plugin){
 const files=plugin.app.vault.getMarkdownFiles?.()||[];
 return files.slice(0,1800).map(file=>({path:file.path,frontmatter:plugin.app.metadataCache?.getFileCache?.(file)?.frontmatter||null}));
}
function idFolder(name){
 return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'Mapa';
}
async function ensureFolder(vault,path){
 const parts=path.split('/'), current=[];
 for(const part of parts){current.push(part);const p=current.join('/');
   if(!vault.getAbstractFileByPath(p))await vault.createFolder(p);
 }
}
async function makeHexNote(plugin,map,at){
 const pos=unpack(at),cell=getCell(map,pos.col,pos.row);
 if(cell.note){
   const old=plugin.app.vault.getAbstractFileByPath(cell.note);
   if(old instanceof TFile){await plugin.openNote(cell.note);return cell.note;}
 }
 const root='Basic RPG/Mapas/'+idFolder(map.name);
 await ensureFolder(plugin.app.vault,root);
 let path=root+'/Celula-'+pos.col+'-'+pos.row+'.md',n=2;
 while(plugin.app.vault.getAbstractFileByPath(path))path=root+'/Celula-'+pos.col+'-'+pos.row+'-'+n++ +'.md';
 const escaped=s=>String(s||'').replace(/[\\[\]]/g,'').replace(/\r?\n/g,' ');
 const body=['---','basic-rpg-map: '+map.id,'basic-rpg-cell: "'+at+'"','terrain: '+(cell.terrain||map.defaultTerrain),'---','',
  '# '+(escaped(cell.label)||'Célula '+at),'',
  'Mapa: '+map.name,'Coordenadas: '+at,
  '', '## Descrição','',cell.text||'','',
  '## Rumores e segredos','',cell.secret||'',''].join('\n');
 await plugin.app.vault.create(path,body);
 await plugin.changeMesa(m=>{
   const data=m.atlas.maps.find(x=>x.id===map.id);
   requireMesa(!!data,'Mapa não encontrado.');
   setCell(data,pos.col,pos.row,{note:path});
 });
 await plugin.openNote(path);return path;
}
function showEntity(plugin,view,kind,id){
 if(kind==='note')return plugin.openNote(id);
 if(kind==='entry')return plugin.openMesa('campaigns').then(v=>{v.campaign=plugin.mesa().entries.find(x=>x.id===id)?.campaign||'';v.focusEntry=id;v.render();});
 if(kind==='sheet')return plugin.openMesa('sheets').then(v=>{v.filter=plugin.mesa().sheets.find(x=>x.id===id)?.name||'';v.render();});
 if(kind==='map'){view.panel='maps';view.mapId=id;view.selected='';view.render();return Promise.resolve();}
 return Promise.resolve();
}
function getNode(ref){
 const i=ref.indexOf(':');return i<0?['','']:[ref.slice(0,i),ref.slice(i+1)];
}
class AtlasView extends ItemView{
 constructor(leaf,plugin){
   super(leaf);this.plugin=plugin;this.panel='maps';this.campaign='';this.mapId='';this.selected='';
   this.mode='inspect';this.terrain='forest';this.tile='';this.brush=0;this.zoom=1;this.gm=true;this.regions=true;this.factions=true;
   this.route=[];this.token='';this.focus='';this.relationType='';this.depth=2;this.graphStyle='radial';
 }
 getViewType(){return ATLAS_VIEW;}
 getDisplayText(){return 'Basic RPG · Atlas';}
 getIcon(){return 'map';}
 async onOpen(){this.render();}
 async onClose(){this.closed=true;}
 get atlas(){return this.plugin.mesa().atlas||blankAtlas();}
 get m(){return this.plugin.mesa();}
 get current(){return this.atlas.maps.find(x=>x.id===this.mapId);}
 chooseMap(mapId){
   this.mapId=mapId;this.selected='';this.route=[];this.mode='inspect';this.render();
 }
 show(panel){if(PANELS.some(x=>x[0]===panel))this.panel=panel;this.render();}
 save(change){return this.plugin.changeMesa(m=>{m.atlas ||= blankAtlas();return change(m.atlas,m);});}
 render(){
   if(this.closed)return;
   const root=this.contentEl,top=root.scrollTop;
   root.classList.add('brpg','brpg-view','brpg-atlas');root.replaceChildren();
   const head=el(root,'header','brpg-header brpg-atlas-header'),title=el(head,'div');
   el(title,'p','brpg-eyebrow','BASIC RPG');
   el(title,'h2','brpg-heading','Atlas');
   const nav=row(head);
   button(nav,'Abrir Mesa',action(this.plugin,()=>this.plugin.openMesa()),{icon:'swords',iconOnly:true});
   button(nav,'Abrir calendário',action(this.plugin,()=>this.plugin.open(true)),{icon:'calendar-days',iconOnly:true});
   button(nav,'Pesquisa global',()=>this.plugin.openWorldSearch(),{icon:'search',iconOnly:true});
   const tabs=el(root,'nav','brpg-tabs brpg-atlas-tabs');
   for(const [id,text,icon]of PANELS){
     const b=button(tabs,text,()=>this.show(id),{icon});b.setAttribute('aria-pressed',String(this.panel===id));
   }
   const c=el(root,'div','brpg-atlas-campaign');
   labelled(c,'Campanha',[['','Todas as campanhas'],...this.m.campaigns.map(x=>[x.id,x.name])],this.campaign,
     v=>{this.campaign=v;this.selected='';this.mapId='';this.focus='';this.render();});
   if(this.panel==='relations')this.relationsPane(root);
   else this.mapsPane(root);
   root.scrollTop=top;
 }
 editMap(existing){
   const base=existing||newMap(this.campaign,'hex');
   if(!existing){base.name='Novo mapa';if(!base.campaign)base.campaign=this.m.campaigns[0]?.id||'';}
   modal(this,existing?'Editar mapa':'Criar mapa',base,(root,d,redraw)=>{
     if(!existing){
       labelled(root,'Modelo inicial',[['','Personalizado'],...MAP_TEMPLATES.map(t=>[t.id,t.name])],d.template||'',v=>{
         const oldCampaign=d.campaign;
         const fresh=v?createMapTemplate(v,oldCampaign):newMap(oldCampaign,d.grid);
         if(!v)fresh.name='Novo mapa';
         Object.assign(d,fresh);
         redraw();
       });
       const model=MAP_TEMPLATES.find(x=>x.id===d.template);
       if(model)info(root,model.description+' · '+model.size);
       else info(root,'Escolha um modelo pronto ou crie uma grade personalizada. Os modelos só são adicionados após salvar.');
     }
     input(root,'Nome do mapa',d.name,v=>{d.name=v;},{maxLength:120});
     labelled(root,'Campanha',opts(this.m.campaigns,'Sem campanha'),d.campaign,v=>{d.campaign=v;});
     labelled(root,'Grade',[['hex','Hexagonal'],['square','Quadrada']],d.grid,v=>{d.grid=v;});
     input(root,'Largura (3–40)',d.width,v=>{d.width=v;},{type:'number',min:3,max:40});
     input(root,'Altura (3–40)',d.height,v=>{d.height=v;},{type:'number',min:3,max:40});
     labelled(root,'Terreno inicial',Object.entries(TERRAIN).map(([id,t])=>[id,t.name]),d.defaultTerrain,
       v=>{d.defaultTerrain=v;});
     input(root,'Imagem de fundo no cofre (opcional)',d.background||'',v=>{d.background=v;},{maxLength:500});
     info(root,'Altere a grade antes de pintar. Diminuir o tamanho de um mapa já preenchido pode eliminar células.');
   },async d=>{
     d.name=trim(d.name);d.background=trim(d.background,500);
     requireMesa(!!d.name,'Dê um nome ao mapa.');
     requireMesa(Number.isInteger(d.width)&&Number.isInteger(d.height)&&d.width*d.height<=1600,'Use dimensões inteiras entre 3 e 40.');
     requireMesa(safeNote(d.background),'Caminho de imagem inválido.');
     if(existing){
       for(const at of Object.keys(d.cells)){const p=unpack(at);requireMesa(p&&inMap(d,p.col,p.row),'A nova dimensão corta células preenchidas.');}
       for(const path of d.paths)for(const at of path){const p=unpack(at);requireMesa(p&&inMap(d,p.col,p.row),'A nova dimensão corta uma rota salva.');}
       for(const token of d.tokens){const p=unpack(token.at);requireMesa(p&&inMap(d,p.col,p.row),'A nova dimensão corta um token.');}
     }
     await this.save(a=>{
       if(existing){const pos=a.maps.findIndex(x=>x.id===d.id);requireMesa(pos>=0,'Mapa não encontrado.');a.maps[pos]=d;}
       else a.maps.push(d);
     });
     this.mapId=d.id;this.campaign=d.campaign||'';this.render();
   });
 }
 removeMap(map){
   new Confirm(this.plugin.app,'Excluir o mapa '+map.name+'? As notas do cofre não serão apagadas.',()=>this.save((a,m)=>{
     if(m.session?.map===map.id){m.session.map='';m.session.cell='';}
     a.maps=a.maps.filter(x=>x.id!==map.id);
     for(const item of a.maps){if(item.parent===map.id){item.parent='';item.parentCell='';}
       for(const cell of Object.values(item.cells))if(cell.submap===map.id)delete cell.submap;}
     a.relations=a.relations.filter(x=>x.from!=='map:'+map.id&&x.to!=='map:'+map.id);
     this.mapId='';this.selected='';
   })).open();
 }
 mapsPane(root){
   const listing=this.atlas.maps.filter(x=>!this.campaign||x.campaign===this.campaign);
   const controls=el(root,'div','brpg-atlas-map-controls');
   labelled(controls,'Mapa',opts(listing,'Escolher mapa'),listing.some(x=>x.id===this.mapId)?this.mapId:'',
     v=>this.chooseMap(v));
   const tools=row(controls);
   button(tools,'Novo mapa ou modelo',()=>this.editMap(),{icon:'layout-template',className:'brpg-button mod-cta'});
   const map=this.current;
   if(!map){info(root,'Crie seu primeiro mapa hexagonal ou quadriculado. Você poderá conectar cada célula a notas, personagens e encontros da Mesa.');return;}
   const mapActions=row(root);
   button(mapActions,'Configurações do mapa',()=>this.editMap(map),{icon:'settings-2',iconOnly:true});
   button(mapActions,'Excluir mapa',()=>this.removeMap(map),{icon:'trash-2',iconOnly:true});
   button(mapActions,'Voltar ao mapa pai',()=>{
     this.mapId=map.parent;this.selected=map.parentCell||'';this.render();
   },{icon:'corner-up-left',iconOnly:true,disabled:!map.parent});
   const main=panel(root,map.name,map.grid==='hex'?'Hexágonos · exploração e regiões':'Quadrados · ambientes, cidades e masmorras');
   const basic=row(main);
   const modes=[['inspect','Explorar','mouse-pointer-2'],['terrain','Terreno','paintbrush'],['tile','Textura','image'],['fog','Névoa','cloud'],['route','Rota','route'],['token','Tokens','users']];
   for(const [id,label,icon]of modes){
     const b=button(basic,label,()=>{this.mode=id;this.render();},{icon,iconOnly:true});
     b.setAttribute('aria-pressed',String(this.mode===id));
   }
   const more=el(main,'div','brpg-atlas-tool-options');
   if(this.mode==='terrain'){
     labelled(more,'Pincel de terreno',Object.entries(TERRAIN).map(([id,t])=>[id,t.name+' '+t.icon]),this.terrain,
       v=>{this.terrain=v;});
     labelled(more,'Tamanho do pincel',[['0','1 célula'],['1','Até 3 células'],['3','Até 7 células']],String(this.brush),
       v=>{this.brush=Number(v);});
   }else if(this.mode==='tile'){
     const files=(this.plugin.app.vault.getFiles?.()||[]).filter(x=>/\.(?:png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(x.path)).slice(0,200);
     labelled(more,'Textura do cofre',[['','Remover textura'],...files.map(f=>[f.path,f.path])],this.tile,v=>{this.tile=v;});
     input(more,'Caminho direto da imagem',this.tile,v=>{this.tile=v;},{maxLength:500});
     labelled(more,'Tamanho do pincel',[['0','1 célula'],['1','Até 3 células'],['3','Até 7 células']],String(this.brush),v=>{this.brush=Number(v);});
   }else if(this.mode==='fog')info(more,'Toque ou arraste para cobrir ou revelar células. Na visualização dos jogadores, os detalhes cobertos ficam ocultos.');
   else if(this.mode==='route')info(more,'Toque nas células em sequência para traçar uma rota. O custo considera o terreno de destino.');
   else if(this.mode==='token'){
     const sheets=this.m.sheets.filter(x=>!x.campaign||x.campaign===map.campaign);
     labelled(more,'Ficha do token',[['','Selecione uma ficha'],...opts(sheets).slice(1)],this.token,
       v=>{this.token=v;});
     info(more,'Escolha uma ficha e toque num hexágono. Toque em outro hexágono para mover o mesmo token.');
   }
   const switches=row(main);
   checkbox(switches,'Visualização do mestre',this.gm,v=>{this.gm=v;this.render();});
   checkbox(switches,'Regiões',this.regions,v=>{this.regions=v;this.render();});
   checkbox(switches,'Facções',this.factions,v=>{this.factions=v;this.render();});
   button(switches,'Ampliar',()=>{this.zoom=Math.min(2,+(this.zoom+.2).toFixed(1));this.render();},{icon:'zoom-in',iconOnly:true,disabled:this.zoom>=2});
   button(switches,'Reduzir',()=>{this.zoom=Math.max(.7,+(this.zoom-.2).toFixed(1));this.render();},{icon:'zoom-out',iconOnly:true,disabled:this.zoom<=.7});
   const canvas=el(main,'div','brpg-atlas-canvas');
   const backgroundFile=map.background?this.plugin.app.vault.getAbstractFileByPath(map.background):null;
   const background=backgroundFile instanceof TFile?this.plugin.app.vault.getResourcePath(backgroundFile):'';
   renderMapCanvas(canvas,map,{background,mode:this.mode,gm:this.gm,zoom:this.zoom,selected:this.selected,paintTerrain:this.terrain,
     partyAt:this.m.session?.map===map.id?this.m.session.cell:'',
     regions:this.regions,factions:this.factions,getTileUrl:path=>{const f=this.plugin.app.vault.getAbstractFileByPath(path);return f instanceof TFile?this.plugin.app.vault.getResourcePath(f):'';},
     onPick:at=>this.pickCell(map,at),onPaint:coords=>this.paintCells(map,coords)});
   const board=row(main);
   if(this.mode==='route'){
     el(board,'span','brpg-chip',this.route.length+' pontos');
     button(board,'Salvar rota',action(this.plugin,async()=>{
       requireMesa(this.route.length>1,'Selecione ao menos duas células.');
       const path=[...this.route];
       await this.save(a=>{const m=a.maps.find(x=>x.id===map.id);m.paths.push(path);});
       this.route=[];this.render();
     }),{icon:'save',disabled:this.route.length<2});
     button(board,'Cancelar',()=>{this.route=[];this.render();},{icon:'x'});
     if(this.route.length>1)info(main,routeCost(map,this.route)+' unidades de deslocamento, com custos relativos de terreno.');
   }
   const generated=row(main);
   button(generated,map.grid==='square'?'Gerar masmorra':'Gerar terreno',()=>
     new Confirm(this.plugin.app,'Substituir somente a pintura do mapa? Vínculos, tokens e notas serão preservados.',()=>this.save(a=>{
       const target=a.maps.find(x=>x.id===map.id);
       const generated=map.grid==='square'?dungeonSeed(target,Date.now()):terrainSeed(target,Date.now());
       for(let r=0;r<target.height;r++)for(let q=0;q<target.width;q++){
         const at=place(q,r),cell=target.cells[at]||{};
         delete cell.terrain;
         if(generated[at]?.terrain)cell.terrain=generated[at].terrain;
         if(generated[at]?.label&&!cell.label)cell.label=generated[at].label;
         if(Object.keys(cell).length)target.cells[at]=cell;else delete target.cells[at];
       }
     })).open(),{icon:'sparkles'});
   if(map.paths.length)button(generated,'Remover última rota',()=>
     new Confirm(this.plugin.app,'Remover a última rota deste mapa?',()=>this.save(a=>{
       a.maps.find(x=>x.id===map.id).paths.pop();
     })).open(),{icon:'undo-2'});
   if(this.selected)this.cellPane(root,map);
 }
 pickCell(map,at){
   this.selected=at;
   if(this.mode==='inspect')return this.render();
   if(this.mode==='route'){this.route.push(at);return this.render();}
   if(this.mode==='token')return this.placeToken(map,at);
 }
 paintCells(map,points){
   const all=new Set();
   if(this.mode==='tile'&&this.tile){
     const file=this.plugin.app.vault.getAbstractFileByPath(this.tile);
     if(!(file instanceof TFile))return this.plugin.attempt(()=>{throw new Error('Selecione uma imagem existente no cofre.');});
   }
   for(const at of points){const center=unpack(at);if(!center)continue;
     for(const p of around(map,center.col,center.row,['terrain','tile'].includes(this.mode)?this.brush:0))
       all.add(place(p.col,p.row));
   }
   return this.plugin.attempt(()=>this.save(a=>{
     const target=a.maps.find(x=>x.id===map.id);if(!target)return;
     for(const at of all){const p=unpack(at),cell=getCell(target,p.col,p.row);
       if(this.mode==='terrain')setCell(target,p.col,p.row,{terrain:this.terrain});
       else if(this.mode==='tile')setCell(target,p.col,p.row,{tile:this.tile});
       else if(this.mode==='fog')setCell(target,p.col,p.row,{fog:!cell.fog});
     }
   }));
 }
 placeToken(map,at){
   return this.plugin.attempt(()=>this.save(a=>{
     requireMesa(!!this.token,'Selecione uma ficha para colocar no mapa.');
     const target=a.maps.find(x=>x.id===map.id);requireMesa(!!target,'Mapa não encontrado.');
     const sheet=this.m.sheets.find(x=>x.id===this.token);requireMesa(!!sheet,'Ficha não encontrada.');
     const token=target.tokens.find(x=>x.sheet===sheet.id);
     if(token)token.at=at;
     else {requireMesa(target.tokens.length<80,'Mapa cheio de tokens.');target.tokens.push({id:uid('token'),sheet:sheet.id,name:sheet.name,at});}
   }));
 }
 cellPane(root,map){
   const p=unpack(this.selected),cell=getCell(map,p.col,p.row);
   const visible=this.gm||!cell.fog;
   const detail=panel(root,'Célula '+this.selected,(TERRAIN[cell.terrain||map.defaultTerrain]?.name||'Terreno')+(cell.region?' · '+cell.region:''));
   if(!visible){info(detail,'Este local está coberto pela neblina de guerra na visualização dos jogadores.');return;}
   if(cell.label)el(detail,'strong','',cell.label);
   if(cell.text)el(detail,'p','brpg-mesa-prose',cell.text);
   if(cell.secret&&this.gm)info(detail,'Segredo do mestre: '+cell.secret);
   const links=row(detail);
   if(cell.note)button(links,'Abrir nota',action(this.plugin,()=>this.plugin.openNote(cell.note)),{icon:'file-text'});
   button(links,'Clima do mundo',action(this.plugin,async()=>{const view=await this.plugin.open(true);view.mode='weather';view.weatherPanel='forecast';view.render();}),{icon:'cloud-sun'});
   if(cell.table)button(links,'Rolar encontro',action(this.plugin,async()=>{
     const f=this.plugin.app.vault.getAbstractFileByPath(cell.table);
     requireMesa(f instanceof TFile,'Tabela de encontros não encontrada no cofre.');
     const src=await this.plugin.app.vault.read(f),parsed=parseTable(f.path,src,parseYaml),rolled=tableEngine([parsed],'Tables').output(parsed);
     requireMesa(!!rolled,'A tabela não possui resultados válidos.');
     const message=panel(root,'Encontro sorteado');
     info(message,rolled);
   }),{icon:'dices'});
   if(cell.entry){
     const entry=this.m.entries.find(x=>x.id===cell.entry);
     if(entry)button(links,entry.name,action(this.plugin,()=>showEntity(this.plugin,this,'entry',entry.id)),{icon:'map-pin'});
   }
   if(cell.sheet){
     const s=this.m.sheets.find(x=>x.id===cell.sheet);
     if(s)button(links,s.name,action(this.plugin,()=>showEntity(this.plugin,this,'sheet',s.id)),{icon:'contact-round'});
   }
   if(cell.encounter){
     const e=this.m.encounters.find(x=>x.id===cell.encounter);
     if(e)button(links,'Iniciar '+e.name,action(this.plugin,async()=>{
       await this.plugin.changeMesa(m=>{requireMesa(!m.running,'Finalize o encontro atual antes de iniciar outro.');
         m.running=buildRunning(m.encounters.find(x=>x.id===e.id),m);});
       await this.plugin.openMesa('encounters');
     }),{icon:'swords'});
   }
   if(cell.submap){
     const child=this.atlas.maps.find(x=>x.id===cell.submap);
     if(child)button(links,'Entrar em '+child.name,()=>this.chooseMap(child.id),{icon:'corner-down-right'});
   }
   const controls=row(detail);
   if(this.m.session?.status==='active'&&this.m.session.map===map.id&&this.m.session.cell&&this.m.session.cell!==this.selected)
     button(controls,'Planejar viagem até aqui',action(this.plugin,async()=>{
       const target=this.selected;
       const dashboard=await this.plugin.openMesa('dashboard');
       dashboard.campaign=map.campaign;
       dashboard.travelToDraft=target;
       dashboard.travelPreview=null;
       dashboard.render();
     }),{icon:'route'});
   if(this.m.session?.campaign===map.campaign)button(controls,'Marcar como local da sessão',action(this.plugin,()=>this.plugin.changeMesa(m=>setSessionLocation(m,map.id,this.selected))),{icon:'map-pin'});
   button(controls,'Editar célula',()=>this.editCell(map,this.selected),{icon:'pencil'});
   button(controls,cell.note?'Abrir/criar nota':'Criar nota do hex',action(this.plugin,()=>makeHexNote(this.plugin,map,this.selected)),{icon:'file-plus'});
   button(controls,'Gerar local',action(this.plugin,async()=>{
     const generated=randomContent('site');
     await this.save((a,m)=>{
       requireMesa(!!map.campaign,'Associe o mapa a uma campanha para gerar registros.');
       const entry=newEntry(map.campaign);entry.kind='site';entry.name=generated.title;entry.summary=generated.body;
       m.entries.push(entry);const target=a.maps.find(x=>x.id===map.id);setCell(target,p.col,p.row,{entry:entry.id,label:generated.title});
     });
   }),{icon:'sparkles',disabled:!map.campaign});
 }
 editCell(map,at){
   const p=unpack(at),cell=getCell(map,p.col,p.row);
   modal(this,'Editar célula '+at,{...copy(cell)},(root,c)=>{
     labelled(root,'Terreno',Object.entries(TERRAIN).map(([id,x])=>[id,x.name]),c.terrain||map.defaultTerrain,v=>{c.terrain=v;});
     for(const [name,label,max,multi]of [
       ['label','Nome do lugar',120],['region','Região',120],['faction','Facção',120],
       ['text','Descrição',3000,true],['secret','Segredo do mestre',3000,true],
       ['icon','Símbolo',10],['tile','Textura da célula (imagem do cofre)',500],['note','Caminho de nota existente',500],['table','Tabela de encontros (nota)',500]
     ])input(root,label,c[name]||'',v=>{c[name]=v;},{multiline:!!multi,rows:multi?3:undefined,maxLength:max});
     const entries=this.m.entries.filter(x=>x.campaign===map.campaign);
     const sheets=this.m.sheets.filter(x=>!x.campaign||x.campaign===map.campaign);
     const encounters=this.m.encounters.filter(x=>x.campaign===map.campaign);
     labelled(root,'Registro da campanha',opts(entries),c.entry||'',v=>{c.entry=v;});
     labelled(root,'Ficha ou criatura',opts(sheets),c.sheet||'',v=>{c.sheet=v;});
     labelled(root,'Encontro preparado',opts(encounters),c.encounter||'',v=>{c.encounter=v;});
     const submaps=this.atlas.maps.filter(x=>x.id!==map.id&&x.campaign===map.campaign);
     labelled(root,'Submapa',opts(submaps),c.submap||'',v=>{c.submap=v;});
     checkbox(root,'Ocultar atrás da neblina de guerra',c.fog||false,v=>{c.fog=v;});
   },async c=>{
     for(const f of ['label','region','faction','text','secret','icon','tile','note','table'])c[f]=trim(c[f],f==='text'||f==='secret'?3000:500);
     requireMesa(safeNote(c.note),'Caminho de nota inválido.');
     if(c.tile){const file=this.plugin.app.vault.getAbstractFileByPath(c.tile);requireMesa(file instanceof TFile,'Selecione uma imagem de textura existente no cofre.');}
     if(c.submap){
       const desc=this.atlas.maps.find(x=>x.id===c.submap);
       requireMesa(!desc.parent||desc.parent===map.id,'O submapa já pertence a outro mapa.');
     }
     await this.save(a=>{
       const target=a.maps.find(x=>x.id===map.id);requireMesa(!!target,'Mapa não encontrado.');
       setCell(target,p.col,p.row,c);
       if(c.submap){const child=a.maps.find(x=>x.id===c.submap);child.parent=map.id;child.parentCell=at;}
     });
   });
 }
 relationsPane(root){
   const notes=mapNotes(this.plugin),graph=relationGraph(this.m,this.atlas,this.campaign,notes);
   const controls=panel(root,'Rede de relações','Conexões da Mesa + relações tipadas nas propriedades das notas. Os vínculos das notas são somente leitura.');
   const tools=row(controls);
   button(tools,'Nova relação',()=>this.editRelation(notes),{icon:'plus',className:'brpg-button mod-cta',disabled:!this.m.campaigns.length});
   button(tools,'Ir para campanhas',action(this.plugin,()=>this.plugin.openMesa('campaigns')),{icon:'map'});
   if(!graph.edges.length)return info(root,'Crie relações entre fichas e registros, vincule registros da Mesa ou use propriedades como ally, enemy, spouse e parent nas notas.');
   const options=[['','Rede completa'],...graph.nodes.filter(x=>x.id&&!x.id.startsWith('note:')).slice(0,250).map(x=>[x.id,x.label]),
     ...graph.nodes.filter(x=>x.id.startsWith('note:')).slice(0,75).map(x=>[x.id,'Nota · '+x.label])];
   labelled(controls,'Centro do gráfico',options,this.focus,v=>{this.focus=v;this.render();});
   const filters=row(controls);
   labelled(filters,'Tipo',[['','Todas as relações'],...Object.entries(RELATION_TYPES)],this.relationType,v=>{this.relationType=v;this.render();});
   labelled(filters,'Profundidade',[['1','1 vínculo'],['2','2 vínculos'],['3','3 vínculos'],['4','4 vínculos']],String(this.depth),
     v=>{this.depth=+v;this.render();});
   labelled(filters,'Layout',[['radial','Rede'],['tree','Hierarquia']],this.graphStyle,v=>{this.graphStyle=v;this.render();});
   const filtered=subgraph(graph,this.focus,this.depth,this.relationType?[this.relationType]:[]);
   const box=panel(root,'Diagrama de relações',filtered.nodes.length+' nós · '+filtered.edges.length+' vínculos');
   this.drawGraph(box,filtered);
   const details=el(root,'details','brpg-disclosure brpg-atlas-relations-list');
   el(details,'summary','brpg-summary','Gerenciar vínculos manuais · '+this.atlas.relations.length);
   for(const edge of this.atlas.relations.filter(x=>!this.campaign||x.campaign===this.campaign)){
     const a=graph.nodes.find(x=>x.id===edge.from)?.label||edge.from,b=graph.nodes.find(x=>x.id===edge.to)?.label||edge.to;
     const item=row(details);
     el(item,'span','brpg-atlas-relation-name',a+' · '+RELATION_TYPES[edge.type]+' · '+b);
     button(item,'Excluir relação',()=>new Confirm(this.plugin.app,'Excluir este vínculo?',()=>this.save(a=>{
       a.relations=a.relations.filter(x=>x.id!==edge.id);
     })).open(),{icon:'trash-2',iconOnly:true});
   }
 }
 drawGraph(root,graph){
   const count=Math.min(graph.nodes.length,65);
   if(!count)return info(root,'Nenhuma conexão para os filtros escolhidos.');
   const nodes=graph.nodes.slice(0,count),ids=new Set(nodes.map(x=>x.id));
   const w=780,h=500;
   const scroller=el(root,'div','brpg-atlas-graph-scroll');
   const svg=svgEl(scroller,'svg',{viewBox:'0 0 '+w+' '+h,width:w,height:h,
     role:'img','aria-label':'Diagrama de conexões'});
   const coords=new Map();
   const selected=this.focus, centerNode=nodes.find(x=>x.id===selected);
   const others=nodes.filter(x=>x!==centerNode);
   if(centerNode)coords.set(centerNode.id,{x:w/2,y:h/2});
   for(let i=0;i<others.length;i++){
     const n=others[i];
     if(this.graphStyle==='tree'){
       const levels=4,cols=Math.ceil(Math.sqrt(others.length));
       coords.set(n.id,{x:(i%cols+.5)*w/cols,y:(Math.floor(i/cols)+.5)*h/Math.ceil(others.length/cols)});
     }else{
       const angle=-Math.PI/2+2*Math.PI*i/Math.max(1,others.length);
       const rad=Math.min(w*.38,h*.39)*(.72+.22*(i%3)/2);
       coords.set(n.id,{x:w/2+Math.cos(angle)*rad,y:h/2+Math.sin(angle)*rad});
     }
   }
   if(!centerNode&&nodes.length){
     const angle=-Math.PI/2+2*Math.PI*others.length/Math.max(1,others.length);
     coords.set(nodes.at(-1).id,{x:w/2+Math.cos(angle)*190,y:h/2+Math.sin(angle)*190});
   }
   const canvas=svgEl(svg,'g',{'class':'brpg-atlas-edges'});
   for(const e of graph.edges){
     if(!ids.has(e.from)||!ids.has(e.to))continue;
     const a=coords.get(e.from),b=coords.get(e.to);if(!a||!b)continue;
     const color=['enemy','rival'].includes(e.type)?'#cb6b73':['ally','friend'].includes(e.type)?'#71b59a':
       ['parent','child','family','spouse'].includes(e.type)?'#b39be6':'#9f97b9';
     const line=svgEl(canvas,'line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color,'stroke-width':2,
       'stroke-dasharray':e.automatic?'4 5':''});
     svgEl(line,'title',{},RELATION_TYPES[e.type]||e.type);
   }
   const glyphs=svgEl(svg,'g',{'class':'brpg-atlas-nodes'});
   for(const n of nodes){
     const p=coords.get(n.id);if(!p)continue;
     const g=svgEl(glyphs,'g',{'class':'brpg-atlas-graph-node'});
     const color=n.kind==='sheet'?'#704767':n.kind==='map'?'#536c90':n.kind==='note'?'#6b6b75':'#476c60';
     svgEl(g,'circle',{cx:p.x,cy:p.y,r:n.id===selected?23:18,fill:color,stroke:'#b8afc5','stroke-width':1.5});
     svgEl(g,'text',{x:p.x,y:p.y+4,'text-anchor':'middle','font-size':'12',fill:'#fff'},n.label.slice(0,1).toUpperCase());
     svgEl(g,'text',{x:p.x,y:p.y+34,'font-size':'11',fill:'var(--text-normal)','text-anchor':'middle'},n.label.slice(0,19));
     svgEl(g,'title',{},n.label);
     svgClick(g,()=>{const [kind,id]=getNode(n.id);this.plugin.attempt(()=>kind==='map'?this.plugin.openAtlas('maps',id):showEntity(this.plugin,this,kind,id));});
   }
   if(graph.nodes.length>nodes.length)info(root,'Mostrando os primeiros '+nodes.length+' nós. Escolha um centro ou filtre as relações para reduzir a rede.');
 }
 editRelation(notes){
   const campaign=this.campaign||this.m.campaigns[0]?.id;
   if(!campaign)return;
   const items=[
     ...this.m.entries.filter(x=>x.campaign===campaign).map(x=>({id:nodeRef('entry',x.id),name:'Registro · '+x.name})),
     ...this.m.sheets.filter(x=>!x.campaign||x.campaign===campaign).map(x=>({id:nodeRef('sheet',x.id),name:'Ficha · '+x.name})),
     ...this.atlas.maps.filter(x=>x.campaign===campaign).map(x=>({id:nodeRef('map',x.id),name:'Mapa · '+x.name})),
     ...notes.filter(x=>x.path).slice(0,200).map(x=>({id:nodeRef('note',x.path),name:'Nota · '+x.path})),
   ];
   modal(this,'Nova relação',{id:uid('rel'),campaign,from:items[0]?.id||'',to:items[1]?.id||'',type:'ally'},(root,d)=>{
     info(root,'Campanha: '+(this.m.campaigns.find(x=>x.id===campaign)?.name||'Campanha selecionada'));
     d.campaign=campaign;
     labelled(root,'Origem',items.map(x=>[x.id,x.name]),d.from,v=>{d.from=v;});
     labelled(root,'Destino',items.map(x=>[x.id,x.name]),d.to,v=>{d.to=v;});
     labelled(root,'Tipo',Object.entries(RELATION_TYPES),d.type,v=>{d.type=v;});
     info(root,'O vínculo pertence à campanha escolhida. Para relações vindas de notas, também é possível usar frontmatter, como ally: "[[Nome]]".');
   },async d=>{
     requireMesa(d.from&&d.to&&d.from!==d.to,'Selecione dois elementos diferentes.');
     await this.save(a=>a.relations.push(d));this.campaign=d.campaign;this.render();
   });
 }
}
async function openAtlas(plugin,panelName='maps',mapId=''){
 const workspace=plugin.app.workspace,existing=workspace.getLeavesOfType(ATLAS_VIEW);
 let leaf=existing[0];
 if(!leaf){leaf=workspace.getLeaf('tab');await leaf.setViewState({type:ATLAS_VIEW,active:true});}
 await workspace.revealLeaf(leaf);
 const view=leaf.view;
 if(panelName)view.panel=panelName;
 if(mapId)view.mapId=mapId;
 view.render();
 return view;
}
function registerAtlasEmbeds(plugin){
 const Base=MarkdownRenderChild||class {};
 for(const name of ['brpg-mapa','brpg-relacoes']){
   plugin.registerMarkdownCodeBlockProcessor(name,(source,host,ctx)=>{
     class Embed extends Base{
       constructor(){super(host);}
       onload(){plugin.atlasEmbeds.add(this);this.render();}
       onunload(){plugin.atlasEmbeds.delete(this);}
       render(){
         host.replaceChildren();const root=el(host,'section','brpg brpg-atlas-embed');
         try{
           const sourceTrim=source.trim();
           const config=sourceTrim?sourceTrim.startsWith('{')?JSON.parse(sourceTrim):parseYaml(sourceTrim):{};
           requireMesa(config&&typeof config==='object'&&!Array.isArray(config),'Configuração inválida.');
           const atlas=plugin.mesa().atlas||blankAtlas();
           if(name==='brpg-mapa'){
             const map=find(atlas.maps,config.ref||config.map||'');
             requireMesa(!!map,'Mapa não encontrado. Use ref: Nome ou ID.');
             el(root,'h3','brpg-section-title',map.name);
             const mapCanvas=el(root,'div','brpg-atlas-canvas');
             const backgroundFile=map.background?plugin.app.vault.getAbstractFileByPath(map.background):null;
             renderMapCanvas(mapCanvas,map,{background:backgroundFile instanceof TFile?plugin.app.vault.getResourcePath(backgroundFile):'',gm:config.view!=='player',zoom:1,
               getTileUrl:path=>{const file=plugin.app.vault.getAbstractFileByPath(path);return file instanceof TFile?plugin.app.vault.getResourcePath(file):'';},
               onPick:at=>plugin.attempt(async()=>{const view=await openAtlas(plugin,'maps',map.id);
                 view.selected=at;view.render();})});
             button(root,'Abrir Atlas',action(plugin,()=>openAtlas(plugin,'maps',map.id)),{icon:'map'});
           }else{
             const campaign=config.campaign?find(plugin.mesa().campaigns,config.campaign)?.id||'':'';
             const notes=mapNotes(plugin),graph=relationGraph(plugin.mesa(),atlas,campaign,notes);
             const focus=config.center?'note:'+String(config.center).replace(/^\[\[|\]\]$/g,''):config.focus||'';
             const subset=subgraph(graph,focus,Number(config.depth||1),[]);
             el(root,'h3','brpg-section-title','Relações');
             info(root,subset.nodes.length+' nós · '+subset.edges.length+' conexões');
             AtlasView.prototype.drawGraph.call({plugin,focus,graphStyle:config.tree?'tree':'radial'},root,subset);
             button(root,'Abrir diagrama',action(plugin,async()=>{const view=await openAtlas(plugin,'relations');view.campaign=campaign;view.focus=focus;view.render();}),{icon:'network'});
           }
         }catch(e){info(root,e?.message||'Não foi possível abrir o bloco.');}
       }
     }
     ctx.addChild(new Embed());
   });
 }
}
function renameAtlasNotes(m,oldPath,newPath){
 if(!m.atlas)return false;
 const move=x=>typeof x==='string'&&(x===oldPath||x.startsWith(oldPath+'/'))?newPath+x.slice(oldPath.length):x;
 let changed=false;
 for(const map of m.atlas.maps){
   const background=move(map.background);
   if(background!==map.background){map.background=background;changed=true;}
   for(const c of Object.values(map.cells))for(const field of ['note','table','tile']){
     const next=move(c[field]);if(next!==c[field]){c[field]=next;changed=true;}
   }
 }
 for(const r of m.atlas.relations)for(const field of ['from','to']){
   if(r[field]?.startsWith('note:')){
     const next=move(r[field].slice(5));
     if(next!==r[field].slice(5)){r[field]='note:'+next;changed=true;}
   }
 }
 return changed;
}
function setupAtlas(plugin){
 plugin.atlasEmbeds=new Set();
 plugin.registerView(ATLAS_VIEW,leaf=>new AtlasView(leaf,plugin));
 plugin.addRibbonIcon('map','Basic RPG · Atlas',()=>plugin.attempt(()=>plugin.openAtlas()));
 plugin.addCommand({id:'atlas-open',name:'Atlas · Abrir mapas',callback:()=>plugin.attempt(()=>plugin.openAtlas('maps'))});
 plugin.addCommand({id:'atlas-relations',name:'Atlas · Abrir relações',callback:()=>plugin.attempt(()=>plugin.openAtlas('relations'))});
 registerAtlasEmbeds(plugin);
}
module.exports={ATLAS_VIEW,AtlasView,openAtlas,setupAtlas,renameAtlasNotes,makeHexNote,mapNotes};
