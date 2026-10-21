import assert from 'node:assert/strict';
import '../dist/assets/naver-map.js';
import {hasForbiddenCopy,repeatsCopySentences} from '../worker/conversation-copy.js';
import {applyRelatedQuestions} from '../worker/related-questions.js';
import {normalizeResponseState} from '../worker/response-modes.js';
import {mentionedSearchRegion,normalizeFoodAxis} from '../worker/search-axes.js';

export async function testV130(runCase) {
  const {mapLink,cleanName}=globalThis.InchelinMapLinks;
  const examples=[
    mapLink({name:'땅코참숯구이 강남역직영점 서울특별시 강남구 강남대로78길 25 지상1층'}),
    mapLink({name:'시장냉면(홍대점) 시장냉면 홍대점 (지하1층 푸드코트)',longitude:126.923,latitude:37.556}),
    mapLink({name:'테스트 갈비',url:'https://map.naver.com/p/entry/place/123456789?foo=bar',longitude:127,latitude:37.5})
  ];
  assert.equal(cleanName('시장냉면(홍대점) 시장냉면 홍대점 (지하1층 푸드코트)'),'시장냉면 홍대점');
  assert.equal(decodeURIComponent(new URL(examples[0]).pathname).split('/').at(-1),'땅코참숯구이 강남역직영점');
  for(const url of examples)assert.doesNotMatch(decodeURIComponent(new URL(url).pathname),/강남대로|서울특별시|지상|지하|\d+층|\d+호|푸드코트/);
  assert.ok(new URL(examples[1]).searchParams.has('c'));
  assert.equal(examples[2],'https://map.naver.com/p/entry/place/123456789');
  assert.equal(mapLink({name:'김밥 & 면',url:'javascript:alert(1)'}),'https://map.naver.com/p/search/'+encodeURIComponent('김밥 & 면'));
  assert.equal(mapLink({name:'식당',url:'https://naver.me/abcd'}),'https://naver.me/abcd');
  assert.equal(mapLink({name:'식당',longitude:999,latitude:37}),mapLink({name:'식당'}));
  const old=mapLink({name:'시장냉면 홍대점',url:'https://map.naver.com/p/search/'+encodeURIComponent('시장냉면 홍대점 서울특별시 마포구 테스트로 11 지하1층')});
  assert.equal(old,mapLink({name:'시장냉면 홍대점'}),'legacy address queries are rebuilt from card name');
  const duplicate='회식용으로 강남에서 삼겹살집 3곳을 골랐어요. 회식으로 가시는군요, 먹을 곳을 다시 골라봤어요.';
  assert.ok(repeatsCopySentences(duplicate));assert.ok(hasForbiddenCopy({message:duplicate}));
  assert.equal(hasForbiddenCopy({message:'회식 자리로 강남 삼겹살집 3곳을 골라봤어요.'}),false);
  const classify=(text,state)=>({intent:/비교/.test(text)?'compare':/상세|자세/.test(text)?'specific_place':'condition_change',confidence:1,slots:{region:mentionedSearchRegion(text),...normalizeFoodAxis(text),companion:/회식/.test(text)?'회식':null}});
  const cards=['아주 긴 첫 번째 삼겹살 식당 강남 직영점','아주 긴 두 번째 고깃집 강남 본점'].map((name,i)=>({id:String(i),name,category:'고깃집',address:'서울 강남구 1'}));
  const make=(pending=null)=>({message:'골라봤어요.',restaurants:cards,meta:{analysis:{intent:'place_search'},answer_plan:['text','place_cards',...(pending?['question','chips']:[])],responseModeState:normalizeResponseState({slots:{region:'강남',menu:'삼겹살'},lastCards:cards,pendingQuestionSlot:pending,askedSlots:pending?[pending]:[]}),turnPolicy:pending?{questionText:'누구와 가세요?',next_question:{slot:pending,text:'누구와 가세요?'}}:{}}});
  const rich=await applyRelatedQuestions(make(),{messages:[]},classify,async()=>true);
  assert.equal(rich.meta.relatedQuestions.length,3);assert.equal(new Set(rich.meta.relatedQuestions.map(q=>q.axis)).size,3);
  assert.deepEqual(rich.meta.relatedQuestions.map(q=>q.axis),['region','food','companion']);
  const waiting=await applyRelatedQuestions(make('companion'),{messages:[]},classify,async()=>true);assert.equal(waiting.meta.relatedQuestions.length,2);assert.ok(waiting.meta.relatedQuestions.every(q=>q.axis!=='companion'));
  const noSearch=await applyRelatedQuestions(make(),{messages:[]},classify,async()=>false);
  assert.ok(noSearch.meta.relatedQuestions.length<3,'never invent results to satisfy three');assert.ok(noSearch.meta.relatedQuestions.every(q=>['detail','compare'].includes(q.axis)));
  const env={OPENAI_API_KEY:'test-key',RESTAURANT_DATA_SOURCE:'naver',NAVER_API_HUB_CLIENT_ID:'stub',NAVER_API_HUB_CLIENT_SECRET:'stub'};
  const first=await runCase({message:'강남에서 삼겹살 먹을래',env,naverResponse:{items:[{title:'땅코참숯구이 강남역직영점',category:'한식>돼지고기구이',roadAddress:'서울특별시 강남구 강남대로78길 25 지상1층',mapx:'1270000000',mapy:'375000000'}]}});
  assert.equal(first.body.restaurants.length,1);const link=new URL(first.body.restaurants[0].naverPlaceUrl);assert.ok(link.searchParams.has('c'));assert.equal(decodeURIComponent(link.pathname).split('/').at(-1),'땅코참숯구이 강남역직영점');
  console.log('v130: clean/encoded/coordinate/unique/legacy map links; duplicate copy; three validated axes or two while pending; validation failure never padded passed.');
  console.log('Map URL examples: '+JSON.stringify(examples));
}
