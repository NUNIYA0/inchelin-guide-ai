import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mentionedSearchRegion,normalizeFoodAxis} from '../worker/search-axes.js';
export async function testV135(runCase){
  const env={OPENAI_API_KEY:'test-key',RESTAURANT_DATA_SOURCE:'naver',NAVER_API_HUB_CLIENT_ID:'stub',NAVER_API_HUB_CLIENT_SECRET:'stub'};
  const dataset=q=>{const region=mentionedSearchRegion(q)||'성수',food=normalizeFoodAxis(q)?.menu||'파스타';return {items:[0,1,2].map(i=>({title:region+food+'식당'+i,category:'음식점>'+food,roadAddress:'서울 '+region+' 테스트길 '+i}))};};
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const fn=name=>html.match(new RegExp('    (?:async )?function '+name+'\\([^]*?\\n    \\}'))[0];
  const rows=new Function(html.slice(html.indexOf('    const CORE_SUGGESTIONS ='),html.indexOf('    const PERIOD_LABELS ='))+';return CORE_SUGGESTIONS;')();
  for(const row of rows){
    for(const typed of [false,true]){
      const r=await runCase({message:row.prompt,env,naverResponse:dataset});
      assert.ok(r.body.message);assert.equal(r.body.restaurants.length,3,row.prompt+' '+typed);
      assert.equal(r.body.meta.turnPolicy.next_question,null);assert.ok(r.body.meta.relatedQuestions.length>=2&&r.body.meta.relatedQuestions.length<=3);
    }
  }
  const region=await runCase({message:'성수에서 먹을 곳 찾아줘',env});assert.ok(region.body.meta.turnPolicy.next_question);assert.equal(region.body.restaurants.length,0);
  const neither=await runCase({message:'먹을 곳 찾아줘',env});assert.equal(neither.body.meta.turnPolicy.next_question.slot,'region','restaurant requests with neither primary axis start with region');
  const food=await runCase({message:'파스타 먹고 싶어',env});assert.equal(food.body.meta.turnPolicy.next_question.slot,'region');
  const again=await runCase({message:'파스타 먹고 싶어',env,context:{responseModeState:food.body.meta.responseModeState}});assert.equal(again.body.meta.turnPolicy.questionText,'');
  const first=await runCase({message:'성수에서 파스타 먹을 곳 찾아줘',env,naverResponse:dataset});
  const group=await runCase({message:'회식이에요',env,naverResponse:dataset,context:{responseModeState:first.body.meta.responseModeState}});
  assert.equal(group.body.restaurants.length,3);assert.equal(group.body.meta.turnPolicy.next_question,null);
  assert.ok(group.body.meta.relatedQuestions.every(q=>q.axis!=='companion'&&!/회식|누구와/.test(q.text)));
  assert.ok(group.body.meta.relatedQuestions.every(q=>!first.body.meta.relatedQuestions.some(old=>old.axis===q.axis)),'no consecutive same axis');
  const quiet=await runCase({message:'조용하게 대화할 수 있는 곳으로 추천해줘',env,naverResponse:dataset,context:{responseModeState:group.body.meta.responseModeState}});
  assert.equal(quiet.body.restaurants.length,3);assert.match(quiet.body.meta.notice,/매장 확인/);assert.ok(quiet.body.meta.relatedQuestions.every(q=>q.axis!=='vibe'));
  const budget=await runCase({message:'예산 2만원 이하로',env,naverResponse:dataset,context:{responseModeState:quiet.body.meta.responseModeState}});assert.match(budget.body.meta.responseModeState.preferences.budget,/2만원/);assert.equal(budget.body.restaurants.length,3);
  const zero=await runCase({message:'성수에서 파스타 먹을 곳 찾아줘',env,naverResponse:{items:[]}});assert.equal(zero.body.meta.relatedQuestions.length,0);assert.ok(zero.body.meta.turnPolicy.expansionChoices.length);
  const service=await runCase({message:'추천 기준이 뭐야?',env});assert.equal(service.body.meta.relatedQuestions.length,0);assert.ok(service.body.meta.turnPolicy.expansionChoices.length);
  class Node{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.attrs={};this.events={};this.textContent='';this.label={textContent:''};}
    appendChild(node){this.children.push(node);return node;}append(...nodes){nodes.forEach(n=>this.appendChild(n));}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,fn){this.events[k]=fn;}remove(){this.removed=true;}
    querySelector(s){return s.includes('first-child')?this.label:this.children.find(n=>n.className==='ai-bubble')||null;}
  }
  const flattened=n=>[n,...(n.children||[]).flatMap(flattened)];
  function harness(reply){
    const host=new Node(),timers=new Map(),buttons=new Map();let tid=0;
    host.querySelector=s=>host.children.find(n=>!n.removed&&(s.includes('status')?n.className?.includes('status'):n.className?.includes('ai')));
    const client=new Function('document','messagesEl','requestAssistant','$','setTimeout','clearTimeout',`
      let generating=false,regeneratingAnswer=false,conversationEpoch=0,activeRequestController=null,generationTimers=[],chatMessages=[],currentLocationName='',currentLocationCoords=null,autoFollowConversation=true,lastAIRequest={messages:[{role:'user',content:'성수에서 파스타 먹을 곳 찾아줘'}]};
      const answerRequests=new WeakMap(),isNearConversationBottom=()=>false,followConversation=()=>{},resizeInput=()=>{},normalizeMessage=x=>x,saveConversation=()=>{},openSearchPicker=()=>{};
      const appendMessage=(role,content)=>{chatMessages.push({role,content});const n=document.createElement('div');n.className='message ai';n.textContent=content;messagesEl.appendChild(n);};
      ${html.match(/    function iconHTML[^\n]+/)[0]}${fn('setGenerating')}${fn('showRequestError')}${fn('stopGeneration')}${fn('generateAnswer')}
      return {generateAnswer,stopGeneration,get busy(){return generating;}};
    `)({createElement:tag=>new Node(tag)},host,reply,s=>{if(!buttons.has(s))buttons.set(s,{...new Node(),setAttribute(){},style:{},closest(){return {querySelector:()=>({id:'chatSend'})};}});return buttons.get(s);},(action,ms)=>{const id=++tid;timers.set(id,{action,ms});return id;},id=>timers.delete(id));
    return {client,host,timers,text:()=>flattened(host).filter(n=>!n.removed).map(n=>n.textContent).join(' ')};
  }
  for(const error of [new Error('network'),Object.assign(new Error('upstream abort'),{name:'AbortError'}),new SyntaxError('json'),new Error('response_rules_changed'),new Error('incomplete_answer')]){
    const h=harness(async()=>{throw error;});await h.client.generateAnswer({messages:[]});assert.match(h.text(),/다시 시도/);assert.match(h.text(),/다른 지역/);assert.match(h.text(),/다른 음식/);assert.equal(h.client.busy,false);
  }
  const noResults=harness(async()=>({content:'조건에 맞는 곳을 찾지 못했어요.',meta:{responseModeState:{noResults:true}}}));await noResults.client.generateAnswer({messages:[]});assert.match(noResults.text(),/찾지 못/);assert.match(noResults.text(),/다시 시도/);
  const slow=harness(()=>new Promise(()=>{}));const pending=slow.client.generateAnswer({messages:[]});
  assert.ok(slow.host.children.some(n=>n.className.includes('status')&&!n.removed));[...slow.timers.values()].find(t=>t.ms===20000).action();assert.equal(slow.host.children[0].label.textContent,'조금 더 걸리고 있어요');
  [...slow.timers.values()].find(t=>t.ms===45000).action();await pending;assert.match(slow.text(),/45초/);assert.match(slow.text(),/다시 시도/);
  let finish;const stopped=harness(()=>new Promise(resolve=>{finish=resolve;}));const p=stopped.client.generateAnswer({messages:[]});stopped.client.stopGeneration();finish({content:'late'});await p;assert.match(stopped.text(),/멈췄어요/);assert.match(stopped.text(),/다시 시도/);
  const safeSave=new Function('localStorage',`let currentId='test',chatMessages=[{role:'user',content:'성수 파스타'}],histories=[],currentLocationName='',currentLocationCoords=null;const renderHistory=()=>{};${fn('saveConversation')}return saveConversation;`)({setItem(){throw new Error('QuotaExceededError');}});assert.doesNotThrow(safeSave,'storage failure cannot strand a user bubble before loading');
  assert.match(html,/controls 14, body 16, titles 16, support 13/);assert.match(html,/min-height:44px/);assert.doesNotMatch(fn('setIconLabel'),/appendChild/);assert.doesNotMatch(fn('renderMessage'),/related-arrow|uiIcon\('sliders'\)/);
  console.log('v135: five welcome prompts + typed counterparts; missing-axis/ready/no-repeat/known preferences/3-place retention; service and zero alternatives; network/abort/JSON/version/partial/zero/stop/20s/45s recovery; storage quota; button type/touch contracts passed (mock only).');
}
