// Display copy is separate from routing/facts. Never repair factual claims by guessing.
import { withParticle } from './korean.js';
export const FORBIDDEN_COPY = /요청|제공된\s*(?:네이버\s*)?검색\s*결과|검증|정렬|후보|분류|입니다|습니다/;
export const STYLE_RULES = `친구와 이야기하듯 자연스러운 해요체로 말한다. 사용자 말을 받아 한두 문장, 질문은 별도로 하나만 쓴다.
금지어: 요청, 제공된 검색 결과, 제공된 네이버 검색 결과, 검증, 정렬, 후보, 분류. 금지 말투: ~입니다, ~습니다. 시스템 로그처럼 설명하지 않는다.
좋은 예 1: '강남역에서 삼겹살 먹고 싶으시군요. 먼저 3곳 골라봤어요.' 질문: '누구와 가세요?'
좋은 예 2: '회식으로 가시는군요. 삼겹살집을 다시 골라봤어요.' 좌석 정보를 모르면 단체석이 편하다는 말은 하지 않는다.
좋은 예 3: '쌀쌀해서 따뜻한 음식이 당기시는군요. 국물 요리와 다른 두 가지도 함께 골라봤어요.'
식당의 맛·인기·평점·가격·좌석·분위기·웨이팅·주차는 자료에 없으면 단정하지 않는다. 실제로 달라진 정보만 설명하고, 동행 답변만으로 시설을 안다고 말하지 않는다.
첫 안내는 마지막 사용자 말의 지역·메뉴·상황을 받아 자연스럽게 쓴다. '먼저 식당 N곳을 찾았어요'를 반복하지 말고 직전 3턴과 다른 시작을 쓴다.
카드 이유에 음식 종류·분류명을 되풀이하지 않는다. 주소의 층·도로명·건물명, 상호의 본점·직영점·역점 표기만 근거로 쓴다. 1층이라고 접근이 편하다거나 직영점이라 덜 헷갈린다는 인과관계도 추측하지 않는다. 좌표 없이 가깝다·대로변·도보 시간이라고 하지 않는다. 근거가 없으면 이유는 빈 문자열이다.`;

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

export function cardReasonOptions(card, companion = '') {
  const address = [card.roadAddress, card.address].filter(Boolean).join(' ');
  const name = String(card.name || card.restaurantName || '');
  const result = [];
  const add = (text, start, end) => {
    if (!FORBIDDEN_COPY.test(text) && (!card.category || !text.includes(card.category))) result.push({ text, start, end });
  };
  // Use literal address labels, never infer floors from unit numbers or road exposure.
  const floor = address.match(/지하(?:\s*\d{1,2}\s*층(?![가-힣])|(?=[\s,)]|$))|(?<!\d)\d{1,2}(?:\s*[~–-]\s*\d{1,2})?\s*층(?![가-힣])/)?.[0]?.replace(/\s+/g, '')
    || address.match(/(?:^|[\s,(])(B\d{1,2}(?:F)?)(?=$|[\s,)])/i)?.[1]?.toUpperCase();
  if (floor) {
    add(`주소에는 ${withParticle(floor, '으로/로')} 적혀 있어요.`, 'address', '있어요');
    add(`${floor} 표기를 찾아가실 때 참고해 주세요.`, 'floor', '주세요');
    add(`층수 안내는 ‘${floor}’예요.`, 'floor-label', '예요');
    if (companion === '회식') add(`회식 장소를 살펴보실 때 주소의 ${floor} 표기도 확인해 보세요.`, 'companion', '보세요');
  }
  for (const mark of ['직영점', '본점']) if (name.includes(mark)) {
    add(`상호에 ‘${mark}’이라고 적혀 있네요.`, 'name', '있네요');
    add(`‘${mark}’ 표기로 다른 지점과 구분해 보세요.`, 'branch', '보세요');
  }
  const station = name.match(/[가-힣A-Za-z0-9·-]+역점/)?.[0];
  if (station) add(`찾으실 때는 ‘${station}’ 표기를 참고하시면 돼요.`, 'station', '돼요');
  const building = address.match(/[가-힣A-Za-z0-9·-]+(?:빌딩|타워|상가|센터|플라자|회관|건물)(?=$|[\s,()])/)?.[0];
  if (building) {
    add(`주소에 적힌 건물은 ‘${building}’예요.`, 'building-label', '예요');
    add(`‘${building}’ 건물명도 함께 확인해 보세요.`, 'building', '보세요');
  }
  const road = address.match(/([가-힣A-Za-z0-9·-]+(?:대로|로|길))\s+\d/)?.[1];
  if (road) {
    add(`도로명 주소는 ${road}예요.`, 'road-label', '예요');
    add(`${road} 주소를 참고해 주세요.`, 'road', '주세요');
    add(`찾아가실 때 ${road} 표기를 살펴보세요.`, 'directions', '보세요');
  }
  if (typeof card.distanceMeters === 'number' && Number.isFinite(card.distanceMeters) && card.distanceMeters >= 0) {
    const label = card.distanceMeters < 1000 ? Math.round(card.distanceMeters) + 'm' : (card.distanceMeters / 1000).toFixed(1) + 'km';
    add(`현재 위치와의 직선거리는 ${label}예요.`, 'distance', '예요');
  }
  return result;
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
