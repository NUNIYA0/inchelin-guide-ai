import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeResponseState} from '../worker/response-modes.js';
import {applyRelatedQuestions,validateRelated,confirmedCombination,clearRelatedSearchCache} from '../worker/related-questions.js';
import {mentionedSearchRegion,normalizeFoodAxis} from '../worker/search-axes.js';
import {withTurnDeadline} from '../worker/turn-policy.js';

export async function testV132(runCase){
  const classify=(text)=>({intent:/비교/.test(text)?'compare':/상세|자세/.test(text)?'specific_place':'condition_change',confidence:1,slots:{region:mentionedSearchRegion(text),...normalizeFoodAxis(text),companion:/회식/.test(text)?'회식':/혼자/.test(text)?'혼자':null}});
  const cards=['땅코참숯구이 강남역직영점','강남고기집 한판도 역삼본점','강남고기한상'].map((name,i)=>({id:'place'+i,name,address:'서울 강남구 1',category:'고깃집'}));
  let previous=normalizeResponseState({slots:{region:'강남',menu:'삼겹살',companion:'회식'},lastCards:cards,askedSlots:['companion']});
  const rounds=[];
  let active=0,maxActive=0;
  const preflight=async()=>{active++;maxActive=Math.max(active,maxActive);await new Promise(resolve=>setTimeout(resolve,35));active--;return true;};
  for(let i=0;i<3;i++){
    const response={message:'골라봤어요.',restaurants:cards,meta:{intent:'place_search',answer_plan:['text','place_cards'],responseModeState:previous}};
    const result=await applyRelatedQuestions(response,{messages:[],context:{responseModeState:previous}},classify,preflight);
    assert.equal(result.meta.relatedQuestions.length,3);
    const axes=result.meta.relatedQuestions.map(q=>q.axis);assert.equal(new Set(axes).size,3);rounds.push(axes);
    assert.ok(result.meta.relatedQuestions.every(q=>!/첫\s*번째|두\s*번째|세\s*번째|마지막|…/.test(q.text)));
    previous=result.meta.responseModeState;
  }
  assert.ok(maxActive>=2,'suggestion existence checks are concurrent');
  assert.ok(rounds[0].includes('food')&&rounds[0].includes('companion'));
  assert.notDeepEqual(rounds[0],rounds[1]);assert.ok(rounds[1].includes('detail')&&rounds[1].includes('compare'),'less recent axes rotate forward');
  const named=`${cards[0].name}랑 ${cards[1].name} 비교해줘`;
  assert.ok(named.length>30&&named.length<=40);
  const state=normalizeResponseState({lastCards:cards,slots:{region:'강남',menu:'삼겹살'}});
  assert.equal(validateRelated(named,{state,parentIntent:'place_search',classify}).axis,'compare');
  assert.equal(validateRelated('첫 번째랑 두 번째 식당 비교해줘',{state,parentIntent:'place_search',classify}),null);
  assert.equal(validateRelated('첫 번째 식당 상세 정보도 알려줘',{state,parentIntent:'place_search',classify}),null);
  clearRelatedSearchCache();let lookups=0;
  const load=async()=>{lookups++;await new Promise(resolve=>setTimeout(resolve,15));return true;};
  assert.deepEqual(await Promise.all([confirmedCombination('same',load),confirmedCombination('same',load)]),[true,true]);
  assert.equal(await confirmedCombination('same',load),true);assert.equal(lookups,1,'in-flight and warm result cache reuse');
  const probe=()=>new Promise(resolve=>setTimeout(resolve,35));
  let bench=performance.now();for(let i=0;i<6;i++)await probe();const serialMs=performance.now()-bench;
  bench=performance.now();await Promise.all(Array.from({length:6},probe));const parallelMs=performance.now()-bench;
  assert.ok(parallelMs<serialMs*.7);console.log('v132 synthetic preflight benchmark ms: '+JSON.stringify({serial:Math.round(serialMs),parallel:Math.round(parallelMs),delayPerCheck:35,count:6}));
  const env={OPENAI_API_KEY:'test-key',RESTAURANT_DATA_SOURCE:'naver',NAVER_API_HUB_CLIENT_ID:'stub',NAVER_API_HUB_CLIENT_SECRET:'stub'};
  const dataset=query=>{const region=mentionedSearchRegion(query)||'강남',food=normalizeFoodAxis(query)?.menu||'삼겹살';return {items:[0,1,2].map(i=>({title:region+food+'집'+i,category:'음식점>'+food,roadAddress:'서울 '+region+' 테스트길 '+i}))};};
  const first=await runCase({message:'강남에서 삼겹살 먹을래',env,naverResponse:dataset,delays:{naver:30,copy:60}});
  const next=await runCase({message:'회식이에요',env,context:{responseModeState:first.body.meta.responseModeState},naverResponse:dataset,delays:{naver:30,copy:60}});
  const linked=await runCase({message:'회식하기 좋은 다른 삼겹살집도 보여줘',env,context:{responseModeState:next.body.meta.responseModeState},naverResponse:query=>{const data=dataset(query);data.items=data.items.map(item=>({...item,title:'새로운'+item.title}));return data;}});
  assert.ok(linked.body.restaurants.length);assert.equal(linked.body.meta.responseModeState.slots.menu,'삼겹살');assert.equal(linked.body.meta.responseModeState.slots.region,'강남');assert.ok(linked.body.restaurants.every(card=>!next.body.restaurants.some(old=>old.id===card.id)),'current-situation link excludes already shown places');
  const timing=result=>Object.fromEntries(result.headers.get('Server-Timing').split(', ').map(value=>{const [key,duration]=value.split(';dur=');return [key,Number(duration)];}));
  const a=timing(first),b=timing(next);
  for(const row of [a,b]){for(const key of ['intent','search','details','copy','decode','policy','suggestions','total'])assert.ok(Number.isFinite(row[key]));assert.ok(row.search>=25&&row.copy>=50);assert.ok(row.suggestions<300,'preflight stage is not six serial waits');}
  console.log('v132 mock stage timings ms (30ms Naver / 60ms answer fixture, NOT live AI): '+JSON.stringify({first:a,next:b,axes:rounds}));
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const fn=name=>html.match(new RegExp('    (?:async )?function '+name+'\\([^]*?\\n    \\}'))[0];
  const pending=[],timerMap=new Map(),errors=[],saved=[];let timerId=0;
  class Node{constructor(){this.label={textContent:''};this.style={};this.attrs={};}setAttribute(k,v){this.attrs[k]=v;}querySelector(s){return s.includes('first-child')?this.label:null;}remove(){this.removed=true;}}
  const host={children:[],innerHTML:'',appendChild(n){this.children.push(n);},querySelector(){return this.children.find(n=>!n.removed);}};
  const input={value:'old',focus(){},style:{},closest(){return {querySelector(){return {id:'chatSend'};}};}};
  const controls=new Map();const dollar=s=>{if(s==='#welcomeInput'||s==='#chatInput')return input;if(!controls.has(s))controls.set(s,new Node());return controls.get(s);};
  const client=new Function('document','messagesEl','requestAssistant','$','followConversation','saveConversation','setTimeout','clearTimeout','showRequestError',`
    let generating=false,regeneratingAnswer=false,conversationEpoch=0,activeRequestController=null,generationTimers=[],currentId='old',chatMessages=[{role:'user',content:'old'}],autoFollowConversation=true,currentLocationName='홍대',currentLocationCoords={latitude:37},lastAIRequest={old:true},locationRequestInFlight=true;
    const answerRequests=new WeakMap(),normalizeMessage=x=>x,isNearConversationBottom=()=>false,clearComparisonTray=()=>{},showWelcome=()=>{},resizeInput=()=>{},setSidebar=()=>{},window={innerWidth:1024};
    function appendMessage(role,content){chatMessages.push({role,content});saveConversation(content);}
    ${html.match(/    function iconHTML[^\n]+/)[0]}${fn('setGenerating')}${fn('stopGeneration')}${fn('newChat')}${fn('generateAnswer')}
    return {generateAnswer,newChat,begin(){currentId='new';chatMessages=[{role:'user',content:'new'}];},get messages(){return chatMessages;},get busy(){return generating;},get last(){return lastAIRequest;}};
  `)({createElement:()=>new Node()},host,()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),dollar,()=>{},content=>saved.push(content),(action,ms)=>{const id=++timerId;timerMap.set(id,{action,ms});return id;},id=>timerMap.delete(id),()=>errors.push('error'));
  const old=client.generateAnswer({messages:[]});client.newChat();assert.deepEqual(client.messages,[]);assert.equal(client.last,null);client.begin();
  const fresh=client.generateAnswer({messages:[]});assert.equal(timerMap.size,2);
  pending[0].reject(new Error('late previous conversation failure'));await old;assert.equal(errors.length,0);assert.equal(timerMap.size,2,'old finalizer must not clear new timers');assert.equal(client.busy,true);
  [...timerMap.values()].find(t=>t.ms===15000).action();assert.match(host.children.at(-1).label.textContent,/찾는 중/);
  pending[1].resolve({content:'new response',restaurants:[],quickReplies:[],meta:{}});await fresh;
  assert.deepEqual(client.messages.map(m=>m.content),['new','new response']);assert.deepEqual(saved,['new response']);assert.equal(timerMap.size,0);
  assert.match(html,/\$\('#startButton'\)\.addEventListener\('click', newChat\)/);assert.match(html,/\$\('#mobileStartButton'\)\.addEventListener\('click', newChat\)/);
  assert.match(html,/messages: JSON.parse\(JSON.stringify\(chatMessages\)\)/,'history saves an immutable snapshot');
  const archive=new Function('$','localStorage','messagesEl',`
    let histories=[],currentId='old',chatMessages=[{role:'user',content:'홍대에서 냉면 먹을래'}],currentLocationName='홍대',currentLocationCoords=null,conversationEpoch=0,lastAIRequest=null,autoFollowConversation=true,locationRequestInFlight=false;
    const window={innerWidth:1024},stopGeneration=()=>{},clearComparisonTray=()=>{},showWelcome=()=>{},resizeInput=()=>{},setSidebar=()=>{},renderHistory=()=>{},leaveSharedConversation=()=>{},renderConversation=()=>{},updateShareVisibility=()=>{},normalizeMessage=x=>({...x});
    const welcome={style:{}},guidePanel={classList:{remove(){}}},chatView={classList:{add(){}}},main={classList:{add(){}}};
    ${fn('saveConversation')}${fn('newChat')}${fn('openHistory')}
    return {saveConversation,newChat,openHistory,begin(){currentId='fresh';chatMessages=[{role:'user',content:'강남에서 삼겹살 먹을래'}];},mutate(){chatMessages.push({role:'assistant',content:'추가 답변'});},get messages(){return chatMessages;},get histories(){return histories;}};
  `)(dollar,{setItem(){}},host);
  archive.saveConversation();archive.newChat();assert.deepEqual(archive.messages,[]);archive.begin();archive.saveConversation();archive.mutate();
  assert.equal(archive.histories.find(h=>h.id==='fresh').messages.length,1,'saved history does not retain a mutable active-array alias');
  archive.saveConversation();assert.equal(archive.histories.length,2);archive.openHistory('old');assert.deepEqual(archive.messages.map(m=>m.content),['홍대에서 냉면 먹을래']);archive.openHistory('fresh');assert.deepEqual(archive.messages.map(m=>m.content),['강남에서 삼겹살 먹을래','추가 답변']);
  const source=await readFile(new URL('../worker/index.template.js',import.meta.url),'utf8');
  const providerSource=source.match(/class NaverRestaurantProvider[^]*?\n\}/)[0];let finishBackup;
  const Provider=new Function('trustedEndpoint','safeText','naverRestaurantSearchQueries','providerDebugLog','getJsonWithTimeout','sanitizeNaverPlace','validateRestaurantCandidate','RestaurantProviderError','UpstreamHttpError',providerSource+';return NaverRestaurantProvider;')(
    x=>x,(x)=>String(x||''),()=>['primary','backup'],()=>{},async url=>new URL(url).searchParams.get('query')==='primary'?{items:[{name:'winner'}]}:new Promise(resolve=>{finishBackup=resolve;}),x=>x,()=>true,Error,Error);
  const quick=new Provider({NAVER_API_HUB_CLIENT_ID:'stub',NAVER_API_HUB_CLIENT_SECRET:'stub'});let gotWinner=false;
  const win=quick.searchRestaurants({messages:[],locationName:'강남',intentAnalysis:{}}).then(result=>{gotWinner=true;return result;});
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(gotWinner,true,'a valid primary result must not wait for a slow parallel backup');finishBackup({items:[]});assert.equal((await win).places[0].name,'winner');
  const analyzer=source.match(/async function analyzeResponseModeIntent\([^]*?\n\}/)[0];let deadlines=[];
  const fallback={intent:'food_talk',sub_intent:null,slots:{}};
  const analyze=new Function('normalizeResponseState','fallbackResponseModeAnalysis','IMMEDIATE_REQUEST','locationMatches','buildIntentAnalysisInstructions','withTurnDeadline','fetch','normalizeAnalysis','extractOutputText','validRegionCandidate','console','RESPONSE_MODE_SCHEMA',analyzer+';return analyzeResponseModeIntent;')(
    normalizeResponseState,()=>fallback,/impossible/,()=>[],()=>'',(action,ms)=>{deadlines.push(ms);return withTurnDeadline(action,10);},async()=>({ok:true,json:()=>new Promise(()=>{})}),x=>x,x=>x,()=>true,{error(){}},{});
  assert.equal(await analyze({OPENAI_API_KEY:'stub'},[{role:'user',content:'음식 이야기'}],{}),fallback);assert.deepEqual(deadlines,[2000,2000],'JSON body is covered by each classifier deadline');
  console.log('v132 axis rotation/full-name 40-char/no ordinals; parallel preflight/cache; header stage timings; 15s progress; stale request/new-chat timer isolation; classifier JSON timeout passed.');
}
