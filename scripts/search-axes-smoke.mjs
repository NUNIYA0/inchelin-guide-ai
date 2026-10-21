import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mountSearchPicker } from '../dist/assets/search-picker-v1.js';
import { SEARCH_FOODS, SEARCH_REGIONS, REGION_ALIASES, searchMessage, placeMatchesRegion } from '../worker/search-axes.js';

export async function testSearchAxes(runCase) {
  const env = { OPENAI_API_KEY: 'test-key', RESTAURANT_DATA_SOURCE: 'naver', NAVER_API_HUB_CLIENT_ID: 'stub', NAVER_API_HUB_CLIENT_SECRET: 'stub' };
  const rows = {
    강남: '서울 강남구 청담동 1', 강남역: '서울 서초구 서초동 1', 역삼: '서울 강남구 역삼동 1',
    홍대: '서울 마포구 서교동 1', 성수: '서울 성동구 성수동1가 1', 종로: '서울 종로구 관철동 1', 여의도: '서울 영등포구 여의도동 1',
  };
  const item = (title, address, category = '한식>냉면') => ({ title, roadAddress: address, category, mapx: '1270000000', mapy: '375000000' });
  for (const region of SEARCH_REGIONS) {
    assert.equal(placeMatchesRegion({ address: rows[region] }, region), true, region);
    assert.equal(placeMatchesRegion({ name: region + '맛집', address: '부산 해운대구 우동 1' }, region), false);
    const result = await runCase({ message: searchMessage({ food: '냉면', region }), env,
      naverResponse: { items: [item(region + '냉면', rows[region]), item(region + '냉면 외지점', '부산 해운대구 우동 1'), item('고깃집', rows[region], '한식>돼지고기구이')] } });
    assert.equal(result.body.restaurants.length, 1, region + JSON.stringify(result.body));
    assert.equal(result.body.restaurants[0].foodLabel, '냉면');
    assert.equal(result.body.restaurants[0].regionLabel, region);
    assert.deepEqual(result.body.meta.searchConditions, { region, food: '냉면' });
    assert.match(result.body.message, /1곳/);
    assert.doesNotMatch(result.body.message, /3곳/);
    assert.equal(result.body.restaurants[0].recommendationReason, '');
    assert.ok(result.body.meta.turnPolicy.expansionChoices.length > 0);
  }
  const categories = { 한식: '한식', 고기: '한식>돼지고기구이', '국밥·찌개': '한식>찌개', 면: '한식>냉면', 일식: '일식', 중식: '중식', 양식: '양식', 분식: '분식', 카페: '카페>커피', 술집: '주점>호프' };
  for (const food of SEARCH_FOODS) {
    const result = await runCase({ message: searchMessage({ food: food.value, region: '홍대' }), env,
      naverResponse: { items: [item(food.name + '테스트', rows.홍대, categories[food.value])] } });
    assert.equal(result.body.restaurants.length, 1, food.name + JSON.stringify(result.body));
  }
  for (const [region, aliases] of Object.entries(REGION_ALIASES)) for (const alias of aliases) {
    assert.ok(placeMatchesRegion({ address: '서울 ' + alias + ' 1' }, region), region + ':' + alias);
  }
  const foodOnly = await runCase({ message: searchMessage({ food: '냉면' }), env });
  assert.equal(foodOnly.body.meta.mode, 'B'); assert.equal(foodOnly.body.restaurants.length, 0);
  assert.equal(foodOnly.body.meta.turnPolicy.next_question.slot, 'region');
  const areaOnly = await runCase({ message: searchMessage({ region: '홍대' }), env });
  assert.equal(areaOnly.body.meta.mode, 'B'); assert.equal(areaOnly.body.restaurants.length, 0);
  assert.equal(areaOnly.body.meta.turnPolicy.next_question.slot, 'menu');
  const first = await runCase({ message: '홍대에서 냉면 먹을 곳 찾아줘', env, naverResponse: { items: [item('홍대냉면', rows.홍대)] } });
  const street = await runCase({ message: '홍대에서 냉면 먹을 곳 찾아줘', env, naverResponse: { items: [{ ...item('홍대냉면', '서울 마포구 월드컵북로5길 1'), address: '서울 마포구 서교동 1' }] } });
  assert.equal(street.body.restaurants.length, 1, 'jibun address is preserved for region evidence');
  assert.equal(street.body.restaurants[0].regionLabel, '홍대');
  const here = await runCase({ message: '내 주변에서 냉면 먹을 곳 찾아줘', env, context: { currentLocation: { latitude: 37.55, longitude: 126.92 }, currentLocationName: '서울 마포구 서교동' }, naverResponse: { items: [item('서교냉면', rows.홍대)] } });
  assert.equal(here.body.restaurants.length, 1);
  assert.deepEqual(here.body.meta.searchConditions, { region: '현재 위치', food: '냉면' });
  assert.equal(here.body.restaurants[0].regionLabel, '서교동');
  const changed = await runCase({ message: '역삼에서 냉면 먹을 곳 찾아줘', env, context: { responseModeState: first.body.meta.responseModeState }, naverResponse: { items: [item('역삼냉면', rows.역삼), item('홍대냉면', rows.홍대)] } });
  assert.equal(changed.body.meta.responseModeState.slots.menu, '냉면');
  assert.equal(changed.body.meta.responseModeState.slots.region, '역삼');
  assert.equal(changed.body.restaurants.length, 1);
  const changedFood = await runCase({ message: '역삼에서 한식 먹을 곳 찾아줘', env, context: { responseModeState: changed.body.meta.responseModeState }, naverResponse: { items: [item('역삼한식', rows.역삼, '한식')] } });
  assert.equal(changedFood.body.meta.responseModeState.slots.menu, null, 'changing to cuisine clears the old specific menu');
  assert.equal(changedFood.body.meta.responseModeState.slots.region, '역삼');
  assert.equal(changedFood.body.restaurants.length, 1);
  const empty = await runCase({ message: '홍대에서 냉면 먹을 곳 찾아줘', env, naverResponse: { items: [] } });
  assert.equal(empty.body.restaurants.length, 0); assert.ok(empty.body.meta.turnPolicy.expansionChoices.length);

  // Shared picker DOM handlers: no browser, keys or external calls.
  const previous = globalThis.document;
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.events = {}; this.dataset = {}; this.value = ''; }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(' '); }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.text = ''; this.children = nodes; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, action) { this.events[type] = action; }
    emit(type) { this.events[type]?.({ target: this, preventDefault() {} }); }
    click() { if (!this.disabled) this.emit('click'); }
    querySelectorAll(tag) { return this.children.flatMap(child => [...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag)]); }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
  }
  const nodes = node => [node, ...node.children.flatMap(nodes)];
  const byText = (node, text) => nodes(node).find(child => child.tag === 'button' && child.textContent === text);
  const body = new Node('body'), home = new Node('section'), sent = [], located = [];
  let slots = {}, busy = false;
  try {
    globalThis.document = { body, createElement: tag => new Node(tag), createElementNS: (ns, tag) => new Node(tag) };
    const mount = root => mountSearchPicker({ home: root, getSlots: () => slots, send: message => sent.push(message), locate: message => located.push(message), isBusy: () => busy });
    const picker = mount(home);
    assert.equal(byText(home, '찾기').disabled, true);
    byText(home, '면').click(); byText(home, '냉면').click();
    assert.equal(byText(home, '찾기').disabled, true);
    byText(home, '한 가지만 정하고 이어가기').click(); assert.equal(sent.pop(), '냉면 먹고 싶어요');
    byText(home, '홍대').click(); assert.equal(byText(home, '찾기').disabled, false);
    byText(home, '찾기').click(); assert.equal(sent.pop(), '홍대에서 냉면 먹을 곳 찾아줘');
    const result = await runCase({ message: searchMessage({ food: '냉면', region: '홍대' }), env, naverResponse: { items: [item('냉면집', rows.홍대)] } });
    assert.equal(result.body.restaurants.length, 1);
    const regionHome = new Node('section'); mount(regionHome);
    byText(regionHome, '성수').click(); byText(regionHome, '한 가지만 정하고 이어가기').click();
    assert.equal(sent.pop(), '성수에서 먹을 곳 찾아줘');
    byText(home, '현재 위치').click(); byText(home, '찾기').click();
    assert.equal(located.pop(), '내 주변에서 냉면 먹을 곳 찾아줘');
    slots = { region: '홍대', menu: '냉면', companion: '회식' };
    picker.open('region'); assert.equal(byText(picker.dialog, '면'), undefined);
    byText(picker.dialog, '역삼').click(); byText(picker.dialog, '찾기').click(); assert.equal(sent.pop(), '역삼에서 냉면 먹을 곳 찾아줘');
    assert.equal(slots.companion, '회식');
    picker.open('food'); assert.equal(byText(picker.dialog, '역삼'), undefined);
    byText(picker.dialog, '고기').click(); byText(picker.dialog, '삼겹살').click(); byText(picker.dialog, '찾기').click();
    assert.equal(sent.pop(), '홍대에서 삼겹살 먹을 곳 찾아줘');
    picker.open('region'); byText(picker.dialog, '직접 입력').click();
    const input = picker.dialog.querySelectorAll('input')[0]; input.value = '찾아줘'; input.emit('input');
    assert.equal(byText(picker.dialog, '찾기').disabled, true);
    input.value = '여의도'; input.emit('input'); byText(picker.dialog, '찾기').click(); assert.equal(sent.pop(), '여의도에서 냉면 먹을 곳 찾아줘');
    picker.open('region'); picker.dialog.emit('cancel'); assert.equal(picker.dialog.open, false);
    busy = true; picker.open('food'); assert.equal(picker.dialog.open, false);
  } finally { globalThis.document = previous; }
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /homeSearchAxes/);
  assert.ok(html.indexOf('id="welcomeForm"') < html.indexOf('id="suggestions"'));
  assert.match(html, /openSearch: openSearchPicker/);
  console.log('Food × region picker/search mocked regressions passed (7 quick regions, 10 categories).');
}
