// Stored preferences are not proof. Only trusted source fields reach this layer.
export function evaluateConditions(card,c) {
  const checks=[];const put=(key,label,status,basis)=>checks.push({key,label,status,basis});
  put('distance','직선거리',Number.isFinite(card.distanceMeters)&&card.distanceMeters<=c.radiusMeters?'confirmed':'failed',card.originLabel+' 기준 좌표 계산');
  const facts=card.registeredFacts||{},menus=Array.isArray(facts.menus)?facts.menus:[];
  if(c.food){const exact=menus.some(menu=>menu.name.includes(c.food)),broad=/^(한식|중식|일식|양식|분식|카페|고기)$/.test(c.food),category=String(facts.category||'');put('food','음식·메뉴',exact||broad&&category.includes(c.food)?'confirmed':'unknown',exact?'앱 등록 메뉴':broad&&category.includes(c.food)?'앱 등록 업종':'메뉴 판매 여부 미확인');}
  if(c.budget){
    const match=c.budget.match(/([\d,.]+)\s*(만)?\s*원/),limit=match?Number(match[1].replace(/,/g,''))*(match[2]?10000:1):null;
    const relevant=menus.filter(menu=>menu.mainDish===true&&Number.isFinite(menu.priceKRW)&&(!c.food||/^(한식|중식|일식|양식|분식|카페|고기)$/.test(c.food)||menu.name.includes(c.food)));
    const passing=relevant.some(menu=>/미만/.test(c.budget)?menu.priceKRW<limit:menu.priceKRW<=limit);
    put('budget','예산',limit&&passing?'confirmed':limit&&relevant.length?'failed':'unknown',passing?'등록된 주 메뉴 가격 기준':limit&&relevant.length?'확인된 해당 주 메뉴 가격이 예산을 초과해요':'조건에 맞는 주 메뉴 가격 미확인');
  }
  if(c.companion==='혼밥'){
    const records=card.recommendationBundle?[card.recommendationBundle.representative,...card.recommendationBundle.additional].filter(Boolean):[];
    const experience=records.some(r=>/혼밥|혼자|1인/.test(r.reason||'')&&!/불편|어렵|불가|안\s*좋|추천하지/.test(r.reason||''));
    put('companion','혼밥',facts.soloEvidence?.confirmed===true?'confirmed':experience?'experience':'unknown',facts.soloEvidence?.confirmed?'앱 등록 1인 이용 정보':experience?'추천인의 경험(좌석 보장 아님)':'1인 이용 근거 미확인');
  }else if(c.companion||c.people||c.purpose)put('companion','인원·방문 목적','unknown','좌석·수용 인원 미확인');
  if(c.parking)put('parking','주차','unknown','주차 정보 미확인');
  if(c.vibe)put('vibe','분위기','unknown','주관적 선호로 기록, 매장 확인 필요');
  if(c.visit)put('visit','방문 시간 영업 여부','unknown','해당 방문 시점의 영업정보 미연결');
  return {status:checks.some(x=>x.status==='failed')?'failed':checks.some(x=>x.status==='unknown')?'unconfirmed':checks.some(x=>x.status==='experience')?'experience':'confirmed',checks};
}
export const conditionSignature=c=>JSON.stringify(c);
