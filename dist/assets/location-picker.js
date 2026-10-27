import {createBottomSheet,sheetIcon} from './bottom-sheet-v1.js?v=127';

// Search the project's real, supported coordinate catalogue. No geocoder or sample results.
export async function searchSupportedLocations(query='',filter='all'){
  const api=globalThis.InchelinPhase1;
  if(!api?.locationOptions)throw new Error('location catalogue unavailable');
  const key=query.normalize('NFKC').replace(/\s/g,'').toLowerCase();
  return api.locationOptions().filter(row=>(filter==='all'||row.type===filter)&&(!key||(row.label+' '+row.centerLabel).replace(/\s/g,'').toLowerCase().includes(key)));
}

export function createLocationPicker({send,isBusy=()=>false,search=searchSupportedLocations}){
  let opener,previousOverflow='',previousRootOverflow='',selected=null,query='',filter='all',version=0,cleanup=()=>{};
  const sheet=createBottomSheet({titleId:'locationPickerTitle',onClose:()=>{version++;cleanup();document.body.style.overflow=previousOverflow;if(document.documentElement)document.documentElement.style.overflow=previousRootOverflow;opener?.focus?.();}});
  sheet.dialog.classList.add('location-picker');
  sheet.dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const controls=[...sheet.dialog.querySelectorAll('button,input,[tabindex]')].filter(node=>!node.disabled&&!node.hidden&&(!node.getClientRects||node.getClientRects().length));
    if(!controls.length)return;
    const active=document.activeElement,first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&(active===first||!controls.includes(active))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(active===last||!controls.includes(active))){event.preventDefault();first.focus();}
  });
  const make=(tag,cls='',text='')=>{const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};
  let input,clear,list,status,apply,filters;
  const syncViewport=()=>{
    const viewport=globalThis.visualViewport,height=viewport?.height||globalThis.innerHeight||800,offset=viewport?.offsetTop||0;
    const mobile=(globalThis.innerWidth||1024)<768,box=Math.max(0,Math.min(mobile?700:680,height-(mobile?8:48)));
    sheet.dialog.classList[height<600?'add':'remove']('location-compact');
    sheet.dialog.style.height=box+'px';sheet.dialog.style.top=(offset+(mobile?height-box:(height-box)/2))+'px';
  };
  async function refresh(){
    const token=++version;selected=null;apply.disabled=true;clear.hidden=!input.value;list.replaceChildren();status.textContent='검색 중…';list.setAttribute('aria-busy','true');
    for(const b of filters.children)b.setAttribute('aria-pressed',String(b.dataset.filter===filter));
    try{
      const rows=await search(query,filter);if(token!==version||!sheet.dialog.open)return;
      status.textContent=rows.length?'검색 결과 '+rows.length:'검색 결과가 없어요. 지원하는 동네·역 이름으로 다시 검색해 주세요.';
      rows.forEach(row=>{
        const choice=make('button','location-result');choice.type='button';choice.setAttribute('role','radio');choice.setAttribute('aria-checked','false');choice.setAttribute('aria-label',row.label+' '+(row.type==='station'?'지하철역':'지역'));
        choice.append(sheetIcon('pin'));
        const copy=make('span','location-result-copy'),head=make('span','location-result-head');
        head.append(make('span','location-result-name',row.label),make('span','location-type',row.type==='station'?'지하철역':'지역'));
        copy.append(head,make('span','location-result-detail',row.detail));
        const radio=make('span','location-radio');radio.setAttribute('aria-hidden','true');choice.append(copy,radio);
        choice.addEventListener('click',()=>{selected=row;apply.disabled=false;for(const item of list.children)item.setAttribute('aria-checked',String(item===choice));});
        choice.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const rows=[...list.children],index=rows.indexOf(choice),next=event.key==='Home'?0:event.key==='End'?rows.length-1:(index+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length;rows[next]?.focus();rows[next]?.click();});
        list.append(choice);
      });
    }catch{
      if(token!==version||!sheet.dialog.open)return;
      status.textContent='위치 목록을 불러오지 못했어요.';
      const retry=make('button','location-retry','다시 시도');retry.type='button';retry.addEventListener('click',refresh);list.append(retry);
    }finally{if(token===version)list.setAttribute('aria-busy','false');}
  }
  function open(){
    if(isBusy())return;
    if(sheet.dialog.open){input.focus();return;}
    opener=document.activeElement;previousOverflow=document.body.style.overflow;previousRootOverflow=document.documentElement?.style.overflow||'';document.body.style.overflow='hidden';if(document.documentElement)document.documentElement.style.overflow='hidden';selected=null;query='';filter='all';
    sheet.open('어디에서 찾을까요?');
    const description=make('p','location-picker-description','동네나 역 이름을 검색해 주세요.');
    const searchBox=make('div','location-search');input=make('input');input.type='search';input.value='';input.maxLength=60;input.placeholder='동네·역 이름 검색';input.autocomplete='off';input.setAttribute('aria-label','동네나 역 이름 검색');
    clear=make('button','location-clear');clear.type='button';clear.setAttribute('aria-label','검색어 지우기');clear.append(sheetIcon('close'));clear.hidden=true;
    clear.addEventListener('click',()=>{input.value='';query='';refresh();input.focus();});input.addEventListener('input',()=>{query=input.value;refresh();});
    input.addEventListener('keydown',event=>{if(!event.isComposing&&['Enter','ArrowDown'].includes(event.key)){event.preventDefault();list.children[0]?.focus();}});
    searchBox.append(sheetIcon('search'),input,clear);
    filters=make('div','location-filters');filters.setAttribute('aria-label','위치 종류 필터');
    for(const [value,label] of [['all','전체'],['region','지역'],['station','지하철역']]){const button=make('button','location-filter',label);button.type='button';button.dataset.filter=value;button.addEventListener('click',()=>{filter=value;refresh();});filters.append(button);}
    status=make('p','location-status');status.setAttribute('aria-live','polite');status.setAttribute('role','status');
    const scope=make('p','location-scope','현재 등록된 7개 역과 연결된 지역을 검색해요. 주소·노선 정보는 제공되지 않아요.');
    list=make('div','location-results');list.setAttribute('role','radiogroup');list.setAttribute('aria-label','위치 검색 결과');
    const hint=make('p','location-picker-hint','선택한 위치를 기준으로 주변 맛집을 찾아드려요.');
    sheet.body.append(description,searchBox,filters,scope,status,list,hint);
    const cancel=make('button','location-cancel','취소');cancel.type='button';cancel.addEventListener('click',()=>sheet.dialog.close());
    apply=make('button','location-apply','선택하기');apply.type='button';apply.disabled=true;
    apply.addEventListener('click',()=>{if(!selected||isBusy())return;const chosen={...selected};sheet.dialog.close();send(chosen.label+'에서 추천해줘',{locationSelection:chosen});});
    sheet.setActions(cancel,apply);syncViewport();
    const viewport=globalThis.visualViewport;viewport?.addEventListener('resize',syncViewport);viewport?.addEventListener('scroll',syncViewport);globalThis.addEventListener?.('resize',syncViewport);
    cleanup=()=>{viewport?.removeEventListener('resize',syncViewport);viewport?.removeEventListener('scroll',syncViewport);globalThis.removeEventListener?.('resize',syncViewport);};
    input.focus();refresh();
  }
  return {open,dialog:sheet.dialog};
}
