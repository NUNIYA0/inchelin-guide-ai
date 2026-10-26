import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../dist/assets/recommendation-flags.js';
import '../dist/assets/recommendations-ui.js';

export async function testPhase1Client(runCase,samples,requestCase=runCase){
  const deploymentFlags=globalThis.InchelinRecommendationFlags;
  globalThis.InchelinRecommendationFlags={enabled:false,connected:false};
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const fn=name=>{const value=html.match(new RegExp('    (?:async )?function '+name+'\\([^]*?\\n    \\}'))?.[0];assert.ok(value,name);return value;};
  const flatten=n=>[n,...n.children.flatMap(flatten)],cls=(root,name)=>flatten(root).filter(n=>n.className.split(' ').includes(name));
  class Node{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.events={};this.dataset={};this.style={};this.className='';this.value='';this.scrollHeight=26;this.classList={add:name=>this.className+=' '+name,remove:name=>this.className=this.className.split(' ').filter(n=>n!==name).join(' '),contains:name=>this.className.split(' ').includes(name)};}
    appendChild(n){this.children.push(n);n.parent=this;return n;}append(...nodes){nodes.forEach(n=>this.appendChild(n));}replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    set innerHTML(value){this.children=[];if(String(value).includes('thinking-dots')){const bubble=new Node();bubble.className='ai-bubble';const label=new Node('span');label.textContent='생각하는 중';bubble.append(label);this.append(bubble);}}
    set textContent(value){this.text=value;this.children=[];}get textContent(){return(this.text||'')+this.children.map(n=>n.textContent).join(' ');}
    setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];delete this[k];}
    addEventListener(k,fn){this.events[k]=fn;}click(){if(!this.disabled)this.events.click?.();}remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
    focus(){}scrollIntoView(){}closest(){return{querySelector:()=>({id:'chatSend'})};}getBoundingClientRect(){return{left:16,right:344,top:0,bottom:600};}showModal(){this.open=true;}close(){this.open=false;this.events.close?.();}
    querySelectorAll(selector){return flatten(this).filter(n=>selector.split(',').some(p=>p.trim().startsWith('.')&&p.trim().slice(1).split(/[.: >]/)[0]&&n.className.split(' ').includes(p.trim().slice(1).split(/[.: >]/)[0])));}
    querySelector(selector){if(selector.includes('span:first-child'))return flatten(this).find(n=>n.tagName==='SPAN');return this.querySelectorAll(selector)[selector.includes('last-child')?'at':'at'](selector.includes('last-child')?-1:0);}
  }
  const originalDocument=globalThis.document,originalStorage=globalThis.sessionStorage;
  try{
    function app({kind='',skew=0,clock=false}={}){
      const ids=['welcome','chatView','main','guidePanel','messages','welcomeInput','chatInput','chatSend','conversationBottom','comparisonTray','suggestions','welcomeForm'];const elements=Object.fromEntries(ids.map(id=>[id,new Node()]));
      const document={body:new Node('body'),createElement:tag=>new Node(tag),createElementNS:(ns,tag)=>new Node(tag),getElementById:id=>elements[id]||null};globalThis.document=document;
      const memory=new Map();globalThis.sessionStorage={setItem:(k,v)=>memory.set(k,v),getItem:k=>memory.get(k),removeItem:k=>memory.delete(k)};
      const requests=[],opened=[],timers=new Map();let reloaded=false,timerId=0;
      const fetch=async(url,options)=>{
        const request=JSON.parse(options.body);requests.push(request);
        if(kind==='network')throw new Error('network');
        if(kind==='hang')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('stopped'),{name:'AbortError'}))));
        if(kind==='json')return new Response('{');
        const result=await(kind==='consent'?requestCase:runCase)(request.messages.at(-1).content,{state:request.context.responseModeState,demoMode:request.context.demoMode,...(kind==='zero'?{data:{items:[]}}:{})});
        result.body.meta.generatedAt+=skew;if(kind==='version')result.body.meta.responseRulesVersion='v136';return Response.json(result.body);
      };
      const source=`
        const scopedKey=key=>key;
        let currentId='old',chatMessages=[],currentLocationName='',currentLocationCoords=null,generating=false,autoFollowConversation=true,lastAIRequest=null,activeRequestController=null,generationTimers=[],conversationEpoch=0,locationRequestInFlight=false,regeneratingAnswer=false,pending;
        const answerRequests=new WeakMap(),AI_API_ENDPOINT='/api/chat',activeSuggestions=globalThis.InchelinPhase1.welcome(12);
        const $=s=>document.getElementById(s.slice(1)),qsa=()=>[],saveConversation=()=>{},updateShareVisibility=()=>{},leaveSharedConversation=()=>{},setSidebar=()=>{},showToast=()=>{},followConversation=()=>{},isNearConversationBottom=()=>true;
        const appendLimitedMarkdown=(node,text)=>node.textContent=text,resolveRestaurantDetail=()=>{},canUseCurrentLocation=()=>false,chooseMenuCard=()=>{},runPlugin=()=>{},copyAnswer=()=>{},regenerateAnswer=()=>{},openSearchPicker=()=>{},requestCurrentLocation=()=>{},focusManualLocationInput=()=>{};
        const getLocalTimeState=()=>({localDateTime:'2026-10-22T12:00:00+09:00',timeZone:'Asia/Seoul',periodLabel:'점심'});
        const pluginState=()=>[...chatMessages].reverse().find(m=>m.meta?.responseModeState)?.meta.responseModeState||{};
        ${fn('safeHttpUrl')}${fn('normalizeNaverPlaceDetails')}${fn('normalizeRestaurant')}${fn('hasExplicitTimeCondition')}${fn('buildAIRequest')}${fn('extractAssistantText')}${fn('assertCompleteAnswer')}${fn('requestAssistant')}${fn('normalizeMessage')}${fn('resizeInput')}
        ${html.slice(html.indexOf('    const comparisonTray = new Map();'),html.indexOf('    function appendMessage(')).replace(/import\('\/assets\/phase1-sheets.js\?v=\d+'\)/,'loadSheetModule()')}
        ${fn('appendMessage')}${fn('showWelcome')}${fn('newChat')}${fn('showChatView')}${fn('isCurrentLocationIntent')}${fn('routeQuestion')}${fn('ask')}${fn('submitWelcomeQuestion')}${fn('setGenerating')}${fn('showRequestError')}${fn('stopGeneration')}
        ${fn('generateAnswer').replace('async function generateAnswer','async function performGeneration')}
        function generateAnswer(...args){pending=performGeneration(...args);return pending;}
        ${html.match(/    \$\('#suggestions'\)\.addEventListener\('click'[^]*?\n    \}\);/)[0]}
        ${html.match(/    \$\('#welcomeForm'\)\.addEventListener[^\n]+/)[0]}
        return {type(value){document.getElementById('welcomeInput').value=value;document.getElementById('welcomeForm').events.submit({preventDefault(){}});},clickRow(index){document.getElementById('suggestions').events.click({target:{closest:()=>({dataset:{index}})}});},send:routeQuestion,done:()=>pending,stop:stopGeneration,edit:openPhase1Condition,render:message=>renderMessage(normalizeMessage(message)),get messages(){return chatMessages;},get busy(){return generating;},request:()=>buildAIRequest(chatMessages),setFocus:setPhase1Focus};
      `;
      const api=new Function('document','window','fetch','main','welcome','chatView','guidePanel','messagesEl','location','loadSheetModule','setTimeout','clearTimeout',source)(document,{innerWidth:360,matchMedia:()=>({matches:true}),open:(...args)=>opened.push(args)},fetch,elements.main,elements.welcome,elements.chatView,elements.guidePanel,elements.messages,{reload:()=>reloaded=true},()=>import('../dist/assets/phase1-sheets.js'),clock?(action,ms)=>{const id=++timerId;timers.set(id,{action,ms});return id;}:setTimeout,clock?id=>timers.delete(id):clearTimeout);
      return{api,elements,document,requests,opened,memory,timers,get reloaded(){return reloaded;}};
    }
    for(const prompt of ['오늘 점심 추천해줘','냉면 먹고 싶어','오늘 뭐 먹지','홍대 맛집 추천해줘','성수에서 파스타','강남역에서 한식, 만 원 이하로'])for(const skew of [0,60000]){
      const a=app({skew});a.api.type(prompt);await a.api.done();assert.equal(a.api.messages.length,2,prompt);assert.equal(a.requests.length,1);assert.equal(cls(a.elements.messages,'retry-button').length,0);
      assert.ok(a.elements.chatView.classList.contains('active'));assert.equal(a.elements.welcome.style.display,'none');assert.equal(a.api.busy,false);
      const hasLocation=/홍대|성수|강남역/.test(prompt);assert.equal(cls(a.elements.messages,'restaurant-card').length,hasLocation?3:0,prompt);assert.equal(cls(a.elements.messages,'turn-question').length,hasLocation?0:1);assert.ok(!/새 버전/.test(a.elements.messages.textContent));
      if(!hasLocation)assert.equal(cls(a.elements.messages,'phase1-conditions').length,0,'no chips until location is resolved');
    }
    for(let index=0;index<3;index++){const a=app();a.api.clickRow(index);await a.api.done();assert.equal(a.api.messages.length,2);assert.equal(cls(a.elements.messages,'turn-question').length,1);assert.equal(cls(a.elements.messages,'retry-button').length,0);}
    const gated=app({kind:'consent'});gated.api.type('강남역에서 한식, 만 원 이하로 혼자 먹을 거야');await gated.api.done();assert.equal(cls(gated.elements.messages,'restaurant-card').length,0);assert.match(gated.elements.messages.textContent,/연결되지|미확인/);const consent=cls(gated.elements.messages,'quick-reply').find(n=>n.textContent==='미확인 후보 보기');assert.ok(consent);consent.click();await gated.api.done();assert.equal(cls(gated.elements.messages,'restaurant-card').length,3);assert.ok(cls(gated.elements.messages,'condition-evidence').length);assert.match(gated.elements.messages.textContent,/미확인/);assert.equal(gated.api.request().context.responseModeState.phase1.conditions.budget,'1만 원 이하');
    const a=app();a.api.type('강남역에서 한식, 만 원 이하로');await a.api.done();
    assert.equal(cls(a.elements.messages,'registered-recommendations').length,0,'production flag off');
    const oldFlags=globalThis.InchelinRecommendationFlags;
    try{
      const off=app();off.api.render({role:'assistant',content:samples.enabled.body.message,restaurants:samples.enabled.body.restaurants,meta:samples.enabled.body.meta});assert.equal(cls(off.elements.messages,'registered-recommendations').length,0,'off ignores incoming authored records too');
      globalThis.InchelinRecommendationFlags={enabled:true,connected:true};
      const rec=app();rec.api.render({role:'assistant',content:samples.solo.body.message,restaurants:samples.solo.body.restaurants,meta:samples.solo.body.meta});
      const sections=cls(rec.elements.messages,'registered-recommendations');assert.equal(sections.length,3);
      assert.match(sections[0].textContent,/테스트 전용 작성자 하나/);assert.ok(sections[0].textContent.includes(samples.fixture.restaurants[0].recommendations[0].reason));
      assert.match(sections[1].textContent,/추천인 정보 없음/);assert.match(sections[1].textContent,/추천 이유 없음/);assert.equal(cls(sections[1],'recommendations-toggle').length,0);
      assert.match(sections[2].textContent,/등록된 추천이 없어요/);assert.equal(cls(sections[2],'recommendations-toggle').length,0);
      const toggle=cls(sections[0],'recommendations-toggle')[0],extra=cls(sections[0],'additional-recommendations')[0];
      assert.equal(toggle.textContent,'다른 추천 2개 보기');assert.equal(extra.hidden,true);
      const beforeRequests=rec.requests.length,beforeConditions=JSON.stringify(rec.api.messages),links=cls(rec.elements.messages,'restaurant-map-link').filter(n=>n.tagName==='A').map(n=>n.href);
      toggle.click();assert.equal(extra.hidden,false);assert.equal(toggle.attributes['aria-expanded'],'true');assert.equal(toggle.textContent,'다른 추천 접기');assert.match(extra.textContent,/── 다른 추천 2개 ──/);
      assert.equal(cls(sections[0],'registered-recommendation').length,3);
      toggle.click();assert.equal(extra.hidden,true);assert.equal(rec.requests.length,beforeRequests);assert.equal(JSON.stringify(rec.api.messages),beforeConditions);assert.deepEqual(cls(rec.elements.messages,'restaurant-map-link').filter(n=>n.tagName==='A').map(n=>n.href),links);
      rec.api.render({role:'assistant',content:samples.solo.body.message,restaurants:samples.solo.body.restaurants,meta:samples.solo.body.meta});toggle.click();assert.equal(extra.hidden,false);assert.equal(cls(rec.elements.messages,'additional-recommendations').at(-1).hidden,true,'only the clicked card expands, including historical cards');
    }finally{globalThis.InchelinRecommendationFlags=oldFlags;globalThis.document=a.document;}
    assert.ok(cls(a.elements.messages,'phase1-condition').length>=4);assert.match(a.elements.messages.textContent,/강남역에서 직선 100m/);
    const before=JSON.stringify(a.api.messages);const link=cls(a.elements.messages,'restaurant-map-link').find(n=>n.tagName==='A');assert.ok(link.href.includes(encodeURIComponent('서울특별시')));link.click();assert.equal(a.api.messages.length,2);assert.equal(a.api.request().context.responseModeState.phase1.focusCardId,a.api.messages[1].restaurants[0].id);assert.ok(before.includes('강남역'));
    await a.api.edit('radiusMeters');const dialog=a.document.body.children.at(-1);assert.equal(dialog.open,true);assert.equal(flatten(dialog).find(n=>n.textContent==='1km 이내').attributes['aria-pressed'],'true');assert.ok(flatten(dialog).some(n=>n.placeholder==='예: 800m, 1.5km'));const five=flatten(dialog).find(n=>n.tagName==='BUTTON'&&n.textContent==='500m 이내');five.click();await a.api.done();assert.equal(a.api.request().context.responseModeState.phase1.conditions.radiusMeters,500);assert.equal(a.api.request().context.responseModeState.phase1.conditions.food,'한식');
    const latestConditions=cls(a.elements.messages,'phase1-conditions').at(-1);const remove=flatten(latestConditions).find(n=>n.attributes['aria-label']==='1만 원 이하 해제');remove.click();await a.api.done();assert.equal(a.api.request().context.responseModeState.phase1.conditions.budget,null);assert.equal(a.api.request().context.responseModeState.phase1.conditions.radiusMeters,500);
    await a.api.edit('location');const regionDialog=a.document.body.children.at(-1);flatten(regionDialog).find(n=>n.tagName==='BUTTON'&&n.textContent==='역삼역').click();await a.api.done();assert.equal(a.api.request().context.responseModeState.phase1.conditions.location.label,'역삼역');assert.equal(a.api.request().context.responseModeState.phase1.conditions.radiusMeters,500);
    const missing=app();missing.api.render({role:'assistant',content:samples.noAddress.body.message,restaurants:samples.noAddress.body.restaurants,meta:samples.noAddress.body.meta});assert.ok(cls(missing.elements.messages,'restaurant-map-link').some(n=>n.disabled&&n.textContent==='주소 정보 없음'));assert.equal(cls(missing.elements.messages,'restaurant-media').length,0);
    for(const kind of ['network','json','zero','version']){const a=app({kind});a.api.type('강남역에서 추천해줘');await a.api.done();assert.equal(a.api.busy,false);assert.ok(cls(a.elements.messages,'retry-button').length);assert.equal(/새 버전/.test(a.elements.messages.textContent),kind==='version');if(kind==='zero'){assert.ok(cls(a.elements.messages,'answer-chips').length);assert.equal(a.api.request().context.responseModeState.phase1.conditions.radiusMeters,1000);}if(kind==='version'){cls(a.elements.messages,'retry-button')[0].click();assert.equal(a.reloaded,true);assert.ok(a.memory.get('inchelin-resume-chat'));}}
    const stopped=app({kind:'hang'});stopped.api.type('강남역에서 추천해줘');stopped.api.stop();await stopped.api.done();assert.match(stopped.elements.messages.textContent,/멈췄어요|다시 시도/);assert.equal(stopped.api.busy,false);
    const slow=app({kind:'hang',clock:true});slow.api.type('강남역에서 추천해줘');[...slow.timers.values()].find(t=>t.ms===20000).action();assert.match(slow.elements.messages.textContent,/조금 더 걸리고/);[...slow.timers.values()].find(t=>t.ms===45000).action();await slow.api.done();assert.match(slow.elements.messages.textContent,/45초/);assert.ok(cls(slow.elements.messages,'retry-button').length);
    for(const variant of ['granted','prompt','denied','unavailable','timeout','reverse-failed','insecure','unsupported']){
      const messages=[],sent=[],host=new Node(),position=globalThis.InchelinPhase1.centers[0];let geoCalls=0;
      const navigator={permissions:{query:async()=>({state:variant==='denied'?'denied':variant==='prompt'?'prompt':'granted'})},geolocation:variant==='unsupported'?null:{getCurrentPosition:(ok,fail)=>{geoCalls++;if(variant==='unavailable'||variant==='timeout')fail({code:variant==='timeout'?3:2});else ok({coords:position});}}};
      const locate=new Function('navigator','window','document','messagesEl','fetch','appendMessage','generateAnswer',`
        let currentId=null,generating=false,locationRequestInFlight=false,conversationEpoch=0,currentLocationName='',currentLocationCoords=null,lastAIRequest=null;
        const chatMessages=[],REVERSE_GEOCODE_ENDPOINT='/api/reverse-geocode',showChatView=()=>{},followConversation=()=>{},clearLocationPermissionDenied=()=>{},rememberLocationPermissionDenied=()=>{},saveConversation=()=>{},pluginState=()=>({phase1:{conditions:{food:'냉면'}}}),buildAIRequest=()=>({context:{currentLocationName,currentLocation:currentLocationCoords,responseModeState:pluginState()}});
        ${fn('geolocationPermissionState')}${fn('geolocationPosition')}${fn('appendLocationFallback')}${fn('requestCurrentLocation')}
        return requestCurrentLocation;
      `)(navigator,{isSecureContext:variant!=='insecure'},{createElement:tag=>new Node(tag)},host,async()=>Response.json({locationName:'강남역'},{status:variant==='reverse-failed'?503:200}),(role,content,options)=>messages.push({role,content,options}),request=>sent.push(request));
      await locate('지금 내 주변에서 찾아줘');
      if(['granted','prompt','reverse-failed'].includes(variant)){assert.equal(sent.length,1,variant);assert.equal(sent[0].context.currentLocation.latitude,position.latitude);assert.equal(sent[0].context.responseModeState.phase1.conditions.food,'냉면');assert.equal(geoCalls,1);}
      else{assert.equal(sent.length,0,variant);assert.ok(messages.at(-1).options.quickReplies.includes('지역·역 선택'));if(['denied','insecure','unsupported'].includes(variant))assert.equal(geoCalls,0);}
    }
    const script=html.match(/<script>\s*([^]*?)<\/script>/g).at(-1)?.replace(/^<script>|<\/script>$/g,'');if(script)new Function(script);
    assert.match(html,/white-space:nowrap/);assert.match(html,/flex-wrap:wrap/);assert.match(html,/45000/);assert.match(html,/20000/);assert.match(html,/pointer: fine/);assert.match(html,/prefers-reduced-motion/);
    assert.match(html,/\.restaurant-title-link::after\s*\{content:none;/,'no stretched link intercepting authored toggles');assert.match(html,/inchelin-active-chat/);assert.match(html,/aria-label="새 대화"/);
    console.log('v142 client DOM smoke passed: local recommendation/evidence toggles; consent; chips; maps/state; geolocation mocks; retry/stop.');
  }finally{globalThis.document=originalDocument;globalThis.sessionStorage=originalStorage;globalThis.InchelinRecommendationFlags=deploymentFlags;}
}
