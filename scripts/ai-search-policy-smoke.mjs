import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeFoodAxis, normalizeSearchRegion, SEARCH_REGIONS } from '../worker/search-axes.js';

export async function testAISearchPolicy(runCase) {
  const env = { OPENAI_API_KEY: 'test-key', RESTAURANT_DATA_SOURCE: 'naver', NAVER_API_HUB_CLIENT_ID: 'stub', NAVER_API_HUB_CLIENT_SECRET: 'stub' };
  const localCalls = result => result.calls.filter(call => call.href.includes('/search/v1/local'));
  const items = (region, category = '한식>돼지고기구이', name = '삼겹살') => ({ items: Array.from({ length: 3 }, (_, index) => ({ title: region + name + index, category, roadAddress: '서울 ' + region + ' 테스트로 ' + index, mapx: String(1270000000 + index), mapy: '375000000' })) });
  // ③ Food/region dictionaries keep a broad kind and optional specific menu.
  for (const [text, kind, menu] of [['냉면 땡겨', '면', '냉면'], ['고기 먹고 싶다', '고기', null], ['국물 있는 거', '국밥·찌개', null], ['갈비 구이 먹자', '고기', '갈비']]) {
    const result = await runCase({ message: text, env });
    assert.equal(result.body.meta.analysis.slots.food_type, kind, text);
    assert.equal(result.body.meta.analysis.slots.menu, menu, text);
    assert.equal(result.body.meta.mode, 'B');
    assert.equal(result.body.meta.turnPolicy.next_question.slot, 'region');
    assert.equal(result.body.restaurants.length, 0); assert.equal(result.calls.length, 0);
  }
  for (const [text, region] of [['역삼 쪽', '역삼'], ['홍대입구', '홍대'], ['홍대입구역', '홍대'], ['강남역 근처', '강남역']]) {
    const result = await runCase({ message: text, env });
    assert.equal(result.body.meta.analysis.slots.region, region, text);
    assert.equal(result.body.meta.mode, 'B'); assert.equal(result.body.meta.turnPolicy.next_question.slot, 'menu');
    assert.equal(localCalls(result).length, 0);
  }
  assert.deepEqual(normalizeFoodAxis('고기'), { food_type: '고기', menu: null });
  assert.equal(normalizeFoodAxis('삼겹살').food_type, '고기');
  assert.equal(normalizeFoodAxis('갈비').food_type, '고기');
  assert.equal(normalizeFoodAxis('구이').food_type, '고기');
  assert.equal(normalizeSearchRegion('홍대입구'), '홍대');
  assert.equal(normalizeSearchRegion('역삼2동'), '역삼');
  assert.equal(normalizeSearchRegion('성수동1가'), '성수');
  const normalized = await runCase({ message: '홍대입구에서 냉면 땡겨', env, naverResponse: items('홍대', '한식>냉면', '냉면') });
  assert.equal(normalized.body.meta.mode, 'C'); assert.equal(normalized.body.restaurants.length, 3);
  assert.equal(normalized.body.meta.analysis.slots.food_type, '면');
  assert.equal(normalized.body.meta.responseModeState.slots.region, '홍대');
  assert.equal(new URL(localCalls(normalized)[0].href).searchParams.get('query'), '홍대 냉면');
  assert.equal(normalized.body.meta.turnPolicy.next_question.slot, 'companion');
  const strictDish = await runCase({ message: '성수에서 스테이크 먹을 곳 찾아줘', env, naverResponse: { items: [
    ...items('성수', '양식>스테이크', '스테이크').items.slice(0, 1),
    ...items('성수', '한식>돼지고기구이', '고깃집').items.slice(0, 1),
  ] } });
  assert.equal(strictDish.body.restaurants.length, 1, 'dictionary-specific menus must be validated too');
  // Normalization also runs after a model classification, not only the disabled-analyzer path.
  const model = await runCase({ message: '고기 먹고 싶다', env, analyzerEnabled: true, modeIntentAnalysis: { intent: 'general', confidence: 0.4, slots: {}, flags: {} } });
  assert.equal(model.body.meta.analysis.slots.food_type, '고기');
  assert.equal(model.body.meta.mode, 'B'); assert.equal(model.body.meta.turnPolicy.next_question.slot, 'region');
  const analysisCall = model.calls.find(call => call.body?.text?.format?.name === 'inchelin_response_mode_analysis');
  assert.match(analysisCall.body.instructions, /최우선 축은 food_type과 region/);
  // ④ Replacing one axis preserves the other and does not exclude all earlier cards.
  const first = await runCase({ message: '홍대에서 삼겹살 먹을 곳 찾아줘', env, naverResponse: items('홍대') });
  const regionChange = await runCase({ message: '거기 말고 성수에서', env, context: { responseModeState: first.body.meta.responseModeState }, naverResponse: items('성수') });
  assert.equal(regionChange.body.meta.mode, 'D');
  assert.equal(regionChange.body.meta.responseModeState.slots.menu, '삼겹살');
  assert.equal(regionChange.body.meta.responseModeState.slots.food_type, '고기');
  assert.equal(regionChange.body.meta.responseModeState.slots.region, '성수');
  assert.equal(new URL(localCalls(regionChange)[0].href).searchParams.get('query'), '성수 삼겹살');
  const foodChange = await runCase({ message: '그럼 국밥으로', env, context: { responseModeState: regionChange.body.meta.responseModeState }, naverResponse: items('성수', '한식>국밥', '국밥') });
  assert.equal(foodChange.body.meta.mode, 'D');
  assert.equal(foodChange.body.meta.responseModeState.slots.region, '성수');
  assert.equal(foodChange.body.meta.responseModeState.slots.menu, '국밥');
  assert.equal(foodChange.body.meta.analysis.slots.food_type, '국밥·찌개');
  assert.equal(new URL(localCalls(foodChange)[0].href).searchParams.get('query'), '성수 국밥');
  assert.ok(foodChange.body.restaurants.every(card => card.category === '국밥'));
  // ⑤ Vague food asks region before menu exploration; there is no guessed cuisine.
  const vague = await runCase({ message: '맛있는 거 찾아줘', env });
  assert.equal(vague.body.meta.mode, 'B'); assert.equal(vague.body.meta.turnPolicy.next_question.slot, 'region');
  assert.equal(vague.body.meta.responseModeState.slots.food_type, null); assert.equal(vague.body.restaurants.length, 0);
  const vagueBare = await runCase({ message: '맛있는 거', env });
  assert.equal(vagueBare.body.meta.turnPolicy.next_question.slot, 'region');
  assert.equal(vagueBare.calls.length, 0);
  const vagueArea = await runCase({ message: '홍대입구', env, context: { responseModeState: vague.body.meta.responseModeState } });
  assert.equal(vagueArea.body.meta.turnPolicy.next_question.slot, 'menu'); assert.ok(vagueArea.body.suggestions.includes('메뉴 탐색'));
  const explore = await runCase({ message: '오늘 뭐 먹을지 같이 골라줘', env, context: { responseModeState: vagueArea.body.meta.responseModeState } });
  assert.equal(explore.body.meta.mode, 'A'); assert.equal(explore.body.meta.menuCards.length, 3);
  assert.equal(explore.body.meta.responseModeState.slots.region, '홍대');
  // ⑦ Unsupported spoken regions are not searched and do not generate expansion promises.
  for (const region of ['부산', '판교', '울릉도', '신림', '합정']) {
    const result = await runCase({ message: `${region}에서 냉면 먹을 곳 찾아줘`, env });
    assert.equal(result.body.meta.unsupportedRegion, region);
    assert.deepEqual(result.body.suggestions, SEARCH_REGIONS);
    assert.equal(result.body.meta.analysis.can_search, false);
    assert.equal(result.body.meta.responseModeState.slots.menu, '냉면');
    assert.equal(localCalls(result).length, 0); assert.equal(result.calls.length, 0);
    assert.doesNotMatch(result.body.message, /확장|계획|예정|준비|곧/);
    const choice = result.body.meta.turnPolicy.next_question.chips.find(chip => chip.label === '성수');
    assert.equal(choice.message, '성수에서 냉면 먹을 곳 찾아줘');
  }
  // Unverified preferences never replace the two required search axes or block results.
  const optional = await runCase({ message: '역삼에서 삼겹살 회식할 건데 주차 필요하고 조용한 곳', env, naverResponse: items('역삼') });
  assert.equal(optional.body.restaurants.length, 3); assert.match(optional.body.meta.notice, /주차|분위기/);
  assert.equal(optional.body.meta.analysis.slots.food_type, '고기'); assert.equal(optional.body.meta.analysis.slots.region, '역삼');
  const missing = await runCase({ message: '회식하기 좋은 곳으로', env, context: { responseModeState: { lastCards: [{ id: 'a', name: '식당', address: '서울 역삼동' }], slots: {} } } });
  assert.equal(missing.body.meta.mode, 'B'); assert.equal(localCalls(missing).length, 0);
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const home = html.slice(html.indexOf('id="welcome"'), html.indexOf('id="chatView"'));
  assert.doesNotMatch(html, /homeSearchAxes/);
  assert.doesNotMatch(home, /search-axes|axis-group|음식 종류와 지역으로 찾기/);
  assert.match(html, /mountSearchPicker\(\{ getSlots:/);
  assert.match(html, /openSearch: openSearchPicker/);
  const categoryPlugin = await readFile(new URL('../dist/assets/meal-tools-v2.js', import.meta.url), 'utf8');
  const regionPlugin = await readFile(new URL('../dist/assets/plugin-actions-v1.js', import.meta.url), 'utf8');
  assert.match(categoryPlugin, /openSearch\('food'\)/); assert.match(regionPlugin, /openSearch\('region'\)/);
  console.log('AI search-axis priority/alias/unsupported-region mocked regressions passed.');
}
