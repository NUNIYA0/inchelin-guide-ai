import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../dist/assets/recommendation-flags.js';
import '../dist/assets/recommendations-ui.js';
import '../dist/assets/restaurant-ui.js';

export async function testPhase1Client(runCase,samples,requestCase=runCase,rawRequestCase=requestCase){
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
        const result=await(kind==='radius-flow'?rawRequestCase:kind==='consent'?requestCase:runCase)(request.messages.at(-1).content,{state:request.context.responseModeState,locationSelection:request.context.locationSelection,demoMode:request.context.demoMode,...(kind==='zero'?{data:{items:[]}}:{})});
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
        ${fn('safeHttpUrl')}${fn('normalizeNaverPlaceDetails')}${fn('normalizeRestaurant')}${fn('hasExplicitTimeCondition')}${fn('compactPlannerState')}${fn('buildAIRequest')}${fn('extractAssistantText')}${fn('assertCompleteAnswer')}${fn('requestAssistant')}${fn('normalizeMessage')}${fn('resizeInput')}
        ${html.slice(html.indexOf('    let phase1Sheets=null;'),html.indexOf('    function appendMessage(')).replace(/import\('\/assets\/phase1-sheets.js\?v=\d+'\)/,'loadSheetModule()')}
        ${fn('appendMessage')}${fn('showWelcome')}${fn('newChat')}${fn('showChatView')}${fn('isCurrentLocationIntent')}${fn('routeQuestion')}${fn('ask')}${fn('submitWelcomeQuestion')}${fn('setGenerating')}${fn('showRequestError')}${fn('stopGeneration')}
        ${fn('generateAnswer').replace('async function generateAnswer','async function performGeneration')}
        function generateAnswer(...args){pending=performGeneration(...args);return pending;}
        ${html.match(/    \$\('#suggestions'\)\.addEventListener\('click'[^]*?\n    \}\);/)[0]}
        ${html.match(/    \$\('#welcomeForm'\)\.addEventListener[^\n]+/)[0]}
        return {type(value){document.getElementById('welcomeInput').value=value;document.getElementById('welcomeForm').events.submit({preventDefault(){}});},clickRow(index){document.getElementById('suggestions').events.click({target:{closest:()=>({dataset:{index}})}});},send:routeQuestion,done:()=>pending,stop:stopGeneration,edit:openPhase1Condition,render:message=>renderMessage(normalizeMessage(message)),restore:messages=>{for(const message of messages){const restored=normalizeMessage(message,{restored:true});chatMessages.push(restored);renderMessage(restored);}},get messages(){return chatMessages;},get busy(){return generating;},request:()=>buildAIRequest(chatMessages),setFocus:setPhase1Focus};
      `;
      const api=new Function('document','window','fetch','main','welcome','chatView','guidePanel','messagesEl','location','loadSheetModule','setTimeout','clearTimeout',source)(document,{innerWidth:360,matchMedia:()=>({matches:true}),open:(...args)=>opened.push(args)},fetch,elements.main,elements.welcome,elements.chatView,elements.guidePanel,elements.messages,{reload:()=>reloaded=true},()=>import('../dist/assets/phase1-sheets.js'),clock?(action,ms)=>{const id=++timerId;timers.set(id,{action,ms});return id;}:setTimeout,clock?id=>timers.delete(id):clearTimeout);
      return{api,elements,document,requests,opened,memory,timers,get reloaded(){return reloaded;}};
    }
    for(const prompt of ['오늘 점심 추천해줘','냉면 먹고 싶어','오늘 뭐 먹지','홍대 맛집 추천해줘','성수에서 파스타','강남역에서 한식, 만 원 이하로'])for(const skew of [0,60000]){
      const a=app({skew});a.api.type(prompt);await a.api.done();assert.equal(a.api.messages.length,2,prompt);assert.equal(a.requests.length,1);assert.equal(cls(a.elements.messages,'retry-button').length,0);
      assert.ok(a.elements.chatView.classList.contains('active'));assert.equal(a.elements.welcome.style.display,'none');assert.equal(a.api.busy,false);
      const hasLocation=/홍대|성수|강남역/.test(prompt);assert.equal(cls(a.elements.messages,'restaurant-card').length,hasLocation?3:0,prompt);assert.equal(cls(a.elements.messages,'turn-question').length,hasLocation?0:1);assert.ok(!/새 버전/.test(a.elements.messages.textContent));
      if(!hasLocation){
        assert.equal(cls(a.elements.messages,'phase1-conditions').length,0,'no chips until location is resolved');
        assert.equal(cls(a.elements.messages,'location-choice-response').length,1);
        assert.equal(cls(a.elements.messages,'turn-question')[0].textContent,'어디에서 드실 예정이세요?');
        assert.match(cls(a.elements.messages,'location-choice-help')[0].textContent,/동네나 역 이름/);
        const actions=cls(a.elements.messages,'question-location-choice')[0];assert.equal(actions.children.length,2);
        assert.deepEqual(actions.children.map(n=>n.attributes['aria-label']),['현재 위치로 찾기','지역 선택']);
        assert.equal(cls(actions,'supplied-icon').length,2);
        assert.equal(cls(a.elements.messages,'answer-results')[0].children.length,0,'no duplicated intro above location question');
      }
    }
    for(const sample of samples.contextSamples||[]){const ui=app();ui.api.render({role:'assistant',content:sample.message,restaurants:sample.restaurants,meta:sample.meta});assert.equal(cls(ui.elements.messages,'restaurant-card').length,sample.restaurants.length,'semantic planner -> actual client card renderer');assert.equal(cls(ui.elements.messages,'turn-question').length,sample.meta.answer_plan.includes('question')?1:0,'semantic clarify/radius -> actual client question renderer');}
    for(const metaPatch of [{responseRulesVersion:'v100'},{generatedAt:Date.now()-2*60*60*1000}]){
      const ui=app(),body=samples.bulk.body,archive={role:'assistant',content:body.message,restaurants:body.restaurants,meta:{...body.meta,...metaPatch,staleResponse:true}};
      ui.api.restore([{role:'user',content:'강남역에서 추천해줘'},archive]);
      assert.equal(cls(ui.elements.messages,'restaurant-card').length,3,'archive retains actual cards after version/TTL changes');
      assert.ok(ui.elements.messages.textContent.includes(body.message),'archive retains original answer');
      assert.equal(cls(ui.elements.messages,'retry-button').length,0,'archives do not ask users to rerun because of internal versions');
      assert.equal(ui.requests.length,0,'restoring history never silently runs a search');
      assert.ok(ui.api.request().messages.some(m=>m.role==='assistant'&&m.content===body.message),'past assistant context survives cache invalidation');
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
      assert.match(sections[1].textContent,/추천인 정보 없음/);assert.match(sections[1].textContent,/아직 등록된 추천 이유가 없어요/);assert.equal(cls(sections[1],'recommendations-toggle').length,0);
      assert.match(sections[2].textContent,/등록된 추천이 없어요/);assert.equal(cls(sections[2],'recommendations-toggle').length,0);
      const toggle=cls(sections[0],'recommendations-toggle')[0],extra=cls(sections[0],'additional-recommendations')[0];
      assert.equal(toggle.textContent,'다른 추천 2개 보기');assert.equal(extra.hidden,true);
      const beforeRequests=rec.requests.length,beforeConditions=JSON.stringify(rec.api.messages),links=cls(rec.elements.messages,'restaurant-map-link').filter(n=>n.tagName==='A').map(n=>n.href);
      const cards=cls(rec.elements.messages,'restaurant-card'),details=cls(cards[0],'restaurant-extra')[0],detailToggle=cls(cards[0],'restaurant-details-toggle')[0];
      assert.equal(details.hidden,true);assert.equal(cls(details,'registered-recommendations').length,0,'authored pair is never hidden in details');
      assert.equal(cls(details,'restaurant-address').length,1);assert.equal(cls(cards[0],'photo-missing').length,0);
      assert.equal(cls(cards[0],'restaurant-media').length,1,'no image keeps an equal-size placeholder');assert.match(cls(cards[0],'restaurant-photo-empty')[0].textContent,/등록된 사진이 없어요/);
      const mapButton=cls(cards[0],'restaurant-map-button')[0];assert.equal(mapButton.textContent,'네이버지도에서 검색');assert.equal(mapButton.children.length,0,'map action is text only');
      const checkedCard={...samples.solo.body.restaurants[0],naverPlaceUrl:'https://map.naver.com/p/entry/place/123456',naverPlaceId:'123456',naverPlaceVerification:{status:'verified',name:samples.solo.body.restaurants[0].name,address:samples.solo.body.restaurants[0].roadAddress||samples.solo.body.restaurants[0].address,source:'test-only-place-check',checkedAt:'2026-10-27'}};
      const checked=app();checked.api.render({role:'assistant',content:'테스트 전용 상세 연결',restaurants:[checkedCard],meta:samples.solo.body.meta});const checkedMap=cls(checked.elements.messages,'restaurant-map-button')[0];assert.equal(checkedMap.textContent,'지도 보기');assert.equal(checkedMap.href,checkedCard.naverPlaceUrl);globalThis.document=rec.document;
      detailToggle.click();assert.equal(details.hidden,false);assert.equal(detailToggle.attributes['aria-expanded'],'true');assert.equal(cls(cards[1],'restaurant-extra')[0].hidden,true);
      assert.equal(cls(details,'restaurant-compare').length,0,'compare collection removed from details');
      assert.ok(!html.includes('id="comparisonTray"'),'no comparison tray in composer');
      assert.ok(!html.includes('비교에 담기'),'no collect label or handler in production UI');
      detailToggle.click();assert.equal(details.hidden,true);assert.equal(rec.requests.length,beforeRequests);assert.equal(JSON.stringify(rec.api.messages),beforeConditions);assert.deepEqual(cls(rec.elements.messages,'restaurant-map-link').filter(n=>n.tagName==='A').map(n=>n.href),links);
      toggle.click();assert.equal(extra.hidden,false);assert.equal(toggle.attributes['aria-expanded'],'true');assert.equal(toggle.textContent,'다른 추천 접기');assert.match(extra.textContent,/── 다른 추천 2개 ──/);
      assert.equal(cls(sections[0],'registered-recommendation').length,3);
      toggle.click();assert.equal(extra.hidden,true);assert.equal(rec.requests.length,beforeRequests);assert.equal(JSON.stringify(rec.api.messages),beforeConditions);assert.deepEqual(cls(rec.elements.messages,'restaurant-map-link').filter(n=>n.tagName==='A').map(n=>n.href),links);
      rec.api.render({role:'assistant',content:samples.solo.body.message,restaurants:samples.solo.body.restaurants,meta:samples.solo.body.meta});toggle.click();assert.equal(extra.hidden,false);assert.equal(cls(rec.elements.messages,'additional-recommendations').at(-1).hidden,true,'only the clicked card expands, including historical cards');
    }finally{globalThis.InchelinRecommendationFlags=oldFlags;globalThis.document=a.document;}
    assert.equal(cls(a.elements.messages,'phase1-condition').length,0);assert.equal(cls(a.elements.messages,'phase1-conditions')[0].children.length,0,'conditions are read-only text');assert.match(a.elements.messages.textContent,/강남역에서 직선 100m/);
    const before=JSON.stringify(a.api.messages);const link=cls(a.elements.messages,'restaurant-map-link').find(n=>n.tagName==='A');assert.ok(link.href.includes(encodeURIComponent('서울특별시')));link.click();assert.equal(a.api.messages.length,2);assert.equal(a.api.request().context.responseModeState.phase1.focusCardId,a.api.messages[1].restaurants[0].id);assert.ok(before.includes('강남역'));
    a.api.send('500m 이내로 찾아줘');await a.api.done();assert.equal(a.api.request().context.responseModeState.phase1.conditions.radiusMeters,500);assert.equal(a.api.request().context.responseModeState.phase1.conditions.food,'한식');
    a.api.send('예산 제한 없애줘');await a.api.done();assert.equal(a.api.request().context.responseModeState.phase1.conditions.budget,null);assert.equal(a.api.request().context.responseModeState.phase1.conditions.radiusMeters,500);
    await a.api.edit('location');const regionDialog=a.document.body.children.at(-1);flatten(regionDialog).find(n=>n.attributes['aria-label']==='역삼역 지하철역').click();
    assert.equal(cls(regionDialog,'location-apply')[0].disabled,false);cls(regionDialog,'location-apply')[0].click();await a.api.done();
    assert.equal(a.requests.at(-1).context.locationSelection.id,'station:역삼역');assert.equal(a.api.request().context.responseModeState.phase1.conditions.location.id,'station:역삼역');assert.equal(a.api.request().context.responseModeState.phase1.conditions.location.label,'역삼역');assert.equal(a.api.request().context.responseModeState.phase1.conditions.radiusMeters,500);
    {
      const {createLocationPicker}=await import('../dist/assets/location-picker.js'),catalog=globalThis.InchelinPhase1.locationOptions(),p=app(),sent=[];
      const flush=async()=>{await Promise.resolve();await Promise.resolve();};
      const picker=createLocationPicker({send:(...args)=>sent.push(args)});picker.open();await flush();const dialog=picker.dialog;
      const find=name=>cls(dialog,name)[0],filter=value=>cls(dialog,'location-filter').find(n=>n.dataset.filter===value);
      assert.equal(find('location-apply').disabled,true);assert.equal(find('location-search').querySelectorAll('.location-clear').length,1);
      assert.equal(cls(dialog,'location-result').length,catalog.length);assert.equal(find('location-search').children.find(n=>n.tagName==='INPUT').value,'');
      filter('station').click();await flush();assert.equal(cls(dialog,'location-result').length,7);
      const input=flatten(dialog).find(n=>n.tagName==='INPUT');input.value='홍대';input.events.input();await flush();assert.equal(cls(dialog,'location-result').length,1);
      filter('region').click();await flush();assert.equal(cls(dialog,'location-result').length,1);
      const row=cls(dialog,'location-result')[0];row.click();assert.equal(row.attributes.role,'radio');assert.equal(row.attributes['aria-checked'],'true');assert.equal(find('location-apply').disabled,false);assert.equal(cls(dialog,'location-radio').length,0,'single-selection semantics without decorative radio markers');
      find('location-apply').click();assert.equal(dialog.open,false);assert.equal(sent[0][0],'홍대에서 추천해줘');assert.equal(sent[0][1].locationSelection.id,'region:홍대');
      const selected=sent[0][1].locationSelection,parsed=globalThis.InchelinPhase1.parse(sent[0][0],{radiusMeters:500,food:'냉면'},{locationSelection:selected}).conditions;
      assert.equal(parsed.location.latitude,selected.latitude);assert.equal(parsed.location.longitude,selected.longitude);assert.equal(parsed.radiusMeters,500);assert.equal(parsed.food,'냉면');
      picker.open();await flush();assert.equal(input.value,'홍대','previous input node is detached');const freshInput=flatten(dialog).find(n=>n.tagName==='INPUT');assert.equal(freshInput.value,'');assert.equal(find('location-apply').disabled,true);
      freshInput.value='광화문';freshInput.events.input();await flush();assert.equal(cls(dialog,'location-result').length,0,'unsupported mockup place is not fabricated');assert.match(find('location-status').textContent,/결과가 없어요/);
      find('location-clear').click();await flush();assert.equal(cls(dialog,'location-result').length,catalog.length);
      cls(dialog,'location-result')[1].click();assert.equal(cls(dialog,'location-result').filter(n=>n.attributes['aria-checked']==='true').length,1);
      find('location-cancel').click();assert.equal(sent.length,1,'cancel leaves applied location unchanged');
      picker.open();await flush();dialog.events.cancel({preventDefault(){}});assert.equal(dialog.open,false);assert.equal(sent.length,1,'Esc does not apply');
      const regionData=JSON.parse(await readFile(new URL('../dist/assets/location-regions.json',import.meta.url),'utf8')),hierarchySent=[],stationCalls=[];
      const scopedStation={id:'discovered:서울:강남구:역삼역',label:'역삼역',type:'station',centerLabel:'역삼역',regionId:'서울:강남구',province:'서울',district:'강남구',latitude:37.50062,longitude:127.03645,detail:'서울 강남구'};
      const hierarchy=createLocationPicker({regionData,send:(...args)=>hierarchySent.push(args),loadStations:async(region,q)=>{stationCalls.push(region);return q==='역삼'?[{...scopedStation,label:'강남역'},scopedStation]:region==='서울:강남구'?[scopedStation]:[];}});hierarchy.open();await flush();
      assert.equal(cls(hierarchy.dialog,'location-province').length,17);assert.equal(cls(hierarchy.dialog,'location-region').length,22);assert.equal(cls(hierarchy.dialog,'location-apply')[0].disabled,true);assert.equal(hierarchySent.length,0,'initial browsing province never applies a search location');
      assert.equal(cls(hierarchy.dialog,'location-filter').length,0,'redundant type filters are absent in the data-driven picker');
      cls(hierarchy.dialog,'location-province').find(n=>n.attributes['aria-label'].startsWith('부산 ')).click();await flush();assert.equal(cls(hierarchy.dialog,'location-region').length,12);
      cls(hierarchy.dialog,'location-province').find(n=>n.attributes['aria-label'].startsWith('서울 ')).click();await flush();
      assert.ok(cls(hierarchy.dialog,'location-region').length>7);assert.ok(cls(hierarchy.dialog,'location-region').every(n=>!n.attributes['aria-label'].includes('부산')));
      cls(hierarchy.dialog,'location-region').find(n=>cls(n,'location-result-name')[0].textContent==='강남구').click();await flush();
      assert.equal(stationCalls.length,0,'district selection never searches stations');assert.equal(cls(hierarchy.dialog,'location-region').length,22);assert.equal(cls(hierarchy.dialog,'location-apply')[0].disabled,false);
      assert.equal(cls(hierarchy.dialog,'location-region').filter(n=>n.attributes['aria-checked']==='true').length,1);
      cls(hierarchy.dialog,'location-apply')[0].click();assert.equal(hierarchySent[0][1].locationSelection.id,'admin:서울:강남구');assert.equal(hierarchySent[0][0],'서울 강남구에서 추천해줘');assert.equal(hierarchySent[0][1].locationSelection.latitude,undefined);
      hierarchy.open();await flush();const direct=flatten(hierarchy.dialog).find(n=>n.tagName==='INPUT');direct.value='제주시';direct.events.input();await flush();assert.equal(cls(hierarchy.dialog,'location-result').length,1);cls(hierarchy.dialog,'location-result')[0].click();assert.equal(cls(hierarchy.dialog,'location-apply')[0].disabled,false);cls(hierarchy.dialog,'location-cancel')[0].click();assert.equal(hierarchySent.length,1,'cancel keeps applied region');assert.equal(stationCalls.length,0);
      let resolveSearch;const delayed=createLocationPicker({send:()=>{},search:()=>new Promise(resolve=>resolveSearch=resolve)});delayed.open();assert.match(cls(delayed.dialog,'location-status')[0].textContent,/검색 중/);resolveSearch([]);await flush();assert.match(cls(delayed.dialog,'location-status')[0].textContent,/결과가 없어요/);delayed.dialog.close();
      const failed=createLocationPicker({send:()=>{},search:async()=>{throw new Error('test');}});failed.open();await flush();assert.match(cls(failed.dialog,'location-status')[0].textContent,/불러오지 못/);assert.equal(cls(failed.dialog,'location-retry').length,1);failed.dialog.close();
      const oldWidth=globalThis.innerWidth,oldHeight=globalThis.innerHeight,oldViewport=globalThis.visualViewport;
      try{
        globalThis.innerWidth=1280;globalThis.innerHeight=900;globalThis.visualViewport=undefined;
        const pc=createLocationPicker({send:()=>{}});pc.open();assert.equal(pc.dialog.style.height,'680px');assert.equal(pc.dialog.style.top,'110px');pc.dialog.close();
        globalThis.innerWidth=390;globalThis.visualViewport={height:844,offsetTop:0,addEventListener(){},removeEventListener(){}};
        const mobile=createLocationPicker({send:()=>{}});mobile.open();assert.equal(mobile.dialog.style.height,'591px');assert.equal(mobile.dialog.style.top,'253px');mobile.dialog.close();
        globalThis.visualViewport={height:400,offsetTop:20,addEventListener(){},removeEventListener(){}};
        const keyboard=createLocationPicker({send:()=>{}});keyboard.open();assert.equal(keyboard.dialog.style.height,'392px');assert.equal(keyboard.dialog.style.top,'28px');assert.ok(keyboard.dialog.classList.contains('location-compact'));keyboard.dialog.close();
      }finally{globalThis.innerWidth=oldWidth;globalThis.innerHeight=oldHeight;globalThis.visualViewport=oldViewport;}
      const forged=globalThis.InchelinPhase1.parse('강남역',{}, {locationSelection:{...catalog[0],latitude:0}}).conditions;
      assert.equal(forged.location.latitude,catalog[0].latitude,'request cannot replace authoritative coordinates');
    }
    {
      const history=app();history.api.render({role:'assistant',content:'골라주세요.',quickReplies:['한식','중식'],meta:{answer_plan:['text','chips']}});history.api.render({role:'user',content:'한식'});
      const selected=cls(history.elements.messages,'history-selected');assert.ok(selected.length);assert.equal(selected[0].attributes['aria-pressed'],'true');assert.equal(cls(history.elements.messages,'history-check').length,0,'history selection adds no check icon');
    }
    for(const withCards of [true,false]){
      const noticeApp=app(),notice='인원·방문 목적·해당 시간 영업 정보는 확인되지 않아 방문 전 매장 확인이 필요해요.';
      noticeApp.api.render({role:'assistant',content:'말씀하신 조건으로 찾아봤어요.',restaurants:withCards?samples.solo.body.restaurants:[],meta:{...samples.solo.body.meta,answer_plan:['text','place_cards','source','notice'],notice}});
      const result=cls(noticeApp.elements.messages,'answer-results')[0],notes=cls(result,'turn-notice');assert.equal(notes.length,1);assert.equal(notes[0].textContent,notice);
      assert.equal(notes[0].attributes.role,'note');
      if(withCards){const group=cls(result,'restaurant-group')[0];assert.equal(result.children.indexOf(notes[0]),result.children.indexOf(group)+1,'common note directly follows whole card list');assert.equal(cls(group,'turn-notice').length,0,'not repeated within cards');}
      else assert.equal(cls(result,'restaurant-group').length,0,'cardless notice remains available');
    }
    const missing=app();missing.api.render({role:'assistant',content:samples.noAddress.body.message,restaurants:samples.noAddress.body.restaurants,meta:samples.noAddress.body.meta});assert.ok(cls(missing.elements.messages,'restaurant-map-link').some(n=>n.disabled&&n.textContent==='주소 정보 없음'));assert.equal(cls(missing.elements.messages,'restaurant-photo-empty').length,samples.noAddress.body.restaurants.length);
    {
      const card={name:'테스트 사진 카드',dataSource:'inchelin',photos:[{url:'https://test.example/a.jpg',source:'registered'},{url:'https://test.example/b.jpg',source:'registered',isPrimary:true}]};
      const frame=globalThis.InchelinRestaurantUI.photo(card),image=cls(frame,'restaurant-image')[0],empty=cls(frame,'restaurant-photo-empty')[0];assert.equal(image.src,card.photos[1].url);image.events.load();assert.equal(empty.hidden,true);image.events.error();assert.equal(empty.hidden,false);assert.equal(cls(frame,'restaurant-image').length,0);assert.equal(frame.className,'restaurant-media','failure preserves image frame');
      assert.equal(globalThis.InchelinRestaurantUI.choosePhoto({...card,photos:card.photos.map(p=>({...p,isPrimary:false}))}).url,card.photos[0].url);
      const group=new Node(),list=new Node();for(let i=0;i<3;i++){const card=new Node('article');card.className='restaurant-card';card.getBoundingClientRect=()=>({width:300});list.append(card);}list.clientWidth=624;list.scrollWidth=936;list.scrollLeft=0;list.scrollTo=({left})=>{list.scrollLeft=left;list.events.scroll?.();};
      globalThis.InchelinRestaurantUI.carousel(group,list);const nav=cls(group,'restaurant-carousel-nav');assert.equal(nav[0].disabled,true);assert.equal(nav[1].disabled,false);nav[1].click();assert.equal(nav[1].disabled,true);assert.equal(nav[0].disabled,false);nav[0].click();assert.equal(list.scrollLeft,0);
      list.events.keydown({key:'End',target:list,preventDefault(){}});assert.equal(list.scrollLeft,312);list.events.keydown({key:'Home',target:list,preventDefault(){}});assert.equal(list.scrollLeft,0);
      list.events.pointerdown({pointerType:'mouse',button:0,target:{closest:()=>null},clientX:250,clientY:0,pointerId:1});list.events.pointermove({clientX:30,clientY:1,preventDefault(){}});list.events.pointerup();let suppressed=false;list.events.click({preventDefault(){suppressed=true;},stopImmediatePropagation(){}});assert.equal(suppressed,true,'drag cannot activate a card action');
      const single=new Node(),one=new Node();one.className='restaurant-card';single.append(one);const only=new Node();globalThis.InchelinRestaurantUI.carousel(only,single);assert.equal(cls(only,'restaurant-carousel-nav').length,0);
    }
    {
      const raw=app({kind:'radius-flow'});raw.api.type('강남역');await raw.api.done();assert.equal(cls(raw.elements.messages,'restaurant-card').length,0);assert.equal(cls(raw.elements.messages,'radius-answer').length,1);
      const one=cls(raw.elements.messages,'quick-reply').find(n=>n.attributes['aria-label']==='1km 이내');one.click();await raw.api.done();assert.equal(cls(raw.elements.messages,'restaurant-card').length,3);assert.equal(raw.api.request().context.responseModeState.phase1.conditions.radiusMeters,1000);assert.equal(cls(raw.elements.messages,'phase1-remove').length,0);
      raw.api.send('3km까지 넓혀줘');await raw.api.done();assert.equal(raw.api.request().context.responseModeState.phase1.conditions.radiusMeters,3000);assert.equal(cls(raw.elements.messages,'history-check').length,0);
    }
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
      else{assert.equal(sent.length,0,variant);assert.ok(messages.at(-1).options.quickReplies.includes('지역 선택'));if(['denied','insecure','unsupported'].includes(variant))assert.equal(geoCalls,0);}
    }
    const script=html.match(/<script>\s*([^]*?)<\/script>/g).at(-1)?.replace(/^<script>|<\/script>$/g,'');if(script)new Function(script);
    assert.match(html,/white-space:nowrap/);assert.match(html,/flex-wrap:wrap/);assert.match(html,/45000/);assert.match(html,/20000/);assert.match(html,/pointer: fine/);assert.match(html,/prefers-reduced-motion/);
    assert.match(html,/\.restaurant-title-link::after\s*\{content:none;/,'no stretched link intercepting authored toggles');assert.match(html,/inchelin-active-chat/);assert.match(html,/aria-label="새 대화"/);
    console.log('v142 client DOM smoke passed: local recommendation/evidence toggles; consent; chips; maps/state; geolocation mocks; retry/stop.');
  }finally{globalThis.document=originalDocument;globalThis.sessionStorage=originalStorage;globalThis.InchelinRecommendationFlags=deploymentFlags;}
}
