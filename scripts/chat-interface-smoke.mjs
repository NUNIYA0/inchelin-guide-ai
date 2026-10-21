import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyRelatedQuestions, confirmedCombination, clearRelatedSearchCache, validateRelated } from '../worker/related-questions.js';
import { normalizeResponseState } from '../worker/response-modes.js';
import { SEARCH_REGIONS, mentionedSearchRegion } from '../worker/search-axes.js';

export async function testChatInterface(runCase) {
  clearRelatedSearchCache();let searches=0;
  assert.equal(await confirmedCombination('positive',()=>{searches++;return true;}),true);
  assert.equal(await confirmedCombination('positive',()=>{searches++;return false;}),true);assert.equal(searches,1,'reuse confirmed result');
  assert.equal(await confirmedCombination('empty',()=>false),false);
  assert.equal(await confirmedCombination('timeout',()=>new Promise(()=>{}),1),false);
  assert.equal(await confirmedCombination('error',()=>{throw Error('mock');}),false);
  const state=normalizeResponseState({slots:{region:'홍대',menu:'냉면'},lastCards:[{id:'one',name:'홍대냉면',address:'서울 홍대 1',category:'냉면'}]});
  const classify=text=>({intent:/기준|지역.*찾을|현재 위치로/.test(text)?'service':'condition_change',confidence:1,slots:{region:mentionedSearchRegion(text)}});
  for(const text of ['합정에서도 냉면 먹을 곳 찾아줘','성수에서도 냉면 먹을 곳 찾아주세요'])assert.equal(validateRelated(text,{state,parentIntent:'place_search',classify}),null);
  const base={message:'홍대에서 골라봤어요.',suggestions:['다른 메뉴 보기'],restaurants:[state.lastCards[0]],meta:{analysis:{intent:'place_search'},answer_plan:['text','place_cards','chips'],turnPolicy:{actionChips:['다른 곳 보기']},responseModeState:state,
    relatedCandidates:[{text:'같은 조건으로 다른 곳도 보여줘'},{text:'다른 한식 메뉴도 보여줘'},{text:'성수에서도 냉면 먹을 곳 찾아줘'}]}};
  const rejected=await applyRelatedQuestions(base,{messages:[]},classify,async()=>false);
  assert.ok(rejected.meta.relatedQuestions.every(item=>!['region','food','place','more','menu_batch'].includes(item.axis)),'empty/duplicate actions never surface');
  const accepted=await applyRelatedQuestions(base,{messages:[]},classify,async({region,food})=>region==='성수'&&food==='냉면');
  assert.ok(accepted.meta.relatedQuestions.some(item=>item.axis==='region'&&item.text.includes('성수')));
  assert.ok(accepted.meta.relatedQuestions.every(item=>!/주세요|다른 곳|다른 한식 메뉴/.test(item.text)));

  const env={OPENAI_API_KEY:'test-key',RESTAURANT_DATA_SOURCE:'naver',NAVER_API_HUB_CLIENT_ID:'stub',NAVER_API_HUB_CLIENT_SECRET:'stub'};
  const result=await runCase({message:'홍대에서 냉면 먹을 곳 찾아줘',env,naverResponse:query=>({items:query==='홍대 냉면'?[{title:'홍대냉면',category:'음식점>한식>냉면',roadAddress:'서울 마포구 홍대 1'}]:[]}),
    aiResponse:{message:'홍대에서 냉면을 골라봤어요.',suggestions:[],selectedRestaurantIds:[],related_questions:[{text:'합정에서도 냉면 먹을 곳 찾아줘'},{text:'성수에서도 냉면 먹을 곳 찾아줘'},{text:'냉면 말고 국밥 먹을 곳 찾아줘'}]}});
  assert.ok(result.body.meta.relatedQuestions.every(item=>!['region','food','place','companion','more'].includes(item.axis)),'server preflight rejects even correctly classified empty combinations');
  assert.ok(!result.calls.some(call=>call.href.includes('query=')&&new URL(call.href).searchParams.get('query')?.includes('합정')));
  assert.ok(result.body.meta.relatedQuestions.every(item=>!mentionedSearchRegion(item.text)||SEARCH_REGIONS.includes(mentionedSearchRegion(item.text))));

  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  // Execute the actual clipboard, regeneration and composer helpers with browser mocks.
  const fn=name=>html.match(new RegExp('    (?:async )?function '+name+'\\([^]*?\\n    \\}'))?.[0];
  let clipboard='',toast='',generated=[];
  const message={role:'assistant',content:'홍대에서 골라봤어요.',restaurants:[{name:'홍대냉면',category:'냉면',address:'서울 홍대 1'}],meta:{menuCards:[{name:'국밥',description:'따뜻한 한 끼',reason:'국물이 좋아요'}]}};
  const send={id:'chatSend'},input={value:'안녕',style:{},scrollHeight:200,closest:()=>({querySelector:()=>send})};
  const helpers=new Function('navigator','showToast','buildAIRequest','generateAnswer',`
    let chatMessages=[{role:'user',content:'홍대 냉면 찾아줘'},arguments[4]],generating=false;
    const answerRequests=new WeakMap();${fn('copyAnswer')}${fn('regenerateAnswer')}${fn('resizeInput')}
    return {copyAnswer,regenerateAnswer,resizeInput,busy(value){generating=value;},messages:chatMessages};
  `)({clipboard:{writeText:async value=>{clipboard=value;}}},value=>{toast=value;},messages=>({messages}),(...args)=>generated.push(args),message);
  await helpers.copyAnswer(message);assert.match(clipboard,/홍대냉면 · 냉면 · 서울 홍대 1/);assert.match(clipboard,/국밥 · 따뜻한/);assert.match(toast,/복사/);
  helpers.regenerateAnswer(message);assert.equal(generated.length,1);assert.equal(generated[0][1].replaceMessage,message);assert.equal(generated[0][0].messages.length,1);assert.equal(helpers.messages.length,2,'no duplicate user bubble');
  helpers.busy(true);helpers.regenerateAnswer(message);assert.equal(generated.length,1);helpers.busy(false);
  helpers.resizeInput(input);assert.equal(input.style.height,'128px');assert.equal(input.style.overflowY,'auto');input.scrollHeight=26;helpers.resizeInput(input);assert.equal(input.style.height,'26px');assert.equal(input.style.overflowY,'hidden');

  let scrolled=0,button={hidden:true};const win={scrollY:800,innerHeight:600,matchMedia:()=>({matches:true})};
  const scroll=new Function('window','document','requestAnimationFrame',`
    let autoFollowConversation=true,previousScrollY=900,chatMessages=[{}];
    ${fn('isNearConversationBottom')}${fn('updateConversationScroll')}${fn('followConversation')}
    return {updateConversationScroll,followConversation,reset(){autoFollowConversation=true;}};
  `)(win,{documentElement:{scrollHeight:3000},getElementById:()=>button},callback=>callback());
  const anchor={scrollIntoView:options=>{scrolled++;assert.equal(options.behavior,'auto');}};
  scroll.updateConversationScroll();scroll.followConversation(anchor);assert.equal(scrolled,0);assert.equal(button.hidden,false,'reading older messages shows bottom control');
  scroll.reset();scroll.followConversation(anchor);assert.equal(scrolled,1);

  // Execute real generation and stop functions: replacement, cancellation, stale controller safety.
  let resolveAnswer,saved=0;
  class Node { constructor(){this.style={};this.attrs={};}setAttribute(k,v){this.attrs[k]=v;}querySelector(){return null;}remove(){this.removed=true;} }
  const oldNode=new Node(),elements={chatSend:new Node(),chatInput:{...input,value:'',closest:input.closest}};
  const host={children:[oldNode],appendChild(node){this.children.push(node);},querySelector(selector){return selector.includes('status')?this.children.find(node=>node.className?.includes('status')&&!node.removed):oldNode;}};
  const generation=new Function('document','messagesEl','requestAssistant','$','followConversation','saveConversation',`
    let generating=false,regeneratingAnswer=false,activeRequestController=null,generationTimers=[],chatMessages=[arguments[6]],autoFollowConversation=false,currentLocationName='',currentLocationCoords=null;
    const answerRequests=new WeakMap(); const normalizeMessage=value=>value;
    const isNearConversationBottom=()=>false,resizeInput=()=>{},showRequestError=()=>{},renderMessage=(message)=>{const node=document.createElement('div');messagesEl.appendChild(node);return node;};
    const appendMessage=()=>{throw Error('replacement must not append');};
    ${fn('setGenerating')}${fn('stopGeneration')}${fn('generateAnswer')}
    return {generateAnswer,stopGeneration,get messages(){return chatMessages;},get busy(){return generating;}};
  `)({createElement:()=>new Node()},host,()=>new Promise(resolve=>{resolveAnswer=resolve;}),selector=>elements[selector.slice(1)],()=>{},()=>{saved++;},message);
  const pending=generation.generateAnswer({messages:[{role:'user',content:'홍대 냉면 찾아줘'}]},{replaceMessage:message});
  assert.equal(elements.chatSend.attrs['aria-label'],'답변 생성 멈추기');assert.equal(elements.chatSend.disabled,false);assert.equal(elements.chatInput.disabled,false);
  resolveAnswer({content:'새 답변이에요.',restaurants:[],quickReplies:[],meta:{}});await pending;
  assert.equal(generation.messages.length,1);assert.equal(generation.messages[0].content,'새 답변이에요.');assert.equal(oldNode.removed,true);assert.equal(saved,1);assert.equal(generation.busy,false);
  const cancel=generation.generateAnswer({}, {replaceMessage:generation.messages[0]});generation.stopGeneration();resolveAnswer({content:'취소된 답변'});await cancel;assert.equal(generation.messages[0].content,'새 답변이에요.');assert.equal(generation.busy,false);
  assert.doesNotMatch(html,/<nav class="plugin-shortcuts"/);
  assert.match(html,/\.message\.user \{[^}]*max-width: 80%/);assert.match(html,/\.chat-view, \.chat-dock-inner \{ width: min\(720px, 100%\)/);
  assert.match(html,/\.message\.ai \{ gap: 0; margin-bottom: 24px; font-size: 16px; line-height: 1.6/);
  assert.match(html,/\.composer, \.chat-composer \{[^}]*min-height: 52px;[^}]*border-radius: 28px/);
  assert.match(html,/prefers-reduced-motion: reduce\) \{ \.live-reveal[^}]*animation: none/);
  assert.match(html,/if \(shouldSendOnEnter\(event\)\)/);
  assert.doesNotMatch(html,/<i><\/i><i><\/i>/,'one loading dot only');
  for(const width of [360,390])assert.ok((width-32)*.8<width-32,'user 80% and cards fit reading column');
  console.log('v125: preflight/empty/timeout/cache/supported regions/casual tone/chip dedupe; real helper+renderer copy/regenerate/stop/resize/scroll; 360/390 DOM/CSS contracts passed (browser pixels not checked).');
}
