import assert from 'node:assert/strict';
import '../worker/phase1-core.js';
import {actionSchema,readModelPlan,chooseExecution} from '../worker/semantic-contract.js';
import {applyPlan,defaults} from '../worker/conversation-planner.js';
import {finalizeConversationCopy} from '../worker/conversation-copy.js';
import {createRecommendationCatalog} from '../worker/recommendations.js';
import {resolveRegisteredCards} from '../worker/registered-search.js';
import {menuMatches} from '../worker/menu-matching.js';
import {resolveLocation,ambiguousLocationQuestion} from '../worker/location-resolver.js';
const keys=Object.keys(defaults()).filter(k=>k!=='radiusConfirmed');
const raw=extra=>({task:'recommend',action:'search',confidence:0,changes:Object.fromEntries(keys.map(k=>[k,null])),question:null,clarificationReason:null,unknownConsent:null,consentEvidence:null,...extra});
const read=(plan,text)=>readModelPlan(plan,[{role:'user',content:text}]);
const api=globalThis.InchelinPhase1,center=api.centers[0];
const resolver=async value=>({...center,label:value});
let p=raw({action:'clarify',clarificationReason:'missing_location',question:{slot:'location',text:'어디에서 찾을까요?',choices:[]}});
p.changes.food={op:'set',value:'냉면',evidence:'냉면'};p=read(p,'냉면 땡겨');
let applied=await applyPlan(p,{}, {},resolver);assert.equal(applied.conditions.food,'냉면');assert.equal(chooseExecution(p,applied.conditions),'search','missing location reaches required-input executor, rather than losing the food');
let next=raw({action:'clarify',clarificationReason:'missing_location'});next.changes.location={op:'set',value:'홍대입구역',evidence:'홍대입구역'};next.changes.radiusMeters={op:'set',value:1000,evidence:'1km'};
next=read(next,'홍대입구역에서 1km');applied=await applyPlan(next,{phase1:applied},{},resolver);assert.equal(applied.conditions.food,'냉면');assert.equal(applied.conditions.radiusMeters,1000);assert.equal(chooseExecution(next,applied.conditions),'search','already understood location does not stall the turn');
const lunch=raw();lunch.changes.location={op:'set',value:'광화문',evidence:'광화문'};lunch.changes.visit={op:'set',value:'오늘 점심',evidence:'점심'};lunch.changes.radiusMeters={op:'set',value:1000,evidence:'광화문에서 점심 추천해줘'};
const parsed=read(lunch,'광화문에서 점심 추천해줘');assert.ok(!parsed.changes.some(c=>c.slot==='radiusMeters'),'unspoken default cannot become explicit');assert.ok(parsed.changes.some(c=>c.slot==='visit'));
const consent=read(raw({task:'consent',action:'answer',unknownConsent:true,consentEvidence:'미확인 조건을 알고 후보도 보여줘'}),'미확인 조건을 알고 후보도 보여줘');assert.equal(consent.action,'search');
assert.throws(()=>read(raw({unknownConsent:true,consentEvidence:'존재하지 않는 동의'}),'식당 알려줘'),/consent_evidence/);
const opening=raw({task:'change_conditions',action:'update_search'});opening.changes.requireOpen={op:'set',value:true,evidence:'지금 영업 중인 곳만'};opening.changes.visit={op:'set',value:'지금',evidence:'지금'};
assert.equal((await applyPlan(read(opening,'지금 영업 중인 곳만'),{phase1:applied},{},resolver)).conditions.requireOpen,true);
const prior={phase1:{conditions:{...applied.conditions,visit:'내일 저녁',visitAt:'2026-10-29T19:00:00+09:00'}}};
const today=raw({task:'change_conditions'});today.changes.visit={op:'set',value:'오늘 점심',evidence:'오늘 점심'};
const changed=await applyPlan(read(today,'그럼 오늘 점심으로'),prior,{},resolver);assert.equal(changed.conditions.visit,'오늘 점심');assert.equal(changed.conditions.visitAt,null);assert.deepEqual(changed.conditions.location,prior.phase1.conditions.location);
assert.equal(chooseExecution(raw({task:'change_conditions',action:'clarify',clarificationReason:'missing_budget'}),changed.conditions),'clarify');
const facts='첫 번째 식당: 김치볶음 9,000원\n두 번째 식당: 볶음 8,000원\n가격은 등록된 메뉴 기준이에요.';
const factual=finalizeConversationCopy({message:facts,restaurants:[],meta:{phase1:true,copySource:'program',intent:'compare',turnPolicy:{intro:facts}}});assert.equal(factual.message,facts,'fact/menu endings cannot erase a comparison');
assert.equal(menuMatches('국밥','순대국 (특)'),true);assert.equal(menuMatches('삼겹살','양갈비'),false);assert.equal(menuMatches('파스타','트러플 리조토'),false);
const rows=Array.from({length:12},(_,i)=>({sourceId:'semantic-only-fixture-'+i,name:'테스트 전용 식당 '+i,roadAddress:'서울 강남구 테스트로 '+(i+1),menus:[{name:'식사',priceKRW:9000,mainDish:true}],recommendations:[]}));
const catalog=createRecommendationCatalog({schemaVersion:1,enabled:true,connected:true,restaurants:rows});
const conditions={...defaults(),location:{...center,kind:'station'},radiusConfirmed:true,budget:'10,000원 이하'};
const lookup=async row=>{const i=Number(row.sourceId.split('-').at(-1));return [{name:row.name,address:row.roadAddress,registered_data:{roadAddress:row.roadAddress,latitude:center.latitude+(i<8?.03:.001),longitude:center.longitude,category:'한식'}}];};
const old=await resolveRegisteredCards(catalog,conditions,api,lookup);assert.equal(old.cards.length,0);
const progressive=await resolveRegisteredCards(catalog,conditions,api,lookup,{progressive:true});assert.ok(progressive.cards.length>=3);assert.equal(progressive.attempted,12);assert.equal(progressive.diagnostics.outsideRadius,8);
assert.equal(actionSchema([],['search'],keys).properties.changes.required.length,keys.length);
const pending={phase1:{pendingQuestion:{slot:'radiusMeters'},conditions:{...defaults(),location:center}}};
const numberAnswer=readModelPlan(raw({task:'information',action:'answer'}),[{role:'user',content:'1km'}],pending);
assert.equal(numberAnswer.action,'search');assert.equal(numberAnswer.changes.find(c=>c.slot==='radiusMeters').value,1000);
const confirmed=await applyPlan(numberAnswer,pending,{},resolver);assert.equal(confirmed.conditions.radiusConfirmed,true);
const explain=read(raw({task:'information',action:'service',faqId:'how_to.radius'}),'1km 반경은 무슨 뜻이야?');assert.equal(explain.changes.length,0,'distance in an explanation must not mutate search');
const budgetQuestion=read(raw({task:'change_conditions',action:'search',clarificationReason:'missing_budget',changes:{...raw().changes,budget:{op:'set',value:null,evidence:'더 저렴'}}}),'더 저렴한 곳');assert.equal(budgetQuestion.action,'clarify');assert.equal(budgetQuestion.question.slot,'budget');
const current=await applyPlan({...raw(),changes:[{slot:'requireOpen',op:'set',value:true}],openingTimeBasis:'current'},{phase1:{conditions:{...conditions,visit:'내일 저녁',visitAt:'2026-10-29T19:00:00+09:00'}}},{currentLocalDatetime:'2026-10-28T12:00:00+09:00'},resolver);assert.equal(current.conditions.visit,'지금');assert.equal(current.conditions.visitAt,'2026-10-28T12:00:00+09:00');
for(const text of ['강남역에서 한식 1km 이내로 추천해줘','역삼역 1km 맛집 찾아줘']){
 const result=read(raw(),text);assert.ok(result.changes.some(c=>c.slot==='location'),'search task cannot drop an exact supported location literal');
}
assert.equal(read(raw({task:'information',action:'answer'}),'역삼역은 어디야?').changes.length,0,'location literals do not override model information intent');
const ambiguous=read(raw({task:'change_conditions',changes:{...raw().changes,food:{op:'clear',value:null,evidence:'그 조건은 빼줘'}}}),'그 조건은 빼줘');assert.equal(ambiguous.action,'clarify');assert.equal(ambiguous.changes.length,0);
const noTarget=readModelPlan(raw({task:'information',action:'details',referencePositions:[2]}),[{role:'user',content:'두 번째 집 전화 알려줘'}],{});assert.equal(noTarget.action,'clarify');assert.equal(noTarget.targetIds.length,0);
const irrelevantRef=read(raw({task:'change_conditions',referencePositions:[2],changes:{...raw().changes,requireOpen:{op:'clear',value:false,evidence:'영업 조건은 빼고'}}}),'영업 조건은 빼고');assert.equal(irrelevantRef.changes[0].value,null);assert.equal(irrelevantRef.action,'search');
const relative=read(raw({task:'change_conditions',budgetRelation:'cheaper'}),'좀 더 싼 곳은?');assert.equal(relative.action,'clarify');assert.equal(relative.question.slot,'budget');
const device=read(raw({task:'change_conditions',locationReference:'current'}),'그럼 현재 위치로 찾아줘');const missingDevice=await applyPlan(device,{phase1:applied},{},async()=>null);assert.equal(missingDevice.conditions.location,null,'current location failure cannot reuse an old station');
console.log('Semantic regressions passed: partial facts, supported literal validation, scoped references, ambiguity safety, current point reset, relative budget, actual menu concepts and progressive candidates. All upstream calls mocked.');

// v179 feedback: validated literals repair compound input, not information routing.
const facts179={regions:[{name:'서울 강남구',regionId:'서울:강남구',evidence:'서울 강남구'}]};
const compound=readModelPlan(raw({changes:{...raw().changes,food:{op:'set',value:'한식',evidence:'한식'},budget:{op:'set',value:10000,evidence:'1만원'}}}),[{role:'user',content:'서울 강남구에서 한식으로 만 원 이하 혼자 먹을 곳 찾아줘'}],{},facts179);
assert.equal(compound.changes.find(c=>c.slot==='location').value,'서울 강남구');assert.equal(compound.changes.find(c=>c.slot==='budget').value,10000);
assert.equal(readModelPlan(raw({task:'information',action:'answer'}),[{role:'user',content:'서울 강남구에서 1만 원이란 무슨 뜻이야?'}],{},facts179).changes.length,0);
const alternative=readModelPlan(raw({locationCardinality:'alternatives',changes:{...raw().changes,location:{op:'set',value:'서울 강남구',evidence:'서울 강남구'}}}),[{role:'user',content:'서울 강남구나 서초구 중에서 추천해줘'}],{},facts179);assert.equal(alternative.action,'clarify');assert.equal(alternative.clarificationReason,'ambiguous_location');assert.ok(!alternative.changes.some(c=>c.slot==='location'));
const singular=readModelPlan(raw({task:'information',action:'compare',informationRequest:'compare_places',referenceKind:'all',referenceCardinality:'single',targetIds:['a','b']}),[{role:'user',content:'거기 주차돼?'}],{phase1:{focusCardId:null},lastCards:[{id:'a',name:'A'},{id:'b',name:'B'}]});assert.equal(singular.action,'clarify');assert.equal(singular.targetIds.length,0);
const solo=await applyPlan({changes:[{slot:'companion',op:'set',value:'혼밥'},{slot:'people',op:'set',value:1}],peopleBasis:'solo'},{},{},resolver);assert.equal(solo.conditionOrigins.people,'derived:companion');
const clearedSolo=await applyPlan({changes:[{slot:'companion',op:'clear',value:null}]},{phase1:solo},{},resolver);assert.equal(clearedSolo.conditions.people,null);assert.equal(clearedSolo.conditions.companion,null);
const explicitOne=await applyPlan({changes:[{slot:'companion',op:'clear',value:null}]},{phase1:{conditions:{...solo.conditions},conditionOrigins:{people:'explicit'}}},{},resolver);assert.equal(explicitOne.conditions.people,1,'explicit head count survives companion clear');
console.log('v179 feedback unit checks passed: compound regional/money literals, multiple-region clarification, single deictic target, derived vs explicit people.');

const staleClear=readModelPlan(raw({task:'change_conditions',changes:{...raw().changes,location:{op:'clear',value:null,evidence:'그 조건은 빼줘'},budget:{op:'set',value:10000,evidence:'1만 원'}}}),[{role:'user',content:'그 조건은 빼줘'},{role:'assistant',content:'어떤 조건인가요?'},{role:'user',content:'예산은 1만 원 이하로'}]);assert.ok(!staleClear.changes.some(c=>c.slot==='location'));assert.equal(staleClear.changes.find(c=>c.slot==='budget').value,10000);
const explicitClear=read(raw({task:'change_conditions',action:'clarify',clarificationReason:'ambiguous_condition',question:{slot:'clarify',text:'어떤 조건인가요?',choices:[]},changes:{...raw().changes,food:{op:'clear',value:null,evidence:'음식 조건만 빼줘'}}}),'음식 조건만 빼줘');assert.equal(explicitClear.action,'search');assert.equal(explicitClear.clarificationReason,null);
const staleMore=readModelPlan(raw({task:'change_conditions',action:'search_more',resultRequest:'new_results',resultEvidence:'다른 곳도 보여줘',changes:{...raw().changes,companion:{op:'clear',value:null,evidence:'혼밥 조건 빼줘'}}}),[{role:'user',content:'다른 곳도 보여줘'},{role:'user',content:'혼밥 조건 빼줘'}]);assert.equal(staleMore.action,'search');
const realMore=read(raw({resultRequest:'new_results',resultEvidence:'다른 곳도 보여줘'}),'다른 곳도 보여줘');assert.equal(realMore.action,'search_more');
const unrestricted=read(raw({foodScope:'unrestricted',changes:{...raw().changes,food:{op:'set',value:'아무거나',evidence:'아무거나'}}}),'아무거나 먹을래');assert.equal(unrestricted.changes.find(c=>c.slot==='food').op,'clear');
const mealOnly=read(raw({task:'change_conditions',visitPrecision:'meal',changes:{...raw().changes,visit:{op:'set',value:'오늘 점심',evidence:'오늘 점심'},visitAt:{op:'set',value:'2026-10-28T12:00:00+09:00',evidence:'오늘 점심'}}}),'오늘 점심으로');assert.ok(!mealOnly.changes.some(c=>c.slot==='visitAt'));
assert.equal(read(raw(),'광화문역에서 1km 안으로 찾아줘').changes.find(c=>c.slot==='location').value,'광화문역');
const rejectedConsent=read(raw({task:'change_conditions',unknownConsent:false,consentEvidence:'존재하지 않는 동의',changes:{...raw().changes,budget:{op:'clear',value:null,evidence:'예산은 빼줘'}}}),'예산은 빼줘');assert.equal(rejectedConsent.unknownConsent,null);assert.equal(rejectedConsent.changes[0].op,'clear');
const oneWon=read(raw({task:'change_conditions',clarificationReason:'missing_budget',budgetRelation:'cheaper'}),'1원 이하로');assert.equal(oneWon.changes.find(c=>c.slot==='budget').value,1);assert.notEqual(oneWon.clarificationReason,'missing_budget');
const plannedVisit=read(raw({task:'change_conditions',changes:{...raw().changes,visit:{op:'set',value:'내일 저녁',evidence:'내일 저녁'},requireOpen:{op:'set',value:true,evidence:'내일 저녁'}}}),'내일 저녁에 갈 곳 찾아줘');assert.ok(!plannedVisit.changes.some(c=>c.slot==='requireOpen'),'meal context cannot become an opening-hours-only filter');
const openedVisit=read(raw({task:'change_conditions',changes:{...raw().changes,requireOpen:{op:'set',value:true,evidence:'내일 저녁 7시에 영업하는 곳만'}}}),'내일 저녁 7시에 영업하는 곳만 찾아줘');assert.equal(openedVisit.changes.find(c=>c.slot==='requireOpen').value,true);
const clearVisit=await applyPlan({changes:[{slot:'visit',op:'clear',value:null}]},{phase1:{conditions:{...defaults(),visit:'내일 저녁',visitAt:'2026-10-29T19:00:00+09:00'}}},{},resolver);assert.equal(clearVisit.conditions.visit,null);assert.equal(clearVisit.conditions.visitAt,null,'clearing the visit condition clears its exact time too');
const keepPeople=read(raw({task:'change_conditions',changes:{...raw().changes,food:{op:'clear',value:null,evidence:'음식 조건 빼줘'},people:{op:'clear',value:null,evidence:'음식 조건 빼줘'}}}),'음식 조건 빼줘');assert.ok(!keepPeople.changes.some(c=>c.slot==='people'),'food-only edits cannot erase party size');
const soloAlias=read(raw({task:'change_conditions',changes:{...raw().changes,companion:{op:'set',value:'혼자',evidence:'혼자'}}}),'혼자 갈래');assert.equal(soloAlias.changes.find(c=>c.slot==='companion').value,'혼밥');
console.log('v181 feedback semantic checks passed: explicit-hours guarding, paired visit clearing, protected party context, solo normalization and deictic target safety.');

// v181 live failures: execute the conflicting model deltas, rather than only
// checking a prompt string. No upstream calls are made by these regressions.
const mealChanges=[{slot:'visit',op:'set',value:'오늘 점심'},{slot:'visitAt',op:'clear',value:null}];
for(const deltas of [mealChanges,[...mealChanges].reverse()]){
 const meal=await applyPlan({changes:deltas},prior,{},resolver);
 assert.equal(meal.conditions.visit,'오늘 점심');assert.equal(meal.conditions.visitAt,null);
 assert.equal(meal.conditionOrigins.visit,'explicit');assert.equal(meal.conditionOrigins.visitAt,'unset');
 assert.deepEqual(meal.conditions.location,prior.phase1.conditions.location);
}
const wrongCurrent=readModelPlan(raw({task:'conversation',action:'clarify',clarificationReason:'other',question:{slot:'clarify',text:'그럼이 무슨 뜻인가요?',choices:[]}}),[{role:'user',content:'그럼 현재 위치로 찾아줘'}],{phase1:{conditions:conditions}});
assert.equal(wrongCurrent.task,'change_conditions');assert.equal(wrongCurrent.action,'update_search');assert.equal(wrongCurrent.question,null);
const currentWithoutCoords=await applyPlan(wrongCurrent,{phase1:{conditions}}, {},async()=>null);
assert.equal(currentWithoutCoords.conditions.location,null);assert.equal(currentWithoutCoords.conditions.radiusMeters,1000);
assert.ok(currentWithoutCoords.locationError,'missing device coordinates must reach location recovery');
const currentWithCoords=await applyPlan(wrongCurrent,{phase1:{conditions}}, {},async()=>({...center,kind:'current'}));assert.equal(currentWithCoords.conditions.location.kind,'current');
assert.equal(read(raw({task:'information',action:'service'}),'현재 위치로 찾는 건 뭐야?').action,'service','location explanation cannot mutate location');
for(const [text,slot] of [['음식 종류 제한은 빼줘','food'],['예산도 빼줘','budget'],['혼밥 조건까지 빼줘','companion']]){
 const removal=read(raw({task:'change_conditions',action:'search_more',resultRequest:'new_results',resultEvidence:text,changes:{...raw().changes,[slot]:{op:'clear',value:null,evidence:text}}}),text);
 assert.equal(removal.action,'search');assert.equal(chooseExecution(removal,conditions),'search');
}
const clearAndMore=read(raw({task:'change_conditions',resultRequest:'new_results',resultEvidence:'다른 곳도 보여줘',changes:{...raw().changes,food:{op:'clear',value:null,evidence:'음식 조건 빼고'}}}),'음식 조건 빼고 다른 곳도 보여줘');assert.equal(clearAndMore.action,'search_more','explicit new-place request still excludes previous cards');
console.log('v182 feedback regressions passed: current-location recovery, order-independent meal change, removal without stale exclusions and explicit search-more preserved.');

const changeIntent=read(raw({task:'change_conditions',foodScope:'unrestricted',changes:{...raw().changes,food:{op:'clear',value:null,evidence:'음식 종류 변경'}}}),'음식 종류 변경');
assert.equal(chooseExecution(changeIntent,conditions),'clarify');assert.equal(changeIntent.clarificationReason,'food_change');assert.equal(changeIntent.changes.length,0,'food change button cannot clear current food or search');
for(const text of ['다른 걸 먹고 싶은데 아직 못 정했어','뭘로 바꿀지 추천 좀 해줄래']){
 const reason=text.includes('추천')?'food_suggestions':'food_change';
 const p=read(raw({task:'change_conditions',action:'clarify',clarificationReason:reason}),text);
 assert.equal(chooseExecution(p,conditions),'clarify');assert.equal(p.question.slot,'food');
}
const decidedFood=read(raw({task:'change_conditions',action:'clarify',clarificationReason:'food_change',changes:{...raw().changes,food:{op:'set',value:'냉면',evidence:'냉면'}}}),'그럼 냉면으로 바꿔줘');assert.equal(decidedFood.action,'search');assert.equal(decidedFood.clarificationReason,null);
assert.equal(read(raw({task:'change_conditions',foodScope:'unrestricted'}),'음식 제한 없이 아무거나 찾아줘').changes.find(c=>c.slot==='food').op,'clear','explicit unrestricted request remains supported');
const euljiQuestion=ambiguousLocationQuestion('을지로역');assert.equal(euljiQuestion.choices.length,4);assert.equal(ambiguousLocationQuestion('을지로3가역'),null);
const ambiguousEulji=await applyPlan({changes:[{slot:'location',op:'set',value:'을지로역'}]},{phase1:{conditions}}, {},q=>resolveLocation(q,{},{}));assert.equal(ambiguousEulji.conditions.location,null);assert.equal(ambiguousEulji.locationError,'ambiguous');assert.equal(ambiguousEulji.locationQuestion.slot,'location');
for(const spread of [0.0001,0.1]){
 const resolved=await resolveLocation('을지로3가역',{}, {NAVER_API_HUB_CLIENT_ID:'mock',NAVER_API_HUB_CLIENT_SECRET:'mock'},async()=>Response.json({items:[0,spread].map(offset=>({title:'을지로3가역 2호선',category:'교통>지하철역',roadAddress:'서울 중구 을지로',mapx:String(Math.round((126.9925+offset)*1e7)),mapy:'375665000'}))}));
 if(spread<.01){assert.equal(resolved.label,'을지로3가역');assert.equal(resolved.latitude,37.5665);}else assert.equal(resolved,null,'far apart same-name stations cannot be merged');
}
const locationChoice=readModelPlan(raw({action:'clarify',clarificationReason:'missing_location'}),[{role:'user',content:euljiQuestion.choices[2].message}],{phase1:{pendingQuestion:euljiQuestion}});assert.equal(locationChoice.action,'update_search');assert.equal(locationChoice.changes.find(c=>c.slot==='location').value,'을지로4가역');
