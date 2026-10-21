import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAIN_DISHES, SIDE_FOOD, isMainDish } from '../worker/main-dishes.js';
import { MODE_A_POOL } from '../worker/response-modes.js';
import { MENU_CATEGORIES, ANSWER_BLOCKS, applyAnswerPlan } from '../worker/answer-plan.js';
import { FORBIDDEN_COPY } from '../worker/conversation-copy.js';
import { applyRelatedQuestions, validateRelated } from '../worker/related-questions.js';
import { withTurnDeadline } from '../worker/turn-policy.js';
import { mentionedSearchRegion, normalizeFoodAxis } from '../worker/search-axes.js';

export async function testRelatedQuestions(runCase) {
  const env={OPENAI_API_KEY:'test-key',RESTAURANT_DATA_SOURCE:'naver',NAVER_API_HUB_CLIENT_ID:'stub',NAVER_API_HUB_CLIENT_SECRET:'stub'};
  const places={items:[0,1,2].map(i=>({title:'강남국밥'+i,category:'한식>국밥',roadAddress:'서울 강남구 테스트길 '+i,mapx:'1270000000',mapy:'375000000'}))};
  const run=(message,state={},extra={})=>runCase({message,env,context:{responseModeState:state},naverResponse:query=>{
    const region=mentionedSearchRegion(query)||'강남',food=normalizeFoodAxis(query)?.menu||'국밥';
    return {items:places.items.map((item,i)=>({...item,title:region+food+i,category:'한식>'+food,roadAddress:'서울 '+region+' 테스트길 '+i}))};
  },...extra});
  const first=await run('강남에서 국밥 먹을 곳 찾아줘');
  const state=first.body.meta.responseModeState;
  const check=(body,name,min=0)=>{
    const questions=body.meta.relatedQuestions;
    assert.ok(questions.length>=min && questions.length<=3,name+': '+JSON.stringify(questions));
    const primary=questions.filter(item=>!item.fallback);
    assert.equal(new Set(primary.map(item=>item.axis)).size,primary.length);
    assert.equal(new Set(questions.map(item=>item.key)).size,questions.length);
    assert.equal(body.meta.answer_plan.includes('related_questions'),questions.length>0);
    for(const item of questions){assert.ok(item.text.length>=12 && item.text.length<=(['detail','compare'].includes(item.axis)?40:30));assert.doesNotMatch(item.text,SIDE_FOOD);assert.doesNotMatch(item.text,FORBIDDEN_COPY);assert.doesNotMatch(item.text,/영업|평점|가격|웨이팅|분위기|주차|인기/);assert.ok(item.intent);}
    assert.equal(body.meta.relatedCandidates,undefined);
    assert.ok(!body.meta.analysis?.related_questions,'raw model candidates never leak');
  };
  check(first.body,'place_search');
  assert.ok(!first.body.meta.relatedQuestions.some(item=>item.axis==='companion'),'do not compete with the live companion question');
  const matrix=[
    ['menu_trouble','한식으로 골라줘',{}],
    ['followup','첫 번째 집 주차돼?',state],
    ['condition_change','회식이에요',state],
    ['compare','첫 번째랑 두 번째 비교해줘',state],
    ['specific_place','강남국밥0 상세 정보 알려줘',state,{analyzerEnabled:true,modeIntentAnalysis:{intent:'specific_place',confidence:1,slots:{},reference:{target_name:'강남국밥0'},flags:{food_related:true}}}],
    ['food_talk','냉면 먹는 법 알려줘',{}],
    ['service','추천은 어떤 기준으로 하나요?',{}],
    ['general','안녕',{}],
    ['out_of_scope','주식 추천해줘',{}],
  ];
  for(const [intent,message,previous,extra] of matrix){
    const result=await run(message,previous,extra);check(result.body,intent,intent==='out_of_scope'?1:0);
    if(intent==='compare') assert.ok(result.body.meta.relatedQuestions.some(item=>item.axis==='detail'));
    if(!['service','general'].includes(intent))assert.ok(result.body.meta.relatedQuestions.every(item=>!item.axis.startsWith('service_')),'FAQ questions only appear after service/general answers');
    if(['service','general'].includes(intent)) assert.ok(result.body.meta.relatedQuestions.some(item=>item.axis==='start'));
  }
  for(const message of ['오늘 뭐 먹지','냉면 먹고 싶어','계란찜 먹고 싶어']){
    const result=await run(message);assert.equal(result.body.meta.relatedQuestions.length,0,message);assert.ok(!result.body.meta.answer_plan.includes('related_questions'));
  }
  const zero=await run('강남에서 국밥 먹을 곳 찾아줘',{}, {naverResponse:{items:[]}});assert.equal(zero.body.meta.relatedQuestions.length,0);assert.ok(zero.body.meta.turnPolicy.expansionChoices.length);assert.deepEqual(zero.body.meta.turnPolicy.actionChips,[]);
  const timeout=await run('강남에서 국밥 먹을 곳 찾아줘',{}, {generationStatus:504});check(timeout.body,'timeout fallback');assert.ok(timeout.body.meta.relatedQuestions.every(item=>item.source==='template'));
  const proposed=[{text:'성수에서도 국밥 먹을 곳 찾아줘'},{text:'국밥 말고 냉면 먹을 곳 찾아줘'},{text:'국밥집 영업시간도 함께 알려줘'},{text:'삼겹살 말고 소주 마실 곳 알려줘'}];
  const model=await run('강남에서 국밥 먹을 곳 찾아줘',{}, {aiResponse:{message:'강남에서 국밥을 골라봤어요.',suggestions:[],selectedRestaurantIds:[],related_questions:proposed}});
  check(model.body,'model filtering');assert.equal(model.body.meta.relatedQuestions.filter(item=>item.source==='model').length,2,JSON.stringify(model.body.meta.relatedQuestions));
  const unknown=await run('강남에서 국밥 먹을 곳 찾아줘',{}, {aiResponse:{message:'강남에서 국밥을 골라봤어요.',suggestions:[],selectedRestaurantIds:[],related_questions:[{text:'부산에서도 국밥 먹을 곳 찾아주세요'}]}});
  assert.ok(unknown.body.meta.relatedQuestions.every(item=>!item.text.includes('부산')));
  const malformed=await run('강남에서 국밥 먹을 곳 찾아줘',{}, {aiResponse:{message:'강남에서 국밥을 골라봤어요.',suggestions:[],selectedRestaurantIds:[],related_questions:{bad:true}}});check(malformed.body,'malformed-generation fallback');
  const analyzer=await run('먹고 싶은 국밥으로 찾아볼래요',{slots:{region:'강남'}},{analyzerEnabled:true,modeIntentAnalysis:{intent:'place_search',confidence:1,slots:{menu:'국밥'},related_questions:proposed}});
  assert.ok(analyzer.body.meta.relatedQuestions.some(item=>item.source==='model'),'existing analysis model candidates reach the same validator');
  const next=await run('회식이에요',state);check(next.body,'session');assert.ok(next.body.meta.relatedQuestions.every(item=>!state.shownSuggestions.some(old=>old.key===item.key||old.text===item.text)));
  for(const choice of first.body.meta.relatedQuestions){
    const result=await run(choice.text,state,{naverResponse:query=>({items:places.items.map(item=>({...item,title:query.includes('설렁탕')?'설렁탕집':item.title,roadAddress:'서울 강남구 역삼동 1',category:query.includes('설렁탕')?'한식>설렁탕':'한식>국밥'}))})});
    assert.ok(['place_search','condition_change','followup','compare','service'].includes(result.body.meta.analysis.intent),choice.text+' actual routing');
  }
  for(const dish of ['계란찜','공기밥','김치전','사이다','소주','아이스크림']){
    const result=await run(dish+' 먹고 싶어');assert.equal(result.body.meta.flow,'side_main');assert.match(result.body.message,/보통 어떤 메인과 같이 드세요/);assert.equal(result.calls.length,0);assert.equal(result.body.restaurants.length,0);assert.ok(result.body.suggestions.every(isMainDish));
  }
  assert.ok(MAIN_DISHES.length>=18);assert.ok(MODE_A_POOL.length>=18);assert.ok(MODE_A_POOL.every(item=>item.main_dish && isMainDish(item.menu)));
  for(const names of Object.values(MENU_CATEGORIES))assert.ok(names.every(isMainDish));
  const linkedMenus=applyAnswerPlan({message:'메뉴를 골라봐요.',suggestions:['계란찜|반찬','국밥|한 끼'],meta:{flow:'menu_options',menuCards:[{name:'계란찜',description:'반찬',reason:''},{name:'국밥',description:'따뜻한 한 끼',reason:''}],responseModeState:{slots:{}},analysis:{intent:'menu_trouble'}}});
  assert.deepEqual(linkedMenus.meta.menuCards.map(card=>card.name),['국밥']);assert.ok(linkedMenus.meta.menuCards.every(card=>card.main_dish));assert.ok(!linkedMenus.suggestions.some(value=>value.startsWith('계란찜')));
  const maliciousMenus=await run('한식으로 골라줘',{}, {menuResponses:[{intro:'한식으로 골라봐요.',menus:[{menu:'국밥',description:'공기밥 추가',reason:'소주를 곁들여요'},{menu:'냉면',description:'면',reason:'좋아요'},{menu:'제육볶음',description:'밥',reason:'좋아요'}]}]});
  assert.equal(maliciousMenus.body.meta.menuSelectionSource,'fallback');assert.ok(maliciousMenus.body.meta.menuCards.every(card=>!SIDE_FOOD.test(card.description+' '+card.reason)));
  // The validator must reject even a safe-looking candidate if routing rejects it.
  assert.equal(validateRelated('역삼에서도 국밥 먹을 곳 찾아주세요',{state,parentIntent:'place_search',classify:()=>({intent:'out_of_scope',confidence:1}),history:[]}),null);
  const blocked={...state,askedSlots:['companion'],pendingQuestionSlot:null};
  assert.equal(validateRelated('회식하기 좋은 곳으로 다시 찾아주세요',{state:blocked,parentIntent:'place_search',classify:()=>({intent:'condition_change',confidence:1,slots:{companion:'회식'}}),history:[]}),null);
  const pure={message:'알려드릴게요.',restaurants:[],meta:{intent:'service',answer_plan:['text'],responseModeState:{slots:{}}}};
  await assert.rejects(withTurnDeadline(()=>new Promise(()=>{}),1),/turn_timeout/);
  const afterDeadline=await applyRelatedQuestions(pure,{messages:[]},()=>({intent:'service',confidence:1,slots:{}}));
  assert.ok(afterDeadline.meta.relatedQuestions.length>=2);assert.ok(afterDeadline.meta.relatedQuestions.every(item=>item.source==='template'));
  const seen={...state,shownSuggestions:[{text:'역삼에서도 국밥 먹을 곳 찾아주세요',key:'region:역삼:국밥'}]};
  assert.equal(validateRelated('역삼 지역에서도 국밥집 찾아주세요',{state:seen,parentIntent:'place_search',classify:()=>({intent:'condition_change',confidence:1,slots:{region:'역삼',menu:'국밥'}}),history:[]}),null,'semantic duplicates are rejected across paraphrases');
  const rejectAll=await applyRelatedQuestions(pure,{messages:[]},()=>({intent:'out_of_scope',confidence:1}));assert.equal(rejectAll.meta.relatedQuestions.length,0);assert.ok(!rejectAll.meta.answer_plan.includes('related_questions'));
  assert.ok(ANSWER_BLOCKS.includes('related_questions'));
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.match(html,/\.related-question \{[^}]*min-height: 52px;[^}]*padding: 16px;[^}]*border-radius: 14px;[^}]*background: #f3f3f3;[^}]*color: #222;[^}]*15px/);
  assert.match(html,/\.related-question:focus-visible/);assert.match(html,/prefers-reduced-motion: reduce[^}]*\.related-arrow/);
  assert.match(html,/button\.setAttribute\('aria-label',choice.text\)/);
  console.log('v124 related questions: 10-intent exposure, hidden stages/zero, validation/model/fallback/timeout/session/main-dish/side-request/accessibility/360 CSS contracts passed.');
}
