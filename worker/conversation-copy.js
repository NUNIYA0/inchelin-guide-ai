import { MAIN_DISHES } from './main-dishes.js';
import { normalizeKoreanParticles } from './korean.js';
// Display copy is separate from routing/facts. Never repair factual claims by guessing.
const REPEATED_TERMS=new RegExp([...MAIN_DISHES.map(item=>item.name),'회식','혼밥','가족','데이트','강남역','강남','역삼','홍대','성수','종로','여의도'].sort((a,b)=>b.length-a.length).join('|'),'g');
export const FORBIDDEN_COPY = /요청|제공된\s*(?:네이버\s*)?검색\s*결과|네이버\s*지역\s*검색\s*결과|사용자가|일치하는\s*매장들|검증|정렬|후보|분류|준비|처리|생성|분석|선택했어요|입니다|습니다|[가-힣]*(?:함|음|됨|임|뀜)(?=\s*(?:[.!?。]|$))|(?:변경|추천|검색|완료|진행|정리|선택)\s*(?=[.!。]|$)/;
export const STYLE_RULES = `친구와 이야기하듯 자연스러운 해요체로 말한다. 사용자 말을 받아 한두 문장, 질문은 별도로 하나만 쓴다.
지역+음식이 있으면 질문으로 막지 않고 먼저 결과를 보여준다. 지역 또는 음식이 없을 때만 가장 중요한 없는 축 하나를 묻는다. 이미 말한 조건은 유지하고 다시 묻지 않는다. 예시 질문은 사용자 말투로 필요한 때만, 질문과 합쳐 최대 3개이며 직전 축을 반복하지 않는다. 서비스·오류·0건에는 예시 대신 대안만 둔다. 조용함·단체석 같은 선호는 확인된 시설로 단정하지 않으며, 선택해도 기존 식당 수를 줄이지 않고 매장 확인 안내를 붙인다.
질문은 AI 말풍선 문장에만 쓴다. 칩 라벨은 사용자가 답하는 2~8자 표현으로 쓰고 '제가', '~드릴까요?', '~할까요?' 같은 AI 발화나 물음표를 넣지 않는다. 맡겨 달라는 답은 '네, 골라주세요'로 쓴다.
금지어: 요청, 제공된 검색 결과, 제공된 네이버 검색 결과, 네이버 지역 검색 결과, 사용자가, 일치하는 매장들, 검증, 정렬, 후보, 분류, 준비, 처리, 생성, 분석, 선택했어요. 금지 말투: ~입니다, ~습니다, ~함., ~음., ~됨., ~임., ~명시함, 확인함, 변경, 추천 준비 같은 명사형 조각 문장. 완결된 해요체 문장만 쓰고 첫 검색에 '새로 말씀해 주신 쪽/다시 골라/바꿔봤어요' 같은 조건 변경 표현을 쓰지 않는다. 동행·상황을 답한 뒤에는 '회식 자리로 강남 삼겹살집 3곳을 골라봤어요.'처럼 상황+지역+음식+곳 수를 한 문장으로 쓴다. 같은 상황·지역·메뉴를 다음 문장에 반복하지 않는다.
분석 JSON은 검색과 정책에만 쓴다. reasoning/note/설명/이유를 복사하지 않는다. turn_text는 분석 요약이 아니라 사용자에게 직접 말할 해요체 문장이다. summary와 reason도 동일한 말투 검사를 받는다.
좋은 예 1: '강남역에서 삼겹살 먹고 싶으시군요. 먼저 3곳 골라봤어요.' 질문: '누구와 가세요?'
좋은 예 2: '회식 자리로 강남 삼겹살집 3곳을 골라봤어요.' 좌석 정보를 모르면 단체석이 편하다는 말은 하지 않는다.
좋은 예 3: '쌀쌀해서 따뜻한 음식이 당기시는군요. 국물 요리와 다른 두 가지도 함께 골라봤어요.'
식당의 맛·인기·평점·가격·좌석·분위기·웨이팅·주차는 자료에 없으면 단정하지 않는다. 실제로 달라진 정보만 설명하고, 동행 답변만으로 시설을 안다고 말하지 않는다.
첫 안내는 마지막 사용자 말의 지역·메뉴·상황을 받아 자연스럽게 쓴다. '먼저 식당 N곳을 찾았어요'를 반복하지 말고 직전 3턴과 다른 시작을 쓴다.
슬롯 질문 대기 중에는 연관 질문 2개, 대기 질문이 없으면 서로 다른 축 3개를 제안한다. 지역 바꾸기·메인 음식 바꾸기를 우선하고 상황 추가·카드 상세·비교 중 다른 축을 섞는다. 서버 검증에 실패한 문장으로 개수를 채우지 않는다.
axis_history의 최근 두 응답에서 덜 쓴 축을 먼저 순환한다. 음식 바꾸기와 현재 동행 상황을 잇는 다른 식당 찾기도 포함한다. '첫 번째/두 번째/마지막/거기'로 식당을 지시하지 않는다. 상세·비교에는 실제 가게명을 줄이거나 말줄임하지 않고 그대로 넣으며 이 두 축만 최대 40자를 허용한다. 40자를 넘으면 그 제안은 생략한다.
related_questions는 related_question_context의 현재 발화·intent·확정 슬롯·missing_slots·실제 카드·pending_question·askedSlots를 함께 보고 다음에 궁금할 질문을 사용자 문장 12~30자로 쓴다. '찾아줘/보여줘/어때?'처럼 쓰고 '~해주세요/~찾아주세요' 부탁형은 금지한다. 장소 검색/조건 변경/후속 응답은 지역·메인 음식·상황 변경, 실제 카드 상세, 카드 2곳 이상 비교만 허용한다. 서비스 FAQ는 service/general 뒤에만 허용한다. 메뉴 탐색은 메인 메뉴/종류/지역 탐색, 비교 뒤는 카드 상세/다른 조건, 특정 식당 뒤는 같은 조건 다른 식당/카드 상세, 음식 대화 뒤는 그 음식 탐색으로 잇는다. pending_question이 있으면 최대 2개, 그 질문과 같은 슬롯/선택지는 제외한다. template_history의 최근 두 응답과 동일한 문형을 세 번째로 쓰지 말고 현재 지역·메뉴·카드 내용을 반영해 표현을 바꾼다. 행동 칩이나 메뉴 칩과 같은 기능은 반복하지 않는다. 영업시간·평점·가격·웨이팅·분위기 확인은 제안하지 않는다. 사이드·반찬·음료·술·디저트는 제안하지 않는다. 모든 음식은 main_dish=true 사전의 메뉴와 지원 지역으로 제한하며 이미 한 질문이나 shownSuggestions를 반복하지 않는다. 분석 메모를 복사하지 않는다. 서버의 분류·결과 존재 검증에서 실패한 질문을 FAQ로 메우지 않는다.
카드 이유에 음식 종류나 주소·층·도로명·건물명·지점 표기를 되풀이하지 않는다. 사용자 조건(회식·주차 등)과 실제 확인된 시설 안내가 연결될 때만 이유를 한 줄 쓴다. 연결 근거가 없으면 이유는 빈 문자열이다. 좌표 없이 가깝다·대로변·도보 시간이라고 하지 않는다.`;

export function hasForbiddenCopy(result) {
  const values = [result?.message, result?.intro, result?.turn_text?.summary, result?.turn_text?.reason, result?.next_question?.text,
    ...(result?.suggestions || []), ...(result?.next_question?.chips || []).flatMap(item => [item.label, item.message]),
    ...(result?.card_reasons || []).map(item => item.reason), ...(result?.menus || []).flatMap(item => [item.description, item.reason])];
  return values.some(value => typeof value === 'string' && FORBIDDEN_COPY.test(value))
    || [result?.message,result?.intro,[result?.turn_text?.summary, result?.turn_text?.reason].filter(Boolean).join(' ')].some(repeatsCopySentences);
}

export function repeatsCopySentences(value) {
  const sentences = String(value || '').split(/[.!?。]+/).map(text => text.trim()).filter(Boolean);
  const starts = new Set(), endings = new Set();
  const vocabulary = new Set();
  for (const sentence of sentences) {
    const words = sentence.match(REPEATED_TERMS) || [];
    if(words.some(word=>vocabulary.has(word))) return true;
    words.forEach(word=>vocabulary.add(word));
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

// Acknowledgement is display copy, never a source of restaurant facts or slots.
export function friendlyAcknowledgement(plan){
 const copy=typeof plan?.acknowledgement==='string'?plan.acknowledgement.trim():'';
 // This is a short acknowledgement, not a second question or a partially
 // streamed model fragment. Keep it grounded in the request and complete.
 if(copy&&copy.length<=120&&!FORBIDDEN_COPY.test(copy)
   &&!/[\n<>?？]|https?:|영업\s*중이에요|주차.*가능해요|평점.*높|예약.*완료/.test(copy)
   &&/(?:요|죠|군요|볼게요|드릴게요)[.!。]?$/u.test(copy))return copy;
 if(plan?.action==='service')return '궁금하신 부분부터 설명해드릴게요.';
 if(plan?.detailFields?.includes('hours'))return '영업시간이 궁금하셨군요.';
 if(plan?.detailFields?.includes('parking'))return '차를 가져갈 수 있는지 궁금하셨군요.';
 if(plan?.task==='change_conditions')return '좋아요, 말씀하신 부분만 바꿔서 살펴볼게요.';
 if(plan?.action==='compare')return '두 곳을 고르기 고민되시는군요.';
 return '말씀하신 내용을 함께 살펴볼게요.';
}

export function registeredDetailCopy(card,fields=[]){
 const facts=card.registeredFacts||{},lines=[];
 if(fields.includes('menus'))lines.push(facts.menus?.length?'메뉴·가격: '+facts.menus.map(m=>m.name+' '+(Number.isFinite(m.priceKRW)?m.priceKRW.toLocaleString('ko-KR')+'원':'가격 정보 없음')).join(', '):'메뉴·가격은 현재 확인된 정보가 없어요.');
 if(fields.includes('hours')){
  if(facts.openingHoursText){
   const date=/^\d{4}-\d{2}-\d{2}/.exec(facts.collectedAt||'')?.[0];
   lines.push('등록 자료의 영업시간: '+facts.openingHoursText+(date?' ('+date+' 수집 자료)':''));
   lines.push('지금 확인한 실시간 정보는 아니니 방문 전 최신 영업시간을 확인해 주세요.');
  }else lines.push('영업시간은 현재 확인된 정보가 없어요.');
 }
 if(fields.includes('phone'))lines.push(facts.phone?'전화번호: '+facts.phone:'전화번호는 현재 확인된 정보가 없어요.');
 if(fields.includes('address'))lines.push(card.address?'주소: '+card.address:'주소는 현재 확인된 정보가 없어요.');
 if(fields.includes('parking'))lines.push('주차 가능 여부는 현재 확인된 정보가 없어요.');
 if(fields.includes('seating'))lines.push('좌석·인원 수용 정보는 현재 확인된 정보가 없어요.');
 if(fields.some(f=>['hours','phone','parking','seating'].includes(f)))lines.push(card.mapLinkKind==='detail'?'아래 네이버 플레이스에서 매장 안내를 확인할 수 있어요.':'정확한 플레이스 링크가 없어, 아래 네이버지도 검색에서 매장을 찾아 확인해 주세요.');
 return card.name+'\n'+lines.join('\n');
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
      || (!path.includes('analysis') && (path.includes('menuCards') || path.includes('recommendationBundle')) && key === 'reason')
  ).filter(([key]) => !inAnalysis || allowedAnalysis.has(key)).map(([key, item]) => [key,
    // Only the root analysis object is allowlisted. Its typed routing children
    // keep their fields, while private-key stripping still recurses everywhere.
    stripAnalysisFields(item, key === 'analysis', [...path, key])
  ]));
}

export function finalizeConversationCopy(response) {
  const result = stripAnalysisFields(response);
  const slotsForCopy=result.meta?.responseModeState?.slots||{};
  const words=[slotsForCopy.region,slotsForCopy.menu,slotsForCopy.food_type];
  const safe = (value, fallback = '') => normalizeKoreanParticles(typeof value === 'string' && FORBIDDEN_COPY.test(value) ? fallback : value,words);
  // Fixed service FAQ is authoritative, not generated copy; never rewrite it.
  const fixedFAQ = result.meta?.variant === 'service';
  // Code-owned facts can contain legitimate names/menu words that resemble a
  // banned ending. Never replace a comparison, phone/hours or evidence notice
  // with an unrelated generic recommendation sentence.
  if(result.meta?.copySource==='program'){
    // A clarification's question may still be model-written. Protect facts,
    // but retain the conversational style boundary for the question itself.
    const policy=result.meta?.turnPolicy;
    if(policy?.questionText){policy.questionText=safe(policy.questionText,'어떤 조건을 말씀하시는지 알려주시겠어요?');if(policy.next_question)policy.next_question.text=policy.questionText;}
    return result;
  }
  if (!fixedFAQ) {
    const slots = result.meta?.responseModeState?.slots || {};
    const count = result.restaurants?.length || 0;
    const fallback = count ? `${slots.region ? slots.region + '에서 ' : ''}${slots.menu || slots.food_type || '먹을 곳'} ${count}곳을 골라봤어요.` : '지금 알 수 있는 내용만 안내해드릴게요.';
    const inherited=result.meta?.inheritedFood ? `${result.meta.inheritedFood} 기준으로 찾았어요.` : '';
    const repeats=value=>result.meta?.phase1&&['compare','specific_place'].includes(result.meta.intent)?false:repeatsCopySentences(inherited?String(value||'').replace(inherited,''):value);
    result.message = safe(result.message, fallback);
    if(repeats(result.message)) result.message=[fallback,inherited].filter(Boolean).join(' ');
    if (result.error) result.error = safe(result.error, '답변을 불러오지 못했어요. 다시 시도해 주세요.');
    if (result.meta?.turnPolicy) {
      const policy = result.meta.turnPolicy;
      policy.intro = safe(policy.intro, result.message);
      if(repeats(policy.intro))policy.intro=[fallback,inherited].filter(Boolean).join(' ');
      policy.questionText = safe(policy.questionText);
      if (policy.next_question) policy.next_question.text = safe(policy.next_question.text, policy.questionText);
    }
    if (result.meta?.analysis?.next_question) result.meta.analysis.next_question.text = safe(result.meta.analysis.next_question.text, result.meta?.turnPolicy?.questionText || '');
    if (result.meta?.notice) result.meta.notice = safe(result.meta.notice);
    // Phase-1 labels are code-owned user actions (e.g. 지역·역 선택), not AI sentences.
    if (result.suggestions && !result.meta?.phase1) result.suggestions = result.suggestions.filter(value => !FORBIDDEN_COPY.test(value));
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
