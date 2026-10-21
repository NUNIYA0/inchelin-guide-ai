// Display copy is separate from routing/facts. Never repair factual claims by guessing.
export const FORBIDDEN_COPY = /요청|제공된\s*(?:네이버\s*)?검색\s*결과|네이버\s*지역\s*검색\s*결과|사용자가|일치하는\s*매장들|검증|정렬|후보|분류|준비|처리|생성|분석|입니다|습니다|[가-힣]*(?:함|음|됨|임|뀜)(?=\s*(?:[.!?。]|$))|(?:변경|추천|검색|완료|진행|정리|선택)\s*(?=[.!。]|$)/;
export const STYLE_RULES = `친구와 이야기하듯 자연스러운 해요체로 말한다. 사용자 말을 받아 한두 문장, 질문은 별도로 하나만 쓴다.
질문은 AI 말풍선 문장에만 쓴다. 칩 라벨은 사용자가 답하는 2~8자 표현으로 쓰고 '제가', '~드릴까요?', '~할까요?' 같은 AI 발화나 물음표를 넣지 않는다. 맡겨 달라는 답은 '네, 골라주세요'로 쓴다.
금지어: 요청, 제공된 검색 결과, 제공된 네이버 검색 결과, 네이버 지역 검색 결과, 사용자가, 일치하는 매장들, 검증, 정렬, 후보, 분류, 준비, 처리, 생성, 분석. 금지 말투: ~입니다, ~습니다, ~함., ~음., ~됨., ~임., ~명시함, 확인함, 변경, 추천 준비 같은 명사형 조각 문장. 완결된 해요체 문장만 쓰고 첫 검색에 '새로 말씀해 주신 쪽/다시 골라/바꿔봤어요' 같은 조건 변경 표현을 쓰지 않는다.
분석 JSON은 검색과 정책에만 쓴다. reasoning/note/설명/이유를 복사하지 않는다. turn_text는 분석 요약이 아니라 사용자에게 직접 말할 해요체 문장이다. summary와 reason도 동일한 말투 검사를 받는다.
좋은 예 1: '강남역에서 삼겹살 먹고 싶으시군요. 먼저 3곳 골라봤어요.' 질문: '누구와 가세요?'
좋은 예 2: '회식으로 가시는군요. 삼겹살집을 다시 골라봤어요.' 좌석 정보를 모르면 단체석이 편하다는 말은 하지 않는다.
좋은 예 3: '쌀쌀해서 따뜻한 음식이 당기시는군요. 국물 요리와 다른 두 가지도 함께 골라봤어요.'
식당의 맛·인기·평점·가격·좌석·분위기·웨이팅·주차는 자료에 없으면 단정하지 않는다. 실제로 달라진 정보만 설명하고, 동행 답변만으로 시설을 안다고 말하지 않는다.
첫 안내는 마지막 사용자 말의 지역·메뉴·상황을 받아 자연스럽게 쓴다. '먼저 식당 N곳을 찾았어요'를 반복하지 말고 직전 3턴과 다른 시작을 쓴다.
related_questions는 related_question_context의 현재 발화·intent·확정 슬롯·missing_slots·실제 카드·pending_question·askedSlots를 함께 보고 다음에 궁금할 질문을 사용자 문장 12~30자로 쓴다. '찾아줘/보여줘/어때?'처럼 쓰고 '~해주세요/~찾아주세요' 부탁형은 금지한다. 장소 검색/조건 변경/후속 응답은 지역·메인 음식·상황 변경, 실제 카드 상세, 카드 2곳 이상 비교만 허용한다. 서비스 FAQ는 service/general 뒤에만 허용한다. 메뉴 탐색은 메인 메뉴/종류/지역 탐색, 비교 뒤는 카드 상세/다른 조건, 특정 식당 뒤는 같은 조건 다른 식당/카드 상세, 음식 대화 뒤는 그 음식 탐색으로 잇는다. pending_question이 있으면 최대 2개, 그 질문과 같은 슬롯/선택지는 제외한다. template_history의 최근 두 응답과 동일한 문형을 세 번째로 쓰지 말고 현재 지역·메뉴·카드 내용을 반영해 표현을 바꾼다. 행동 칩이나 메뉴 칩과 같은 기능은 반복하지 않는다. 영업시간·평점·가격·웨이팅·분위기 확인은 제안하지 않는다. 사이드·반찬·음료·술·디저트는 제안하지 않는다. 모든 음식은 main_dish=true 사전의 메뉴와 지원 지역으로 제한하며 이미 한 질문이나 shownSuggestions를 반복하지 않는다. 분석 메모를 복사하지 않는다. 서버의 분류·결과 존재 검증에서 실패한 질문을 FAQ로 메우지 않는다.
카드 이유에 음식 종류나 주소·층·도로명·건물명·지점 표기를 되풀이하지 않는다. 사용자 조건(회식·주차 등)과 실제 확인된 시설 안내가 연결될 때만 이유를 한 줄 쓴다. 연결 근거가 없으면 이유는 빈 문자열이다. 좌표 없이 가깝다·대로변·도보 시간이라고 하지 않는다.`;

export function hasForbiddenCopy(result) {
  const values = [result?.message, result?.intro, result?.turn_text?.summary, result?.turn_text?.reason, result?.next_question?.text,
    ...(result?.suggestions || []), ...(result?.next_question?.chips || []).flatMap(item => [item.label, item.message]),
    ...(result?.card_reasons || []).map(item => item.reason), ...(result?.menus || []).flatMap(item => [item.description, item.reason])];
  return values.some(value => typeof value === 'string' && FORBIDDEN_COPY.test(value))
    || repeatsCopySentences([result?.turn_text?.summary, result?.turn_text?.reason].filter(Boolean).join(' '));
}

export function repeatsCopySentences(value) {
  const sentences = String(value || '').split(/[.!?。]+/).map(text => text.trim()).filter(Boolean);
  const starts = new Set(), endings = new Set();
  for (const sentence of sentences) {
    const start = sentence.replace(/\s/g, '').slice(0, 10);
    const ending = sentence.match(/([가-힣]{3,})$/)?.[1];
    if (start.length >= 6 && starts.has(start) || ending && endings.has(ending)) return true;
    starts.add(start); if (ending) endings.add(ending);
  }
  return false;
}

export function compactMenuCopy(item) {
  const shorten = (value, max) => [...String(value || '').replace(/\s+/g, ' ').trim()].slice(0, max).join('');
  const description = shorten(item.description || item.direction, 22);
  let reason = String(item.reason || '').trim();
  const normalize = value => value.replace(/[^가-힣a-z0-9]/gi, '');
  const descText = normalize(description), reasonText = normalize(reason);
  if ([...reason].length > 30 || !/(?:요|세요)[.!]?$/u.test(reason) || FORBIDDEN_COPY.test(reason)
    || descText && (reasonText.includes(descText) || descText.includes(reasonText))) reason = '';
  return { ...item, description, direction: description, reason };
}

// Exactly one retry on style violations. Caller supplies the same bounded generation path.
export async function generateFriendly(call) {
  let result;
  try { result = await call(false); } catch { return null; }
  if (!hasForbiddenCopy(result)) return result;
  try { result = await call(true); } catch { return null; }
  return hasForbiddenCopy(result) ? null : result;
}

// Last server boundary: routing metadata is not display copy. Strip model-private
// fields even on deterministic/early-return paths; never send them to the browser.
export function stripAnalysisFields(value, inAnalysis = false, path = []) {
  if (Array.isArray(value)) return value.map(item => stripAnalysisFields(item, inAnalysis, path));
  if (!value || typeof value !== 'object') return value;
  const allowedAnalysis = new Set(['intent', 'sub_intent', 'confidence', 'slots', 'reference', 'change', 'flags', 'stage', 'missing_slots', 'next_question', 'can_search', 'answer_plan']);
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !/^_|reasoning|notes?|rationale|explanation|^turn_text$|^summary$|^reason$/i.test(key)
      // Card/menu reasons are public, evidence-bound display fields, not analysis.
      || (!path.includes('analysis') && path.includes('menuCards') && key === 'reason')
  ).filter(([key]) => !inAnalysis || allowedAnalysis.has(key)).map(([key, item]) => [key,
    // Only the root analysis object is allowlisted. Its typed routing children
    // keep their fields, while private-key stripping still recurses everywhere.
    stripAnalysisFields(item, key === 'analysis', [...path, key])
  ]));
}

export function finalizeConversationCopy(response) {
  const result = stripAnalysisFields(response);
  const safe = (value, fallback = '') => typeof value === 'string' && FORBIDDEN_COPY.test(value) ? fallback : value;
  // Fixed service FAQ is authoritative, not generated copy; never rewrite it.
  const fixedFAQ = result.meta?.variant === 'service';
  if (!fixedFAQ) {
    const slots = result.meta?.responseModeState?.slots || {};
    const count = result.restaurants?.length || 0;
    const fallback = count ? `${slots.region ? slots.region + '에서 ' : ''}${slots.menu || slots.food_type || '먹을 곳'} ${count}곳을 골라봤어요.` : '지금 알 수 있는 내용만 안내해드릴게요.';
    result.message = safe(result.message, fallback);
    if (result.error) result.error = safe(result.error, '답변을 불러오지 못했어요. 다시 시도해 주세요.');
    if (result.meta?.turnPolicy) {
      const policy = result.meta.turnPolicy;
      policy.intro = safe(policy.intro, result.message);
      policy.questionText = safe(policy.questionText);
      if (policy.next_question) policy.next_question.text = safe(policy.next_question.text, policy.questionText);
    }
    if (result.meta?.analysis?.next_question) result.meta.analysis.next_question.text = safe(result.meta.analysis.next_question.text, result.meta?.turnPolicy?.questionText || '');
    if (result.meta?.notice) result.meta.notice = safe(result.meta.notice);
    if (result.suggestions) result.suggestions = result.suggestions.filter(value => !FORBIDDEN_COPY.test(value));
    if (result.meta?.menuCards) result.meta.menuCards = result.meta.menuCards.map(card => ({ ...card, description: safe(card.description), reason: safe(card.reason) }));
    if (result.restaurants) result.restaurants = result.restaurants.map(card => ({ ...card, recommendationReason: safe(card.recommendationReason) }));
  }
  return result;
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
