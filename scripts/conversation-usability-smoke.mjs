import assert from 'node:assert/strict';
import { compactMenuCopy, FORBIDDEN_COPY } from '../worker/conversation-copy.js';
export async function testConversationUsability(runCase) {
  const env = { OPENAI_API_KEY: 'test-key', RESTAURANT_DATA_SOURCE: 'naver', NAVER_API_HUB_CLIENT_ID: 'stub', NAVER_API_HUB_CLIENT_SECRET: 'stub' };
  const naverResponse = { items: ['해정집삼겹살', '옥동식삼겹살', '홍대삼겹살'].map((title, i) => ({ title, category: '한식>돼지고기구이', roadAddress: `서울 마포구 홍대 테스트길 ${i} 1층`, mapx: '1269200000', mapy: '375500000' })) };
  const first = await runCase({ message: '홍대에서 삼겹살 먹을 곳 찾아줘', env, naverResponse });
  assert.equal(first.body.meta.turnPolicy.next_question.slot, 'companion');
  assert.deepEqual(first.body.meta.turnPolicy.actionChips, ['다른 곳도 보여줘', '조건 바꾸기']);
  assert.equal(first.body.suggestions.at(-1), '상관없어요');
  assert.ok(first.body.meta.turnPolicy.next_question.chips.every(item => item.label.length >= 2 && item.label.length <= 6));
  const skipped = await runCase({ message: '상관없어요', env, context: { responseModeState: first.body.meta.responseModeState } });
  assert.equal(skipped.calls.length, 0); assert.equal(skipped.body.meta.responseModeState.slots.region, '홍대');
  assert.ok(skipped.body.meta.responseModeState.askedSlots.includes('companion'));
  assert.equal(skipped.body.meta.responseModeState.pendingQuestionSlot, null);
  assert.equal(skipped.body.meta.turnPolicy.next_question, null);
  assert.doesNotMatch(skipped.body.message, /[?？]/);
  const later = await runCase({ message: '다른 곳도 보여줘', env, naverResponse, context: { responseModeState: skipped.body.meta.responseModeState } });
  assert.notEqual(later.body.meta.turnPolicy.next_question?.slot, 'companion');
  for (const message of ['삼겹살 먹고 싶어', '홍대에서 먹을 곳 찾아줘']) {
    const narrow = await runCase({ message, env });
    const slot = narrow.body.meta.turnPolicy.next_question.slot;
    const skip = await runCase({ message: '상관없어요', env, naverResponse, context: { responseModeState: narrow.body.meta.responseModeState } });
    assert.equal(skip.calls.length, 1, 'skip now chooses and proceeds instead of ending the flow'); assert.equal(skip.body.meta.turnPolicy.next_question, null);
    assert.ok(skip.body.meta.responseModeState.askedSlots.includes(slot));
    assert.doesNotMatch(skip.body.message, /[?？]/);
  }
  const refined = await runCase({ message: '회식이에요', env, naverResponse, context: { responseModeState: first.body.meta.responseModeState } });
  assert.equal(refined.body.meta.turnPolicy.next_question, null, 'optional questions pause after an answer');
  const long = compactMenuCopy({ description: '설명'.repeat(30), reason: '이유'.repeat(30) + '요' });
  assert.equal([...long.description].length, 22); assert.equal(long.reason, '');
  assert.equal(compactMenuCopy({ description: '따뜻한 국물과 밥', reason: '따뜻한 국물과 밥이에요' }).reason, '');
  assert.equal(compactMenuCopy({ description: '따뜻한 국물과 밥', reason: '분위기 조건을 확인함.' }).reason, '');
  const compare = await runCase({ message: '해정집이랑 옥동식 비교해줘', env, context: { responseModeState: { lastCards: [
    { id:'a', name:'해정집', category:'국밥', regionLabel:'홍대', address:'서울 마포구 서교동 1층' },
    { id:'b', name:'옥동식', category:'국밥', regionLabel:'홍대', address:'서울 마포구 서교동' },
  ] } } });
  assert.equal(compare.body.meta.variant, 'compare'); assert.equal(compare.calls.length, 0);
  assert.match(compare.body.message, /층: 1층/); assert.match(compare.body.message, /지역: 홍대/);
  assert.equal((compare.body.message.match(/확인된 정보가 없어요/g) || []).length, 1);
  assert.doesNotMatch(compare.body.message, FORBIDDEN_COPY); assert.doesNotMatch(compare.body.message, /평점|인기|주차|웨이팅|영업|[?？]/);
  console.log('Conversation usability: skip-slot, optional-question pause, compact menu, fact-only comparison passed.');
}
