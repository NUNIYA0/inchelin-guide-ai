import assert from 'node:assert/strict';
import worker from '../build/dist/server/index.js';
import { answerPlanFor, applyAnswerPlan, MENU_CATEGORIES } from '../worker/answer-plan.js';
import { FORBIDDEN_COPY } from '../worker/conversation-copy.js';
import { normalizeResponseState, normalizeAnalysis, INTENT_ANALYSIS_SCHEMA, MODE_A_POOL } from '../worker/response-modes.js';
const env={OPENAI_API_KEY:'test-key',NAVER_API_HUB_CLIENT_ID:'stub',NAVER_API_HUB_CLIENT_SECRET:'stub',RESTAURANT_DATA_SOURCE:'naver',INTENT_ANALYZER_DISABLED:'true',CHAT_TIMING_LOGS:'false'};
const places={items:Array.from({length:3},(_,i)=>({title:'강남국밥'+i,category:'한식>국밥',roadAddress:'서울 강남구 강남 테스트길 '+i,mapx:'1270000000',mapy:'375000000'}))};
export async function testAnswerPlan() {
  let calls=[], forcedAnalysis=null, failMenu=null; const original=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{ const body=options.body?JSON.parse(options.body):{}; calls.push({url:String(url),body});
    if(String(url).includes('/search/v1/local')) {
      const query=new URL(url).searchParams.get('query') || '';
      const area=/홍대/.test(query)?'홍대':'강남', food=/냉면/.test(query)?'냉면':/삼겹살/.test(query)?'삼겹살':'국밥';
      return Response.json(forcedAnalysis?.intent==='specific_place' ? {items:[{...places.items[0],title:'해정집'}]} : {items:places.items.map((item,i)=>({...item,title:area+food+i,category:'한식>'+food,roadAddress:'서울 '+area+' 테스트길 '+i}))});
    }
    if(body.text?.format?.name==='inchelin_menu_choices') {if(failMenu==='timeout')throw Error('mock_timeout');if(failMenu)return new Response('{}',{status:504});return Response.json({output_text:'{}'});}
    if(body.text?.format?.name==='inchelin_response_mode_analysis') return Response.json({output_text:JSON.stringify(forcedAnalysis || {intent:'place_search',confidence:.3,slots:{},flags:{food_related:true},answer_plan:['place_cards']})});
    if(String(url).includes('api.openai.com')) return Response.json({output_text:JSON.stringify({message:'먹을 곳을 함께 골라봤어요.',turn_text:{summary:'강남에서 국밥 먹을 곳을 골라봤어요.',reason:''},suggestions:[],selectedRestaurantIds:[],next_question:null})});
    throw Error('Unexpected mocked URL '+url);
  };
  const run=async(message,state={},extra={})=>{calls=[];const res=await worker.fetch(new Request('https://qa.test/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:message}],context:{responseModeState:state}})}),{...env,...extra},{});assert.equal(res.status,200);const data=await res.json();assert.doesNotMatch([data.message,data.meta?.turnPolicy?.intro,data.meta?.turnPolicy?.questionText,...(data.meta?.menuCards||[]).flatMap(card=>[card.description,card.reason])].filter(Boolean).join(' '),FORBIDDEN_COPY);return data;};
  try {
    const first=await run('오늘 뭐 먹을지 같이 골라줘');
    assert.deepEqual(first.meta.answer_plan.filter(block=>block!=='related_questions'),['text','question','chips']);assert.deepEqual(first.restaurants,[]);
    assert.deepEqual(first.suggestions,['한식','중식','일식','양식','분식','카페 식사','네, 골라주세요']);assert.match(first.message,/끌리는 쪽 있으세요/);
    assert.equal(first.meta.responseModeState.stage,'menu_category_asked');assert.equal(calls.length,0);
    const kind=await run('한식으로 골라줘',first.meta.responseModeState);
    assert.deepEqual(kind.meta.answer_plan.filter(block=>block!=='related_questions'),['text','menu_cards','notice','chips']);assert.equal(kind.meta.menuCards.length,3);
    assert.ok(kind.meta.menuCards.every(item=>MENU_CATEGORIES.한식.includes(item.name)));assert.equal(kind.meta.responseModeState.stage,'menu_options_shown');
    const auto=await run('네, 골라주세요',first.meta.responseModeState);
    assert.equal(auto.meta.menuCards.length,3);assert.equal(new Set(auto.meta.menuCards.map(x=>x.name)).size,3);
    assert.equal(new Set(auto.meta.menuCards.map(x=>MODE_A_POOL.find(item=>item.menu===x.name).family)).size,3);
    for(const failure of ['status','timeout']) { failMenu=failure;const failed=await run('중식으로 골라줘');assert.equal(failed.meta.menuCards.length,3);assert.equal(failed.meta.menuSelectionSource,'fallback');assert.ok(failed.meta.menuCards.every(item=>MENU_CATEGORIES.중식.includes(item.name))); } failMenu=null;
    const selected=await run('국밥 먹을래',kind.meta.responseModeState);
    assert.equal(selected.meta.responseModeState.stage,'region_asked');assert.match(selected.message,/지금 어디세요/);
    assert.deepEqual(selected.suggestions,['현재 위치 연결','강남','홍대','역삼','성수','종로','여의도','직접 입력']);
    const found=await run('강남이에요',selected.meta.responseModeState);
    assert.equal(found.restaurants.length,3);assert.equal(found.meta.turnPolicy.questionText,'');
    assert.deepEqual(found.meta.answer_plan.filter(block=>block!=='related_questions'),['text','place_cards','source','chips']);
    const region=await run('오늘 홍대에서 뭐 먹지');assert.equal(region.meta.responseModeState.slots.region,'홍대');assert.match(region.message,/끌리는 쪽 있으세요/);assert.equal(region.restaurants.length,0);
    const regionKind=await run('한식으로 골라줘',region.meta.responseModeState);
    const typedKind=await run('중식',region.meta.responseModeState);assert.equal(typedKind.meta.menuCards.length,3);assert.ok(typedKind.meta.menuCards.every(card=>MENU_CATEGORIES.중식.includes(card.name)));assert.equal(typedKind.meta.responseModeState.slots.region,'홍대');
    const regionPick=await run('국밥 먹을래',regionKind.meta.responseModeState);
    assert.equal(regionPick.restaurants.length,3);assert.equal(regionPick.meta.responseModeState.slots.region,'홍대');assert.equal(regionPick.meta.turnPolicy.next_question,null);
    const known=await run('한식 먹고 싶은데');assert.equal(known.meta.menuCards.length,3);
    const narrow=await run('냉면 먹고 싶어');assert.match(narrow.message,/지금 어디세요/);assert.equal(narrow.meta.responseModeState.slots.menu,'냉면');
    const aliasDish=await run('제육 먹을래');assert.equal(aliasDish.meta.responseModeState.slots.menu,'제육볶음');assert.match(aliasDish.message,/지금 어디세요/);
    const again=await run('냉면 먹고 싶어',narrow.meta.responseModeState);assert.equal(again.meta.turnPolicy.questionText,'');
    const cap=await run('냉면 먹고 싶어',{slots:{},consecutiveQuestions:2});assert.equal(cap.meta.turnPolicy.questionText,'');
    const skip=await run('아무거나',first.meta.responseModeState);assert.equal(skip.meta.menuCards.length,3);assert.ok(skip.meta.responseModeState.askedSlots.includes('menu_category'));
    const skipMenu=await run('상관없어요',kind.meta.responseModeState);assert.ok(skipMenu.meta.responseModeState.slots.menu);assert.equal(skipMenu.meta.responseModeState.stage,'region_asked');
    const skipRegion=await run('상관없어요',selected.meta.responseModeState);assert.equal(skipRegion.meta.responseModeState.slots.region,'강남');assert.equal(skipRegion.restaurants.length,3);
    const low=await run('점심에 뭐든 좀 찾아볼까',{}, {INTENT_ANALYZER_DISABLED:'false'});assert.equal(low.meta.flow,'clarify');assert.deepEqual(low.meta.answer_plan.filter(block=>block!=='related_questions'),['text','question','chips']);assert.equal(low.restaurants.length,0);
    assert.equal(calls.filter(c=>c.url.includes('/search/v1/local')).length,0);
    const lowAgain=await run('점심에 뭐든 좀 찾아볼까',low.meta.responseModeState,{INTENT_ANALYZER_DISABLED:'false'});assert.equal(lowAgain.meta.turnPolicy.questionText,'');
    assert.ok(INTENT_ANALYSIS_SCHEMA.properties.answer_plan);assert.ok(INTENT_ANALYSIS_SCHEMA.required.includes('answer_plan'));
    // 11 table rows × two representative utterances: pure classifier contract,
    // plus malicious surplus data to prove the response envelope drops it.
    const table=[
      ['menu_trouble',{},['오늘 뭐 먹지','저녁 메뉴 고민돼'],['text','question','chips']],
      ['menu_trouble',{food_type:'한식'},['한식으로 골라줘','한식 먹고 싶은데'],['text','menu_cards','notice','chips']],
      ['place_search',{region:'강남',menu:'국밥'},['강남 국밥 찾아줘','강남에서 국밥 먹을 곳 추천해줘'],['text','place_cards','source','chips']],
      ['place_search',{menu:'냉면'},['냉면집 찾아줘','냉면 먹을 곳 추천해줘'],['text','question','chips']],
      ['followup',{region:'강남',menu:'국밥'},['다른 곳 보여줘','첫 번째 집 주차돼?'],['text','place_cards','source']],
      ['condition_change',{region:'홍대',menu:'국밥'},['홍대로 바꿔줘','그럼 국밥으로 할래'],['text','place_cards','source','chips']],
      ['compare',{},['첫째랑 둘째 비교해줘','A랑 B 중에 어디가 나아'],['text','chips']],
      ['specific_place',{},['해정집 전화번호 알려줘','해정집 영업시간 알려줘'],['text','place_cards']],
      ['food_talk',{},['냉면은 어떻게 먹어?','파스타 유래가 궁금해'],['text','question']],
      ['service',{},['추천 기준이 뭐야','너는 누구야'],['text','chips']],
      ['out_of_scope',{},['주식 추천해줘','병원 찾아줘'],['text','chips']],
    ];
    for(const [intent,slots,utterances,expected] of table) for(const content of utterances){
      const analysis=normalizeAnalysis({intent,slots,confidence:1});assert.deepEqual(answerPlanFor(analysis,{slots},content),expected,content);
      const result=applyAnswerPlan({message:'함께 골라봐요.',restaurants:[{id:'x'},{id:'y'},{id:'z'}],suggestions:['추가 칩'],meta:{analysis,responseModeState:normalizeResponseState({slots}),menuCards:[{name:'국밥'}],notice:'시설 확인이 필요해요.',turnPolicy:{questionText:'누구와 가세요?',actionChips:['조건 바꾸기']}}},{messages:[{role:'user',content}]});
      assert.deepEqual(result.meta.answer_plan.filter(block=>block!=='related_questions'),expected);if(!expected.includes('place_cards'))assert.equal(result.restaurants.length,0);
      if(!expected.includes('menu_cards'))assert.equal(result.meta.menuCards.length,0);if(!expected.includes('question'))assert.equal(result.meta.turnPolicy.questionText,'');
      if(!expected.includes('notice'))assert.equal(result.meta.notice,'');if(intent==='specific_place')assert.equal(result.restaurants.length,1);
      // Exercise the real request → mocked classifier → policy → public payload path.
      // This checks routing/composition, not model classification accuracy.
      forcedAnalysis={intent,confidence:1,slots:{},flags:{food_related:true},reference:intent==='specific_place'?{target_name:'해정집'}:{}};
      const priorCards=['followup','condition_change','compare'].includes(intent)?[0,1,2].map(i=>({id:'shown-'+i,name:'식당'+i,category:'국밥',address:'서울 강남구 1층'})):[];
      const live=await run(content,{slots,lastCards:priorCards,shownPlaceIds:priorCards.map(card=>card.id)}, {INTENT_ANALYZER_DISABLED:'false'});
      assert.deepEqual(live.meta.answer_plan.filter(block=>block!=='related_questions'),expected,'pipeline: '+content);
      if(!expected.includes('place_cards'))assert.equal(live.restaurants.length,0);
      if(intent==='specific_place')assert.ok(live.restaurants.length<=1);
    }
    forcedAnalysis={intent:'general',confidence:1,slots:{},flags:{}};
    for(const message of ['안녕','고마워'])assert.deepEqual((await run(message,{}, {INTENT_ANALYZER_DISABLED:'false'})).meta.answer_plan.filter(block=>block!=='related_questions'),['text']);
    forcedAnalysis={intent:'specific_place',confidence:1,slots:{},flags:{food_related:true},reference:{target_name:'해정집'}};
    const specific=await run('해정집 영업시간이랑 전화번호 알려줘',{}, {INTENT_ANALYZER_DISABLED:'false'});
    assert.match(specific.message,/영업시간/);assert.match(specific.message,/전화번호/);assert.match(specific.message,/확인된 정보가 없어요/);
    assert.equal(specific.restaurants.length,1);
    forcedAnalysis=null;
    const composite=answerPlanFor({intent:'place_search',slots:{region:'강남',menu:'삼겹살',parking:true}},{});assert.ok(composite.includes('notice'));
    console.log('Menu flow 9 scenarios + answer-plan 11×2 contracts + low-confidence/skip/cap regressions passed.');
  } finally {globalThis.fetch=original;}
}
if(process.argv[1]?.endsWith('answer-plan-smoke.mjs')) await testAnswerPlan();
