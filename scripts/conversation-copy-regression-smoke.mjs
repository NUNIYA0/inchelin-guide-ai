import assert from 'node:assert/strict';
import { FORBIDDEN_COPY, hasForbiddenCopy, generateFriendly, stripAnalysisFields, finalizeConversationCopy } from '../worker/conversation-copy.js';

// No network: runCase replaces every provider/model fetch with fixtures.
export async function testConversationCopyRegression(runCase) {
  const env = { OPENAI_API_KEY: 'test-key', RESTAURANT_DATA_SOURCE: 'naver', NAVER_API_HUB_CLIENT_ID: 'stub-id', NAVER_API_HUB_CLIENT_SECRET: 'stub-secret' };
  const internal = [
    '홍대 지역에서 냉면을 찾음.', '음식 종류를 냉면에서 국밥으로 변경.',
    '사용자가 국밥으로 바꾸겠다고 명시함.', '네이버 지역 검색 결과에서 일치하는 매장들을 확인함.',
    '냉면을 확인함', '국밥으로 바뀜.', '음식 축이 변경됨.', '국밥임.',
  ];
  for (const copy of internal) {
    for (const output of [{ message: copy }, { intro: copy }, { turn_text: { summary: copy } }, { turn_text: { reason: copy } }, { next_question: { text: copy } }, { menus: [{ reason: copy }] }, { suggestions: ['냉면|' + copy] }]) {
      assert.equal(hasForbiddenCopy(output), true, copy);
    }
  }
  assert.equal(hasForbiddenCopy({ message: '좋아요, 홍대는 그대로 두고 국밥으로 바꿔봤어요.' }), false);
  assert.equal(hasForbiddenCopy({ message: '처음부터 함께 골라봐요.' }), false);
  assert.equal(hasForbiddenCopy({ turn_text: { summary: '홍대에서 냉면을 골라봤어요.', reason: '같은 지역에서 다시 골라봤어요.' } }), true, 'repeated sentence endings trigger the same bounded retry');
  const dirty = { message: internal[0], turn_text: { summary: internal[0], reason: internal[3] }, selectedRestaurantIds: [], suggestions: [], next_question: null,
    reasoning: 'PRIVATE_REASONING', note: 'PRIVATE_NOTE', explanation: 'PRIVATE_EXPLANATION' };
  const clean = { message: '홍대에서 냉면 드시고 싶으시군요.', turn_text: { summary: '홍대에서 냉면 먹을 곳을 골라봤어요.', reason: '' }, selectedRestaurantIds: [], suggestions: [], next_question: null };
  let attempts = [];
  const retried = await generateFriendly(async retry => { attempts.push(retry); return retry ? clean : dirty; });
  assert.deepEqual(attempts, [false, true]); assert.deepEqual(retried, clean);
  attempts = [];
  assert.equal(await generateFriendly(async retry => { attempts.push(retry); return dirty; }), null);
  assert.deepEqual(attempts, [false, true]);
  assert.equal(await generateFriendly(async () => { throw new Error('mock_timeout'); }), null);
  attempts = [];
  assert.equal(await generateFriendly(async retry => { attempts.push(retry); if (retry) throw new Error('mock_retry_timeout'); return dirty; }), null);
  assert.deepEqual(attempts, [false, true]);
  // Strip unknown/private fields recursively, preserving typed routing + approved menu reasons.
  const injected = { message: '함께 골라볼게요.', reasoning: 'PRIVATE_REASONING', note: 'PRIVATE_NOTE',
    meta: { analysis: { intent: 'place_search', slots: { region: '홍대', note: 'PRIVATE_SLOT_NOTE', reason: 'PRIVATE_SLOT_REASON' }, reasoning: 'PRIVATE_REASONING', reason: 'PRIVATE_REASON', summary: 'PRIVATE_SUMMARY', description: 'PRIVATE_DESCRIPTION', notes: ['PRIVATE_NOTE'] },
      _turnDraft: dirty.turn_text, turn_text: dirty.turn_text, debugNote: 'PRIVATE_DEBUG_NOTE',
      menuCards: [{ name: '냉면', reason: '시원하게 먹고 싶을 때 골라봐요.', reasoning: 'PRIVATE_REASONING' }] } };
  const stripped = stripAnalysisFields(injected);
  assert.doesNotMatch(JSON.stringify(stripped), /PRIVATE_|"(?:reasoning|note|notes|_turnDraft|turn_text|summary|explanation)"/);
  assert.equal(stripped.meta.analysis.slots.region, '홍대');
  assert.equal(stripped.meta.menuCards[0].reason, injected.meta.menuCards[0].reason);
  // Even deterministic/early return paths and final-policy fields use the same copy boundary.
  const lastGuard = finalizeConversationCopy({ ...injected, message: internal[0], restaurants: [], meta: { ...injected.meta, turnPolicy: { intro: internal[0], questionText: internal[2] }, menuCards: [{ name: '냉면', reason: internal[3] }] } });
  assert.doesNotMatch(lastGuard.message + lastGuard.meta.turnPolicy.intro + lastGuard.meta.turnPolicy.questionText + lastGuard.meta.menuCards[0].reason, FORBIDDEN_COPY);
  const publicCopy = body => [body.message, body.error, body.meta?.turnPolicy?.intro, body.meta?.turnPolicy?.questionText, body.meta?.notice,
    body.meta?.analysis?.next_question?.text, ...(body.meta?.menuCards || []).flatMap(card => [card.description, card.reason]),
    ...(body.restaurants || []).map(card => card.recommendationReason), ...(body.suggestions || [])].filter(Boolean).join('\n');
  const assertPublic = body => {
    assert.doesNotMatch(publicCopy(body), FORBIDDEN_COPY);
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE_|"(?:reasoning|note|notes|_turnDraft|turn_text|summary|explanation)"/);
  };
  const items = (count, food = '냉면') => ({ items: Array.from({ length: count }, (_, i) => ({ title: `홍대${food}${i}`, category: `한식>${food}`, roadAddress: `서울 마포구 홍대 테스트로 ${i}`, mapx: String(1269200000 + i), mapy: '375500000' })) });
  const generations = result => result.calls.filter(call => call.body?.text?.format?.name === 'inchelin_chat_response');
  for (const count of [0, 1, 2, 3]) {
    const result = await runCase({ message: '홍대입구 쪽에서 냉면 땡겨', env, naverResponse: items(count), aiResponses: [dirty, dirty] });
    assertPublic(result.body);
    assert.equal(result.body.restaurants.length, count);
    assert.equal(generations(result).length, count ? 2 : 0);
    assert.match(result.body.message, count ? new RegExp(count + '곳') : /홍대.*냉면.*찾지 못했어요/);
    if (count < 3) assert.ok(result.body.meta.turnPolicy.expansionChoices.length > 0);
  }
  const alias = await runCase({ message: '홍대입구 쪽에서 냉면 땡겨', env, naverResponse: items(3), aiResponses: [dirty, clean] });
  assertPublic(alias.body); assert.equal(generations(alias).length, 2);
  assert.equal(alias.body.meta.responseModeState.slots.region, '홍대');
  const timeout = await runCase({ message: '홍대입구 쪽에서 냉면 땡겨', env, naverResponse: items(3), generationStatus: 504 });
  assertPublic(timeout.body); assert.equal(timeout.body.restaurants.length, 3);
  const change = await runCase({ message: '그럼 국밥으로 할래', env, context: { responseModeState: alias.body.meta.responseModeState }, naverResponse: items(2, '국밥'),
    aiResponses: [{ ...dirty, turn_text: { summary: internal[1], reason: internal[2] } }, dirty] });
  assertPublic(change.body); assert.equal(change.body.meta.responseModeState.slots.region, '홍대');
  assert.equal(change.body.meta.responseModeState.slots.menu, '국밥'); assert.equal(generations(change).length, 2);
  const unsupported = await runCase({ message: '부산에서 냉면 먹을 곳 찾아줘', env, aiResponse: dirty });
  assertPublic(unsupported.body); assert.equal(unsupported.calls.length, 0); assert.equal(unsupported.body.suggestions.length, 7);
  // The analyst's next_question is never copied into display text, even when superficially natural.
  const analysisOnly = await runCase({ message: '고기 먹고 싶다', env, analyzerEnabled: true, modeIntentAnalysis: {
    intent: 'menu_trouble', confidence: 1, slots: { food_type: '고기' }, flags: {}, reasoning: 'PRIVATE_REASONING', note: 'PRIVATE_NOTE',
    next_question: { slot: 'region', text: '어느 지역 PRIVATE_QUESTION에서 찾을까요?', chips: [] },
  } });
  assertPublic(analysisOnly.body); assert.equal(analysisOnly.body.meta.turnPolicy.questionText, '어느 지역에서 찾을까요?');
  // Existing cross-turn opening diversity remains active after fallback.
  const repeated = await runCase({ message: '그럼 국밥으로 할래', env, context: { responseModeState: change.body.meta.responseModeState },
    history: [{ role: 'assistant', content: change.body.message }], naverResponse: items(3, '국밥'), aiResponses: [dirty, dirty] });
  assertPublic(repeated.body);
  assert.notEqual(repeated.body.meta.turnPolicy.intro.split(/[.!?]/)[0], change.body.meta.turnPolicy.intro.split(/[.!?]/)[0]);
  console.log('Conversation-copy leak/retry/payload/alias/axis-change/0–2 result mocked regressions passed.');
}
