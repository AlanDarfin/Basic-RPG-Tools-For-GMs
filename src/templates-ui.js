'use strict';
const { Modal } = require('obsidian');
const { el, button, info, CalendarEditor } = require('./ui');
const { CALENDAR_TEMPLATES, makeTemplate } = require('./calendar-presets');
class CalendarTemplatesModal extends Modal {
 constructor(plugin){super(plugin.app);this.plugin=plugin;}
 onOpen(){
   const root=this.contentEl;
   root.replaceChildren();this.modalEl.addClass('brpg-template-modal');
   const wrapper=el(root,'section','brpg brpg-template-picker');
   el(wrapper,'p','brpg-eyebrow','BIBLIOTECA DE MODELOS');
   el(wrapper,'h2','brpg-heading','Criar calendário');
   info(wrapper,'Escolha um exemplo para começar. O original permanece intacto e todas as datas, luas e regras podem ser editadas.');
   const listing=el(wrapper,'div','brpg-template-list');
   for(const preset of CALENDAR_TEMPLATES){
     const item=el(listing,'article','brpg-template-card');
     const title=el(item,'div','brpg-template-card-head');
     el(title,'strong','',preset.name);
     el(title,'span','brpg-chip',preset.category);
     el(item,'p','brpg-hint',preset.description);
     el(item,'small','brpg-hint',preset.details);
     button(item,'Usar e personalizar',()=>{
       const calendar=makeTemplate(preset.id,new Date(this.plugin.clockNow()));
       this.close();
       new CalendarEditor(this.plugin,calendar,true).open();
     },{icon:'copy'});
   }
 }
}
module.exports={CalendarTemplatesModal};
