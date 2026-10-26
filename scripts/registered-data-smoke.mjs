import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadRecommendationSource} from './recommendation-source.mjs';
import {createRecommendationCatalog} from '../worker/recommendations.js';
import {matchesRegisteredPlace,registeredShortlist} from '../worker/registered-search.js';
export async function testRegisteredData(request,workerOverride){
  const config=JSON.parse(await readFile(new URL('../data/recommendation-source.json',import.meta.url),'utf8'));
  const source=await loadRecommendationSource(fileURLToPath(new URL('../',import.meta.url)),config);
  assert.equal(source.restaurants.length,1099);assert.equal(source.exclusive,true);
  assert.equal(source.sourceHash,'81699ec6bfd876d9ae1a9b2a5b6a805c5a4cd4e8642eaf01a41184696135f696');
  assert.equal(new Set(source.restaurants.map(r=>r.sourceId)).size,1099);
  assert.ok(source.restaurants.every(r=>!r.latitude&&!r.longitude&&r.imageUrl===null));
  assert.ok(source.restaurants.every(r=>r.recommendations.every(rec=>rec.reason===null&&rec.writtenAt===null)),'collection date is not authorship date');
  const api=globalThis.InchelinPhase1,c=api.parse('강남역',{},{}).conditions;
  const rows=registeredShortlist(source.restaurants,c,api.centers);assert.ok(rows.length>2);
  const raw=(row,index)=>({title:row.name,roadAddress:row.roadAddress,address:row.roadAddress,category:'음식점>한식',mapx:String(Math.round(c.location.longitude*1e7)),mapy:String(Math.round((c.location.latitude+(index+1)*.0005)*1e7))});
  const data=query=>{const index=rows.findIndex(row=>query.startsWith(row.name+' '));assert.ok(index>=0,'only registered-name queries, never a generic external substitute');return {items:[raw(rows[index],index),{...raw(rows[index],index),title:'등록 목록 밖 테스트 식당'}]};};
  const result=await request('강남역',{workerOverride,data});
  assert.equal(result.calls.length,rows.length);assert.equal(result.body.restaurants.length,3);
  assert.equal(result.body.meta.dataConnectionStatus,'connected_snapshot');
  for(const card of result.body.restaurants){
    const row=source.restaurants.find(r=>r.sourceId===card.registeredSourceId);assert.ok(row);
    assert.equal(card.name,row.name);assert.equal(card.dataSource,'inchelin');
    assert.equal(card.recommendationBundle.representative.recommenderName,row.recommendations[0].recommenderName);
    assert.equal(card.recommendationBundle.representative.reason,null);
    assert.deepEqual(card.registeredFacts.menus,row.menus);assert.equal(card.phone,row.phone);
    assert.equal(card.registeredFacts.openingHoursText,row.openingHoursText);
    assert.ok(card.distanceMeters<=1000);assert.equal(card.naverPlaceUrl,api.mapUrl(row.roadAddress));
  }
  const state=result.body.meta.responseModeState;
  const change=await request('500m 안으로',{workerOverride,state,data});assert.equal(change.calls.length,0,'coordinate cache reused');assert.equal(change.body.restaurants.length,3);
  const detail=await request('첫 번째 집 영업시간이랑 전화번호 알려줘',{workerOverride,state,data});
  assert.match(detail.body.message,/엑셀에 수집된 영업시간/);assert.match(detail.body.message,/연락처:/);
  const faq=await request('등록 안 된 식당도 나와?',{workerOverride,data});assert.match(faq.body.message,/1,099/);assert.ok(!/전환 중/.test(faq.body.message));
  const first=rows[0],place={name:first.name,address:first.roadAddress,registered_data:{roadAddress:first.roadAddress}};
  assert.equal(matchesRegisteredPlace(first,place),true);
  assert.equal(matchesRegisteredPlace(first,{...place,name:'다른 가게'}),false);
  assert.equal(matchesRegisteredPlace(first,{...place,address:'서울 다른길 999',registered_data:{roadAddress:'서울 다른길 999'}}),false);
  assert.equal(createRecommendationCatalog(source).entries().length,1099);
  console.log('v145 actual-source smoke passed: all 1099 rows loaded; exact recommender/menu/hour linkage; registered-only results; mocked coordinates; radius/cache/map/details/FAQ. Not a live geocode audit.');
}
