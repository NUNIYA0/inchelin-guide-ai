// Display copy is separate from routing/facts. Never repair factual claims by guessing.
export const FORBIDDEN_COPY = /요청|제공된\s*(?:네이버\s*)?검색\s*결과|검증|정렬|후보|분류|입니다|습니다/;
export const STYLE_RULES = `친구와 이야기하듯 자연스러운 해요체로 말한다. 사용자 말을 받아 한두 문장, 질문은 별도로 하나만 쓴다.
금지어: 요청, 제공된 검색 결과, 제공된 네이버 검색 결과, 검증, 정렬, 후보, 분류. 금지 말투: ~입니다, ~습니다. 시스템 로그처럼 설명하지 않는다.
좋은 예 1: '강남역에서 삼겹살 먹고 싶으시군요. 먼저 3곳 골라봤어요.' 질문: '누구와 가세요?'
좋은 예 2: '회식으로 가시는군요. 삼겹살집을 다시 골라봤어요.' 좌석 정보를 모르면 단체석이 편하다는 말은 하지 않는다.
좋은 예 3: '쌀쌀해서 따뜻한 음식이 당기시는군요. 국물 요리와 다른 두 가지도 함께 골라봤어요.'
식당의 맛·인기·평점·가격·좌석·분위기·웨이팅·주차는 자료에 없으면 단정하지 않는다. 실제로 달라진 정보만 설명하고, 동행 답변만으로 시설을 안다고 말하지 않는다.
첫 안내는 마지막 사용자 말의 지역·메뉴·상황을 받아 자연스럽게 쓴다. '먼저 식당 N곳을 찾았어요'를 반복하지 말고 직전 3턴과 다른 시작을 쓴다.
카드 이유에 음식 종류나 주소·층·도로명·건물명·지점 표기를 되풀이하지 않는다. 사용자 조건(회식·주차 등)과 실제 확인된 시설 안내가 연결될 때만 이유를 한 줄 쓴다. 연결 근거가 없으면 이유는 빈 문자열이다. 좌표 없이 가깝다·대로변·도보 시간이라고 하지 않는다.`;

export function hasForbiddenCopy(result) {
  const values = [result?.message, result?.intro, result?.turn_text?.summary, result?.turn_text?.reason, result?.next_question?.text,
    ...(result?.card_reasons || []).map(item => item.reason), ...(result?.menus || []).flatMap(item => [item.description, item.reason])];
  return values.some(value => typeof value === 'string' && FORBIDDEN_COPY.test(value));
}

// Exactly one retry on style violations. Caller supplies the same bounded generation path.
export async function generateFriendly(call) {
  let result = await call(false);
  if (!hasForbiddenCopy(result)) return result;
  try { result = await call(true); } catch { return null; }
  return hasForbiddenCopy(result) ? null : result;
}

export function cardReasonOptions(card, preferences = {}) {
  const slots = typeof preferences === 'string' ? { companion: preferences } : preferences || {};
  const options = [];
  if (slots.parking === true && card.parking === true) options.push({ text: '필요하신 주차는 가능하다고 안내돼요.', start: 'parking', end: '안내돼요' });
  if (/회식|모임|가족/.test(slots.companion || '') && card.privateRoom === true) options.push({ text: '별도 룸 안내가 있어 모임 장소를 고를 때 참고할 수 있어요.', start: 'room', end: '있어요' });
  return options;
}

export function groundedCardReason(card, food = '', area = '', index = 0) {
  const options = cardReasonOptions(card);
  return options[index % Math.max(1, options.length)]?.text || '';
}

export function safeCardReason(value, card, food = '', area = '', companion = '') {
  return typeof value === 'string' && value.length > 0 && cardReasonOptions(card, companion).some(option => option.text === value);
}

// Diversity never outranks evidence: omit the line if no unused grounded phrasing remains.
export function applyCardReasons(cards, drafts = [], companion = '') {
  drafts = Array.isArray(drafts) ? drafts : [];
  const texts = new Set(), starts = new Set(), ends = new Set();
  return cards.map(card => {
    const options = cardReasonOptions(card, companion);
    const proposed = drafts.find(item => item.id === card.id)?.reason;
    const ordered = [...options.filter(option => option.text === proposed), ...options.filter(option => option.text !== proposed)];
    const selected = ordered.find(option => !texts.has(option.text) && !starts.has(option.start) && !ends.has(option.end));
    if (selected) { texts.add(selected.text); starts.add(selected.start); ends.add(selected.end); }
    return { ...card, recommendationReason: selected?.text || '' };
  });
}
