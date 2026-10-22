import assert from 'node:assert/strict';
import { MENU_CATEGORIES } from '../worker/answer-plan.js';
import { FORBIDDEN_COPY } from '../worker/conversation-copy.js';

// All upstream requests are intercepted by runCase; never reads a credential file.
export async function testHistoryAlternatives(runCase) {
  const env = { OPENAI_API_KEY:'test-key', RESTAURANT_DATA_SOURCE:'naver', NAVER_API_HUB_CLIENT_ID:'stub', NAVER_API_HUB_CLIENT_SECRET:'stub' };
  const run = async (message, state, naverResponse = {items:[]}) => runCase({message,env,context:{responseModeState:state},naverResponse});
  const local = result => result.calls.filter(call=>call.href.includes('/search/v1/local'));
  const item = (name,area,category='한식>국밥') => ({title:name,category,roadAddress:`서울 ${area} 테스트길 1`,mapx:'1270000000',mapy:'375000000'});
  for (const category of Object.keys(MENU_CATEGORIES)) {
    const first = await run(`${category}으로 골라줘`);
    assert.equal(first.body.meta.menuCards.length,3,category);
    assert.ok(first.body.suggestions.includes('다른 메뉴 보기'));
    const next = await run('다른 메뉴 보기',first.body.meta.responseModeState);
    assert.equal(next.body.meta.menuCards.length,3,category+' second batch');
    assert.equal(next.body.meta.responseModeState.menuCategory,category);
    assert.ok(next.body.meta.menuCards.every(card=>MENU_CATEGORIES[category].includes(card.name)));
    assert.ok(next.body.meta.menuCards.every(card=>!first.body.meta.menuCards.some(old=>old.name===card.name)));
    assert.ok(next.body.suggestions.includes('다른 메뉴 보기'));
    // A third batch must not falsely relabel previous menus as unseen.
    const third = await run('다른 메뉴 보기',next.body.meta.responseModeState);
    assert.ok(third.body.meta.menuCards.every(card=>!next.body.meta.responseModeState.aProposed.includes(card.name)));
  }
  const menu = await run('한식으로 골라줘');
  const selected = await run('국밥 먹을래',menu.body.meta.responseModeState);
  assert.deepEqual(selected.body.suggestions,['현재 위치 연결','강남','홍대','역삼','성수','종로','여의도','직접 입력']);
  assert.ok(!selected.body.meta.turnPolicy.next_question.chips.some(chip=>chip.label==='상관없어요'));
  const moreAfterSelection = await run('다른 메뉴 보기',selected.body.meta.responseModeState);
  assert.equal(moreAfterSelection.body.meta.responseModeState.menuCategory,'한식');
  assert.ok(moreAfterSelection.body.meta.menuCards.every(card=>MENU_CATEGORIES.한식.includes(card.name)));

  for (const count of [0,1,2]) {
    const result = await run('강남에서 국밥 먹을 곳 찾아줘',{}, {items:Array.from({length:count},(_,i)=>item('강남국밥'+i,'강남구'))});
    assert.equal(result.body.restaurants.length,count);
    assert.ok(local(result).length>=1 && local(result).length<=19,'main region search plus at most three bounded batches of six suggestion preflights');
    assert.equal(new URL(local(result)[0].href).searchParams.get('query'),'강남 국밥');
    assert.ok(result.body.restaurants.every(card=>card.address.includes('강남')),'preflight cannot broaden displayed cards');
    const choices=result.body.meta.turnPolicy.expansionChoices;
    assert.ok(choices.some(choice=>choice.label.includes('역삼')));
    assert.ok(choices.some(choice=>choice.label.includes('논현')));
    assert.ok(choices.some(choice=>choice.label.includes('설렁탕')));
    assert.ok(choices.some(choice=>choice.label.includes('곰탕')));
    assert.ok(result.body.meta.answer_plan.includes('chips'));
    assert.doesNotMatch(result.body.message,FORBIDDEN_COPY);
    if(count) assert.match(result.body.meta.turnPolicy.intro,new RegExp(count+'곳'));
    else assert.doesNotMatch(result.body.message,/3곳|찾았어요/);
  }
  const neighborFixture = query => ({items:/역삼/.test(query) ? [item('역삼국밥','강남구 역삼동'),item('잘못된메뉴','강남구 역삼동','일식>초밥'),item('잘못된지역','부산 해운대구','한식>국밥')]
    : /논현/.test(query) ? [item('논현국밥','강남구 논현동'),item('논현국밥','강남구 논현동')]
    : [item('강남국밥','강남구')]});
  for(const message of ['아무데나','아무 데나','어디든','상관없어요']) {
    const result=await run(message,selected.body.meta.responseModeState,neighborFixture);
    assert.equal(result.body.restaurants.length,3,message);
    assert.equal(new Set(result.body.restaurants.map(card=>card.id)).size,3);
    assert.deepEqual(new Set(result.body.restaurants.map(card=>card.regionLabel)),new Set(['강남','역삼','논현']));
    assert.ok(result.body.restaurants.every(card=>!card.name.includes('잘못된')));
    assert.match(result.body.meta.turnPolicy.intro,/지역을 따로 정하지 않으셔서 강남부터/);
    assert.match(result.body.meta.turnPolicy.intro,/역삼.*논현/);
    assert.doesNotMatch(result.body.meta.turnPolicy.intro,/인기|많이 찾/);
    assert.ok(result.body.meta.turnPolicy.expansionChoices.some(choice=>choice.label==='홍대'));
    assert.equal(result.body.meta.responseModeState.regionFlexible,true);
    assert.ok(local(result).length>=3 && local(result).length<=21,'two bounded neighbor queries plus at most eighteen distinct suggestion-only preflights');
    assert.ok(local(result).slice(0,3).every(call=>new URL(call.href).searchParams.get('query').includes('국밥')), 'main and neighbor searches keep the food; suggestions may explore another food');
    const changed=await run('홍대에서 찾아줘',result.body.meta.responseModeState,{items:[item('홍대국밥','마포구 서교동')]});
    assert.equal(changed.body.meta.responseModeState.regionFlexible,false);
    assert.ok(local(changed).length>=1 && local(changed).length<=19,'explicit area search plus bounded suggestion preflights');
    assert.ok(changed.body.restaurants.every(card=>/홍대|서교동/.test(card.address)),'suggestions never broaden the selected area cards');
  }
  const noNeighbors=await run('아무데나',selected.body.meta.responseModeState,query=>({items:/역삼|논현/.test(query)?[]:[item('강남국밥','강남구')]}));
  assert.equal(noNeighbors.body.restaurants.length,1,'no fabricated backfill');
  assert.match(noNeighbors.body.meta.turnPolicy.intro,/1곳/);
  assert.ok(noNeighbors.body.meta.turnPolicy.expansionChoices.some(choice=>choice.label.includes('곰탕')));
  const none=await run('어디든',selected.body.meta.responseModeState,{items:[]});
  assert.equal(none.body.restaurants.length,0);
  assert.match(none.body.meta.turnPolicy.intro,/강남부터/);
  const lowConfidence=await runCase({message:'어디든',env,analyzerEnabled:true,context:{responseModeState:selected.body.meta.responseModeState},naverResponse:neighborFixture,modeIntentAnalysis:{intent:'general',confidence:.2,slots:{}}});
  assert.equal(lowConfidence.body.restaurants.length,3,'explicit region answer wins over uncertain classification');
  const combined=await run('국밥 먹을래 아무데나',{},neighborFixture);
  assert.equal(combined.body.restaurants.length,3,'food and region-indifference can arrive together');
  assert.equal(combined.body.meta.responseModeState.slots.menu,'국밥');
  const alternate=await run('다른 곳도 보여줘',{slots:{region:'강남',food_type:'국밥·찌개',menu:'국밥'},lastCards:[{id:'old',name:'이전국밥',category:'국밥',address:'서울 강남구 1'}]}, {items:[item('새국밥','강남구')]});
  assert.equal(alternate.body.restaurants.length,1);
  assert.ok(alternate.body.meta.answer_plan.includes('chips'));
  assert.ok(alternate.body.meta.turnPolicy.expansionChoices.length>=4);
  assert.equal(alternate.body.meta.turnPolicy.next_question,null);
  console.log('v122: retained-history DOM + 9-category unseen menu batches + region indifference/neighbor validation + 0–2 alternatives passed.');
}
