import {createBottomSheet} from './bottom-sheet-v1.js?v=127';
const api=globalThis.InchelinPhase1;
export function mountPhase1Sheets({send,locate,isBusy}){
  const sheet=createBottomSheet({titleId:'phase1ConditionTitle'});
  const make=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;node.className=cls;return node;};
  const button=(text,action)=>{const b=make('button',text,'meal-chip');b.type='button';b.addEventListener('click',action);return b;};
  function open(key='location'){
    if(isBusy())return;
    const titles={location:'지역·역 선택',radiusMeters:'직선거리 변경',food:'음식 종류 변경',budget:'예산 변경',companion:'동행 변경',people:'인원 변경',visit:'방문 날짜·시간',purpose:'방문 목적',vibe:'분위기 선호',parking:'주차 선호'};
    sheet.open(titles[key]||'조건 변경');
    const finish=message=>{sheet.dialog.close();send(message);};
    if(key==='location'){
      const current=button('현재 위치로 찾기',()=>{sheet.dialog.close();locate('지금 내 주변에서 찾아줘');});current.className='primary-action';sheet.body.append(current);
      sheet.body.append(make('p','역 이름을 바로 입력하거나 아래에서 골라주세요.','meal-muted'));
    }
    const chips=make('div','','meal-chips');
    const options=key==='location'?api.centers.map(c=>[c.label,c.label+'에서 추천해줘']):key==='radiusMeters'?[['500m 이내','500m 이내로 찾아줘'],['1km 이내','1km 이내로 찾아줘'],['2km 이내','2km 이내로 찾아줘']]:key==='food'?['한식','중식','일식','양식','파스타','냉면','삼겹살','국밥','카페'].map(food=>[food,food+' 먹을 곳 찾아줘']):key==='budget'?[['1만 원 이하','1만 원 이하로 찾아줘'],['2만 원 이하','2만 원 이하로 찾아줘'],['제한 없음','예산 제한 없애줘']]:key==='companion'?[['혼밥','혼자 먹을 거야'],['동료','동료와 먹을 거야'],['가족','가족과 먹을 거야'],['해제','동행 조건 해제해줘']]:key==='purpose'?[['회식','회식할 거야'],['데이트','데이트할 거야'],['접대','접대할 거야']]:[];
    options.forEach(([label,message])=>chips.append(button(label,()=>finish(message))));sheet.body.append(chips);
    const input=make('input');input.type='text';input.maxLength=80;input.placeholder=key==='location'?'동네나 역 이름 직접 입력':key==='radiusMeters'?'예: 700m 안으로':key==='budget'?'예: 1만 5천 원 이하':key==='visit'?'예: 내일 저녁에 갈 거야':'원하는 조건을 직접 입력해 주세요';input.setAttribute('aria-label',titles[key]||'조건 직접 입력');sheet.body.append(input);
    const submit=make('button','이 조건으로 찾기','primary-action');submit.type='button';submit.disabled=true;
    input.addEventListener('input',()=>submit.disabled=!input.value.trim());
    const apply=()=>{const value=input.value.trim();if(!value||isBusy())return;finish(key==='location'?value+'에서 추천해줘':key==='food'?value+' 먹을 곳 찾아줘':value);};
    submit.addEventListener('click',apply);input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();apply();}});sheet.setActions(submit);
  }
  return {open,dialog:sheet.dialog};
}
