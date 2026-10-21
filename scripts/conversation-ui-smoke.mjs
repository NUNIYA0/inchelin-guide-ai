import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FORBIDDEN_COPY, STYLE_RULES, groundedCardReason, safeCardReason, cardReasonOptions, applyCardReasons } from '../worker/conversation-copy.js';
import { normalizeResponseState, MODE_A_POOL } from '../worker/response-modes.js';
import { answerPlanFor } from '../worker/answer-plan.js';

export async function testConversationUI(runCase) {
  const env = { OPENAI_API_KEY: 'test-key', RESTAURANT_DATA_SOURCE: 'naver', NAVER_API_HUB_CLIENT_ID: 'stub-id', NAVER_API_HUB_CLIENT_SECRET: 'stub-secret' };
  const items = ['첫고기', '둘고기', '셋고기'].map((name, i) => ({ title: name, roadAddress: '서울 강남역 테스트로 ' + i, category: '한식>돼지고기구이', mapx: String(1270000000 + i), mapy: String(375000000 + i) }));
  const clean = { message: '강남역에서 삼겹살 드시고 싶으시군요.', turn_text: { summary: '강남역에서 삼겹살 먹을 곳 3곳을 골라봤어요.', reason: '' }, suggestions: [], selectedRestaurantIds: [], next_question: null };
  const dirty = { ...clean, message: '삼겹살 요청입니다.', turn_text: { summary: '검증된 후보를 정렬했습니다.', reason: '제공된 검색 결과의 분류입니다.' } };
  const first = await runCase({ message: '강남역에서 삼겹살 먹을건데', env, naverResponse: { items }, aiResponses: [dirty, clean] });
  assert.equal(first.calls.filter(call => call.body?.text?.format?.name === 'inchelin_chat_response').length, 2, 'style is regenerated exactly once');
  assert.doesNotMatch(first.body.message, FORBIDDEN_COPY);
  assert.equal(first.body.restaurants.length, 3);
  const lastCall = first.calls.at(-1);
  assert.ok(lastCall.body.instructions.includes(STYLE_RULES));
  assert.match(lastCall.body.instructions, /한 번 다시/);
  const failed = await runCase({ message: '강남역에서 삼겹살 먹을건데', env, naverResponse: { items }, aiResponses: [dirty, dirty] });
  assert.equal(failed.calls.filter(call => call.body?.text?.format?.name === 'inchelin_chat_response').length, 2);
  assert.doesNotMatch(failed.body.message, FORBIDDEN_COPY);
  assert.equal(failed.body.restaurants.length, 3, 'bad copy cannot remove verified cards');
  assert.ok(first.body.restaurants.every(card => card.recommendationReason === ''));
  for (const card of first.body.restaurants) {
    assert.equal(card.recommendationReason, '');
    assert.doesNotMatch(card.recommendationReason, FORBIDDEN_COPY);
    assert.doesNotMatch(card.recommendationReason, /단체석|조용|주차|평점|인기|거리/);
    assert.ok(!card.recommendationReason.includes(card.address));
    assert.equal(card.imageUrl, null);
  }
  const card = first.body.restaurants[0];
  const goodReason = '도로명 주소는 테스트로예요.';
  assert.equal(safeCardReason(goodReason, card, '삼겹살', '강남역'), false);
  for (const bad of [`${card.name}는 단체로 앉기 편해요.`, `${card.name}는 마라탕도 맛있어요.`, `${card.name}는 인기 많은 곳이에요.`]) assert.equal(safeCardReason(bad, card, '삼겹살', '강남역'), false);
  const generated = await runCase({ message: '강남역에서 삼겹살 먹을건데', env, naverResponse: { items }, aiResponse: { ...clean, card_reasons: [{ id: card.id, reason: goodReason }] } });
  assert.equal(generated.body.restaurants[0].recommendationReason, '', 'address-only model reason is dropped');
  const refine = await runCase({ message: '회식이에요', env, context: { responseModeState: first.body.meta.responseModeState }, naverResponse: { items }, aiResponse: { ...clean, turn_text: { summary: '강남역 삼겹살집은 단체로 앉기 편한 쪽을 위로 올렸어요.', reason: '' } } });
  assert.doesNotMatch(refine.body.message, /앉기|단체로|검증|정렬|후보|입니다/);
  assert.match(refine.body.meta.notice, /단체석.*매장 확인/);
  assert.deepEqual(refine.body.meta.turnPolicy.actionChips, ['다른 곳 보기', '조건 바꾸기']);

  // Menu choices are made by the model inside the allowlist, with contextual reasons.
  const menus = { intro: '쌀쌀한 날 친구들과 나눠 먹을 메뉴를 골라볼게요.', menus: [
    { menu: '국밥', description: '밥과 따뜻한 국물', reason: '쌀쌀하다고 하셔서 따뜻한 국물로 골랐어요' },
    { menu: '전골', description: '함께 끓이는 한 냄비', reason: '친구들과 함께 나눠 먹기 좋아요' },
    { menu: '피자', description: '오븐에 구운 한 판', reason: '친구들과 토핑을 나눠 골라봐요' },
  ] };
  const menu = await runCase({ message: '쌀쌀하고 친구들이랑 저녁 뭐 먹을지 고민이야, 알아서 골라줘', env, menuResponses: [menus] });
  assert.equal(menu.body.meta.mode, 'A');
  assert.equal(menu.body.meta.menuSelectionSource, 'model');
  assert.ok(menu.body.message.startsWith(menus.intro));
  assert.deepEqual(menu.body.meta.menuCards.map(card => card.name), menus.menus.map(card => card.menu));
  assert.ok(menu.body.meta.menuCards.every(card => card.description && card.reason));
  const menuCall = menu.calls.find(call => call.body?.text?.format?.name === 'inchelin_menu_choices');
  assert.ok(menuCall.body.input.at(-1).content.includes('쌀쌀하고 친구들'));
  assert.match(menuCall.body.instructions, /이전 선택|날씨·기분·동행/);
  assert.doesNotMatch(menu.body.message, FORBIDDEN_COPY);
  const nextMenus = { menus: MODE_A_POOL.filter(item => !menus.menus.some(choice => choice.menu === item.menu)).slice(0, 3).map(item => ({ menu: item.menu, description: item.direction, reason: item.reason })) };
  const more = await runCase({ message: '다른 메뉴도 추천해줘', env, context: { responseModeState: menu.body.meta.responseModeState }, menuResponses: [nextMenus] });
  assert.ok(more.body.meta.menuCards.every(card => !menu.body.meta.menuCards.some(old => old.name === card.name)));
  const invalid = await runCase({ message: '알아서 골라줘', env, menuResponses: [{ menus: menus.menus.map(item => ({ ...item, menu: '없는메뉴' })) }] });
  assert.equal(invalid.body.meta.menuSelectionSource, 'fallback');
  assert.ok(invalid.body.meta.menuCards.every(card => MODE_A_POOL.some(item => item.menu === card.name)));
  const badMenus = { menus: menus.menus.map(item => ({ ...item, reason: '제공된 검색 결과의 후보입니다.' })) };
  const retriedMenu = await runCase({ message: '알아서 골라줘', env, menuResponses: [badMenus, menus] });
  assert.equal(retriedMenu.calls.filter(call => call.body?.text?.format?.name === 'inchelin_menu_choices').length, 2);
  assert.equal(retriedMenu.body.meta.menuSelectionSource, 'model');
  assert.doesNotMatch(groundedCardReason({ ...card, distanceMeters: null }), /거리/);

  // v117 supersedes address-derived reasons: only a verified user-condition connection remains.
  const factCard = { id: 'a', name: '식당', category: '한식', address: '서울 역삼동 1 1층', privateRoom: true, parking: true };
  assert.deepEqual(cardReasonOptions(factCard), []);
  assert.ok(cardReasonOptions(factCard, { companion: '회식' }).some(option => option.text.includes('룸')));
  assert.ok(cardReasonOptions(factCard, { parking: true }).some(option => option.text.includes('주차')));
  assert.deepEqual(cardReasonOptions({ ...factCard, privateRoom: null, parking: null }, { companion: '회식', parking: true }), []);
  const noEvidenceItems = items.map((item, index) => ({ ...item, title: '삼겹살' + ['가게가', '가게나', '가게다'][index], roadAddress: '서울 강남구 역삼동 ' + (index + 1) }));
  const noEvidence = await runCase({ message: '강남역에서 삼겹살 먹을건데', env, naverResponse: { items: noEvidenceItems }, aiResponse: { ...clean, card_reasons: [{ id: 'fake', reason: '분위기가 좋아요.' }] } });
  assert.equal(noEvidence.body.restaurants.length, 3);
  assert.ok(noEvidence.body.restaurants.every(item => item.recommendationReason === ''));
  const contextual = await runCase({ message: '강남역에서 삼겹살 회식할 거야', env, naverResponse: { items }, aiResponse: { ...clean, turn_text: { summary: '회식이라면 강남역 삼겹살집을 함께 골라볼게요.', reason: '' } } });
  assert.ok(contextual.body.message.startsWith('회식이라면 강남역 삼겹살집을 함께 골라볼게요.'));
  assert.doesNotMatch(failed.body.message, /먼저 식당 \d+곳을 찾았어요/);
  assert.match(first.calls.at(-1).body.instructions, /fact_reason_options|웨이팅|이유를 만들지/);

  // Exercise the real rendering functions with a small DOM fixture, no browser or APIs.
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const renderSource = html.slice(html.indexOf('    const comparisonTray = new Map();'), html.indexOf('    function appendMessage('));
  class Node {
    constructor(tag) { this.tag = tag; this.tagName = tag.toUpperCase(); this.children = []; this.events = {}; this.attributes = {}; this.className = ''; this.classList = { add: name => { this.className += ' ' + name; } }; }
    appendChild(node) { this.children.push(node); node.parent = this; return node; }
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    set innerHTML(value) { this.children = []; }
    querySelectorAll(selector) { return nodes(this).filter(node => selector.split(',').some(part => node.className.split(' ').includes(part.trim().slice(1)))); }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return (this.text || '') + this.children.map(node => node.textContent).join(' '); }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; delete this[key]; }
    addEventListener(type, handler) { this.events[type] = handler; }
    click() { this.events.click?.(); }
    remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
  }
  const sent = [], host = new Node('div'), trayHost = new Node('section');
  const document = { createElement: tag => new Node(tag), getElementById: id => id === 'comparisonTray' ? trayHost : null };
  const openedAxes = [];
  const renderer = new Function('document', 'messagesEl', 'appendLimitedMarkdown', 'ask', 'resolveRestaurantDetail', 'showToast', 'isCurrentLocationIntent', 'canUseCurrentLocation', 'chooseMenuCard', 'routeQuestion', 'openSearchPicker', renderSource + '\nreturn { renderRestaurantCards, renderMessage };')(
    document, host, (node, text) => { node.textContent = text; }, (...args) => sent.push(args), () => {}, () => {}, () => false, () => true, value => sent.push([value + ' 먹을래']), value => sent.push([value]), axis => openedAxes.push(axis));
  const nodes = root => [root, ...root.children.flatMap(nodes)];
  const ofClass = (root, cls) => nodes(root).filter(node => node.className.split(' ').includes(cls));
  const group = renderer.renderRestaurantCards(first.body.restaurants);
  assert.equal(ofClass(group, 'restaurant-condition-chips').length, 3);
  assert.equal(ofClass(group, 'restaurant-region').length, 3);
  assert.ok(ofClass(group, 'restaurant-category').some(node => node.textContent === '삼겹살'));
  assert.ok(ofClass(group, 'restaurant-region').every(node => node.textContent === '강남역'));
  assert.equal(ofClass(group, 'restaurant-card').length, 3);
  assert.equal(ofClass(group, 'restaurant-media').length, 0);
  assert.equal(ofClass(group, 'restaurant-image').length, 0);
  assert.equal(ofClass(group, 'restaurant-source').length, 1);
  assert.equal(nodes(group).filter(node => node.text === '네이버 검색 기준').length, 1);
  assert.equal(ofClass(group, 'restaurant-carousel-nav').length, 0);
  assert.doesNotMatch(group.textContent, /이미지 준비|영업시간|평점/);
  const noReasons = renderer.renderRestaurantCards(noEvidence.body.restaurants);
  assert.equal(ofClass(noReasons, 'restaurant-reason').length, 0, 'no evidence means no reason element');
  assert.equal(ofClass(noReasons, 'restaurant-card-head').length, 3);
  assert.equal(ofClass(noReasons, 'restaurant-address').length, 3);
  const photo = renderer.renderRestaurantCards([{ ...card, imageUrl: 'https://db.example/registered-photo.jpg' }]);
  assert.equal(ofClass(photo, 'restaurant-image').length, 1);
  const photoContent = ofClass(photo, 'restaurant-card-content')[0];
  assert.deepEqual(photoContent.children.map(node => node.className), ['restaurant-card-body', 'restaurant-media']);
  ofClass(photo, 'restaurant-image')[0].events.error();
  assert.equal(ofClass(photo, 'restaurant-media').length, 0);
  const compareButtons = nodes(group).filter(node => node.tag === 'button' && node.text === '비교에 담기');
  compareButtons[0].click();
  assert.equal(ofClass(trayHost, 'comparison-submit')[0].disabled, true);
  assert.match(trayHost.textContent, /1곳 더 담아 주세요/);
  compareButtons[1].click();
  assert.equal(ofClass(group, 'compare-tray-action').length, 0);
  const compareAction = ofClass(trayHost, 'comparison-submit')[0];
  assert.equal(compareAction.disabled, false); compareAction.click();
  assert.equal(sent.at(-1)[1].compareCards.length, 2);
  assert.equal(sent.at(-1)[0], '첫고기랑 둘고기 비교해줘');
  compareButtons[2].click();
  const fourthGroup = renderer.renderRestaurantCards([{ ...card, id: 'fourth', name: '네번째집' }]);
  nodes(fourthGroup).find(node => node.tag === 'button' && node.text === '비교에 담기').click();
  assert.equal(ofClass(trayHost, 'comparison-item').length, 3, 'tray is capped at three across responses');
  ofClass(trayHost, 'comparison-item')[0].click();
  assert.equal(ofClass(trayHost, 'comparison-item').length, 2);
  assert.equal(compareButtons[0].attributes['aria-pressed'], 'false', 'removal updates original card button');
  ofClass(trayHost, 'comparison-item')[0].click();
  assert.equal(ofClass(trayHost, 'comparison-submit')[0].disabled, true);
  const message = renderer.renderMessage({ role: 'assistant', content: first.body.message, restaurants: first.body.restaurants, quickReplies: first.body.suggestions, meta: first.body.meta });
  const bubble = ofClass(message, 'ai-bubble')[0];
  const conditions = ofClass(message, 'result-conditions')[0];
  assert.deepEqual(conditions.children.map(node => node.textContent), ['강남역', '삼겹살']);
  conditions.children[0].click(); conditions.children[1].click();
  assert.deepEqual(openedAxes, ['region', 'food']);
  const classes = bubble.children.map(node => node.className);
  assert.ok(classes.indexOf('message-copy') < classes.indexOf('restaurant-group'));
  assert.ok(classes.indexOf('restaurant-group') < classes.indexOf('turn-question'));
  assert.ok(classes.indexOf('turn-question') < classes.findIndex(value=>value.split(' ').includes('answer-chips')));
  assert.equal(ofClass(message, 'message-copy')[0].textContent, first.body.meta.turnPolicy.intro);
  assert.equal(ofClass(message, 'turn-question').length, 1);
  const menuNode = renderer.renderMessage({ role: 'assistant', content: menu.body.message, restaurants: [], quickReplies: menu.body.suggestions, meta: menu.body.meta });
  assert.equal(ofClass(menuNode, 'menu-choice').length, 3);
  assert.equal(ofClass(menuNode, 'quick-reply-reason').length, 3);
  const choice = ofClass(menuNode, 'menu-choice')[0]; choice.click();
  assert.equal(sent.at(-1)[0], '국밥 먹을래');
  assert.equal(ofClass(menuNode, 'menu-more').length, 1, 'menu options always include their pale more-menu chip');
  // Two representative display envelopes per each of the eleven table rows.
  const table = [
    ['menu_trouble',{}],['menu_trouble',{food_type:'한식'}],['place_search',{region:'강남',menu:'국밥'}],
    ['place_search',{menu:'국밥'}],['followup',{}],['condition_change',{region:'강남',menu:'국밥'}],
    ['compare',{}],['specific_place',{}],['food_talk',{}],['service',{}],['out_of_scope',{}],
  ];
  for (const [intent, slots] of table) for (const version of [1,2]) {
    const answer_plan = answerPlanFor({intent,slots},{slots});
    const rendered = renderer.renderMessage({role:'assistant',content:'함께 골라봐요.',restaurants:first.body.restaurants,
      quickReplies:['국밥|따뜻한 밥','선택'],meta:{answer_plan,answer_limits:{place_cards:intent==='specific_place'?1:3},
        menuCards:[{name:'국밥',description:'따뜻한 한 그릇',reason:'든든하게 먹어요'}],notice:'매장 확인이 필요해요.',
        turnPolicy:{intro:'함께 골라봐요.',questionText:'누구와 가세요?',actionChips:['조건 바꾸기']}}});
    assert.equal(ofClass(rendered,'restaurant-card').length,answer_plan.includes('place_cards')?(intent==='specific_place'?1:3):0, intent+version);
    assert.equal(ofClass(rendered,'restaurant-source').length,answer_plan.includes('source')&&answer_plan.includes('place_cards')?1:0);
    assert.equal(ofClass(rendered,'menu-choice').length,answer_plan.includes('menu_cards')?1:0);
    assert.equal(ofClass(rendered,'turn-question').length,answer_plan.includes('question')?1:0);
    assert.equal(ofClass(rendered,'answer-chips').length,answer_plan.includes('chips')?1:0);
    assert.equal(ofClass(rendered,'turn-notice').length,answer_plan.includes('notice')?1:0);
  }
  const menuBubble = ofClass(menuNode, 'ai-bubble')[0];
  const menuClasses = menuBubble.children.map(node => node.className);
  assert.ok(menuClasses.indexOf('message-copy') < menuClasses.indexOf('menu-hint'));
  assert.ok(menuClasses.indexOf('quick-replies menu-cards') < menuClasses.indexOf('menu-hint'));
  assert.equal(ofClass(menuNode,'turn-question').length,0,'menu-options plan has no question block');
  assert.ok(menu.body.meta.menuCards.every(item => [...item.description].length <= 22 && [...item.reason].length <= 30));
  assert.ok(ofClass(message, 'action-chips').every(group => group.children.length <= 2));
  assert.ok(ofClass(message, 'answer-chips')[0].textContent.includes('상관없어요'));
  assert.doesNotMatch(ofClass(message, 'action-chips')[0].textContent, /비교하기|메뉴 탐색/);
  assert.equal(ofClass(group, 'restaurant-source').length, 1);
  assert.ok(nodes(group).indexOf(ofClass(group, 'restaurant-source')[0]) > nodes(group).indexOf(ofClass(group, 'restaurant-list')[0]));
  renderer.renderMessage({ role: 'user', content: '국밥 먹고 싶어요' });
  assert.notEqual(ofClass(message, 'answer-chips')[0].hidden, true, 'history is retained');
  assert.notEqual(ofClass(menuNode, 'menu-cards')[0].hidden, true);
  assert.equal(ofClass(menuNode, 'menu-choice').length, 3);
  assert.ok(ofClass(menuNode, 'menu-choice').every(button=>button.disabled));
  assert.equal(ofClass(menuNode,'history-selected').length,1);
  assert.equal(ofClass(menuNode,'history-check').length,1);
  assert.match(ofClass(menuNode,'history-selected')[0].textContent,/국밥.*✓/);
  assert.ok(ofClass(message,'quick-reply').every(button=>button.disabled));
  assert.ok(ofClass(message,'restaurant-map-link').every(button=>button.disabled));
  assert.equal(ofClass(message,'restaurant-card').length,3,'old restaurant cards remain');
  const sentBefore = sent.length; choice.click();
  assert.equal(sent.length,sentBefore,'disabled old choices cannot send a new request');
  // Newest choices stay live; earlier selections remain unchanged after later turns.
  const nextQuestion = renderer.renderMessage({role:'assistant',content:first.body.message,restaurants:first.body.restaurants,quickReplies:first.body.suggestions,meta:first.body.meta});
  renderer.renderMessage({role:'user',content:'회식이에요'});
  assert.equal(ofClass(nextQuestion,'history-selected').length,1);
  assert.match(ofClass(nextQuestion,'history-selected')[0].textContent,/회식.*✓/);
  assert.equal(ofClass(menuNode,'history-selected').length,1,'a later answer cannot change historical selection');
  const sparse = await runCase({message:'강남역에서 삼겹살 먹을 곳 찾아줘',env,naverResponse:{items:items.slice(0,1)}});
  const alternativesNode=renderer.renderMessage({role:'assistant',content:sparse.body.message,restaurants:sparse.body.restaurants,quickReplies:sparse.body.suggestions,meta:sparse.body.meta});
  const alternatives=ofClass(alternativesNode,'alternative-chips')[0];
  assert.equal(alternatives.children.length,sparse.body.meta.turnPolicy.expansionChoices.length);
  alternatives.children[0].click();
  assert.equal(sent.at(-1)[0],sparse.body.meta.turnPolicy.expansionChoices[0].message,'alternative sends a natural-language request');
  renderer.renderMessage({role:'user',content:'첫 번째 집 알려줘'});
  assert.equal(ofClass(alternativesNode,'restaurant-card').length,1);
  assert.equal(ofClass(alternativesNode,'restaurant-card')[0].className.includes('history-selected'),true);
  assert.ok(alternatives.children.every(button=>button.disabled));
  const beforeDisabledClick=sent.length;alternatives.children[0].click();assert.equal(sent.length,beforeDisabledClick);
  // Replaying stored assistant/user messages reconstructs state without saving DOM.
  host.innerHTML='';
  const replay=renderer.renderMessage({role:'assistant',content:menu.body.message,restaurants:[],quickReplies:menu.body.suggestions,meta:menu.body.meta});
  const replayMore=ofClass(replay,'menu-more')[0];replayMore.click();assert.equal(sent.at(-1)[0],'다른 메뉴 보기');
  renderer.renderMessage({role:'user',content:'국밥 먹고 싶어요'});
  assert.equal(ofClass(replay,'menu-choice').length,3);
  assert.equal(ofClass(replay,'history-check').length,1);
  assert.ok(ofClass(replay,'menu-choice').every(button=>button.disabled));
  assert.equal(replayMore.disabled,true);
  assert.match(html, /\.menu-choice \.quick-reply-title \{ font: 700 17px/);
  assert.match(html, /\.quick-reply-reason \{[^}]*font-size: 14px; font-weight: 400/);
  assert.match(html, /\.chat-scroll-area \{[^}]*overflow: visible/);
  assert.doesNotMatch(html, /chatScrollArea\.scroll(?:To|Top)/);
  assert.match(html, /\.chat-dock \{ position: fixed/);
  assert.match(html, /\.answer-chips\[hidden\][^}]*display: none !important/);
  assert.match(html, /\.restaurant-list\s*\{[^}]*flex-direction:\s*column/);
  assert.doesNotMatch(html, /restaurant-carousel-nav|restaurant-placeholder/);
  // New registered DB image fields are optional; no image endpoint is used.
  const schema = JSON.parse(await readFile(new URL('../schemas/ai-place-profile.schema.json', import.meta.url), 'utf8'));
  assert.ok(schema.properties.inchelin_core.properties.imageUrl);
  assert.ok(!schema.properties.inchelin_core.required.includes('imageUrl'));
  assert.ok(first.calls.every(call => !call.href.includes('/search/image')));
  console.log('Conversation copy/card/menu mocked regressions passed.');
}
