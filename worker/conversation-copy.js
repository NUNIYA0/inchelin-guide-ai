// Display copy is separate from routing/facts. Never repair factual claims by guessing.
export const FORBIDDEN_COPY = /요청|제공된\s*(?:네이버\s*)?검색\s*결과|검증|정렬|후보|분류|입니다|습니다/;
export const STYLE_RULES = `친구와 이야기하듯 자연스러운 해요체로 말한다. 사용자 말을 받아 한두 문장, 질문은 별도로 하나만 쓴다.
금지어: 요청, 제공된 검색 결과, 제공된 네이버 검색 결과, 검증, 정렬, 후보, 분류. 금지 말투: ~입니다, ~습니다. 시스템 로그처럼 설명하지 않는다.
좋은 예 1: '강남역에서 삼겹살 먹고 싶으시군요. 먼저 3곳 골라봤어요.' 질문: '누구와 가세요?'
좋은 예 2: '회식으로 가시는군요. 삼겹살집을 다시 골라봤어요.' 좌석 정보를 모르면 단체석이 편하다는 말은 하지 않는다.
좋은 예 3: '쌀쌀해서 따뜻한 음식이 당기시는군요. 국물 요리와 다른 두 가지도 함께 골라봤어요.'
식당의 맛·인기·평점·가격·좌석·분위기는 자료에 없으면 단정하지 않는다. 실제로 달라진 정보만 설명하고, 동행 답변만으로 시설을 안다고 말하지 않는다.`;

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

export function groundedCardReason(card, food = '', area = '', index = 0) {
  const name = card.name || card.restaurantName || '이 식당';
  const kind = card.category || food || '음식점';
  const distance = card.distanceMeters;
  if (typeof distance === 'number' && Number.isFinite(distance)) {
    const label = distance < 1000 ? Math.round(distance) + 'm' : (distance / 1000).toFixed(1) + 'km';
    return `${name}, 현재 위치에서 직선거리 ${label}예요.`;
  }
  const place = area && String(card.address || '').replace(/\s/g, '').includes(area.replace(/\s/g, '')) ? area + '에서 ' : '';
  return [
    `${name}, ${place}${kind} 드시고 싶을 때 살펴볼 곳이에요.`,
    `${place}${kind} 찾으신다면 ${name}도 함께 살펴보세요.`,
    `${name}도 ${place}${kind} 먹을 곳으로 골라봤어요.`,
  ][index % 3];
}

export function safeCardReason(value, card, food = '', area = '') {
  if (typeof value !== 'string' || value.length > 160 || !value.includes(card.name) || FORBIDDEN_COPY.test(value)) return false;
  // Closed vocabulary after removing the actual facts: no invented facilities, menus or claims.
  let rest = value;
  for (const fact of [card.name, card.category, food, area].filter(Boolean).sort((a, b) => b.length - a.length)) rest = rest.split(fact).join('');
  rest = rest.replace(/드시고\s*싶|먹고\s*싶|먹을\s*곳|찾으신다면|찾는다면|살펴볼|살펴보세요|골라봤어요|함께|좋겠어요|어때요|이에요|예요|드실|먹기|고른|여기도|이번엔|선택|하나|들러볼|보세요|찾을|가볼|수\s*있어요|어요|에서|으로|라면|집|도|은|는|이|가|을|를|와|과|로|인|곳|때|요|만|한|고|또/g, '');
  return /^[\s.,·!~]*$/.test(rest) && (value.match(/[.!?]/g) || []).length <= 1;
}
