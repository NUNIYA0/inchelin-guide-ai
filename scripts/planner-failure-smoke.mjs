import assert from 'node:assert/strict';
import '../worker/phase1-core.js';
import {analyzePlan,plannerFailure} from '../worker/conversation-planner.js';
import worker from '../build/dist/server/index.js';

const faq={items:[]},env={OPENAI_API_KEY:'test-placeholder',CHAT_TIMING_LOGS:'false'};
const messages=[{role:'user',content:'지금 가기 좋은 카페 추천해줘'}];
for(const [status,code,category] of [[401,'invalid_api_key','authentication'],[429,'insufficient_quota','quota'],[429,'rate_limit_exceeded','rate_limit'],[403,'permission_denied','access'],[404,'model_not_found','access'],[400,'invalid_json_schema','configuration'],[503,'server_error','provider']]){
  let caught;
  try{await analyzePlan(env,messages,{}, {},faq,async()=>Response.json({error:{code,type:'invalid_request_error',param:'text.format.schema',message:'DO_NOT_LOG_PROVIDER_BODY'}},{status,headers:{'x-request-id':'req_test'}}));}catch(error){caught=error;}
  assert.ok(caught);const failure=plannerFailure(caught);
  assert.equal(failure.category,category);assert.equal(failure.diagnostic.status,status);
  assert.equal(failure.diagnostic.upstreamCode,code);assert.equal(failure.diagnostic.providerRequestId,'req_test');
  assert.doesNotMatch(JSON.stringify(failure),/DO_NOT_LOG_PROVIDER_BODY|test-placeholder/);
}
assert.equal(plannerFailure(new DOMException('timeout','TimeoutError')).category,'timeout');
assert.equal(plannerFailure(new TypeError('fetch failed')).category,'transport');
assert.equal(plannerFailure(new SyntaxError('invalid JSON')).category,'invalid_response');

const original=globalThis.fetch,originalError=console.error,logs=[];
try{
  console.error=value=>logs.push(value);
  globalThis.fetch=async()=>Response.json({error:{code:'insufficient_quota',type:'insufficient_quota',message:'DO_NOT_LOG_PROVIDER_BODY'}},{status:429,headers:{'x-request-id':'req_regression'}});
  const conditions={location:null,radiusMeters:1000,radiusConfirmed:false,food:'냉면',foodDirection:null};
  const pendingQuestion={slot:'location',text:'어디에서 찾을까요?',choices:[]};
  const previous={conversationId:'planner-failure',lastCards:[{id:'kept-card',name:'기존 카드'}],phase1:{conditions,pendingQuestion}};
  const response=await worker.fetch(new Request('https://example.test/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversationId:'planner-failure',messages,context:{responseModeState:previous}})}),env,{});
  const body=await response.json();assert.ok(body.message);assert.match(body.message,/이용 한도/);
  assert.equal(body.meta.phase1Failure,true);assert.equal(body.meta.recoverable,true);assert.equal(body.meta.failureCategory,'quota');
  assert.equal(body.meta.responseModeState.phase1.conditions.food,'냉면');
  assert.deepEqual(body.meta.responseModeState.phase1.pendingQuestion,pendingQuestion);
  assert.equal(body.meta.responseModeState.lastCards[0].id,'kept-card');
  assert.equal(JSON.parse(logs[0]).upstreamCode,'insufficient_quota');
  assert.doesNotMatch(JSON.stringify({body,logs}),/DO_NOT_LOG_PROVIDER_BODY|test-placeholder|req_regression.*authorization/);
  assert.equal(body.meta.providerRequestId,undefined,'provider diagnostics stay server-side');
}finally{globalThis.fetch=original;console.error=originalError;}
console.log('Planner failure smoke passed: provider classes, private diagnostics, visible failure response, conditions/cards/pending question preserved. No live API calls.');
