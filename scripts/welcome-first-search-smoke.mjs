import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeFoodAxis,mentionedSearchRegion} from '../worker/search-axes.js';
import {FORBIDDEN_COPY} from '../worker/conversation-copy.js';
import {applyRelatedQuestions} from '../worker/related-questions.js';
import {normalizeResponseState} from '../worker/response-modes.js';

export async function testWelcomeFirstSearch(runCase){
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const fn=name=>html.match(new RegExp('    (?:async )?function '+name+'\\([^]*?\\n    \\}'))?.[0];
  const rows=new Function(html.slice(html.indexOf('    const CORE_SUGGESTIONS ='),html.indexOf('    const PERIOD_LABELS ='))+';return CORE_SUGGESTIONS;')();
  assert.equal(rows.length,5);
  const env={OPENAI_API_KEY:'test-key',RESTAURANT_DATA_SOURCE:'naver',NAVER_API_HUB_CLIENT_ID:'stub',NAVER_API_HUB_CLIENT_SECRET:'stub'};
  const fixture=query=>{const region=mentionedSearchRegion(query),food=normalizeFoodAxis(query)?.menu;return{items:region&&food?Array.from({length:3},(_,i)=>({title:region+food+i,category:'음식점>'+food,roadAddress:'서울 '+region+' 테스트길 '+i,mapx:'1270000000',mapy:'375000000'})):[]};};
  const dirty={message:'강남에서 삼겹살 집 3곳 추천 준비.',turn_text:{summary:'강남에서 삼겹살 집 3곳 추천 준비.',reason:'새로 말씀해 주신 쪽으로 먹을 곳을 다시 골라봤어요.'},suggestions:[],selectedRestaurantIds:[],next_question:null};
  const run=message=>runCase({message,env,naverResponse:fixture,aiResponses:[dirty,dirty]});
  const shape=body=>{
    assert.equal(body.restaurants.length,3);assert.equal(body.meta.analysis.intent,'place_search');
    for(const block of ['text','place_cards','source','question','chips','related_questions'])assert.ok(body.meta.answer_plan.includes(block),block);
    assert.equal(body.meta.turnPolicy.questionText,'누구와 가세요?');assert.equal(body.suggestions.length,5);
    assert.ok(body.meta.relatedQuestions.length>=1);assert.ok(body.meta.relatedQuestions.every(item=>['region','food','companion','compare'].includes(item.axis)));
    assert.doesNotMatch(body.message,FORBIDDEN_COPY);assert.doesNotMatch(body.message,/새로 말씀|다시|준비|처리|생성|분석/);
  };
  const nodes=node=>[node,...node.children.flatMap(nodes)];
  class Node{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.events={};this.attributes={};this.style={};this.value='';this.scrollHeight=26;this.dataset={};this.className='';this.classList={add:n=>{this.className+=' '+n;},remove:n=>{this.className=this.className.replace(n,'');},contains:n=>this.className.split(' ').includes(n)};}
    appendChild(node){this.children.push(node);node.parent=this;return node;}append(...children){children.forEach(child=>this.appendChild(child));}
    set innerHTML(v){this.children=[];}set textContent(v){this.text=v;this.children=[];}get textContent(){return(this.text||'')+this.children.map(n=>n.textContent).join(' ');}
    setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}
    addEventListener(k,v){this.events[k]=v;}click(){this.events.click?.();}focus(){}closest(){return{querySelector:()=>({id:'chatSend'})};}remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
    querySelectorAll(selector){return nodes(this).filter(node=>selector.split(',').some(part=>part.trim().startsWith('.')&&part.trim().slice(1).split(/[.: ]/).filter(Boolean).every(cls=>node.className.split(' ').includes(cls))));}
    querySelector(selector){const found=this.querySelectorAll(selector);return selector.includes('last-child')?found.at(-1):found[0];}
    scrollIntoView(){}
  }
  const cls=(root,c)=>nodes(root).filter(n=>n.className.split(' ').includes(c));
  const renderSource=html.slice(html.indexOf('    const comparisonTray = new Map();'),html.indexOf('    function appendMessage('));
  async function app(partial=false){
    const elements=Object.fromEntries(['welcome','chatView','main','guidePanel','messages','welcomeInput','chatInput','chatSend','conversationBottom','comparisonTray','suggestions','welcomeForm'].map(id=>[id,new Node()]));
    const document={createElement:tag=>new Node(tag),getElementById:id=>elements[id]||null};
    const main=elements.main,welcome=elements.welcome,chatView=elements.chatView,guidePanel=elements.guidePanel,messagesEl=elements.messages;
    const requests=[];
    const fetch=async(url,options)=>{const request=JSON.parse(options.body);requests.push(request);if(partial)return Response.json({message:'홍대에서 냉면 먹을 곳 3곳을 골라봤어요.'});const result=await run(request.messages.at(-1).content);return Response.json(result.body);};
    const source=`
      let currentId='old',currentLocationName='역삼',currentLocationCoords=null,chatMessages=[{role:'assistant',content:'이전 기록',restaurants:[],meta:{responseModeState:{slots:{region:'역삼'},lastCards:[{id:'old'}]}}}],generating=false,autoFollowConversation=true,lastAIRequest=null,activeRequestController=null,generationTimers=[],regeneratingAnswer=false,pending;
      const answerRequests=new WeakMap(),AI_API_ENDPOINT='/api/chat';
      const $=selector=>document.getElementById(selector.slice(1)),qsa=()=>[],saveConversation=()=>{},updateShareVisibility=()=>{},leaveSharedConversation=()=>{},setSidebar=()=>{},stopGeneration=()=>{},showToast=()=>{},followConversation=()=>{},isNearConversationBottom=()=>true;
      const normalizeRestaurant=value=>value,appendLimitedMarkdown=(node,text)=>{node.textContent=text;};
      const resolveRestaurantDetail=()=>{},canUseCurrentLocation=()=>false,chooseMenuCard=()=>{},openSearchPicker=()=>{},runPlugin=()=>{},copyAnswer=()=>{},regenerateAnswer=()=>{};
      const getLocalTimeState=()=>({localDateTime:'2026-10-21',timeZone:'Asia/Seoul',periodLabel:'점심'});
      ${fn('hasExplicitTimeCondition')}${fn('buildAIRequest')}${fn('extractAssistantText')}${fn('assertCompleteAnswer')}${fn('requestAssistant')}${fn('normalizeMessage')}${fn('resizeInput')}
      ${renderSource}${fn('appendMessage')}${fn('showWelcome')}${fn('newChat')}${fn('showChatView')}${fn('isCurrentLocationIntent')}${fn('routeQuestion')}${fn('ask')}${fn('submitWelcomeQuestion')}${fn('setGenerating')}${fn('showRequestError')}
      ${fn('generateAnswer').replace('async function generateAnswer','async function performGeneration')}
      function generateAnswer(...args){pending=performGeneration(...args);return pending;}
      ${html.match(/    \$\('#suggestions'\)\.addEventListener\('click'[^]*?\n    \}\);/)[0]}
      ${html.match(/    \$\('#welcomeForm'\)\.addEventListener[^\n]+/)[0]}
      return {clickRow(index){document.getElementById('suggestions').events.click({target:{closest:()=>({dataset:{index}})}});},type(value){document.getElementById('welcomeInput').value=value;document.getElementById('welcomeForm').events.submit({preventDefault(){}});},done:()=>pending,get messages(){return chatMessages;}};
    `;
    const api=new Function('document','window','fetch','main','welcome','chatView','guidePanel','messagesEl','activeSuggestions',source)(document,{innerWidth:360,matchMedia:()=>({matches:true})},fetch,main,welcome,chatView,guidePanel,messagesEl,rows);
    return {api,elements,requests};
  }
  for(const row of rows){
    const direct=await run(row.prompt);shape(direct.body);
    const {api,elements,requests}=await app();api.clickRow(rows.indexOf(row));await api.done();
    assert.equal(requests.length,1);assert.equal(requests[0].messages.length,1,'welcome clears stale history');assert.equal(requests[0].context.responseModeState,null);
    assert.equal(api.messages.length,2);assert.equal(api.messages[0].content,row.prompt);assert.equal(elements.welcome.style.display,'none');assert.ok(elements.chatView.classList.contains('active'));
    assert.equal(cls(elements.messages,'restaurant-card').length,3,row.prompt+' actual welcome render');assert.equal(cls(elements.messages,'turn-question').length,1);assert.ok(cls(elements.messages,'related-question').length);
    assert.deepEqual(api.messages[1].restaurants.map(c=>c.id),direct.body.restaurants.map(c=>c.id));assert.deepEqual(api.messages[1].meta.answer_plan,direct.body.meta.answer_plan);
    const typed=await app();typed.api.type(row.prompt);await typed.api.done();assert.equal(cls(typed.elements.messages,'restaurant-card').length,3);assert.deepEqual(typed.requests[0].messages,requests[0].messages);assert.deepEqual(typed.requests[0].context,requests[0].context);
  }
  const partial=await app(true);partial.api.clickRow(0);await partial.api.done();assert.equal(cls(partial.elements.messages,'retry-button').length,1,'incomplete response goes through real request rejection → generation catch → retry UI');assert.equal(partial.api.messages.length,1,'do not persist incomplete text as a successful answer');
  const check=new Function(fn('assertCompleteAnswer')+';return assertCompleteAnswer;')();
  assert.throws(()=>check({content:'홍대에서 냉면 먹을 곳 3곳을 골라봤어요.',restaurants:[],meta:null}),/incomplete_answer/);
  assert.throws(()=>check({content:'3곳을 골라봤어요.',restaurants:[],meta:{answer_plan:['text']}}),/incomplete_answer/);
  const errorHost=new Node(),retry=new Function('document','messagesEl','isNearConversationBottom','followConversation','generateAnswer',fn('showRequestError')+';return showRequestError;')({createElement:tag=>new Node(tag)},errorHost,()=>false,()=>{},()=>{});
  retry({});assert.equal(cls(errorHost,'retry-button')[0].textContent,'다시 시도');assert.match(html,/answer_timeout/);assert.match(html,/30000/);
  const desktop=(width,fine,coarse)=>new Function('window',fn('shouldSendOnEnter')+';return shouldSendOnEnter;')({innerWidth:width,matchMedia:q=>({matches:q.includes('fine')?fine:coarse})});
  for(const [width,fine,coarse,expected] of [[1024,true,false,true],[768,false,false,true],[600,true,false,true],[390,false,true,false],[1024,false,true,true]]){
    const send=desktop(width,fine,coarse);assert.equal(send({key:'Enter'}),expected);assert.equal(send({key:'Enter',shiftKey:true}),false);assert.equal(send({key:'Enter',isComposing:true}),false);assert.equal(send({key:'Enter',keyCode:229}),false);
  }
  for(const fragment of ['삼겹살 집 3곳 추천 준비.','홍대 냉면 분석.','응답 처리.','답변 생성.','식당 검색.'])assert.match(fragment,FORBIDDEN_COPY);
  const first=await runCase({message:'강남에서 삼겹살 먹을래',env,naverResponse:fixture,analyzerEnabled:true,modeIntentAnalysis:{intent:'condition_change',confidence:1,slots:{menu:'삼겹살',region:'강남'},change:{slot:'menu',action:'replace'},flags:{food_related:true}},aiResponses:[dirty,dirty]});shape(first.body);assert.equal(first.body.meta.responseModeState.stage,'ready');
  const state=normalizeResponseState({slots:{region:'홍대',menu:'냉면'},lastCards:[{id:'one',name:'홍대냉면'}]});
  const pure={message:'골라봤어요.',restaurants:state.lastCards,suggestions:[],meta:{intent:'place_search',analysis:{intent:'place_search'},answer_plan:['text','place_cards'],responseModeState:state,relatedCandidates:[{text:'추천은 어떤 기준으로 해?'}]}};
  const classify=text=>({intent:/기준/.test(text)?'service':'condition_change',confidence:1,slots:{region:mentionedSearchRegion(text)}});
  const zero=await applyRelatedQuestions(pure,{messages:[]},classify,async()=>false);assert.deepEqual(zero.meta.relatedQuestions,[],'no FAQ/compare filler if search preflights fail');
  const one=await applyRelatedQuestions(pure,{messages:[]},classify,async({region})=>region==='성수');assert.equal(one.meta.relatedQuestions.length,1,'keep one verified suggestion instead of adding FAQ');
  console.log('v126: five welcome rows → actual ask/request/generate/render vs direct; first-search blocks/copy; partial retry; related axes; Enter/Shift/IME/fine/coarse passed.');
}
