import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FORBIDDEN_COPY, STYLE_RULES, groundedCardReason, safeCardReason, cardReasonOptions, applyCardReasons } from '../worker/conversation-copy.js';
import { normalizeResponseState, MODE_A_POOL } from '../worker/response-modes.js';

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
  assert.equal(new Set(first.body.restaurants.map(card => card.recommendationReason)).size, 3);
  for (const card of first.body.restaurants) {
    assert.match(card.recommendationReason, /테스트로/);
    assert.doesNotMatch(card.recommendationReason, FORBIDDEN_COPY);
    assert.doesNotMatch(card.recommendationReason, /단체석|조용|주차|평점|인기|거리/);
    assert.ok(!card.recommendationReason.includes(card.address));
    assert.equal(card.imageUrl, null);
  }
  const card = first.body.restaurants[0];
  const goodReason = '도로명 주소는 테스트로예요.';
  assert.equal(safeCardReason(goodReason, card, '삼겹살', '강남역'), true);
  for (const bad of [`${card.name}는 단체로 앉기 편해요.`, `${card.name}는 마라탕도 맛있어요.`, `${card.name}는 인기 많은 곳이에요.`]) assert.equal(safeCardReason(bad, card, '삼겹살', '강남역'), false);
  const generated = await runCase({ message: '강남역에서 삼겹살 먹을건데', env, naverResponse: { items }, aiResponse: { ...clean, card_reasons: [{ id: card.id, reason: goodReason }] } });
  assert.equal(generated.body.restaurants[0].recommendationReason, goodReason, 'grounded model reason is retained');
  const refine = await runCase({ message: '회식이에요', env, context: { responseModeState: first.body.meta.responseModeState }, naverResponse: { items }, aiResponse: { ...clean, turn_text: { summary: '강남역 삼겹살집은 단체로 앉기 편한 쪽을 위로 올렸어요.', reason: '' } } });
  assert.doesNotMatch(refine.body.message, /앉기|단체로|검증|정렬|후보|입니다/);
  assert.match(refine.body.meta.notice, /단체석.*매장 확인/);
  assert.deepEqual(refine.body.meta.turnPolicy.actionChips, ['다른 곳도 보여줘', '조건 바꾸기', '비교하기']);

  // Menu choices are made by the model inside the allowlist, with contextual reasons.
  const menus = { intro: '쌀쌀한 날 친구들과 나눠 먹을 메뉴를 골라볼게요.', menus: [
    { menu: '국밥', description: '밥과 따뜻한 국물', reason: '쌀쌀하다고 하셔서 따뜻한 국물로 골랐어요' },
    { menu: '전골', description: '함께 끓이는 한 냄비', reason: '친구들과 함께 나눠 먹기 좋아요' },
    { menu: '피자', description: '오븐에 구운 한 판', reason: '친구들과 토핑을 나눠 골라봐요' },
  ] };
  const menu = await runCase({ message: '쌀쌀하고 친구들이랑 저녁 뭐 먹을지 고민이야', env, menuResponses: [menus] });
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
  const invalid = await runCase({ message: '오늘 뭐 먹지', env, menuResponses: [{ menus: menus.menus.map(item => ({ ...item, menu: '없는메뉴' })) }] });
  assert.equal(invalid.body.meta.menuSelectionSource, 'fallback');
  assert.ok(invalid.body.meta.menuCards.every(card => MODE_A_POOL.some(item => item.menu === card.name)));
  const badMenus = { menus: menus.menus.map(item => ({ ...item, reason: '제공된 검색 결과의 후보입니다.' })) };
  const retriedMenu = await runCase({ message: '오늘 뭐 먹지', env, menuResponses: [badMenus, menus] });
  assert.equal(retriedMenu.calls.filter(call => call.body?.text?.format?.name === 'inchelin_menu_choices').length, 2);
  assert.equal(retriedMenu.body.meta.menuSelectionSource, 'model');
  assert.doesNotMatch(groundedCardReason({ ...card, distanceMeters: null }), /거리/);

  // v116: per-restaurant reasons need literal address/name evidence, not cuisine filler.
  const factCards = [
    { id: 'floor', name: '층수집', category: '고깃집', address: '서울 강남구 역삼동 20 1층' },
    { id: 'branch', name: '고기 직영점', category: '고깃집', address: '서울 강남구 역삼동 21' },
    { id: 'building', name: '모임집', category: '고깃집', address: '서울 강남구 테헤란로 22 한빛빌딩' },
  ];
  const varied = applyCardReasons(factCards, [], '회식');
  assert.match(varied[0].recommendationReason, /1층/);
  assert.match(varied[1].recommendationReason, /직영점/);
  assert.match(varied[2].recommendationReason, /한빛빌딩|테헤란로/);
  const variants = varied.map(item => cardReasonOptions(item, '회식').find(option => option.text === item.recommendationReason));
  assert.equal(new Set(variants.map(option => option.start)).size, 3);
  assert.equal(new Set(variants.map(option => option.end)).size, 3);
  for (const item of varied) {
    assert.doesNotMatch(item.recommendationReason, /고깃집|분류|가까|대로변|편해|헷갈|분위기|맛|웨이팅|주차/);
  }
  for (const floor of ['지하 1층', '지하', '3층', '4~5층', 'B1']) {
    assert.ok(cardReasonOptions({ name: '식당', address: '서울 역삼동 1 ' + floor }).some(option => option.text.includes(floor.replace(/\s/g, ''))));
  }
  const unknown = { id: 'none', name: '골목집', category: '고깃집', address: '서울 강남구 역삼동 33 101호' };
  assert.deepEqual(cardReasonOptions(unknown), [], 'unit number is not a floor');
  assert.deepEqual(cardReasonOptions({ ...unknown, address: '서울 역삼동 지하철역 인근' }), [], 'subway is not basement evidence');
  assert.ok(cardReasonOptions({ ...unknown, address: '서울 센터로 1' }).every(option => !option.text.includes('건물')), 'a road containing 센터 is not a building');
  assert.deepEqual(cardReasonOptions({ ...unknown, address: '서울 역삼동 1 1층빌딩' }).filter(option => option.start === 'address'), [], 'building name is not floor evidence');
  assert.equal(groundedCardReason(unknown), '');
  for (const invented of ['1층이라 찾아가기 편해요.', '직영점이라 헷갈리지 않아요.', '강남역에서 가까운 대로변이에요.', '조용하고 맛있어요.', '웨이팅이 짧고 주차가 돼요.', '고깃집 먹을 곳으로 골라봤어요.']) {
    assert.equal(safeCardReason(invented, unknown), false);
    assert.equal(applyCardReasons([unknown], [{ id: 'none', reason: invented }])[0].recommendationReason, '');
  }
  assert.ok(cardReasonOptions({ name: '한결 강남역점', address: '' }).some(option => option.text.includes('강남역점')));
  assert.ok(cardReasonOptions({ name: '한결 본점', address: '' }).some(option => option.text.includes('본점')));
  assert.doesNotMatch(groundedCardReason({ name: '한결 강남역점' }), /가깝|거리|분 거리/);
  assert.ok(cardReasonOptions({ ...unknown, distanceMeters: 250 }).some(option => option.text.includes('직선거리')));
  const duplicates = applyCardReasons(factCards.map((item, i) => ({ ...unknown, id: String(i), address: '서울 역삼동 33 1층' })), factCards.map((_, i) => ({ id: String(i), reason: '주소에는 1층으로 적혀 있어요.' })));
  assert.equal(new Set(duplicates.map(item => item.recommendationReason)).size, 3);
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
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.attributes = {}; this.className = ''; this.classList = { add: name => { this.className += ' ' + name; } }; }
    appendChild(node) { this.children.push(node); node.parent = this; return node; }
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return (this.text || '') + this.children.map(node => node.textContent).join(' '); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, handler) { this.events[type] = handler; }
    click() { this.events.click?.(); }
    remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
  }
  const sent = [], host = new Node('div');
  const document = { createElement: tag => new Node(tag) };
  const renderer = new Function('document', 'messagesEl', 'appendLimitedMarkdown', 'ask', 'resolveRestaurantDetail', 'showToast', 'isCurrentLocationIntent', 'canUseCurrentLocation', 'chooseMenuCard', 'routeQuestion', renderSource + '\nreturn { renderRestaurantCards, renderMessage };')(
    document, host, (node, text) => { node.textContent = text; }, (...args) => sent.push(args), () => {}, () => {}, () => false, () => true, value => sent.push([value + ' 먹고 싶어요']), value => sent.push([value]));
  const nodes = root => [root, ...root.children.flatMap(nodes)];
  const ofClass = (root, cls) => nodes(root).filter(node => node.className.split(' ').includes(cls));
  const group = renderer.renderRestaurantCards(first.body.restaurants);
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
  compareButtons[0].click(); compareButtons[1].click();
  const compareAction = ofClass(group, 'compare-tray-action')[0];
  assert.equal(compareAction.hidden, false); compareAction.click();
  assert.equal(sent.at(-1)[1].compareCards.length, 2);
  const message = renderer.renderMessage({ role: 'assistant', content: first.body.message, restaurants: first.body.restaurants, quickReplies: first.body.suggestions, meta: first.body.meta });
  const bubble = ofClass(message, 'ai-bubble')[0];
  const classes = bubble.children.map(node => node.className);
  assert.ok(classes.indexOf('message-copy') < classes.indexOf('restaurant-group'));
  assert.ok(classes.indexOf('restaurant-group') < classes.indexOf('turn-question'));
  assert.ok(classes.indexOf('turn-question') < classes.indexOf('quick-replies quick-replies-followup'));
  assert.equal(ofClass(message, 'message-copy')[0].textContent, first.body.meta.turnPolicy.intro);
  assert.equal(ofClass(message, 'turn-question').length, 1);
  const menuNode = renderer.renderMessage({ role: 'assistant', content: menu.body.message, restaurants: [], quickReplies: menu.body.suggestions, meta: menu.body.meta });
  assert.equal(ofClass(menuNode, 'menu-choice').length, 3);
  assert.equal(ofClass(menuNode, 'quick-reply-reason').length, 3);
  const choice = ofClass(menuNode, 'menu-choice')[0]; choice.click();
  assert.equal(sent.at(-1)[0], '국밥 먹고 싶어요');
  assert.equal(ofClass(menuNode, 'menu-more').length, 1);
  assert.match(html, /\.restaurant-list\s*\{[^}]*flex-direction:\s*column/);
  assert.doesNotMatch(html, /restaurant-carousel-nav|restaurant-placeholder/);
  // New registered DB image fields are optional; no image endpoint is used.
  const schema = JSON.parse(await readFile(new URL('../schemas/ai-place-profile.schema.json', import.meta.url), 'utf8'));
  assert.ok(schema.properties.inchelin_core.properties.imageUrl);
  assert.ok(!schema.properties.inchelin_core.required.includes('imageUrl'));
  assert.ok(first.calls.every(call => !call.href.includes('/search/image')));
  console.log('Conversation copy/card/menu mocked regressions passed.');
}
