import { normalizeResponseState } from './response-modes.js';
import { withParticle } from './korean.js';
import { FORBIDDEN_COPY } from './conversation-copy.js';
import { nearbySuggestions } from './search-axes.js';

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
    && !FORBIDDEN_COPY.test(proposed.text)
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
    if (!valueText || FORBIDDEN_COPY.test(valueText) || /[?？]|맛있|인기|평점|별점|최고|저렴|조용|주차|단체석|영업|분위기|예약|적합|도보|차량|좌석|앉기|편한|룸|모임.*많이/.test(valueText)) return null;
    if (/\d/.test(valueText.replace(new RegExp(count + '곳', 'g'), '').replace(state.slots.companion || '\u0000', ''))) return null;
    if ((valueText.match(/[.!。]/g) || []).length > 1 || /\d+곳/.test(valueText) && !valueText.includes(count + '곳')) return null;
    if (response.meta.mode !== 'A' && !valueText.includes(food) && !valueText.includes(area) && !(state.slots.companion && valueText.includes(state.slots.companion))) return null;
    if (response.meta.mode === 'A') {
      const userWords = messages.filter(message => message.role === 'user').map(message => message.content).join(' ');
      if ((valueText.match(/쌀쌀|추운|더운|비가|눈이/g) || []).some(word => !userWords.includes(word))) return null;
    }
    return valueText.replace(/[.!。]+$/, '');
  };
  const defaultStarts = count ? [
    `${area}에서 ${state.slots.companion ? state.slots.companion + ' 자리로 ' : ''}${food} 먹을 곳 ${count}곳을 골라봤어요`,
    `${food} 드시고 싶으시군요, ${area}에서${state.slots.companion ? ' ' + state.slots.companion + ' 자리로' : ''} ${count}곳 골라봤어요`,
    `이번에는 ${area}에서 ${state.slots.companion ? state.slots.companion + '으로 ' : ''}${food} 먹을 곳 ${count}곳을 살펴봤어요`,
    `${area}에서 함께 살펴볼 식당 ${count}곳이에요`,
  ] : response.meta.mode === 'A' ? [
    '오늘은 서로 다른 방향의 메뉴 세 가지로 좁혀봤어요', '이번 한 끼에 어울릴 서로 다른 방향을 골랐어요',
    '말씀하신 식사 고민에 맞춰 다른 메뉴들을 준비했어요', '새로운 메뉴 방향을 함께 살펴볼게요',
  ] : !state.slots.menu && !state.slots.food_type && state.slots.region ? [
    `${area}에서 먹을 곳을 함께 골라봐요`, `${area}로 정하셨군요, 메뉴도 골라볼게요`, '어디서 먹을지는 정했으니 메뉴만 골라봐요',
  ] : [`${food} 드시고 싶으시군요`, `${food} 좋죠, 먹을 곳도 함께 찾아볼게요`, `이번 식사는 ${withParticle(food, '으로/로')} 골라볼게요`, '한 가지만 더 고르면 먹을 곳을 찾을 수 있어요'];
  const modelStart = candidateText(proposal?.summary);
  const starts = [modelStart, ...defaultStarts, '한 끼 고르는 고민을 조금 덜어볼게요', '먹고 싶은 쪽으로 조금씩 좁혀봐요', '이번에는 이렇게 골라봤어요', '함께 먹을 메뉴를 한 단계 더 골라봐요'].filter(Boolean);
  const summary = starts.find(value => !oldOpenings.includes(opening(value))) || `다음 한 끼는 ${withParticle(food, '으로/로')} 이어가볼게요`;
  let reason = count ? plan.stage === 'refining'
    ? /다른\s*곳|더\s*없|별로/.test(latest) ? '앞서 본 곳은 빼고, 같은 메뉴로 더 찾아봤어요'
      : state.slots.companion ? `${state.slots.companion === '회식' ? '회식으로 가시는군요' : `${state.slots.companion} 함께 드시는군요`}, 먹을 곳을 다시 골라봤어요`
      : '새로 말씀해 주신 쪽으로 먹을 곳을 다시 골라봤어요'
    : ''
    : response.meta.mode === 'A' ? ''
      : !state.slots.region ? '동네를 알려주시면 먹을 곳도 찾아드릴게요' : '먹고 싶은 메뉴부터 골라봐요';
  const generatedReason = candidateText(proposal?.reason);
  if (generatedReason) reason = generatedReason;
  // Keep unverified preferences above the cards, outside the three-sentence copy.
  const notices = [];
  if (state.slots.parking === true && response.restaurants?.some(card => card.parking == null)) notices.push('주차');
  if (state.slots.other.some(value => /단체석/.test(value))) notices.push('단체석');
  if (state.preferences.vibe) notices.push('분위기');
  if (state.preferences.budget) notices.push('예산');
  if (count && state.slots.companion === '회식' && !notices.includes('단체석')) notices.push('단체석');
  const notice = count && notices.length ? `${unique(notices).join('·')} 정보는 아직 알 수 없어 매장 확인이 필요해요.` : '';
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
  const sparse = count > 0 && count < 3;
  const expand = sparse || response.meta.restaurantSearchStatus === 'no_results';
  const countedSummary = sparse && !summary.includes(count + '곳') ? `${summary}, 지금은 ${count}곳을 찾았어요` : summary;
  const intro = [countedSummary + '.', reason && reason + '.'].filter(Boolean).join(' ');
  const message = !count && !['A', 'B'].includes(response.meta.mode) ? response.message : [intro, question?.text].filter(Boolean).join(' ');
  return { ...response, message, suggestions, restaurants: (response.restaurants || []).slice(0, 3),
    meta: { ...cleanMeta, analysis, responseModeState: state, notice,
      ...((count || response.meta.restaurantSearchStatus === 'no_results') && (state.slots.region || state.slots.use_current_location) && (state.slots.menu || state.slots.food_type) ? { searchConditions: { region: state.slots.use_current_location ? '현재 위치' : state.slots.region, food: state.slots.menu || state.slots.food_type } } : {}),
      turnPolicy: { ...analysis, cardFirst: false, intro: !count && !['A', 'B'].includes(response.meta.mode) ? response.message : intro, questionText: question?.text || '',
        actionChips: (count || expand) && !IMMEDIATE_REQUEST.test(latest) ? [...(expand ? nearbySuggestions(state.slots.region, state.slots.menu || state.slots.food_type).map(item => item.label) : ['다른 곳도 보여줘']), '조건 바꾸기', ...(count > 1 ? ['비교하기'] : [])] : [],
        expansionChoices: expand ? nearbySuggestions(state.slots.region, state.slots.menu || state.slots.food_type) : [],
        questionSource: question && proposed?.text === question.text ? 'model' : question ? 'template' : null } } };
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
