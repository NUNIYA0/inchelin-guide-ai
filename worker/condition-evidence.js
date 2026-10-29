import {menuMatches} from './menu-matching.js';
import {preferredMenus,foodDirectionLabel,foodDirectionScore} from './food-preferences.js';
// Stored preferences are not proof. Only trusted source fields reach this layer.
export const broadFood=food=>/^(한식|중식|일식|양식|분식|카페|고기)$/.test(food||'');
export function unknownScopes(c){return [c.foodDirection&&{key:'food_direction',label:foodDirectionLabel(c.foodDirection)},c.food&&!broadFood(c.food)&&{key:'menu',label:'메뉴 판매 여부'},c.budget&&{key:'budget',label:'가격'},(c.companion||c.people||c.purpose)&&{key:'companion',label:'인원·좌석'},c.vibe&&{key:'vibe',label:'분위기'},c.parking&&{key:'parking',label:'주차'},c.requireOpen&&{key:'visit',label:'해당 시간의 영업 여부'}].filter(Boolean);}
export function consentKeys(prior,c,latest){
  const allowed=new Set(['food_category','menu','food_direction','budget','companion','vibe','parking','visit']);
  let accepted=Array.isArray(prior.acceptedUnknowns)?prior.acceptedUnknowns.filter(key=>allowed.has(key)):[];
  const scopeValue=(key,value={})=>JSON.stringify(['menu','food_category'].includes(key)?value.food:key==='food_direction'?value.foodDirection:key==='budget'?[value.budget,value.food,value.foodDirection]:key==='companion'?[value.companion,value.people,value.purpose]:key==='visit'?[value.visit,value.visitAt,value.requireOpen]:value[key]);
  // Moving/radius changes keep consent; a different unknown criterion does not.
  if(prior.conditions)accepted=accepted.filter(key=>scopeValue(key,prior.conditions)===scopeValue(key,c));
  if(!accepted.length&&prior.consentSignature===conditionSignature(prior.conditions))accepted=unknownScopes(prior.conditions||{}).map(item=>item.key);
  if(prior.conditions)accepted=accepted.filter(key=>scopeValue(key,prior.conditions)===scopeValue(key,c));
  if(/미확인.*(?:후보|조건).*(?:보여|볼게|동의)|미확인 후보 보기/.test(latest))accepted.push(...(prior.pendingUnknowns||[]).filter(key=>allowed.has(key)));
  return [...new Set(accepted)];
}
function openingStatus(facts,c){
  const schedule=facts.openingSchedule,at=Date.parse(c.visitAt);
  if(!schedule?.source||!Number.isFinite(at)||schedule.timeZone!=='Asia/Seoul'||at<Date.parse(schedule.validFrom)||at>=Date.parse(schedule.validUntil)||!Number.isFinite(Date.parse(schedule.validFrom))||!Number.isFinite(Date.parse(schedule.validUntil)))return 'unknown';
  const local=new Date(at+9*3600000),minute=local.getUTCHours()*60+local.getUTCMinutes();
  return schedule.hours.some(h=>minute>=h.startMinute&&minute<h.endMinute)?'confirmed':'failed';
}
export function evaluateConditions(card,c) {
  const checks=[];const put=(key,label,status,basis,blocking=true)=>checks.push({key,label,status,basis,blocking});
  if(c.location?.kind==='region')put('region','지역',card.registeredRegionId===c.location.regionId?'confirmed':'failed','앱 등록 주소의 시·군·구');
  else put('distance','직선거리',Number.isFinite(card.distanceMeters)&&card.distanceMeters<=c.radiusMeters?'confirmed':'failed',card.originLabel+' 기준 좌표 계산');
  const facts=card.registeredFacts||{},menus=Array.isArray(facts.menus)?facts.menus:[];
  if(c.foodDirection){const matching=preferredMenus(menus,c);put('food_direction',foodDirectionLabel(c.foodDirection),matching.length?'confirmed':'unknown',matching.length?'등록된 메뉴 이름을 바탕으로 음식 방향 확인':'원하신 음식 방향에 맞는 등록 메뉴 미확인');}
  if(c.food){if(broadFood(c.food)){const category=String(facts.category||card.rawCategory||card.category||'');put('food_category','업종',category.includes(c.food)?'confirmed':'unknown',category.includes(c.food)?(facts.category?'앱 등록 업종':'네이버 업종 정보'):'요청 업종 여부 미확인');}else{const exact=menus.some(menu=>menuMatches(c.food,menu.name));put('menu','특정 메뉴 판매',exact?'confirmed':'unknown',exact?'앱 등록 판매 메뉴':'해당 메뉴 판매 여부는 확인되지 않았어요');}}
  if(c.budget){
    const match=c.budget.match(/([\d,.]+)\s*(만)?\s*원/),limit=match?Number(match[1].replace(/,/g,''))*(match[2]?10000:1):null;
    const relevant=menus.filter(menu=>menu.mainDish===true&&Number.isFinite(menu.priceKRW)&&(!c.foodDirection||foodDirectionScore(c.foodDirection,menu.name)>0)&&(!c.food||/^(한식|중식|일식|양식|분식|카페|고기)$/.test(c.food)||menuMatches(c.food,menu.name)));
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
  if(c.visit||c.requireOpen){const status=openingStatus(facts,c);put('visit','해당 시간 영업',status,status==='unknown'?'해당 시간의 영업 여부는 확인되지 않았어요':status==='confirmed'?'요청 시점에 적용되는 등록 영업정보':'해당 시각은 등록 영업시간 밖이에요',c.requireOpen===true);}
  const required=checks.filter(check=>check.blocking);
  return {status:required.some(x=>x.status==='failed')?'failed':required.some(x=>x.status==='unknown')?'unconfirmed':required.some(x=>x.status==='experience')?'experience':'confirmed',checks};
}
export const conditionSignature=c=>JSON.stringify(c);
