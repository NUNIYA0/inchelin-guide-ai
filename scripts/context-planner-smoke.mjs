import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../build/dist/server/index.js';
import {applyPlan,validatePlan,isolateState,plannerInput} from '../worker/conversation-planner.js';
const faq=JSON.parse(await readFile(new URL('../data/service-faq.json',import.meta.url),'utf8'));
const source=JSON.parse(await readFile(new URL('../data/private/restaurants-261026.json',import.meta.url),'utf8'));
export const contextSamples=[];
const base=()=>({task:'recommend',clarificationReason:null,consentEvidence:null,action:'search',confidence:.95,changes:[],question:null,answer:null,faqId:null,targetIds:[],detailFields:[],unknownConsent:null,clearContext:false});
const change=(slot,value)=>({slot,op:'set',value});
const question=(slot,text)=>({slot,text,choices:[],replaceExisting:false});
const env={OPENAI_API_KEY:'mock-not-a-real-key',NAVER_API_HUB_CLIENT_ID:'mock',NAVER_API_HUB_CLIENT_SECRET:'mock',CHAT_TIMING_LOGS:'false'};
const api=globalThis.InchelinPhase1,point={label:'광화문역',kind:'station',latitude:37.5716,longitude:126.9764,district:'종로구'};
let state=null,history=[],plan=base(),mode='',calls=[],inputs=[],coords=point;
const original=globalThis.fetch;
globalThis.fetch=async(value,options)=>{
  const url=new URL(value);calls.push(url.hostname);
  if(url.hostname==='api.openai.com'){
    const body=JSON.parse(options.body);inputs.push(JSON.parse(body.input[0].content));
    assert.equal(body.text.format.strict,true);assert.equal(body.store,false);assert.ok(body.instructions.includes('資料')||body.instructions.includes('자료'));
    if(mode==='fail')return Response.json({error:'mock'},{status:503});
    if(mode==='timeout')throw new DOMException('mock timeout','TimeoutError');
    if(mode==='malformed')return Response.json({output_text:'{',status:'completed'});
    return Response.json({status:'completed',output_text:JSON.stringify(plan)});
  }
  assert.equal(url.hostname,'naverapihub.apigw.ntruss.com','only mocked planner and actual tool contract');
  const query=url.searchParams.get('query');
  if(query==='광화문역')return Response.json({items:[{title:'광화문역',category:'교통>지하철역',roadAddress:'서울특별시 종로구 세종대로',mapx:'1269764000',mapy:'375716000'}]});
  const row=source.restaurants.find(row=>query.startsWith(row.name+' '));
  return Response.json({items:row?[{title:row.name,category:'음식점>한식',roadAddress:row.roadAddress,address:row.parcelAddress||row.roadAddress,mapx:String(Math.round(coords.longitude*1e7)),mapy:String(Math.round(coords.latitude*1e7))}]:[]});
};
async function turn(text,next={},id='context-test'){
  plan={...base(),...next};calls=[];
  const rawChanges=Object.fromEntries(Object.keys(api.parse('',{},{}).conditions).filter(k=>k!=='radiusConfirmed').map(k=>[k,null]));
  for(const {slot,op,value} of plan.changes)rawChanges[slot]={op,value,evidence:text};
  plan.changes=rawChanges;
  if(plan.action==='clarify'&&!plan.clarificationReason)plan.clarificationReason=plan.question?.slot==='budget'?'missing_budget':plan.question?.slot==='clarify'?'ambiguous_condition':null;
  if(plan.unknownConsent!==null)plan.consentEvidence=text;

  history.push({role:'user',content:text});
  const res=await worker.fetch(new Request('https://example.test/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversationId:id,messages:history,context:{responseModeState:state,currentLocalDatetime:'2026-10-27T12:00:00+09:00'}})}),env,{});
  assert.equal(res.status,200);const body=await res.json();assert.ok(body.message||body.meta.turnPolicy.questionText);state=body.meta.responseModeState;history.push({role:'assistant',content:body.message});return body;
}
try{
  const first=await turn('광화문에서 점심 추천해줘',{changes:[change('location','광화문'),change('visit','오늘 점심')]});
  contextSamples.push(first);assert.equal(state.phase1.conditions.location.label,'광화문역');assert.equal(first.restaurants.length,0);assert.equal(first.meta.turnPolicy.next_question.slot,'radiusMeters');assert.equal(state.phase1.conditionOrigins.radiusMeters,'default');assert.equal(state.phase1.conditionOrigins.visit,'explicit');
  const searched=await turn('1km',{changes:[change('radiusMeters',1000)]});
  contextSamples.push(searched);assert.equal(searched.restaurants.length,3);assert.equal(state.phase1.conditions.visit,'오늘 점심');assert.equal(state.phase1.conditionOrigins.radiusMeters,'explicit');
  for(const card of searched.restaurants){assert.equal(card.mapLinkKind,'detail');assert.ok(card.distanceMeters<=1000);assert.ok(source.restaurants.some(row=>row.sourceId===card.registeredSourceId));}
  const details=await turn('거기는 연락할 수 있어?',{action:'details',targetIds:[searched.restaurants[1].id],detailFields:['hours','phone']});
  assert.equal(details.restaurants[0].id,searched.restaurants[1].id);assert.match(details.message,/연락처|전화번호/);assert.equal(calls.length,1,'detail interpretation comes only from model target/fields, not words');
  const comparison=await turn('이 두 곳은 어때?',{action:'compare',targetIds:searched.restaurants.slice(0,2).map(c=>c.id)});assert.equal(comparison.restaurants.length,2);assert.ok(comparison.restaurants.every(card=>comparison.message.includes(card.name)));assert.equal(calls.length,1);
  const before=structuredClone(state.phase1.conditions);
  const cheaper=await turn('더 저렴한 곳',{action:'clarify',question:question('budget','한 끼 예산은 어느 정도인가요?')});
  contextSamples.push(cheaper);assert.deepEqual(state.phase1.conditions,before);assert.equal(calls.filter(x=>x.includes('naver')).length,0);assert.match(cheaper.meta.turnPolicy.questionText,/예산/);
  coords=api.centers.find(c=>c.label==='홍대입구역');
  await turn('아니, 홍대로',{action:'update_search',changes:[change('location','홍대')]});
  assert.equal(state.phase1.conditions.location.label,'홍대입구역');assert.notEqual(state.phase1.conditions.location.longitude,point.longitude);assert.equal(state.phase1.conditions.radiusMeters,1000);assert.equal(state.phase1.conditions.visit,'오늘 점심');
  const kept=isolateState(state,'context-test',history.length).phase1.conditions;
  const definition=await turn('반경이 뭐야?',{action:'service',faqId:'how_to.radius'});
  contextSamples.push(definition);assert.deepEqual(state.phase1.conditions,kept);assert.equal(definition.restaurants.length,0);assert.match(definition.message,/직선거리/);assert.equal(calls.length,1);
  assert.equal(definition.meta.variant,'service');assert.equal(definition.message,faq.items.find(item=>item.id==='how_to.radius').answer.default);
  const unclear=await turn('그 조건은 빼줘',{action:'clarify',question:question('clarify','어떤 조건을 빼드릴까요?')});assert.deepEqual(state.phase1.conditions,kept);assert.equal(unclear.restaurants.length,0);
  await turn('처음부터',{action:'reset',clearContext:true});assert.equal(state.phase1.conditions.location,null);assert.equal(state.lastCards.length,0);
  await turn('오늘 점심 추천해줘');assert.equal(state.phase1.conditions.location,null);assert.equal(calls.length,1);
  // Different chat id cannot inherit either conditions or target identities.
  state={conversationId:'old',phase1:{conditions:kept},lastCards:searched.restaurants};history=[];
  await turn('추천해줘',{},'new');assert.equal(inputs.at(-1).currentConditions.location,null);assert.equal(inputs.at(-1).visibleCards.length,0);
  // Failure never selects a keyword fallback or performs a restaurant lookup.
  for(const failure of ['fail','timeout','malformed']){mode=failure;const result=await turn('강남역에서 삼겹살 1km');assert.equal(result.meta.recoverable,true);assert.equal(calls.length,1);assert.equal(result.restaurants.length,0);}mode='';
  const bad=await turn('강남역',{changes:[change('radiusMeters',-1)]});assert.equal(bad.meta.recoverable,true);assert.equal(calls.length,1);
  state={conversationId:'context-test',phase1:{conditions:kept}};
  const lost=await turn('없는 역으로 바꿔줘',{action:'update_search',changes:[change('location','없는역')]});assert.equal(state.phase1.conditions.location,null);assert.equal(lost.meta.turnPolicy.next_question.slot,'region');
  const known={conversationId:'same',phase1:{conditions:kept},lastCards:searched.restaurants};
  assert.throws(()=>validatePlan({...base(),action:'answer',changes:[change('location','강남')]},known,faq));
  assert.throws(()=>validatePlan({...base(),targetIds:['invented']},known,faq));
  assert.throws(()=>validatePlan({...base(),changes:[change('radiusMeters',1000),change('radiusMeters',2000)]},known,faq));
  const input=plannerInput(Array.from({length:100},()=>({role:'user',content:'가'.repeat(3000)})),known,{},faq);assert.equal(input.untrustedConversation.length,12);assert.equal(input.untrustedConversation[0].content.length,1800);
  assert.equal(isolateState(known,'other',2).phase1,undefined);
  const cleared=await applyPlan({...base(),changes:[{slot:'budget',op:'clear',value:null}]},{phase1:{conditions:{...kept,budget:'10000원 이하'}}},{},()=>null);assert.equal(cleared.conditions.budget,null);assert.equal(cleared.conditions.location.label,'홍대입구역');
  state={conversationId:'context-test',phase1:{conditions:{...kept,budget:'10,000원 이하'}}};
  const lower=await turn('그보다 싼 곳',{action:'clarify',question:{...question('budget','예산을 얼마까지 낮춰볼까요?'),replaceExisting:true}});assert.equal(lower.meta.turnPolicy.next_question.slot,'budget');assert.equal(state.phase1.conditions.budget,'10,000원 이하');
  state={conversationId:'context-test',phase1:{conditions:{...kept,location:point,companion:'혼밥'},pendingUnknowns:['companion'],acceptedUnknowns:[]}};
  const consent=await turn('미확인 조건을 알고 후보도 보여줘',{task:'consent',action:'answer',unknownConsent:true});
  assert.ok(state.phase1.acceptedUnknowns.includes('companion'));assert.equal(consent.meta.phase1Failure,false);
  await turn('500m 안으로',{task:'change_conditions',changes:[change('radiusMeters',500)]});
  assert.ok(state.phase1.acceptedUnknowns.includes('companion'));assert.equal(state.phase1.conditions.companion,'혼밥');assert.equal(state.phase1.conditions.radiusMeters,500);assert.ok(!state.phase1.pendingUnknowns?.includes('companion'));
  const unavailable=await worker.fetch(new Request('https://example.test/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversationId:'without-runtime-key',messages:[{role:'user',content:'강남역 1km 추천'}]})}),{CHAT_TIMING_LOGS:'false'},{});assert.equal((await unavailable.json()).meta.recoverable,true);
  console.log('Context planner smoke passed: structured-output contract, 7-turn context flow, actual catalogue/tool execution, partial updates, ambiguous clarification, chat isolation, bounded history, invalid plans, failure/timeout safety and verified map links. All AI/provider outputs mocked; no real keys/API calls.');
}finally{globalThis.fetch=original;}
