import assert from 'node:assert/strict';
import {lookupRestaurantPhoto} from '../worker/restaurant-photos.js';
import {registeredPhotos} from '../worker/recommendations.js';
export async function testCardsV155(request,worker){
  const state=r=>r.body.meta.responseModeState;
  const start=await request('오늘 점심 추천해줘');assert.equal(start.body.meta.turnPolicy.next_question.slot,'region');
  const location=await request('강남역',{state:state(start)});assert.equal(location.calls.length,0);assert.equal(location.body.restaurants.length,0);assert.equal(location.body.meta.turnPolicy.next_question.slot,'radiusMeters');assert.deepEqual(location.body.suggestions,['500m 이내','1km 이내','3km 이내']);
  const radius=await request('500m 이내로 찾아줘',{state:state(location)});assert.equal(radius.body.restaurants.length,2);assert.equal(state(radius).phase1.conditions.radiusMeters,500);assert.ok(radius.body.restaurants.every(c=>c.distanceMeters<=500));
  const widened=await request('3km까지 넓혀줘',{state:state(radius)});assert.equal(state(widened).phase1.conditions.radiusMeters,3000);assert.equal(widened.body.meta.turnPolicy.next_question,null);assert.equal(widened.body.restaurants.length,3);
  const explicit=await request('강남역에서 1km 이내로 추천해줘');assert.equal(explicit.body.meta.turnPolicy.next_question,null);assert.equal(explicit.body.restaurants.length,3);
  const moved=await request('역삼역으로 바꿔줘',{state:state(explicit)});assert.equal(state(moved).phase1.conditions.radiusMeters,1000);assert.equal(moved.body.meta.turnPolicy.next_question,null);
  const current=await request('지금 내 주변에서 찾아줘',{currentLocation:globalThis.InchelinPhase1.centers[0]});assert.equal(current.body.meta.turnPolicy.next_question.slot,'radiusMeters');
  const row={sourceId:'test-only-photo',name:'테스트 가게 역삼점',roadAddress:'서울 강남구 테스트로 1'},approval={restaurantSourceId:row.sourceId,restaurantName:row.name,roadAddress:row.roadAddress,imageUrl:'https://photo.example/approved.jpg',sourceUrl:'https://source.example/original',attribution:'테스트 권리자',rightsBasis:'테스트 전용 허락 기록',identityVerified:true,rightsVerified:true};
  let calls=0;const fetcher=async(url,options)=>{calls++;assert.ok(new URL(url).searchParams.get('query').includes(row.name+' '+row.roadAddress));assert.ok(options.headers['X-NCP-APIGW-API-KEY']);return Response.json({items:[{title:'다른 식당 사진',link:'https://photo.example/wrong.jpg'},{title:row.name,link:approval.imageUrl}]});};
  const env={NAVER_API_HUB_CLIENT_ID:'mock',NAVER_API_HUB_CLIENT_SECRET:'mock'};
  assert.equal((await lookupRestaurantPhoto(row,{enabled:false},env,fetcher)).status,'not_configured');assert.equal(calls,0);
  assert.equal((await lookupRestaurantPhoto(row,{enabled:true,approvals:[{...approval,rightsVerified:false}]},env,fetcher)).status,'verification_required');assert.equal(calls,0);
  const approved=await lookupRestaurantPhoto(row,{enabled:true,approvals:[approval]},env,fetcher);assert.equal(approved.photo.url,approval.imageUrl);assert.equal(approved.photo.sourceUrl,approval.sourceUrl);assert.equal(approved.photo.restaurantSourceId,row.sourceId);assert.equal(calls,1);
  assert.equal((await lookupRestaurantPhoto(row,{enabled:true,approvals:[{...approval,roadAddress:'다른 주소'}]},env,fetcher)).status,'verification_required');
  assert.equal(registeredPhotos({photos:[{url:'https://photo.example/a.jpg'},{url:'https://photo.example/b.jpg',isPrimary:true}]}).find(p=>p.isPrimary).url,'https://photo.example/b.jpg');
  const disabled=await worker.fetch(new Request('https://example.test/api/restaurant-photo?id=unknown'),{},{});assert.equal((await disabled.json()).status,'not_found');
  console.log('v155 smoke passed: explicit radius lifecycle, actual distance filtering, preserved location changes, audited photo matching and rights gate; no live image or AI calls.');
}
