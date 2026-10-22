import assert from 'node:assert/strict';
import {withParticle,normalizeKoreanParticles} from '../worker/korean.js';
import {relatedAxisGroup,selectRelatedAxes} from '../worker/related-questions.js';
import {readFile} from 'node:fs/promises';
export async function testV136(runCase){
  const env={OPENAI_API_KEY:'test-key',RESTAURANT_DATA_SOURCE:'naver',NAVER_API_HUB_CLIENT_ID:'stub',NAVER_API_HUB_CLIENT_SECRET:'stub'};
  const category={items:[
    ...['성수식당 가','성수식당 나','성수식당 다'].map(title=>({title,category:'음식점>양식>이탈리아음식',roadAddress:'서울특별시 성동구 연무장길 10',address:'서울특별시 성동구 성수동2가 1'})),
    {title:'홍대 이탈리아집',category:'음식점>양식>이탈리아음식',address:'서울 마포구 서교동 1'},
    {title:'성수 고기집',category:'음식점>한식>육류,고기요리',address:'서울 성동구 성수동2가 2'},
    {title:'성수 카페',category:'음식점>카페',address:'서울 성동구 성수동2가 3'}]};
  const r=await runCase({message:'성수에서 파스타 먹을 곳 찾아줘',env,naverResponse:category});
  assert.equal(r.body.restaurants.length,3,'Italian cuisine category + original Seongsu parcel address retained');
  assert.ok(r.body.restaurants.every(c=>/^성수식당/.test(c.name)));
  const query=new URL(r.calls.find(c=>c.href.includes('naverapihub')).href).searchParams.get('query');assert.equal(query,'성수 파스타');
  const empty=await runCase({message:'성수에서 파스타 먹을 곳 찾아줘',env,naverResponse:{items:[]}});
  assert.equal(empty.body.meta.responseModeState.slots.menu,'파스타');
  const next=await runCase({message:'홍대 맛집 추천해줘',env,context:{responseModeState:empty.body.meta.responseModeState},naverResponse:{items:[{title:'홍대파스타',category:'음식점>양식>이탈리아음식',address:'서울 마포구 서교동 1'}]}});
  assert.equal(next.body.meta.responseModeState.slots.region,'홍대');assert.equal(next.body.meta.responseModeState.slots.menu,'파스타');
  assert.match(next.body.meta.turnPolicy.intro,/파스타 기준으로 찾았어요/);
  for(const previous of [r,empty]){
    const zeroNext=await runCase({message:'홍대 맛집 추천해줘',env,context:{responseModeState:previous.body.meta.responseModeState},naverResponse:{items:[]}});
    assert.match(zeroNext.body.message,/파스타 기준으로 찾았어요/,'food inheritance disclosed even when next search is also empty');
  }
  const fresh=await runCase({message:'홍대 맛집 추천해줘',env});assert.equal(fresh.body.restaurants.length,0);
  assert.match(fresh.body.meta.turnPolicy.questionText,/홍대에서 어떤 음식이 끌리세요/);assert.doesNotMatch(fresh.body.message,/홍대은|그대로/);
  for(const [word,pair,expected] of [['홍대','은/는','홍대는'],['성수','이/가','성수가'],['냉면','을/를','냉면을'],['삼겹살','으로/로','삼겹살로'],['국밥','과/와','국밥과']])assert.equal(withParticle(word,pair),expected);
  assert.equal(normalizeKoreanParticles('홍대은 그대로 두고 냉면를 삼겹살으로 바꿔볼게요.',['홍대','냉면','삼겹살']),'홍대는 그대로 두고 냉면을 삼겹살로 바꿔볼게요.');
  assert.equal(normalizeKoreanParticles('냉면가게를 골라봐요.',['냉면']),'냉면가게를 골라봐요.');
  const pool=['companion','vibe','facility','region','food','detail','compare'].map(axis=>({axis}));
  const selected=selectRelatedAxes(pool,{placeResponse:true});assert.equal(selected.length,3);assert.equal(new Set(selected.map(q=>relatedAxisGroup(q.axis))).size,3);
  const single=selectRelatedAxes(pool,{placeResponse:true,singlePlace:true});assert.deepEqual(single.map(q=>relatedAxisGroup(q.axis)),['situation','region','food']);
  for(const result of [r,next]){const qs=result.body.meta.relatedQuestions;assert.equal(new Set(qs.map(q=>relatedAxisGroup(q.axis))).size,qs.length);assert.ok(qs.every(q=>!/다시 찾아줘/.test(q.text)));if(result.body.restaurants.length===1)assert.ok(qs.every(q=>q.axis!=='compare'));}
  assert.equal(r.body.meta.turnPolicy.next_question,null,'v135 sufficient-information policy intentionally kept; no mandatory companion question');
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const fn=name=>html.match(new RegExp('    (?:async )?function '+name+'\\([^]*?\\n    \\}'))[0];
  const requestClient=response=>new Function('fetch',`const AI_API_ENDPOINT='/api/chat',normalizeRestaurant=x=>x;${fn('requestAssistant')}${fn('extractAssistantText')}${fn('assertCompleteAnswer')}return requestAssistant;`)(async()=>response);
  await assert.rejects(()=>requestClient(Response.json({...fresh.body,meta:{...fresh.body.meta,responseRulesVersion:'v135'}}))({}),/response_rules_changed/);
  await assert.rejects(()=>requestClient(Response.json({...fresh.body,meta:{...fresh.body.meta,generatedAt:null}}))({}),/invalid_response_metadata/);
  await assert.rejects(()=>requestClient(new Response('{',{headers:{'content-type':'application/json'}}))({}),SyntaxError);
  console.log('v136: question client render/clock-skew tested in welcome suite; Italian classification + parcel region filter; zero-result food inheritance disclosed; particles; semantic situation uniqueness and one-place selection passed.');
}
