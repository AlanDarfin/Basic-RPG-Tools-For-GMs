'use strict';
const { MarkdownRenderChild, MarkdownView, parseYaml }=require('obsidian');
const { copy,uid }=require('./calendar');
const { el,button,select,input,info }=require('./ui');
const { find,newEntry,newSheet,resource,requireMesa }=require('./mesa');
const { key,clean }=require('./solo');
const {
  CONTENT,roll,activeResources,updateSheetResource,restSheet,executeAction,executeSheetAction,randomContent,
  getAssets,formatAsset,configObject
}=require('./ultra');
const { art }=require('./solo-ui');

function row(root){return el(root,'div','brpg-toolbar brpg-ultra-row');}
function section(root,title,note){
  const box=el(root,'section','brpg-mesa-panel brpg-ultra-panel');
  el(box,'h3','brpg-section-title',title);
  if(note)info(box,note);
  return box;
}
function labelled(root,title,items,value,update) {
  const holder=el(root,'label','brpg-field');
  el(holder,'span','brpg-label',title);
  return select(holder,items,value,update,title);
}
function run(plugin,fn){return ()=>plugin.attempt(fn);}
function activeEditor(plugin){
  const ws=plugin.app.workspace;
  const view=ws.getActiveViewOfType?.(MarkdownView);
  if(view?.editor) return view.editor;
  const editors=(ws.getLeavesOfType?.('markdown')||[]).map(l=>l.view?.editor).filter(Boolean);
  return editors.length===1?editors[0]:null;
}
function output(plugin,root,value,after){
  const controls=row(root);
  button(controls,'Copiar',run(plugin,async()=>{
    if(typeof navigator==='undefined'||!navigator.clipboard?.writeText) throw new Error('Área de transferência indisponível.');
    await navigator.clipboard.writeText(value); if(after)after();
  }),{icon:'copy'});
  button(controls,'Inserir na nota',run(plugin,async()=>{
    const editor=activeEditor(plugin);
    if(!editor)throw new Error('Abra uma nota em edição para inserir o resultado.');
    editor.replaceSelection(value); if(after)after();
  }),{icon:'file-pen-line'});
}
function saveGenerated(plugin,campaign,result){
  requireMesa(!!campaign,'Selecione uma campanha antes de salvar um registro.');
  return plugin.changeMesa(m=>{
    const entry=newEntry(campaign);
    entry.name=clean(result.title);
    entry.kind=result.entryKind||'event';
    entry.summary=clean(result.body,10000);
    m.entries.push(entry);
  });
}
function newGeneratedSheet(plugin,campaign,result){
  requireMesa(result.kind==='npc','Apenas o gerador de NPCs cria fichas diretamente.');
  return plugin.changeMesa(m=>{
    const s=newSheet(campaign||'');
    s.name=clean(result.title);s.kind='npc';s.type='NPC gerado';s.description=clean(result.body,12000);
    s.resources=[resource('Vida',10)];s.initiative='1d20';
    m.sheets.push(s);
  });
}
function externalGenerator(plugin){
  const api=plugin.app.plugins?.plugins?.['fantasy-content-generator']?.api;
  return api && typeof api.generate==='function' && typeof api.keys==='function' ? api:null;
}
function renderGenerator(view,root){
  const plugin=view.plugin,box=section(root,'Geradores conectados',
    'Crie material e salve diretamente na Mesa. O gerador externo é opcional; os modelos locais funcionam sem rede.');
  const state=view.ultraState ||= {kind:'npc',external:'',result:null,assetQuery:'',assetType:'all',assetSheetId:''};
  const ext=externalGenerator(plugin);
  const options=[...Object.entries(CONTENT).map(([id,label])=>[id,label])];
  const xkeys=ext?ext.keys().slice(0,200).filter(x=>typeof x==='string'):[];
  for(const name of xkeys)options.push(['fcg:'+name,'Conteúdo externo · '+name]);
  const selectBox=labelled(box,'Tipo de conteúdo',options,state.kind,v=>{state.kind=v;state.result=null;drawResult();});
  selectBox.value=options.some(x=>x[0]===state.kind)?state.kind:'npc';
  const actions=row(box);
  button(actions,'Gerar conteúdo',run(plugin,async()=>{
    const kind=state.kind;
    if(kind.startsWith('fcg:')){
      requireMesa(!!ext,'O TTRPG Content Generator não está disponível.');
      const name=kind.slice(4);
      const content=String(await ext.generate(name));
      state.result={kind:'external',entryKind:'event',title:name+' · '+(new Date()).toLocaleTimeString('pt-BR'),
        body:clean(content,10000)};
    }else state.result=randomContent(kind);
    drawResult();
  }),{icon:'sparkles',className:'brpg-button mod-cta'});
  const display=el(box,'div','brpg-ultra-output');
  const drawResult=()=>{
    display.replaceChildren();
    const result=state.result;
    if(!result)return info(display,'Selecione um gerador e clique em Gerar conteúdo.');
    el(display,'h4','',result.title);
    el(display,'p','brpg-mesa-prose',result.body);
    output(plugin,display,result.title+'\n'+result.body);
    const current=view.campaign||view.m.campaigns[0]?.id||'';
    const buttons=row(display);
    button(buttons,'Salvar como registro',run(plugin,()=>saveGenerated(plugin,current,result)),
      {icon:'bookmark',disabled:!current});
    if(result.kind==='npc')
      button(buttons,'Criar ficha de NPC',run(plugin,()=>newGeneratedSheet(plugin,current,result)),{icon:'contact-round'});
    if(!current)info(display,'Crie uma campanha para salvar o conteúdo na Mesa.');
  };
  drawResult();
  const trail=section(root,'Da ideia à campanha');
  info(trail,'Fluxo: gerar NPC, salvar ficha, adicionar a um encontro e executar uma ação pelo painel de combate.');
  button(row(trail),'Abrir fichas',()=>view.show('sheets'),{icon:'contact-round'});
  button(row(trail),'Abrir encontros',()=>view.show('encounters'),{icon:'swords'});
}
function renderAssetLibrary(view,root){
  const plugin=view.plugin, s=view.ultraState ||= {kind:'npc',assetQuery:'',assetType:'all',assetSheetId:''};
  const box=section(root,'Biblioteca de recursos','Imagens, tokens, trilhas e notas locais. A busca no Moulinette Cloud usa o plugin externo, se instalado.');
  const query=input(box,'Buscar no cofre',s.assetQuery||'',v=>{s.assetQuery=v;paint();},{maxLength:200});
  query.placeholder='Retrato, mapa, trilha, regras...';
  labelled(box,'Tipo',[['all','Tudo'],['image','Imagens e tokens'],['audio','Áudio'],['note','Notas']],s.assetType||'all',
    v=>{s.assetType=v;paint();});
  const cloud=row(box);
  button(cloud,'Abrir Atlas',run(plugin,()=>plugin.openAtlas()),{icon:'map'});
  const commands=plugin.app.commands?.listCommands?.()||[];
  const moulinette=commands.find(cmd=>/moulinette/i.test(cmd.id)&&/browser|browse|open/i.test(cmd.id))
    ||commands.find(cmd=>/moulinette/i.test(cmd.id));
  if(moulinette){
    button(cloud,'Abrir Moulinette',run(plugin,async()=>{
      const result=plugin.app.commands.executeCommandById(moulinette.id);
      if(result===false)throw new Error('O comando do Moulinette não foi executado.');
    }),{icon:'cloud'});
  }else info(box,'Moulinette Cloud: instale e configure o plugin original para navegar no catálogo externo.');
  const sheets=view.m.sheets.filter(x=>!view.campaign||!x.campaign||x.campaign===view.campaign);
  const sheetOption=labelled(box,'Associar retrato à ficha',[['','Selecionar ficha'],...sheets.map(x=>[x.id,x.name])],
    s.assetSheetId||'',v=>{s.assetSheetId=v;});
  const results=el(box,'div','brpg-ultra-assets');
  function paint(){
    results.replaceChildren();
    const files=getAssets(plugin.app.vault,s.assetQuery,s.assetType,80);
    info(results,files.length+' resultados (máximo 80).');
    for(const f of files){
      const asset=el(results,'div','brpg-ultra-asset');
      const name=el(asset,'div','brpg-ultra-asset-name');
      el(name,'strong','',f.path.split('/').at(-1));
      el(name,'small','brpg-hint',f.path);
      if(/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(f.path)){
        const img=el(asset,'img','brpg-ultra-thumb');img.loading='lazy';img.alt=f.basename||f.path;
        img.src=plugin.app.vault.getResourcePath(f);
      }
      const toolbar=row(asset);
      button(toolbar,'Copiar link',run(plugin,async()=>{
        if(typeof navigator==='undefined'||!navigator.clipboard?.writeText)throw new Error('Área de transferência indisponível.');
        await navigator.clipboard.writeText(formatAsset(f.path));
      }),{icon:'copy',iconOnly:true});
      button(toolbar,'Inserir na nota',run(plugin,()=>{
        const editor=activeEditor(plugin);if(!editor)throw new Error('Abra uma nota para inserir o recurso.');
        editor.replaceSelection(formatAsset(f.path));
      }),{icon:'file-pen-line',iconOnly:true});
      if(/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(f.path)){
        button(toolbar,'Usar como retrato',run(plugin,()=>{
          const id=sheetOption.value;
          requireMesa(!!id,'Selecione uma ficha para associar o retrato.');
          return plugin.changeMesa(m=>{
            const target=m.sheets.find(x=>x.id===id);requireMesa(!!target,'Ficha não encontrada.');
            target.image=f.path;
          });
        }),{icon:'image',iconOnly:true,disabled:!sheets.length});
      }
    }
  }
  paint();
}
function renderSheetTools(plugin,root,sheet){
  if(!plugin.mesa().sheets.some(x=>x.id===sheet.id))return;
  const body=section(root,'Recursos ao vivo','As alterações ficam separadas do modelo original da ficha.');
  const resources=activeResources(plugin.mesa(),sheet);
  if(!resources.length) info(body,'Adicione recursos na edição da ficha para ter contadores interativos.');
  for(const r of resources){
    const line=el(body,'div','brpg-ultra-resource');
    el(line,'strong','',r.name);el(line,'span','brpg-chip',r.value+'/'+r.max);
    button(line,'Diminuir '+r.name,run(plugin,()=>plugin.changeMesa(m=>updateSheetResource(m,sheet.id,r.name,-1))),
      {icon:'minus',iconOnly:true,disabled:r.value===0});
    button(line,'Aumentar '+r.name,run(plugin,()=>plugin.changeMesa(m=>updateSheetResource(m,sheet.id,r.name,1))),
      {icon:'plus',iconOnly:true,disabled:r.value>=r.max});
  }
  button(row(body),'Descanso / restaurar',run(plugin,()=>plugin.changeMesa(m=>restSheet(m,sheet.id))),
    {icon:'moon',disabled:!resources.length});
}
function renderCombat(plugin,view,root,running){
  const box=section(root,'Ações automáticas','Rolagem, custo de recurso, CA e dano são resolvidos juntos quando a ficha os define.');
  const actor=running.members.find(x=>x.id===running.turn);
  if(!actor)return;
  const actions=actor.sheet?.actions||[];
  if(!actions.length)return info(box,actor.name+' não possui ações configuradas. Edite a ficha de origem.');
  const usable=actions.map((a,i)=>[String(i),a.name+(a.damage?' · '+a.damage:'')]);
  const chosen={action:usable[0][0],target:running.members.find(x=>x.id!==actor.id)?.id||''};
  labelled(box,'Ação',usable,chosen.action,v=>{chosen.action=v;});
  labelled(box,'Alvo',[['','Sem alvo'],...running.members.map(x=>[x.id,x.name])],chosen.target,v=>{chosen.target=v;});
  button(row(box),'Rolar e resolver',run(plugin,()=>plugin.changeMesa(m=>{
    executeAction(m,actor.id,Number(chosen.action),chosen.target);
  })),{icon:'dice-5',className:'brpg-button mod-cta'});
  const log=plugin.mesa().activity||[];
  if(log.length){
    const history=el(box,'details','brpg-disclosure');
    el(history,'summary','brpg-summary','Histórico de ações · '+log.length);
    for(const entry of log.slice(0,12)){
      const item=el(history,'article','brpg-ultra-log');
      el(item,'strong','',entry.title);
      el(item,'p','brpg-mesa-prose',entry.detail);
    }
  }
}
function registerBlocks(plugin){
  const Child=MarkdownRenderChild||class {};
  for(const name of ['brpg-painel','brpg-gerador']){
    plugin.registerMarkdownCodeBlockProcessor(name,(source,host,ctx)=>{
      class Panel extends Child {
        constructor(){super(host);}
        onload(){plugin.mesaEmbeds.add(this);this.render();}
        onunload(){plugin.mesaEmbeds.delete(this);}
        render(){
          host.replaceChildren();
          const root=el(host,'section','brpg brpg-mesa-embed brpg-ultra-embed');
          try {
            const config=configObject(source,parseYaml);
            if(name==='brpg-painel'){
              const sheet=find(plugin.mesa().sheets,config.ref||config.sheet);
              requireMesa(!!sheet,'Ficha não encontrada. Informe ref: Nome ou ID.');
              el(root,'h3','brpg-section-title',sheet.name);
              const stats=el(root,'div','brpg-metadata');
              for(const attr of sheet.attributes)el(stats,'span','brpg-chip',attr.name+' '+attr.value);
              renderSheetTools(plugin,root,sheet);
            }else{
              const type=config.type||'npc';
              requireMesa(Object.hasOwn(CONTENT,type),'Tipo de gerador inválido.');
              const result=el(root,'div','brpg-ultra-output');
              const rollNext=()=>{
                const generated=randomContent(type);
                result.replaceChildren();el(result,'strong','',generated.title);
                el(result,'p','brpg-mesa-prose',generated.body);
                const campaign=config.campaign?find(plugin.mesa().campaigns,config.campaign):null;
                if(campaign)button(row(result),'Salvar na campanha',run(plugin,()=>saveGenerated(plugin,campaign.id,generated)),{icon:'bookmark'});
              };
              button(root,'Gerar '+CONTENT[type],rollNext,{icon:'sparkles'});
              rollNext();
            }
          }catch(err){info(root,err?.message||'Erro ao processar bloco.');}
        }
      }
      ctx.addChild(new Panel());
    });
  }
}
function setup(plugin){
  plugin.ultra={executeSheetAction,render:(view,root)=>view.tab==='library'?renderAssetLibrary(view,root):renderGenerator(view,root),
    renderSheetTools:(root,sheet)=>renderSheetTools(plugin,root,sheet),
    renderCombat:(view,root,running)=>renderCombat(plugin,view,root,running)};
  registerBlocks(plugin);
  plugin.addCommand({id:'ultra-generate',name:'Estúdio · Gerar conteúdo de RPG',
    callback:()=>plugin.attempt(()=>plugin.openMesa('studio'))});
  plugin.addCommand({id:'ultra-assets',name:'Biblioteca · Buscar recursos de RPG',
    callback:()=>plugin.attempt(()=>plugin.openMesa('library'))});
}
module.exports={setup,renderGenerator,renderAssetLibrary,renderSheetTools,renderCombat};
