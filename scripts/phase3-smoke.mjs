import assert from 'node:assert/strict';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {evaluateConditions} from '../worker/condition-evidence.js';

export async function testPhase3(request){
  const state=r=>r.body.meta.responseModeState,conditions=r=>state(r).phase1.conditions;
  const base=await request('강남역');assert.equal(base.body.restaurants.length,3);assert.equal(conditions(base).radiusMeters,1000);assert.ok(base.body.restaurants.every(c=>c.conditionVerification.status==='confirmed'));
  const gated=await request('강남역에서 한식, 만 원 이하로 혼자 먹을 거야');assert.equal(gated.calls.length,0,'no silently weakened Naver search before consent');assert.equal(gated.body.restaurants.length,0);assert.ok(gated.body.suggestions.includes('미확인 후보 보기'));assert.equal(conditions(gated).budget,'1만 원 이하');assert.equal(conditions(gated).companion,'혼밥');
  const consent=await request('미확인 조건을 알고 후보도 보여줘',{state:state(gated)});assert.equal(consent.body.restaurants.length,3);assert.ok(consent.body.restaurants.every(card=>card.conditionVerification.status==='unconfirmed'));assert.ok(consent.body.restaurants.every(card=>card.conditionVerification.checks.some(check=>check.key==='budget'&&check.status==='unknown')));
  const change=await request('500m 안으로',{state:state(consent)});assert.equal(change.body.restaurants.length,0,'condition change requires fresh explicit consent');assert.equal(conditions(change).radiusMeters,500);assert.equal(conditions(change).food,'한식');
  const release=await request('예산 제한 없애줘',{state:state(change)});assert.equal(conditions(release).budget,null);assert.equal(conditions(release).radiusMeters,500);assert.equal(conditions(release).food,'한식');assert.equal(conditions(release).companion,'혼밥');
  const only=await request('강남역에서 기존 앱에 등록된 추천인 이름과 추천 이유가 있는 맛집 찾아줘');assert.equal(only.body.restaurants.length,0);assert.match(only.body.message,/연결되지/);assert.equal(only.calls.length,0,'do not silently replace a registered-only request with Naver');
  const zero=await request('성수역',{data:{items:[]}});assert.equal(state(zero).noResults,true);assert.equal(zero.body.meta.phase1Failure,false);assert.ok(zero.body.suggestions.includes('2km로 확대'));assert.equal(conditions(zero).radiusMeters,1000);
  const tech=await request('성수역',{status:503});assert.equal(tech.body.meta.phase1Failure,true);assert.match(tech.body.message,/다시 시도/);assert.equal(conditions(tech).radiusMeters,1000);
  const raw=JSON.parse(await readFile(new URL('../tests/fixtures/recommendations.json',import.meta.url),'utf8')),center=globalThis.InchelinPhase1.centers[4];
  const source={...raw,enabled:true,connected:true,restaurants:raw.restaurants.map((r,index)=>({...r,category:'한식',latitude:center.latitude+(index+1)*.001,longitude:center.longitude,menus:[{name:'국밥',priceKRW:index===1?12000:9000,mainDish:true}],soloEvidence:index===0?{confirmed:true,source:'test-only 1인 메뉴 기록'}:null}))};
  const text=await readFile(new URL('../build/dist/server/index.js',import.meta.url),'utf8'),testPath=new URL('../build/dist/server/index.phase3-test.js',import.meta.url);
  await writeFile(testPath,text.replace(/const recommendationData = [^\n]+;/,'const recommendationData = '+JSON.stringify(source)+';'));
  try{
    const workerOverride=(await import(testPath.href+'?test='+Date.now())).default;
    const connected=await request('성수역',{workerOverride});assert.equal(connected.calls.length,0,'registered data first, no Naver call when 3 records available');assert.equal(connected.body.restaurants.length,3);assert.ok(connected.body.restaurants.every(c=>c.dataSource==='inchelin'));
    const qualified=await request('성수역에서 한식, 만 원 이하로 혼자 먹을 거야',{workerOverride});assert.equal(qualified.body.meta.notice,'','do not label confirmed prices/seats unconfirmed');assert.equal(qualified.body.restaurants.length,1,'do not fill with unknown prices/seats');const card=qualified.body.restaurants[0];assert.equal(card.conditionVerification.status,'confirmed');assert.equal(card.recommendationBundle.representative.id,'fixture-a');assert.equal(card.registeredFacts.menus[0].priceKRW,9000);
    const mixed=await request('미확인 조건을 알고 후보도 보여줘',{state:state(qualified),workerOverride});assert.equal(mixed.body.restaurants.length,2,'confirmed over-budget menu is excluded, not relabeled unknown');assert.equal(mixed.body.restaurants.filter(c=>c.conditionVerification.status==='confirmed').length,1);assert.equal(mixed.body.restaurants.filter(c=>c.conditionVerification.status==='unconfirmed').length,1);assert.ok(mixed.body.restaurants[1].conditionVerification.checks.some(c=>c.key==='companion'&&c.status==='unknown'));
    const distance=await request('500m 안으로',{state:state(qualified),workerOverride});assert.equal(conditions(distance).budget,'1만 원 이하');assert.equal(conditions(distance).food,'한식');
    const meeting=await request('회식할 거야',{state:state(qualified),workerOverride});assert.equal(meeting.body.restaurants.length,0,'unconfirmed new condition withheld');const accepted=await request('미확인 조건을 알고 후보도 보여줘',{state:state(meeting),workerOverride});assert.equal(accepted.body.restaurants[0].recommendationBundle.representative.id,'fixture-b');
    const future=await request('내일 저녁에 갈 거야',{state:state(qualified),workerOverride});assert.equal(future.body.restaurants.length,0,'do not claim future opening from missing data');
    assert.equal(evaluateConditions({...card,distanceMeters:1001},{...conditions(qualified),radiusMeters:1000}).status,'failed');
    return {connected:connected.body,qualified:qualified.body,mixed:mixed.body};
  }finally{await rm(testPath,{force:true});}
}
