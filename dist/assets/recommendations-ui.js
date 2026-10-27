// Contains no recommendation records. The server supplies exact authored pairs.
(() => {
  const active=()=>globalThis.InchelinRecommendationFlags?.enabled===true&&globalThis.InchelinRecommendationFlags?.connected===true;
  function normalize(bundle){
    if(!active()||!bundle||!['matched','unmatched','ambiguous'].includes(bundle.status))return null;
    const clean=r=>r&&typeof r.id==='string'?{id:r.id,recommenderName:typeof r.recommenderName==='string'?r.recommenderName:null,reason:typeof r.reason==='string'?r.reason:null,writtenAt:r.writtenAt||null}:null;
    const representative=clean(bundle.representative),additional=Array.isArray(bundle.additional)?bundle.additional.map(clean).filter(Boolean):[];
    const records=[...new Map([representative,...additional].filter(Boolean).map(r=>[r.id,r])).values()];
    return {status:bundle.status,representative:records[0]||null,additional:records.slice(1),totalCount:records.length};
  }
  function render(raw){
    const bundle=normalize(raw);if(!bundle)return null;
    const section=document.createElement('section');section.className='registered-recommendations';section.setAttribute('aria-label','등록된 추천');
    const pair=record=>{
      const item=document.createElement('div');item.className='registered-recommendation';
      const name=document.createElement('p');name.className='recommender-name';
      const nameLabel=document.createElement('span');nameLabel.className='recommendation-label';nameLabel.textContent='추천인';
      const nameValue=document.createElement('span');nameValue.className='recommendation-value';nameValue.textContent=record.recommenderName?.trim()?record.recommenderName:'추천인 정보 없음';name.append(nameLabel,nameValue);
      const reason=document.createElement('p');reason.className='authored-reason';
      const reasonLabel=document.createElement('span');reasonLabel.className='recommendation-label';reasonLabel.textContent='추천 이유';
      const reasonValue=document.createElement('span');reasonValue.className='recommendation-value';reasonValue.textContent=record.reason?.trim()?'“'+record.reason+'”':'추천 이유 없음';if(!record.reason?.trim())reasonValue.className+=' missing-authored-reason';reason.append(reasonLabel,reasonValue);
      item.append(name,reason);return item;
    };
    if(!bundle.representative){const empty=document.createElement('p');empty.className='recommendations-empty';empty.textContent='등록된 추천이 없어요';section.append(empty);return section;}
    section.append(pair(bundle.representative));
    if(bundle.additional.length){
      const extra=document.createElement('div');extra.className='additional-recommendations';extra.hidden=true;
      const heading=document.createElement('p');heading.className='recommendations-separator';heading.textContent='── 다른 추천 '+bundle.additional.length+'개 ──';extra.append(heading,...bundle.additional.map(pair));
      const toggle=document.createElement('button');toggle.type='button';toggle.className='recommendations-toggle';toggle.setAttribute('aria-expanded','false');
      const more='다른 추천 '+bundle.additional.length+'개 보기';toggle.textContent=more;
      toggle.addEventListener('click',event=>{event?.stopPropagation?.();extra.hidden=!extra.hidden;toggle.setAttribute('aria-expanded',String(!extra.hidden));toggle.textContent=extra.hidden?more:'다른 추천 접기';});
      section.append(extra,toggle);
    }
    return section;
  }
  globalThis.InchelinRecommendationsUI=Object.freeze({normalize,render});
})();
