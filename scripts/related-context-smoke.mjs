import assert from 'node:assert/strict';
import {normalizeResponseState} from '../worker/response-modes.js';
import {applyRelatedQuestions,validateRelated,relatedContext,relatedPattern,RELATED_AXES} from '../worker/related-questions.js';
import {mentionedSearchRegion,normalizeFoodAxis} from '../worker/search-axes.js';

export async function testRelatedContext(runCase){
  const classify=(text,state)=>({intent:/기준/.test(text)?'service':/상세|자세/.test(text)?'specific_place':/비교/.test(text)?'compare':'condition_change',confidence:1,slots:{region:mentionedSearchRegion(text),...normalizeFoodAxis(text),companion:/회식/.test(text)?'회식':null}});
  const cards=[{id:'one',name:'강남고기집',category:'돼지고기구이',address:'서울 강남구 1'},{id:'two',name:'강남삼겹집',category:'돼지고기구이',address:'서울 강남구 2'}];
  const state=normalizeResponseState({slots:{region:'강남',menu:'삼겹살'},lastCards:cards,pendingQuestionSlot:'companion',askedSlots:['companion']});
  const response={message:'강남에서 골라봤어요.',restaurants:cards,suggestions:['혼자','회식','가족'],meta:{analysis:{intent:'place_search'},answer_plan:['text','place_cards','source','question','chips'],responseModeState:state,turnPolicy:{next_question:{slot:'companion',text:'누구와 가세요?'},questionText:'누구와 가세요?',missing_slots:[],actionChips:['다른 곳 보기','조건 바꾸기']},relatedCandidates:[{text:'회식으로 역삼에서 삼겹살 찾아줘'},{text:'추천은 어떤 기준으로 해?'},{text:'강남고기집 자세히 알려줘'},{text:'첫 번째랑 두 번째 식당 비교해줘'}]}};
  const payload={messages:[{role:'user',content:'강남에서 삼겹살 먹을래'}]};
  const context=relatedContext(response,payload);assert.equal(context.utterance,payload.messages[0].content);assert.equal(context.intent,'place_search');assert.equal(context.slots.menu,'삼겹살');assert.deepEqual(context.cards,cards);assert.equal(context.pending_question.slot,'companion');assert.ok(context.askedSlots.includes('companion'));
  const filtered=await applyRelatedQuestions(response,payload,classify,async()=>true);
  assert.equal(filtered.meta.relatedQuestions.length,2);assert.ok(filtered.meta.relatedQuestions.some(item=>['detail','compare'].includes(item.axis)));assert.ok(filtered.meta.relatedQuestions.some(item=>['region','food'].includes(item.axis)));assert.ok(filtered.meta.relatedQuestions.every(item=>!item.text.includes('회식')&&!item.axis.startsWith('service_')));
  const blocked=validateRelated('회식으로 역삼에서 삼겹살 찾아줘',{state,parentIntent:'place_search',classify,pendingSlot:'companion'});assert.equal(blocked,null,'pending companion wins over a mixed region proposal');
  assert.ok(RELATED_AXES.place_search.includes('detail'));assert.ok(!RELATED_AXES.place_search.includes('service_regions'));
  // Three real generation rounds with different slots: syntax pattern, not just wording/value, must change.
  let previous=normalizeResponseState({}),rounds=[];
  for(const [region,food] of [['강남','삼겹살'],['홍대','국밥'],['성수','냉면']]){
    const next=normalizeResponseState({...previous,slots:{region,menu:food},lastCards:cards,pendingQuestionSlot:'companion'});
    const envelope={...response,restaurants:cards,meta:{...response.meta,responseModeState:next,relatedCandidates:[{text:`역삼에서도 ${food} 먹을 곳 찾아줘`}]}};
    const result=await applyRelatedQuestions(envelope,{messages:[{role:'user',content:`${region}에서 ${food} 먹을래`}],context:{responseModeState:previous}},classify,async()=>true);
    const patterns=result.meta.relatedQuestions.map(item=>item.pattern);assert.ok(patterns.length>0);assert.ok(patterns.length<=2);
    if(rounds.length>=2)for(const pattern of patterns)assert.ok(!(rounds.at(-1).includes(pattern)&&rounds.at(-2).includes(pattern)),'same template not shown for a third consecutive response');
    if(!rounds.length)assert.ok(result.meta.relatedQuestions.some(item=>item.source==='model'));
    // Axis rotation can legitimately omit the model's region proposal on later turns.
    rounds.push(patterns);previous=result.meta.responseModeState;
  }
  assert.equal(relatedPattern('역삼에서도 삼겹살 먹을 곳 찾아줘',state),relatedPattern('성수에서도 국밥 먹을 곳 찾아줘',state),'slot substitutions do not disguise the same template');
  const env={OPENAI_API_KEY:'test-key',RESTAURANT_DATA_SOURCE:'naver',NAVER_API_HUB_CLIENT_ID:'stub',NAVER_API_HUB_CLIENT_SECRET:'stub'};
  const search=await runCase({message:'강남에서 삼겹살 먹을래',env,naverResponse:query=>({items:[{title:(mentionedSearchRegion(query)||'강남')+(normalizeFoodAxis(query)?.menu||'삼겹살')+'집',category:'음식점>'+(normalizeFoodAxis(query)?.menu||'삼겹살'),roadAddress:'서울 '+(mentionedSearchRegion(query)||'강남')+' 테스트길 1'}]})});
  assert.ok(search.body.meta.relatedQuestions.length<=3);assert.ok(search.body.meta.relatedQuestions.every(item=>item.intent!=='service'));
  const modelCall=search.calls.find(call=>call.body?.text?.format?.name==='inchelin_chat_response');assert.match(modelCall.body.instructions,/related_question_context/);assert.match(modelCall.body.instructions,/pending_question/);assert.match(modelCall.body.instructions,/askedSlots/);assert.match(modelCall.body.instructions,/template_history/);
  console.log('v128 related context: pending-slot/mixed-axis conflict, actual detail/card validation, max two, service isolation, normalized three-turn template guard and model input context passed.');
}
