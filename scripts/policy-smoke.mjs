import assert from 'node:assert/strict';
import './history-more-smoke.mjs';
import './history-manager-smoke.mjs';
import './composer-smoke.mjs';
import './semantic-regression-smoke.mjs';
import './place-links-smoke.mjs';
import './region-catalog-smoke.mjs';
import {contextSamples} from './context-planner-smoke.mjs';
import {readFile,writeFile,rm} from 'node:fs/promises';
import productionWorker from '../build/dist/server/index.js';
// Legacy external-search regressions run with a disconnected source copy.
// Production catalogue assertions run separately against productionWorker.
const baselinePath=new URL('../build/dist/server/index.baseline-test.js',import.meta.url);
const productionText=await readFile(new URL('../build/dist/server/index.js',import.meta.url),'utf8');
await writeFile(baselinePath,productionText.replace(/const recommendationData = [^\n]+;/,'const recommendationData = {"schemaVersion":1,"enabled":false,"connected":false,"restaurants":[]};'));
const worker=(await import(baselinePath.href+'?test='+Date.now())).default;
await rm(baselinePath,{force:true});
import {testPhase1Client} from './phase1-client-smoke.mjs';
import {normalizeKoreanParticles} from '../worker/korean.js';
import {testRecommendations} from './recommendations-smoke.mjs';
import {testPhase3} from './phase3-smoke.mjs';
import {testPhase4} from './phase4-smoke.mjs';
import {testConversationScroll} from './scroll-smoke.mjs';
import {testRegisteredData} from './registered-data-smoke.mjs';
import {testCardsV155} from './cards-v155-smoke.mjs';
const api=globalThis.InchelinPhase1;
const env={CONVERSATION_PLANNER_MODE:'legacy-test',RESTAURANT_DATA_SOURCE:'naver',NAVER_API_HUB_CLIENT_ID:'mock-id',NAVER_API_HUB_CLIENT_SECRET:'mock-secret',CHAT_TIMING_LOGS:'false'};
function item(center,meters,index=0,extra={}){return {title:'테스트 식당 '+index,category:'음식점>양식>이탈리안음식',address:'서울특별시 성동구 성수동2가 '+index,roadAddress:'서울특별시 성동구 연무장길 '+index,mapx:String(Math.round(center.longitude*1e7)),mapy:String(Math.round((center.latitude+meters/6371008.8*180/Math.PI)*1e7)),...extra};}
const dataset=query=>{const center=api.centers.find(c=>query.startsWith(c.label))||api.centers[0];return {items:[100,400,800,1000.2,2000].map((m,i)=>item(center,m,i,/한식/.test(query)?{category:'음식점>한식'}:{}))};};
export async function requestCase(message,{state=null,currentLocation=null,currentLocationName='',locationSelection=null,data=dataset,status=200,workerOverride=worker,demoMode=false,currentLocalDatetime='2026-10-22T12:00:00+09:00'}={}){
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async url=>{calls.push(String(url));assert.match(String(url),/naverapihub\.apigw\.ntruss\.com\/search\/v1\/local/,'AI/image/other live calls forbidden');return Response.json(typeof data==='function'?data(new URL(url).searchParams.get('query')):data,{status});};
  try{const request=new Request('https://example.test/api/chat',{method:'POST',headers:{'content-type':'application/json','X-Response-Rules-Version':globalThis.InchelinResponseRules.VERSION},body:JSON.stringify({messages:[{role:'user',content:message}],context:{responseModeState:state,currentLocation,currentLocationName,locationSelection,demoMode,currentLocalDatetime}})});const response=await workerOverride.fetch(request,env,{});assert.equal(response.status,200,message);return {body:await response.json(),calls};}finally{globalThis.fetch=original;}
}
// Legacy v137/v138 card assertions now explicitly exercise the consent continuation.
// New v139 tests and the consent client scenario call requestCase directly.
export async function runCase(message,options={}){
  let initial=await requestCase(message,options);
  // Historical card regressions continue after the newly required radius choice.
  if(initial.body.meta?.turnPolicy?.next_question?.slot==='radiusMeters')initial=await requestCase('1km 이내로 찾아줘',{...options,state:initial.body.meta.responseModeState});
  if(initial.body.meta?.turnPolicy?.answerChoices?.some(c=>c.label==='미확인 후보 보기')){
    const accepted=await requestCase('미확인 조건을 알고 후보도 보여줘',{...options,state:initial.body.meta.responseModeState});accepted.initial=initial;return accepted;
  }
  return initial;
}
async function legacyRequestCase(message,options={}){const r=await requestCase(message,options);return r.body.meta?.turnPolicy?.next_question?.slot==='radiusMeters'?requestCase('1km 이내로 찾아줘',{...options,state:r.body.meta.responseModeState}):r;}
const c=r=>r.body.meta.responseModeState.phase1.conditions,s=r=>r.body.meta.responseModeState;
await testCardsV155(requestCase,productionWorker);
for(const [h,m,p] of [[9,59,'morning'],[10,0,'lunch'],[13,59,'lunch'],[14,0,'afternoon'],[16,59,'afternoon'],[17,0,'evening'],[20,59,'evening'],[21,0,'lateNight'],[23,59,'lateNight'],[0,0,'lateNight'],[4,59,'lateNight'],[5,0,'morning']]){
  assert.equal(api.period(h+m/60),p);for(const generated of [undefined,[],null,['영업 중인 식당 찾아줘','홍대에서 냉면 먹을래'],['점심으로 가볍게 먹을 곳 찾아줘']]){const rows=api.welcome(h+m/60,generated);assert.equal(rows.length,3);assert.equal(new Set(rows.map(q=>q.prompt)).size,3);assert.ok(rows.every(q=>!/영업|홍대|강남|디저트/.test(q.prompt)));}
}
const noLocation=await runCase('오늘 점심 추천해줘');assert.equal(noLocation.calls.length,0);assert.equal(noLocation.body.restaurants.length,0);assert.equal(noLocation.body.meta.turnPolicy.next_question.slot,'region');assert.deepEqual(noLocation.body.suggestions,['현재 위치로 찾기','지역·역 선택']);
const foodOnly=await runCase('냉면 먹고 싶어');assert.equal(c(foodOnly).food,'냉면');assert.equal(foodOnly.body.meta.turnPolicy.next_question.slot,'region');
const regionOnly=await runCase('홍대 맛집 추천해줘');assert.equal(regionOnly.body.restaurants.length,3);assert.equal(regionOnly.body.meta.turnPolicy.next_question,null);assert.equal(c(regionOnly).food,null);assert.equal(c(regionOnly).location.label,'홍대입구역');
const direct=await runCase('합정역');assert.equal(c(direct).location.label,'합정역');assert.equal(direct.body.restaurants.length,3);
const bulk=await runCase('강남역에서 한식, 만 원 이하로');assert.equal(c(bulk).food,'한식');assert.equal(c(bulk).budget,'1만 원 이하');assert.equal(c(bulk).radiusMeters,1000);assert.match(bulk.body.meta.notice,/가격.*확인되지/);
const move=await runCase('역삼역으로 바꿔줘',{state:s(bulk)});assert.equal(c(move).location.label,'역삼역');assert.equal(c(move).food,'한식');assert.equal(c(move).budget,'1만 원 이하');
const radius=await runCase('500m 안으로',{state:s(move)});assert.equal(c(radius).radiusMeters,500);assert.equal(radius.body.restaurants.length,2);assert.equal(c(radius).location.label,'역삼역');assert.equal(c(radius).food,'한식');
for(const [text,meters] of [['30m 안으로',30],['30km 이내로',30000]])assert.equal(c(await runCase(text,{state:s(move)})).radiusMeters,meters,'never clamp a requested radius silently');
const invalidDistance=await runCase('0m 안으로',{state:s(move)});assert.equal(invalidDistance.calls.length,0);assert.equal(c(invalidDistance).radiusMeters,1000);assert.ok(invalidDistance.body.meta.turnPolicy.questionText);
const solo=await runCase('혼자 먹을 거야',{state:s(move)});assert.equal(c(solo).companion,'혼밥');assert.equal(c(solo).food,'한식');assert.equal(solo.body.restaurants.length,3);assert.ok(solo.body.suggestions.every(q=>!/혼밥/.test(q)));
const tomorrow=await runCase('내일 저녁에 갈 거야',{state:s(solo)});assert.equal(c(tomorrow).visit,'내일 저녁');assert.equal(c(tomorrow).radiusMeters,1000);assert.equal(c(tomorrow).companion,'혼밥');assert.ok(tomorrow.body.restaurants.every(card=>card.conditionVerification.checks.some(check=>check.key==='visit'&&check.status==='unknown')));
const remove=await runCase('예산 제한 없애줘',{state:s(tomorrow)});assert.equal(c(remove).budget,null);assert.equal(c(remove).food,'한식');assert.ok(!remove.body.meta.conditionChips.some(chip=>chip.key==='budget'));
const removeFood=await runCase('음식 조건 해제해줘',{state:s(tomorrow)});assert.equal(c(removeFood).food,null);assert.equal(c(removeFood).location.label,'역삼역');assert.equal(c(removeFood).budget,'1만 원 이하');
const oldVersion=await runCase('500m 안으로',{state:{responseRulesVersion:'v136',generatedAt:1,slots:{region:'홍대',menu:'냉면'},preferences:{budget:'1만 원 이하'}}});assert.equal(c(oldVersion).location.label,'홍대입구역');assert.equal(c(oldVersion).food,'냉면');assert.equal(c(oldVersion).budget,'1만 원 이하');
const noPoint=await runCase('위치 해제해줘',{state:s(move)});assert.equal(c(noPoint).location,null);assert.equal(noPoint.body.meta.turnPolicy.next_question.slot,'region');
for(const center of api.centers){const r=await runCase(center.label+'에서 추천해줘');assert.equal(r.body.restaurants.length,3);assert.ok(r.body.restaurants.every(card=>card.originLabel===center.label&&card.distanceKind==='straight'&&card.distanceMeters<=1000));}
const center=api.centers.find(c=>c.label==='성수역');assert.ok(Math.abs(api.distance(center,{...center,latitude:center.latitude+1000/6371008.8*180/Math.PI})-1000)<.001);
const boundary=await runCase('성수에서 파스타 먹을 곳 찾아줘',{data:{items:[item(center,999.8,1),item(center,1000.2,2),item(center,0,3,{mapx:'',mapy:''}),item(center,20,4,{category:'쇼핑>편의점'})]}});assert.equal(boundary.body.restaurants.length,1);assert.equal(new URL(boundary.calls[0]).searchParams.get('query'),'성수역 파스타');
const seongsu=await runCase('성수에서 파스타');assert.equal(seongsu.body.restaurants.length,3,'Italian category; no literal pasta name needed');assert.equal(c(seongsu).food,'파스타');
for(const center of [api.centers[0],api.centers[2]]){const r=await runCase('지금 내 주변에서 찾아줘',{currentLocation:center,currentLocationName:center.label,data:{items:[item(center,100,1),item(center,1001,2)]}});assert.equal(r.body.restaurants.length,1);assert.equal(c(r).location.label,'현재 위치');assert.equal(c(r).radiusMeters,1000);}
const denied=await runCase('현재 위치로 찾아줘');assert.equal(denied.calls.length,0);assert.equal(denied.body.restaurants.length,0);
const none=await runCase('성수 파스타',{data:{items:[]}});assert.equal(c(none).radiusMeters,1000);assert.ok(none.body.suggestions.includes('2km로 확대'));assert.equal(none.body.meta.recoverable,true);assert.ok(!none.body.meta.relatedQuestions);assert.equal(none.calls.length,1);
const expand=await runCase('2km 이내로 찾아줘',{state:s(none)});assert.equal(c(expand).radiusMeters,2000);assert.equal(c(expand).food,'파스타');
const failed=await runCase('강남에서 추천해줘',{status:503});assert.equal(failed.body.meta.recoverable,true);assert.equal(c(failed).location.label,'강남역');assert.match(failed.body.message,/다시 시도/);
const retry=await runCase('다시 추천해줘',{state:s(move)});assert.equal(c(retry).location.label,'역삼역');assert.equal(c(retry).budget,'1만 원 이하');
for(const message of ['강남역이나 역삼역에서 추천해줘','건대입구역에서 찾아줘']){const r=await runCase(message);assert.equal(r.calls.length,0);assert.ok(r.body.meta.turnPolicy.questionText);}
const otherGangnam=await runCase('강남구청역에서 찾아줘');assert.equal(otherGangnam.calls.length,0,'unsupported station must not alias 강남역');
for(const address of ['서울특별시 강남구 강남대로78길 25 지상1층','서울특별시 마포구 서교동 123-4','부산광역시 중구 광복로 1'])assert.equal(api.mapUrl(address),'https://map.naver.com/p/search/'+encodeURIComponent(address));assert.equal(api.mapUrl(''),'');
const noAddress=await runCase('강남역에서 추천해줘',{data:{items:[item(api.centers[0],100,1,{roadAddress:'',address:''})]}});assert.equal(noAddress.body.restaurants.length,1);assert.equal(noAddress.body.restaurants[0].naverPlaceUrl,null);assert.equal(noAddress.body.restaurants[0].mapUrl,'');
const compare=await runCase('첫 번째랑 두 번째 식당 비교하고 지도도 보여줘',{state:s(bulk)});assert.equal(compare.calls.length,0);assert.equal(compare.body.restaurants.length,2);assert.match(compare.body.message,/테스트 식당 0/);assert.match(compare.body.message,/테스트 식당 1/);assert.match(compare.body.message,/주소/);
assert.ok(compare.body.meta.phase1Intents.includes('compare'));assert.ok(compare.body.meta.phase1Intents.includes('map'));assert.ok((move.initial||move).body.meta.phase1Intents.includes('condition_change'));
const detail=await runCase('두 번째 집 영업시간이랑 전화번호 알려줘',{state:s(bulk)});assert.equal(detail.calls.length,0);assert.match(detail.body.message,/영업시간.*전화/);assert.equal(detail.body.restaurants[0].id,bulk.body.restaurants[1].id);
const vague=await runCase('여기 지도 보여줘',{state:s(bulk)});assert.equal(vague.calls.length,0);assert.ok(vague.body.meta.turnPolicy.questionText);
const focusedState=s(bulk);focusedState.phase1.focusCardId=bulk.body.restaurants[1].id;const focused=await runCase('여기 지도 보여줘',{state:focusedState});assert.equal(focused.body.restaurants[0].id,bulk.body.restaurants[1].id);
for(const r of [bulk,seongsu,noAddress])for(const card of r.body.restaurants){for(const key of ['imageUrl','menus','prices','recommenderName','otherRecommendations','openingHours'])assert.equal(card[key],null);assert.equal(card.recommendedBy,'');assert.equal(card.recommendationReason,'');}
assert.equal(normalizeKoreanParticles('홍대은 냉면를 골라봐요.',['홍대','냉면']),'홍대는 냉면을 골라봐요.');
const faq=await runCase('추천은 어떤 기준으로 하나요?');assert.equal(faq.calls.length,0);assert.equal(faq.body.restaurants.length,0);assert.match(faq.body.message,/반경/);
assert.deepEqual(noLocation.body.meta.conditionChips,[]);assert.deepEqual(foodOnly.body.meta.conditionChips,[]);
assert.ok(bulk.body.meta.notice.split(/[.!?]/).filter(x=>x.trim()).length<=2);
assert.ok(!/주차|분위기|시간|좌석/.test(bulk.body.meta.notice),'only applicable conditions');
assert.ok(remove.body.restaurants.every(card=>card.conditionVerification.checks.find(check=>check.key==='visit')?.blocking===false),'meal context does not require opening evidence');
const v138Samples=await testRecommendations(runCase);
const v139Samples=await testPhase3(legacyRequestCase);
const v140Samples=await testPhase4(legacyRequestCase);
await testPhase1Client(runCase,{contextSamples,noLocation,regionOnly,bulk,none,failed,noAddress,...v138Samples,...v139Samples,...v140Samples},legacyRequestCase,requestCase);
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');assert.match(html,/메뉴·가격·영업시간은 변경될 수 있어요/);assert.match(html,/inchelin-resume-chat/);
testConversationScroll(html);
await testRegisteredData(legacyRequestCase,productionWorker);
const pickerCSS=await productionWorker.fetch(new Request('https://example.test/assets/location-picker.css?v=152'),env,{});
assert.equal(pickerCSS.status,200);assert.match(pickerCSS.headers.get('content-type'),/text\/css/,'picker styles must not be served as binary');assert.match(await pickerCSS.text(),/\.bottom-sheet\.location-picker/);
assert.ok(!/id="guide(?:Rail|Side)"/.test(html),'usage-guide navigation removed from both sidebar states');
for(const id of ['aboutRail','aboutSide'])assert.match(html.match(new RegExp('<button[^>]+id="'+id+'"[^]*?</button>'))?.[0]||'',/src="assets\/guide-icon\.png"/,'introduction reuses the historic open-book asset');
assert.ok(!/\['guideRail', 'guideSide'\]/.test(html),'removed controls have no click binding');
for(const id of ['newChatRail','newChatSide'])assert.match(html.match(new RegExp('<button[^>]+id="'+id+'"[^]*?</button>'))?.[0]||'',/<svg[^]*?<use href="#i-new-chat"\/>/,'new-chat icon remains in both sidebar states');
console.log('v142 policy smoke passed: demo catalogue and entry removed; retired demo flags ignored; consent/category/evidence/map/sidebar regressions. All upstream calls mocked; no keys or AI calls.');
