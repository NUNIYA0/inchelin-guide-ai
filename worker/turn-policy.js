import { normalizeResponseState } from './response-modes.js';
import { withParticle } from './korean.js';

export const IMMEDIATE_REQUEST = /바로\s*보여줘|그냥\s*추천해줘|질문\s*(?:없이|하지\s*마)/;
const unique = values => [...new Set(values)];
const chip = (label, message) => ({ label, message });
export const MENU_CHIPS = ['고기', '한식', '면', '일식', '중식', '분식', '카페'].map(menu => chip(menu, menu + ' 먹고 싶어요'));
const text = value => typeof value === 'string' ? value.trim().slice(0, 180) : null;
const opening = value => String(value || '').replace(/[*#\s]/g, '').split(/[.!?。]/)[0].slice(0, 12);

export function turnPreferences(previous, latest, slots) {
  return {
    companion: slots.companion || previous.companion || null,
    budget: latest.match(/\d+\s*(?:만원|만 원|원)(?:\s*(?:이하|미만|정도))?/)?.[0] || previous.budget || null,
    vibe: latest.match(/조용한?|아늑한?|활기찬?|시끌벅적한?|분위기\s*좋은/)?.[0] || previous.vibe || null,
  };
}
export function questionTemplate(slot, state, response) {
  if (slot === 'region') return { slot, text: '어느 지역에서 찾을까요?', chips: [
    chip('현재 위치 연결', '내 주변에서 먹을 곳 찾아줘'), chip('강남역', '강남역에서 찾아줘'),
    chip('홍대', '홍대에서 찾아줘'), chip('역삼', '역삼에서 찾아줘'),
  ] };
  if (slot === 'menu') {
    const candidates = response.meta?.mode === 'A' ? (response.suggestions || []).filter(value => value.includes('|')).map(value => {
      const label = value.split('|')[0]; return chip(label, label + ' 먹고 싶어요');
    }) : MENU_CHIPS;
    return { slot, text: '어떤 메뉴로 좁혀볼까요?', chips: [...candidates,
      response.meta?.mode === 'A' ? chip('다른 메뉴 보기', '다른 메뉴도 추천해줘') : chip('메뉴 탐색', '오늘 뭐 먹을지 같이 골라줘')] };
  }
  if (slot === 'companion') return { slot, text: '누구와 가세요?', chips: [
    chip('혼자', '혼자 먹을 거예요'), chip('2~3명', '2~3명이 가요'), chip('회식', '회식이에요'), chip('가족', '가족과 함께 가요'),
  ] };
  if (slot === 'sub_menu') {
    const menu = state.slots.food_type;
    const options = { 고기: ['삼겹살', '갈비', '불고기'], 한식: ['국밥', '김치찌개', '비빔밥'], 면: ['냉면', '칼국수', '쌀국수'], 일식: ['초밥', '라멘', '돈까스'], 중식: ['마라탕', '짬뽕', '볶음밥'], 양식: ['파스타', '피자', '스테이크'], 분식: ['떡볶이', '만두'], 카페: ['베이커리', '디저트'] }[menu];
    if (options) return { slot, text: '그중 어떤 세부 메뉴가 끌리세요?', chips: options.map(menu => chip(menu, menu + ' 먹고 싶어요')) };
  }
  if (slot === 'sub_region') {
    const options = { 서울: ['강남역', '홍대', '성수'], 강남: ['강남역', '역삼', '선릉역'], 홍대: ['홍대입구역', '합정역', '상수역'], 부산: ['서면', '해운대', '광안리'] }[state.slots.region];
    if (options) return { slot, text: '어느 동네나 역 쪽이 편하세요?', chips: options.map(region => chip(region, region + '에서 찾아줘')) };
  }
  return null;
}
export function planTurn(response, previousValue = {}, latest = '') {
  const previous = normalizeResponseState(previousValue);
  const state = normalizeResponseState(response.meta?.responseModeState || previous);
  const intent = response.meta?.analysis?.intent || response.meta?.intent || response.meta?.variant || '';
  const exempt = ['service', 'compare', 'specific_place', 'general', 'food_talk', 'out_of_scope', 'hard_reset', 'linked_place'].includes(intent)
    || ['GENERAL', 'E'].includes(response.meta?.mode) || response.meta?.variant === 'compare';
  const hasRegion = Boolean(state.slots.region || state.slots.use_current_location);
  const hasFood = Boolean(state.slots.menu || state.slots.food_type);
  const missing_slots = [!hasRegion && 'region', !hasFood && 'menu'].filter(Boolean);
  const hadCards = previous.lastCards.length > 0;
  const stage = hasRegion && hasFood ? (hadCards ? 'refining' : 'ready') : missing_slots.length === 1 ? 'narrowing' : 'exploring';
  state.stage = exempt ? previous.stage : stage;
  state.preferences = turnPreferences(state.preferences, latest, state.slots);
  let next_question = null;
  if (!exempt && !IMMEDIATE_REQUEST.test(latest) && state.questionCount < 3 && (stage !== 'refining' || state.refinementQuestionCount < 2)) {
    const requestedRegion = response.meta?.mode === 'B' && /지역\s*(?:넓히기|바꾸기|변경)/.test(latest);
    const axes = requestedRegion ? ['region'] : !hasFood && (hasRegion || response.meta?.mode === 'A') ? ['menu'] : !hasRegion ? ['region'] : response.restaurants?.length ? [
      !state.slots.companion && !state.preferences.companion && 'companion',
      !state.slots.menu && 'sub_menu', 'sub_region',
    ].filter(Boolean) : [];
    for (const slot of axes) {
      if (!state.askedSlots.includes(slot)) next_question = questionTemplate(slot, state, response);
      if (next_question) break;
    }
  }
  return { stage: state.stage, missing_slots, next_question, can_search: !exempt && hasRegion && hasFood, exempt, state };
}
export function applyTurnPolicy(response, payload = {}) {
  if (!response?.meta?.responseModeState) return response;
  if (response.meta.variant === 'hard_reset') return response;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const latest = [...messages].reverse().find(message => message.role === 'user')?.content || '';
  const previous = payload.context?.responseModeState || {};
  const plan = planTurn(response, previous, latest);
  const { state, exempt } = plan;
  const proposal = response.meta._turnDraft;
  const analysis = { ...(response.meta.analysis || {}), intent: response.meta.intent || response.meta.analysis?.intent || response.meta.variant,
    stage: plan.stage, missing_slots: plan.missing_slots, next_question: plan.next_question, can_search: plan.can_search };
  const cleanMeta = { ...response.meta }; delete cleanMeta._turnDraft;
  if (exempt) {
    const noFollowup = response.meta.mode === 'E' || response.meta.variant === 'compare';
    const message = noFollowup ? response.message.split(/(?<=[.!?？])\s+/).filter(unit => !/[?？]/.test(unit)).join(' ') || '현재 확인된 정보만 안내해드릴게요.' : response.message;
    return { ...response, message, suggestions: noFollowup ? [] : response.suggestions, meta: { ...cleanMeta, analysis, responseModeState: state, turnPolicy: { ...analysis, next_question: null } } };
  }
  let question = plan.next_question;
  // A model may phrase an approved question, never add an axis or invent chips.
  const proposed = proposal?.question || response.meta.analysis?.next_question;
  if (question && proposed?.slot === question.slot && typeof proposed.text === 'string'
    && proposed.text.length <= 70 && (proposed.text.match(/[?？]/g) || []).length === 1
    && !/예산|분위기|주차|평점|인기|영업/.test(proposed.text)
    && ({ companion: /누구|몇\s*명|동행|어떤\s*분|함께/, region: /지역|동네|역/, menu: /메뉴|음식|방향/, sub_menu: /메뉴|음식/, sub_region: /지역|동네|역/ }[question.slot])?.test(proposed.text)) {
    question = { ...question, text: proposed.text };
  }
  const food = state.slots.menu || state.slots.food_type || '식사';
  const area = state.slots.region || '현재 위치';
  const count = Math.min(3, response.restaurants?.length || 0);
  const recent = [...messages].filter(message => message.role === 'assistant').slice(-3).map(message => opening(message.content));
  const oldOpenings = [...recent, ...state.previousOpenings];
  const candidateText = value => {
    const valueText = text(value);
    if (!valueText || /[?？]|맛있|인기|평점|별점|최고|저렴|조용|주차|단체석|영업|분위기|예약|적합|도보|차량|좌석|룸/.test(valueText)) return null;
    if (/\d/.test(valueText.replace(new RegExp(count + '곳', 'g'), ''))) return null;
    if ((valueText.match(/[.!。]/g) || []).length > 1 || /\d+곳/.test(valueText) && !valueText.includes(count + '곳')) return null;
    if (!valueText.includes(food) && !valueText.includes(area)) return null;
    return valueText.replace(/[.!。]+$/, '');
  };
  const defaultStarts = count ? [
    `${area} ${withParticle(food, '으로/로')} 먼저 식당 ${count}곳을 찾았어요`,
    `말씀하신 ${food} 요청에 맞춰 식당 ${count}곳을 골랐어요`,
    `이번에는 ${area}에서 ${food} 후보 ${count}곳을 확인했어요`,
    `선택하신 조건으로 ${area} 식당 ${count}곳을 추렸어요`,
  ] : response.meta.mode === 'A' ? [
    '오늘은 서로 다른 방향의 메뉴 세 가지로 좁혀봤어요', '이번 한 끼에 어울릴 서로 다른 방향을 골랐어요',
    '말씀하신 식사 고민에 맞춰 다른 메뉴들을 준비했어요', '새로운 메뉴 방향을 함께 살펴볼게요',
  ] : [`${food} 선택을 이어가볼게요`, `말씀하신 ${food} 요청을 반영했어요`, `이번 식사는 ${withParticle(food, '으로/로')} 좁혀볼게요`, '필요한 조건 하나만 더 정해볼게요'];
  const modelStart = candidateText(proposal?.summary);
  const starts = [modelStart, ...defaultStarts, '식사 조건을 바탕으로 선택을 이어갈게요', '확인한 정보에서 다음 선택을 정리했어요', '지금 요청을 기준으로 선택지를 정리해볼게요', '함께 정한 방향에서 한 단계 더 좁혀볼게요'].filter(Boolean);
  const summary = starts.find(value => !oldOpenings.includes(opening(value))) || `다음 선택은 ${food} 요청을 기준으로 이어갈게요`;
  let reason = count ? plan.stage === 'refining'
    ? /다른\s*곳|더\s*없|별로/.test(latest) ? '이미 보여드린 식당을 제외하고 같은 조건으로 다시 검색했어요'
      : `${response.meta.analysis?.slots?.companion || response.meta.analysis?.slots?.region || response.meta.analysis?.slots?.menu || '지역·메뉴'} 요청을 반영해 검증된 후보를 다시 검색·정렬했어요`
    : '지역·메뉴가 일치하고 확인된 분류를 가진 후보만 골랐어요'
    : response.meta.mode === 'A' ? '마음에 드는 메뉴에서 원하는 지역의 식당까지 이어갈 수 있어요'
      : !state.slots.region ? '지역을 정하면 같은 메뉴의 실제 식당을 찾아볼 수 있어요' : '메뉴를 정하면 검색 조건을 더 정확히 맞출 수 있어요';
  const generatedReason = candidateText(proposal?.reason);
  if (generatedReason && /지역|메뉴|분류|검색|직선/.test(generatedReason)) reason = generatedReason;
  // Keep unverified preferences above the cards, outside the three-sentence copy.
  const notices = [];
  if (state.slots.parking === true && response.restaurants?.some(card => card.parking == null)) notices.push('주차');
  if (state.slots.other.some(value => /단체석/.test(value))) notices.push('단체석');
  if (state.preferences.vibe) notices.push('분위기');
  if (state.preferences.budget) notices.push('예산');
  const notice = count && notices.length ? `${unique(notices).join('·')} 조건은 확인되지 않은 선호로 기록했으며 매장 확인이 필요해요.` : '';
  if (question) {
    state.askedSlots = unique([...state.askedSlots, question.slot]);
    state.questionCount++;
    if (plan.stage === 'refining') state.refinementQuestionCount++;
  }
  state.pendingQuestionSlot = question?.slot || null;
  state.previousOpenings = [...state.previousOpenings, opening(summary)].slice(-3);
  analysis.next_question = question;
  let suggestions = question ? question.chips.map(value => response.meta.mode === 'A' ? (response.suggestions || []).find(old => old.split('|')[0] === value.label) || value.label : value.label) : count ? [] : response.suggestions || [];
  if (IMMEDIATE_REQUEST.test(latest)) suggestions = [];
  // No-results and error explanations remain specific and must not claim a search succeeded.
  const message = !count && !['A', 'B'].includes(response.meta.mode) ? response.message : [summary + '.', reason + '.', question?.text].filter(Boolean).join(' ');
  return { ...response, message, suggestions, restaurants: (response.restaurants || []).slice(0, 3),
    meta: { ...cleanMeta, analysis, responseModeState: state, notice,
      turnPolicy: { ...analysis, cardFirst: count > 0, questionSource: question && proposed?.text === question.text ? 'model' : question ? 'template' : null } } };
}

export async function withTurnDeadline(action, timeoutMs = 6500) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([action(controller.signal), new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('turn_timeout')); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
