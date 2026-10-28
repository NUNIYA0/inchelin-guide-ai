import {createBottomSheet,sheetIcon} from './bottom-sheet-v1.js?v=127';

// Search the project's real, supported coordinate catalogue. No geocoder or sample results.
export async function searchSupportedLocations(query='',filter='all'){
  const api=globalThis.InchelinPhase1;
  if(!api?.locationOptions)throw new Error('location catalogue unavailable');
  const key=query.normalize('NFKC').replace(/\s/g,'').toLowerCase();
  return api.locationOptions().filter(row=>(filter==='all'||row.type===filter)&&(!key||(row.label+' '+row.centerLabel).replace(/\s/g,'').toLowerCase().includes(key)));
}

export function createLocationPicker({send,isBusy=()=>false,search=searchSupportedLocations,regionData=globalThis.InchelinLocationRegions,loadStations=async(region,q='')=>{
  const response=await fetch('/api/location-stations?'+new URLSearchParams({region:region||'',q}));if(!response.ok)throw new Error('station_search_failed');return (await response.json()).stations;
}}){
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
  let input,clear,list,status,apply,filters,scope,provinceList,browser,province=null,region=null;
  const hierarchy=Boolean(regionData?.regions?.length);
  if(hierarchy)sheet.dialog.classList.add('location-picker-hierarchical');
  const browse=()=>refresh().then(()=>{if(sheet.dialog.open&&document.activeElement!==input)list.children[0]?.focus();});
  function breadcrumbs(){
    if(!hierarchy)return;
    scope.replaceChildren();
    scope.append(make('span','location-heading',query.trim()?'검색 결과':region?province+' · '+region.district:province+' 지역'));
    if(region||query.trim()){
      const back=make('button','location-back',query.trim()?'지역 목록':'지역 바꾸기');back.type='button';back.addEventListener('click',()=>{region=null;query='';input.value='';browse();});scope.append(back);
    }
    provinceList.replaceChildren();
    regionData.provinces.forEach(row=>{
      const button=make('button','location-province',row.label);button.type='button';button.setAttribute('aria-pressed',String(row.id===province));button.setAttribute('aria-label',row.label+' 등록 맛집 '+row.count+'곳');
      button.addEventListener('click',()=>{province=row.id;region=null;query='';input.value='';filter='all';browse();});provinceList.append(button);
    });
    browser.classList[query.trim()?'add':'remove']('location-searching');
  }
  const syncViewport=()=>{
    const viewport=globalThis.visualViewport,height=viewport?.height||globalThis.innerHeight||800,offset=viewport?.offsetTop||0;
    const mobile=(globalThis.innerWidth||1024)<768;
    const preferred=mobile?Math.max(570,Math.round(height*.70)):680;
    const box=Math.max(0,Math.min(mobile?700:680,preferred,height-(mobile?8:48)));
    sheet.dialog.classList[height<600?'add':'remove']('location-compact');
    sheet.dialog.style.height=box+'px';sheet.dialog.style.top=(offset+(mobile?height-box:(height-box)/2))+'px';
  };
  async function refresh(){
    const token=++version;selected=null;apply.disabled=true;clear.hidden=!input.value;list.replaceChildren();list.scrollTop=0;status.textContent='검색 중…';list.setAttribute('aria-busy','true');
    for(const b of filters.children){b.setAttribute('aria-pressed',String(b.dataset.filter===filter));b.disabled=hierarchy&&!region&&!query.trim()&&b.dataset.filter==='station';}
    breadcrumbs();
    try{
      let rows;
      if(!hierarchy)rows=await search(query,filter);
      else if(query.trim()){
        const key=query.replace(/\s/g,'');
        const areas=regionData.regions.filter(r=>r.label.replace(/\s/g,'').includes(key)).map(r=>({...r,type:'district',detail:'등록 맛집 '+r.count+'곳'}));
        let stations=[];if(filter!=='region'){try{stations=await loadStations('',query);}catch{if(!areas.length)throw new Error('station_search_failed');}}
        const named=stations.filter(s=>{const term=query.replace(/\s/g,''),name=s.label.replace(/\s/g,'');return name.includes(term)||term.includes(name)||term.includes(name.replace(/역$/,''));});
        rows=[...areas,...named];
      }else if(region)rows=await loadStations(region.id,'');
      else if(province)rows=regionData.regions.filter(r=>r.province===province).map(r=>({...r,type:'district',label:r.district,detail:r.count+'곳'}));
      else rows=regionData.provinces.map(r=>({...r,type:'province',detail:'등록 맛집 '+r.count+'곳'}));
      if(token!==version||!sheet.dialog.open)return;
      status.textContent=rows.length?(hierarchy?(query.trim()?rows.length+'개 결과':region?rows.length+'개 역':rows.length+'개 지역'):'검색 결과 '+rows.length):region?'확인된 역이 없어요. 역 이름으로 검색하거나 다른 지역을 골라주세요.':'검색 결과가 없어요. 다른 이름으로 검색해 주세요.';
      list.setAttribute('role',hierarchy&&!region&&!query?'group':'radiogroup');
      if(hierarchy)list.className='location-results'+(!region&&!query?' location-district-grid':'');
      rows.forEach(row=>{
        if(['province','district'].includes(row.type)){
          const navigation=make('button','location-result location-region');navigation.type='button';navigation.setAttribute('aria-label',row.label+' 등록 맛집 '+row.count+'곳');
          navigation.append(make('span','location-result-name',row.label),make('span','location-region-count',row.count+'곳'));
          navigation.addEventListener('click',()=>{if(row.type==='province'){province=row.id;region=null;}else{region=row;province=row.province;}query='';input.value='';filter='all';browse();});list.append(navigation);return;
        }
        const choice=make('button','location-result');choice.type='button';choice.setAttribute('role','radio');choice.setAttribute('aria-checked','false');choice.setAttribute('aria-label',row.label+' '+(row.type==='station'?'지하철역':'지역'));
        choice.append(sheetIcon('pin'));
        const copy=make('span','location-result-copy'),head=make('span','location-result-head');
        head.append(make('span','location-result-name',row.label));if(!hierarchy)head.append(make('span','location-type',row.type==='station'?'지하철역':'지역'));
        copy.append(head,make('span','location-result-detail',row.detail));
        choice.append(copy);
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
    opener=document.activeElement;previousOverflow=document.body.style.overflow;previousRootOverflow=document.documentElement?.style.overflow||'';document.body.style.overflow='hidden';if(document.documentElement)document.documentElement.style.overflow='hidden';selected=null;query='';filter='all';province=hierarchy?[...regionData.provinces].sort((a,b)=>b.count-a.count)[0]?.id:null;region=null;
    sheet.open('어디에서 찾을까요?');
    const description=make('p','location-picker-description',hierarchy?'지역을 고르거나 역 이름을 바로 검색하세요.':'동네나 역 이름을 검색해 주세요.');
    const searchBox=make('div','location-search');input=make('input');input.type='search';input.value='';input.maxLength=60;input.placeholder='동네·역 이름 검색';input.autocomplete='off';input.setAttribute('aria-label','동네나 역 이름 검색');
    clear=make('button','location-clear');clear.type='button';clear.setAttribute('aria-label','검색어 지우기');clear.append(sheetIcon('close'));clear.hidden=true;
    clear.addEventListener('click',()=>{input.value='';query='';refresh();input.focus();});input.addEventListener('input',()=>{query=input.value;refresh();});
    input.addEventListener('keydown',event=>{if(!event.isComposing&&['Enter','ArrowDown'].includes(event.key)){event.preventDefault();list.children[0]?.focus();}});
    searchBox.append(sheetIcon('search'),input,clear);
    filters=make('div','location-filters');filters.setAttribute('aria-label','위치 종류 필터');
    for(const [value,label] of [['all','전체'],['region','지역'],['station','지하철역']]){const button=make('button','location-filter',label);button.type='button';button.dataset.filter=value;button.addEventListener('click',()=>{filter=value;if(hierarchy&&value==='region')region=null;refresh();});filters.append(button);}
    status=make('p','location-status');status.setAttribute('aria-live','polite');status.setAttribute('role','status');
    scope=make('div','location-scope',hierarchy?'':'현재 등록된 7개 역과 연결된 지역을 검색해요. 주소·노선 정보는 제공되지 않아요.');
    list=make('div','location-results');list.setAttribute('role','radiogroup');list.setAttribute('aria-label','위치 검색 결과');
    const hint=make('p','location-picker-hint',hierarchy?'역을 선택하면 그 주변 맛집을 찾아드려요.':'선택한 위치를 기준으로 주변 맛집을 찾아드려요.');
    if(hierarchy){
      const navigation=make('div','location-navigation');navigation.append(scope,status);
      browser=make('div','location-browser');provinceList=make('div','location-provinces');provinceList.setAttribute('role','group');provinceList.setAttribute('aria-label','시·도 선택');browser.append(provinceList,list);
      sheet.body.append(description,searchBox,navigation,browser,hint);
    }else sheet.body.append(description,searchBox,filters,scope,status,list,hint);
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
