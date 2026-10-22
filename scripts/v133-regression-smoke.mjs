import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../build/dist/server/index.js';
import {applyRelatedQuestions,confirmedCombination,clearRelatedSearchCache} from '../worker/related-questions.js';
import {normalizeResponseState} from '../worker/response-modes.js';
import {mentionedSearchRegion,normalizeFoodAxis} from '../worker/search-axes.js';

export async function testV133(runCase){
  const rules=globalThis.InchelinResponseRules,now=Date.now();
  assert.ok(/^v\d+$/.test(rules.VERSION));assert.ok(rules.TTL_MS<=3600000);
  assert.equal(rules.isCurrent({responseRulesVersion:'v132',generatedAt:now}),false);
  assert.equal(rules.isCurrent({responseRulesVersion:rules.VERSION,generatedAt:now-rules.TTL_MS}),false);
  const cache=new Map([['v132:query',{expires:now+1000}],[rules.cacheKey('query'),{expires:now+1000}],['v133:too-long',{expires:now+rules.TTL_MS+1}]]);
  rules.prune(cache,now);assert.deepEqual([...cache.keys()],[rules.cacheKey('query')]);
  clearRelatedSearchCache();let reads=0;
  await confirmedCombination('probe',()=>{reads++;return true;});await confirmedCombination('probe',()=>{reads++;return false;});assert.equal(reads,1);
  const stale=await worker.fetch(new Request('https://example.test/api/chat',{method:'POST',headers:{'content-type':'application/json','X-Response-Rules-Version':'v132'},body:JSON.stringify({messages:[{role:'user',content:'강남에서 삼겹살 먹을래'}]})}),{CHAT_TIMING_LOGS:'false'},{});
  assert.equal(stale.status,409);assert.equal(stale.headers.get('X-Response-Rules-Version'),rules.VERSION);
  const env={OPENAI_API_KEY:'test-key',RESTAURANT_DATA_SOURCE:'naver',NAVER_API_HUB_CLIENT_ID:'stub',NAVER_API_HUB_CLIENT_SECRET:'stub'};
  const dataset=q=>{const region=mentionedSearchRegion(q)||'홍대',food=normalizeFoodAxis(q)?.menu||'냉면';return {items:[0,1,2].map(i=>({title:region+food+'식당'+i,category:'한식>'+food,roadAddress:'서울 '+region+' 테스트길 '+i}))};};
  const first=await runCase({message:'홍대에서 냉면 먹을래',env,naverResponse:dataset});
  assert.equal(first.body.restaurants.length,3);assert.equal(first.body.meta.relatedQuestions.length,3);
  assert.ok(rules.isCurrent(first.body.meta));assert.ok(rules.isCurrent(first.body.meta.responseModeState));
  const refined=await runCase({message:'회식이에요',env,context:{responseModeState:first.body.meta.responseModeState},naverResponse:q=>({items:dataset(q).items.slice(0,1)})});
  assert.deepEqual(refined.body.restaurants.map(x=>x.id),first.body.restaurants.map(x=>x.id));
  assert.equal(refined.body.meta.relatedQuestions.length,3);
  assert.match(refined.body.message+' '+refined.body.meta.notice,/확인/);
  const oldState={...first.body.meta.responseModeState,responseRulesVersion:'v132'};
  oldState.lastCards=[{id:'obsolete',name:'예전식당',category:'냉면',address:'홍대'}];
  const fresh=await runCase({message:'홍대에서 냉면 먹을래',env,context:{responseModeState:oldState},naverResponse:dataset});
  assert.ok(fresh.body.restaurants.every(c=>c.id!=='obsolete'));
  const repeated=await runCase({message:'홍대에서 냉면 먹을래',env,naverResponse:dataset});
  assert.ok(repeated.calls.some(c=>c.href.includes('api.openai.com')),'same prompt generates new copy, not a saved answer');
  assert.ok(repeated.body.meta.relatedQuestions.every(q=>!/첫 번째|두 번째|FAQ/.test(q.text)));
  const cards=first.body.restaurants;
  const classify=text=>({intent:/비교/.test(text)?'compare':/자세|상세/.test(text)?'specific_place':'condition_change',confidence:1,slots:{region:mentionedSearchRegion(text),...normalizeFoodAxis(text)}});
  for(const pending of [false,true]){
    const state=normalizeResponseState({slots:{region:'홍대',menu:'냉면'},lastCards:cards,pendingQuestionSlot:pending?'companion':null});
    const result=await applyRelatedQuestions({message:'골라봤어요.',restaurants:cards,meta:{intent:'place_search',answer_plan:pending?['text','place_cards','question']:['text','place_cards'],turnPolicy:pending?{questionText:'누구와 가세요?',next_question:{slot:'companion'}}:{},responseModeState:state}},{messages:[]},classify,async()=>false);
    assert.ok(result.meta.relatedQuestions.length<(pending?2:3),'v134 never duplicates detail axes to pad a failed search pool');
    assert.equal(new Set(result.meta.relatedQuestions.map(q=>q.axis)).size,result.meta.relatedQuestions.length);
    assert.ok(result.meta.relatedQuestions.every(q=>['detail','compare'].includes(q.axis)));
  }
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const fn=name=>html.match(new RegExp('    (?:async )?function '+name+'\\([^]*?\\n    \\}'))[0];
  const normalize=new Function('normalizeRestaurant',fn('normalizeMessage')+';return normalizeMessage;')(x=>x);
  const archived=normalize({role:'assistant',content:'구버전 본문',meta:{relatedQuestions:[{text:'첫 번째랑 두 번째 식당 비교해줘'}]}},{restored:true});
  assert.equal(archived.meta.staleResponse,true);assert.equal(archived.content,'구버전 본문','archive preserved, not deleted');
  assert.match(fn('renderMessage'),/if\(message\.role==='assistant'&&message\.meta\?\.staleResponse\)/);
  assert.match(fn('buildAIRequest'),/!message\.meta\?\.staleResponse/);
  const root=await worker.fetch(new Request('https://example.test/'),{},{});
  assert.equal(root.headers.get('cache-control'),'no-store');assert.equal(root.headers.get('clear-site-data'),'"cache"');
  const asset=await worker.fetch(new Request('https://example.test/assets/response-rules.js'),{},{});assert.equal(asset.headers.get('cache-control'),'no-store');
  console.log('v133 mocked regressions: version/TTL invalidation, stale archive isolation, repeated prompt fresh generation, 3→3 preference retention, verified fallback 2/3 counts passed.');
}
