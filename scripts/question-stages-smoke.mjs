import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CATEGORY_CHOICES, CATEGORY_ANSWERS, REGION_ANSWERS, isUserAnswerLabel, applyAnswerPlan } from '../worker/answer-plan.js';
import { MENU_CATEGORIES } from '../worker/answer-plan.js';

export async function testQuestionStages(runCase) {
  const env={OPENAI_API_KEY:'test-key',RESTAURANT_DATA_SOURCE:'naver',NAVER_API_HUB_CLIENT_ID:'stub',NAVER_API_HUB_CLIENT_SECRET:'stub'};
  const run=(message,state={},extra={})=>runCase({message,env,context:{responseModeState:state},...extra});
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const source=html.slice(html.indexOf('    const comparisonTray = new Map();'),html.indexOf('    function appendMessage('));
  const nodes=node=>[node,...node.children.flatMap(nodes)];
  class Node {
    constructor(tag) {this.tagName=tag.toUpperCase();this.children=[];this.events={};this.attributes={};this.className='';this.classList={add:name=>{this.className+=' '+name;}};}
    appendChild(node){this.children.push(node);node.parent=this;return node;}
    append(...children){children.forEach(child=>this.appendChild(child));}
    set innerHTML(value){this.children=[];}
    set textContent(value){this.text=value;this.children=[];}
    get textContent(){return(this.text||'')+this.children.map(node=>node.textContent).join(' ');}
    setAttribute(key,value){this.attributes[key]=value;}
    removeAttribute(key){delete this.attributes[key];delete this[key];}
    querySelectorAll(selector){return nodes(this).filter(node=>selector.split(',').some(part=>node.className.split(' ').includes(part.trim().slice(1))));}
    addEventListener(type,callback){this.events[type]=callback;}
    click(){if(!this.disabled)this.events.click?.();}
  }
  const ofClass=(node,cls)=>nodes(node).filter(item=>item.className.split(' ').includes(cls));
  const host=new Node('div'),sent=[],locations=[];let manual=0;
  const locationSource=html.match(/    function isCurrentLocationIntent\(value\) \{[\s\S]*?\n    \}/)[0];
  const routeSource=html.match(/    function routeQuestion\(question\) \{[\s\S]*?\n    \}/)[0];
  const route=new Function('ask','requestCurrentLocation','openSearchPicker','focusManualLocationInput',locationSource+'\n'+routeSource+'\nreturn routeQuestion;')(
    value=>sent.push(value),value=>locations.push(value),()=>{},()=>{manual++;});
  const chooseSource=html.match(/    function chooseMenuCard\(menuName\) \{[\s\S]*?\n    \}/)[0];
  const choose=new Function('routeQuestion','generating',chooseSource+'\nreturn chooseMenuCard;')(route,false);
  const document={createElement:tag=>new Node(tag),getElementById:()=>null};
  const renderer=new Function('document','messagesEl','appendLimitedMarkdown','ask','resolveRestaurantDetail','showToast','isCurrentLocationIntent','canUseCurrentLocation','chooseMenuCard','routeQuestion','openSearchPicker',source+'\nreturn {renderMessage};')(
    document,host,(node,value)=>{node.textContent=value;},value=>sent.push(value),()=>{},()=>{},new Function(locationSource+'\nreturn isCurrentLocationIntent;')(),()=>true,choose,route,()=>{});
  const render=body=>renderer.renderMessage({role:'assistant',content:body.message,meta:body.meta,restaurants:body.restaurants,quickReplies:body.suggestions});
  const labels=node=>ofClass(node,'quick-reply').map(button=>button.historyLabel || button.textContent);
  const checkLabels=body=>{
    const values=[...(body.meta.turnPolicy.answerChoices||[]).map(choice=>choice.label),...(body.meta.turnPolicy.actionChips||[]),...(body.meta.turnPolicy.expansionChoices||[]).map(choice=>choice.label)];
    assert.ok(values.every(isUserAnswerLabel),JSON.stringify(values));
    assert.ok(values.every(value=>!value.includes('제가')));
  };
  const first=(await run('오늘 뭐 먹을지 같이 골라줘')).body;
  assert.deepEqual(first.meta.answer_plan.filter(block=>block!=='related_questions'),['text','question','chips']);checkLabels(first);
  assert.deepEqual(first.suggestions,CATEGORY_CHOICES);assert.equal(first.restaurants.length,0);assert.equal(first.meta.menuCards.length,0);
  assert.match(first.meta.turnPolicy.questionText,/제가 골라드릴까요\?/);
  assert.doesNotMatch(first.meta.turnPolicy.intro,/제가 골라드릴까요/);
  const category=render(first),tiles=ofClass(category,'answer-tiles')[0];
  assert.equal(tiles.children.length,6);assert.deepEqual(tiles.children.map(button=>button.historyLabel),CATEGORY_CHOICES.slice(0,6));
  const auto=ofClass(category,'answer-bottom')[0];assert.equal(auto.children.length,1);assert.equal(auto.children[0].historyLabel,'네, 골라주세요');
  assert.ok(labels(category).every(isUserAnswerLabel));
  assert.equal(ofClass(category,'turn-question').length,1,'one question block, not question-shaped chips');
  tiles.children[0].click();assert.equal(sent.at(-1),'한식으로 골라줘');
  auto.children[0].click();assert.equal(sent.at(-1),'네, 골라주세요');
  const autoResult=await run(sent.at(-1),first.meta.responseModeState,{analyzerEnabled:true,modeIntentAnalysis:{intent:'general',confidence:.1,slots:{}}});
  assert.equal(autoResult.body.meta.menuCards.length,3,'user assent follows normal analysis/policy even on low confidence');
  tiles.children[5].click();assert.equal(sent.at(-1),'카페 식사로 골라줘');
  const cafe=(await run(sent.at(-1),first.meta.responseModeState)).body;
  assert.equal(cafe.meta.menuCards.length,3);assert.ok(cafe.meta.menuCards.every(card=>MENU_CATEGORIES.카페.includes(card.name)));
  renderer.renderMessage({role:'user',content:'한식으로 골라줘'});
  assert.ok(tiles.children.every(button=>button.disabled));assert.equal(ofClass(category,'history-selected').length,1);assert.equal(ofClass(category,'history-check').length,1);

  const menus=(await run('한식으로 골라줘',first.meta.responseModeState)).body;
  assert.deepEqual(menus.meta.answer_plan.filter(block=>block!=='related_questions'),['text','menu_cards','notice','chips']);checkLabels(menus);
  const menuNode=render(menus);assert.equal(ofClass(menuNode,'menu-choice').length,3);assert.equal(ofClass(menuNode,'menu-more').length,1);
  const dish=menus.meta.menuCards[0].name;ofClass(menuNode,'menu-choice')[0].click();assert.equal(sent.at(-1),dish+' 먹을래');
  const region=(await run(sent.at(-1),menus.meta.responseModeState)).body;
  assert.deepEqual(region.meta.answer_plan.filter(block=>block!=='related_questions'),['text','question','chips']);checkLabels(region);
  assert.equal(region.meta.turnPolicy.questionText,'지금 어디세요?');assert.deepEqual(region.suggestions,REGION_ANSWERS.map(choice=>choice.label));
  assert.ok(!region.suggestions.includes('상관없어요'));assert.equal(region.restaurants.length,0);
  const regionNode=render(region),regionAnswers=ofClass(regionNode,'question-region')[0];
  assert.deepEqual(regionAnswers.children.map(child=>child.className),['answer-full-row answer-top','answer-tiles','answer-full-row answer-bottom']);
  const primary=ofClass(regionNode,'location-primary')[0];primary.click();assert.equal(locations.at(-1),'지금 내 주변에서 찾아줘');
  assert.equal(ofClass(regionNode,'answer-tiles')[0].children.length,6);
  ofClass(regionNode,'answer-bottom')[0].children[0].click();assert.equal(manual,1,'direct input opens/focuses the composer without posting a label');
  ofClass(regionNode,'answer-tiles')[0].children[0].click();assert.equal(sent.at(-1),'강남이에요');
  const places={items:Array.from({length:3},(_,i)=>({title:dish+'집'+i,category:'한식>'+dish,roadAddress:'서울 강남구 역삼동 '+i,mapx:'1270000000',mapy:'375000000'}))};
  const found=(await run(sent.at(-1),region.meta.responseModeState,{naverResponse:places})).body;
  assert.deepEqual(found.meta.answer_plan.filter(block=>block!=='related_questions'),['text','place_cards','source','question','chips']);checkLabels(found);
  const companion=render(found);assert.match(found.meta.turnPolicy.questionText,/누구와/);
  const group=ofClass(companion,'question-companion')[0];assert.equal(group.children.length,5);
  assert.deepEqual(group.children.map(button=>button.historyLabel),['혼자','2~3명','회식','가족','상관없어요']);
  assert.equal(ofClass(group,'skip-chip').length,1);assert.equal(group.children.at(-1),ofClass(group,'skip-chip')[0]);
  group.children[2].click();assert.equal(sent.at(-1),'회식이에요');
  const refined=(await run(sent.at(-1),found.meta.responseModeState,{naverResponse:places})).body;assert.equal(refined.meta.responseModeState.slots.companion,'회식');
  const relatedButton=ofClass(companion,'related-question')[0];
  assert.ok(relatedButton);relatedButton.click();assert.equal(sent.at(-1),found.meta.relatedQuestions[0].text,'related row uses the real routeQuestion→ask path');

  const malicious=applyAnswerPlan({message:'함께 골라봐요.',suggestions:['제가 골라드릴까요?','볼까요','너무 길어서 읽을 수 없는 답변','아','정했어요'],meta:{analysis:{intent:'out_of_scope'},responseModeState:{slots:{}},turnPolicy:{}}});
  assert.ok(malicious.suggestions.every(isUserAnswerLabel));assert.ok(malicious.suggestions.includes('정했어요'));
  assert.ok(!malicious.suggestions.includes('볼까요'),'question endings without a question mark are not answers either');
  const legacy=render({...first,suggestions:['제가 골라드릴까요?'],meta:{answer_plan:['text','question','chips'],flow:'menu_category',turnPolicy:{questionText:first.meta.turnPolicy.questionText}}});
  assert.deepEqual(labels(legacy),['네, 골라주세요']);
  assert.ok(CATEGORY_ANSWERS.every(choice=>isUserAnswerLabel(choice.label)));
  // Offline DOM + CSS contract at the two requested phone widths. No pixel/browser assertion.
  assert.match(html,/\.answer-tiles \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)[^}]*gap: 8px/);
  assert.match(html,/\.answer-tiles \.quick-reply \{[^}]*min-height: 52px/);
  assert.match(html,/\.answer-tiles \.quick-reply \.quick-reply-title \{[^}]*15px/);
  assert.match(html,/\.answer-full-row \.quick-reply \{[^}]*width: 100%;[^}]*min-height: 48px/);
  assert.match(html,/\.question-region \.quick-reply.location-primary \{[^}]*background: #111;[^}]*color: #fff/);
  assert.match(html,/\.answer-chips.question-companion \{[^}]*flex-wrap: wrap;[^}]*gap: 8px;[^}]*overflow: visible/);
  assert.match(html,/\.quick-reply.quick-reply-chip \{[^}]*min-height: 40px/);
  for(const width of [360,390]) {
    const content=width-2*16-32-8, tile=(content-2*8)/3, companionWidth=(content-3*8)/4;
    assert.ok(tile>=90 && companionWidth>=66,width+'px layout fits grid/chips');
    assert.equal(Math.ceil(tiles.children.length/3),2);
  }
  console.log('v123 question stages: 4 answer plans, 6 category tiles/assent, 8 region answers, cafe/category and natural-message routing, history, label guard, 360/390 CSS+DOM contracts passed (browser pixels not checked).');
}
