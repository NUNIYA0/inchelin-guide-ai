import assert from 'node:assert/strict';
import { applyTurnPolicy, planTurn, withTurnDeadline } from '../worker/turn-policy.js';
import { normalizeResponseState, INTENT_ANALYSIS_SCHEMA } from '../worker/response-modes.js';
import { situationRequest } from '../dist/assets/plugin-actions-v1.js';

export async function testTurnPolicy(runCase) {
  const env = { OPENAI_API_KEY: 'test-key', RESTAURANT_DATA_SOURCE: 'naver', NAVER_API_HUB_CLIENT_ID: 'stub-id', NAVER_API_HUB_CLIENT_SECRET: 'stub-secret' };
  const places = (area = '강남역', menu = '삼겹살') => ({ items: Array.from({ length: 5 }, (_, i) => ({
    title: area + menu + '테스트식당' + i, roadAddress: '서울특별시 ' + area + ' 테스트로 ' + i,
    category: menu === '국밥' ? '한식>국밥' : '한식>돼지고기구이', mapx: String(1270000000 + i), mapy: String(375000000 + i)
  })) });
  const questions = body => (body.message.match(/[?？]/g) || []).length;
  const boundedCopy = body => assert.ok(body.message.split(/[.!?？]/).filter(unit => unit.trim()).length <= 3, body.message);
  for (const key of ['stage', 'missing_slots', 'next_question', 'can_search']) {
    assert.ok(INTENT_ANALYSIS_SCHEMA.properties[key]);
    assert.ok(INTENT_ANALYSIS_SCHEMA.required.includes(key));
  }
  // 1. First ready turn: verified cards first, exactly one actionable question.
  const first = await runCase({ message: '강남역에서 삼겹살 먹을건데', env, naverResponse: places(),
    aiResponse: { message: '검색 결과예요.', turn_text: { summary: '강남역 삼겹살로 먼저 식당 3곳을 골랐어요.', reason: '' },
      next_question: { slot: 'companion', text: '어떤 분들과 함께 가세요?', chips: [] }, selectedRestaurantIds: ['not-verified'], suggestions: [] } });
  assert.equal(first.body.meta.analysis.stage, 'ready');
  assert.equal(first.body.meta.analysis.can_search, true);
  assert.equal(first.body.restaurants.length, 3);
  assert.ok(first.body.restaurants.every(card => card.id.startsWith('naver:')));
  assert.equal(questions(first.body), 0);
  assert.equal(first.body.meta.turnPolicy.cardFirst, false);
  assert.ok(first.body.meta.turnPolicy.intro);
  assert.equal(first.body.meta.turnPolicy.next_question, null);
  assert.deepEqual(first.body.suggestions, []);
  assert.equal(first.body.meta.turnPolicy.questionSource, null);
  assert.match(first.body.message, /^강남역 삼겹살로 먼저 식당 3곳을 골랐어요/);
  assert.equal(first.body.meta._turnDraft, undefined);
  boundedCopy(first.body);
  // 2. Natural-language answer goes back through analysis/decideMode and re-searches.
  const refined = await runCase({ message: '회식이에요', env, context: { responseModeState: first.body.meta.responseModeState }, naverResponse: places() });
  assert.equal(refined.body.meta.analysis.stage, 'refining');
  assert.equal(refined.body.meta.responseModeState.slots.companion, '회식');
  assert.equal(refined.body.meta.responseModeState.preferences.companion, '회식');
  assert.equal(refined.body.restaurants.length, 3);
  assert.deepEqual(refined.body.restaurants.map(card=>card.id),first.body.restaurants.map(card=>card.id),'optional condition keeps the original verified pool');
  assert.equal(questions(refined.body), 0);
  assert.match(refined.body.meta.turnPolicy.intro, /회식 자리로 강남역 삼겹살집 3곳을 골라봤어요/);
  assert.equal(refined.body.meta.turnPolicy.intro.split(/[.!?]+/).filter(Boolean).length,1);
  assert.equal((refined.body.meta.turnPolicy.intro.match(/회식/g)||[]).length,1);
  assert.deepEqual(refined.body.meta.turnPolicy.actionChips, ['다른 곳 보기', '조건 바꾸기']);
  boundedCopy(refined.body);
  // 3. Explicit fast path never adds a question, even when a slot could refine.
  for (const message of ['바로 보여줘', '그냥 추천해줘']) {
    const result = await runCase({ message, env, context: { responseModeState: first.body.meta.responseModeState }, naverResponse: places() });
    assert.ok(result.body.restaurants.length > 0);
    assert.equal(questions(result.body), 0);
    assert.equal(result.body.meta.turnPolicy.next_question, null);
    assert.deepEqual(result.body.suggestions, []);
  }
  // 4. One missing axis: no cards, one region question and device-location action.
  const narrow = await runCase({ message: '삼겹살 먹고 싶어', env });
  assert.equal(narrow.body.meta.analysis.stage, 'region_asked');
  assert.deepEqual(narrow.body.meta.analysis.missing_slots, ['region']);
  assert.equal(narrow.body.meta.analysis.can_search, false);
  assert.deepEqual(narrow.body.restaurants, []);
  assert.equal(questions(narrow.body), 1);
  assert.ok(narrow.body.suggestions.includes('현재 위치 연결'));
  assert.equal(narrow.calls.length, 0);
  boundedCopy(narrow.body);
  const regionOnly = await runCase({ message: '홍대에서 먹을 곳 찾아줘', env });
  assert.equal(regionOnly.body.meta.analysis.stage, 'menu_category_asked');
  assert.deepEqual(regionOnly.body.restaurants, []);
  assert.equal(regionOnly.body.meta.turnPolicy.next_question.slot, 'menu_category');
  assert.equal(regionOnly.calls.length, 0);
  // 5. The same missing slot is not asked twice.
  const again = await runCase({ message: '삼겹살 먹고 싶어', env, context: { responseModeState: narrow.body.meta.responseModeState } });
  assert.equal(questions(again.body), 0);
  assert.equal(again.body.meta.responseModeState.questionCount, 1);
  assert.deepEqual(again.body.meta.responseModeState.askedSlots, ['region']);
  // 6. At most three questions overall and at most two additional refining questions.
  let response = await runCase({ message: '강남에서 한식 먹을 곳 찾아줘', env, naverResponse: places('강남') });
  assert.equal(response.body.meta.turnPolicy.next_question, null);
  for (const [message, area, menu, next] of [
    ['가족과 함께 가요', '강남', '삼겹살', null],
    ['국밥 먹고 싶어요', '강남', '국밥', null],
    ['홍대에서 찾아줘', '홍대', '국밥', null],
  ]) {
    response = await runCase({ message, env, context: { responseModeState: response.body.meta.responseModeState }, naverResponse: places(area, menu) });
    assert.equal(response.body.meta.turnPolicy.next_question?.slot || null, next);
    assert.ok(response.body.meta.responseModeState.questionCount <= 3);
    assert.ok(response.body.meta.responseModeState.refinementQuestionCount <= 2);
    boundedCopy(response.body);
  }
  assert.equal(response.body.meta.responseModeState.questionCount, 0);
  assert.equal(response.body.meta.responseModeState.refinementQuestionCount, 0);
  assert.equal(questions(response.body), 0);
  assert.equal(new Set(response.body.meta.responseModeState.askedSlots).size, 0);
  // 7. FAQ, comparison and a specific restaurant cannot start a new interview.
  const faq = await runCase({ message: '추천은 어떤 기준으로 하나요?', env, context: { responseModeState: first.body.meta.responseModeState } });
  const compare = await runCase({ message: '첫 번째랑 두 번째 비교해줘', env, context: { responseModeState: first.body.meta.responseModeState } });
  const specific = await runCase({ message: '테스트식당 전화번호 알려줘', env, context: { responseModeState: first.body.meta.responseModeState }, naverResponse: places(),
    aiResponse: { message: '확인 가능한 식당 정보예요. 더 찾아볼까요?', suggestions: ['다른 조건'], selectedRestaurantIds: [] } });
  for (const result of [faq, compare, specific]) {
    assert.equal(questions(result.body), 0);
    assert.equal(result.body.meta.turnPolicy.next_question, null);
    assert.equal(result.body.meta.responseModeState.questionCount, 0);
  }
  // 8. Actual plugin/chip messages and typed messages share one path.
  const pluginMessage = situationRequest(['회식', '주차 필요']);
  const plugin = await runCase({ message: pluginMessage, env, context: { responseModeState: first.body.meta.responseModeState }, naverResponse: places() });
  assert.equal(plugin.body.meta.analysis.stage, 'refining');
  assert.equal(plugin.body.meta.responseModeState.slots.companion, '회식');
  assert.equal(plugin.body.meta.responseModeState.slots.parking, true);
  assert.match(plugin.body.meta.notice, /주차.*매장 확인/);
  assert.doesNotMatch(plugin.body.message, /주차.*가능/);
  assert.equal(first.body.meta.turnPolicy.next_question, null,'enough primary information never adds a required companion question');
  const pref = await runCase({ message: '조용한 곳으로, 예산 2만원 이하', env, context: { responseModeState: first.body.meta.responseModeState }, naverResponse: places() });
  assert.equal(pref.body.meta.responseModeState.preferences.budget, '2만원 이하');
  assert.match(pref.body.meta.responseModeState.preferences.vibe, /조용/);
  assert.match(pref.body.meta.notice, /분위기.*예산.*매장 확인/);
  assert.ok(!['budget', 'vibe'].includes(pref.body.meta.turnPolicy.next_question?.slot));
  assert.ok(pref.body.restaurants.length > 0, 'unverified preferences do not block search');
  // 9. Even a repeated model draft cannot repeat the last three response openings.
  let state = normalizeResponseState({ slots: { region: '강남역', menu: '삼겹살' } });
  let history = [];
  const starts = [];
  for (let i = 0; i < 9; i++) {
    const body = applyTurnPolicy({ message: '원문', suggestions: [], restaurants: first.body.restaurants,
      meta: { mode: 'C', intent: 'place_search', responseModeState: state, _turnDraft: { summary: '강남역 삼겹살로 먼저 식당 3곳을 골랐어요.' } } },
    { messages: [...history, { role: 'user', content: '바로 보여줘' }], context: { responseModeState: state } });
    const start = body.message.split('.')[0];
    assert.ok(!starts.slice(-3).includes(start), start);
    starts.push(start); history.push({ role: 'assistant', content: body.message }); state = body.meta.responseModeState;
  }
  // Malformed/forbidden question text, generation failure and timeout use templates.
  const invalid = await runCase({ message: '강남역에서 삼겹살 먹을건데', env, naverResponse: places(),
    aiResponse: { message: '검색 결과', next_question: { slot: 'companion', text: '예산과 분위기는 어떤가요?', chips: [] }, selectedRestaurantIds: [] } });
  assert.equal(invalid.body.meta.turnPolicy.questionSource, null);
  assert.equal(invalid.body.meta.turnPolicy.next_question, null);
  const failed = await runCase({ message: '강남역에서 삼겹살 먹을건데', env, naverResponse: places(), generationStatus: 504 });
  assert.equal(failed.body.restaurants.length, 3);
  assert.equal(failed.body.meta.turnPolicy.questionSource, null);
  await assert.rejects(withTurnDeadline(() => new Promise(() => {}), 5), /turn_timeout/);
  const plan = planTurn(first.body, { ...first.body.meta.responseModeState, questionCount: 3 }, '다시 추천해줘');
  assert.equal(plan.next_question, null);
}
