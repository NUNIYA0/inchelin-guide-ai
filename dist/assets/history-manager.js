// Existing browser-local transcript storage remains authoritative. No network or AI calls.
(() => {
  function changedHistories(records,id,action,title,save){
    if(!records.some(r=>r.id===id))throw new Error('history_not_found');
    let next;
    if(action==='rename'){
      const name=String(title||'').trim().slice(0,40);if(!name)throw new Error('empty_title');
      next=records.map(row=>row.id===id?{...row,title:name}:row);
    }else if(action==='delete')next=records.filter(row=>row.id!==id);
    else throw new Error('unknown_history_action');
    save(next); // Persist first; never mutate the live list if this fails.
    return next;
  }
  function create({list,getHistories,setHistories,save,render,restoreFocus,onDeleted,toast}){
    const make=(tag,cls='',text='')=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
    let editing=null,deletingId=null,pending=false,previousOverflow='',previousRootOverflow='';
    const dialog=make('dialog','meal-tools-dialog history-delete-dialog');
    dialog.setAttribute('aria-labelledby','historyDeleteTitle');dialog.setAttribute('aria-describedby','historyDeleteDescription historyDeleteNotice');
    const title=make('h2','','대화를 삭제할까요?');title.id='historyDeleteTitle';
    const description=make('p','history-delete-name');description.id='historyDeleteDescription';
    const notice=make('p','history-delete-notice','이 브라우저에 저장된 대화 기록이 삭제되며, 앱에서 복구할 수 없어요.');notice.id='historyDeleteNotice';
    const error=make('p','history-delete-error');error.setAttribute('role','alert');error.hidden=true;
    const actions=make('div','history-delete-actions'),cancel=make('button','history-delete-cancel','취소'),remove=make('button','history-delete-confirm','삭제');
    cancel.type=remove.type='button';actions.append(cancel,remove);dialog.append(title,description,notice,error,actions);document.body.append(dialog);
    function cancelRename(focus=true){
      const edit=editing;if(!edit)return;editing=null;edit.done=true;
      edit.input.replaceWith(edit.button);edit.row.classList.remove('renaming');
      if(focus)restoreFocus(edit.id);
    }
    function rename(id){
      cancelRename(false);const record=getHistories().find(r=>r.id===id);
      const button=[...list.querySelectorAll('[data-open-history]')].find(b=>b.dataset.openHistory===id);
      if(!record||!button)return;
      const input=make('input','history-title-input');input.type='text';input.value=record.title;input.maxLength=40;
      input.setAttribute('aria-label','대화 이름');input.setAttribute('aria-description','Enter로 저장, Esc로 취소해요.');
      const row=button.closest('.history-row'),edit={id,input,button,row,done:false};editing=edit;row.classList.add('renaming');button.replaceWith(input);
      input.addEventListener('click',event=>event.stopPropagation());
      input.addEventListener('keydown',event=>{
        if(event.isComposing||event.keyCode===229)return;
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelRename();return;}
        if(event.key!=='Enter')return;event.preventDefault();event.stopPropagation();
        const value=input.value.trim();if(!value){toast('대화 이름을 입력해 주세요.');return;}
        try{
          const next=changedHistories(getHistories(),id,'rename',value,save);
          edit.done=true;editing=null;setHistories(next);render();restoreFocus(id);
        }catch{cancelRename();toast('이름을 저장하지 못했어요. 기존 제목을 유지했어요.');}
      });
      input.addEventListener('blur',()=>{if(!edit.done)cancelRename(false);});
      input.focus();input.select();
    }
    function closeDelete(){if(!pending)dialog.close();}
    function requestDelete(id){
      cancelRename(false);if(pending)return;
      const record=getHistories().find(r=>r.id===id);if(!record)return;
      deletingId=id;description.textContent=record.title;error.textContent='';error.hidden=true;remove.disabled=cancel.disabled=false;remove.textContent='삭제';
      previousOverflow=document.body.style.overflow;previousRootOverflow=document.documentElement.style.overflow;
      document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';
      dialog.showModal();cancel.focus();
    }
    cancel.addEventListener('click',closeDelete);
    remove.addEventListener('click',()=>{
      if(pending||!deletingId)return;pending=true;remove.disabled=cancel.disabled=true;remove.textContent='삭제 중';dialog.setAttribute('aria-busy','true');
      const id=deletingId;
      try{
        const next=changedHistories(getHistories(),id,'delete',null,save);
        setHistories(next);render();pending=false;dialog.close();onDeleted(id);
      }catch{
        pending=false;error.textContent='대화를 삭제하지 못했어요. 기존 목록은 유지됐어요. 다시 시도해 주세요.';error.hidden=false;remove.focus();
      }finally{remove.disabled=cancel.disabled=false;remove.textContent='삭제';dialog.removeAttribute('aria-busy');if(!error.hidden)remove.focus();}
    });
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeDelete();});
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDelete();});
    dialog.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.stopPropagation();return;}
      if(event.key!=='Tab')return;const controls=[cancel,remove].filter(b=>!b.disabled);if(!controls.length){event.preventDefault();return;}
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    dialog.addEventListener('close',()=>{
      document.body.style.overflow=previousOverflow;document.documentElement.style.overflow=previousRootOverflow;
      const id=deletingId;deletingId=null;restoreFocus(id);
    });
    return Object.freeze({rename,requestDelete,cancelRename});
  }
  globalThis.InchelinHistoryUI=Object.freeze({create,changedHistories});
})();
