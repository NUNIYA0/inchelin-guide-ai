// One composition contract for classifier, server and UI. Never trust a model
// to add blocks outside the intent table or to bypass verified-card selection.
export const ANSWER_BLOCKS = ['text', 'question', 'chips', 'menu_cards', 'place_cards', 'source', 'compare', 'notice'];
export const AUTO_MENU = /제가\s*골라드릴까요|알아서\s*골라|아무거나|상관\s*없어요|아무\s*데나|어디든|다른\s*메뉴/;
export const MENU_CATEGORIES = {
  한식: ['국밥', '제육볶음', '냉면', '비빔밥', '불고기', '전골'],
  중식: ['짬뽕', '볶음밥', '탕수육', '마라탕', '짜장면', '군만두'], 일식: ['초밥', '돈까스', '우동', '카레', '가츠동', '라멘'],
  양식: ['파스타', '피자', '스테이크', '리소토', '햄버거', '라자냐'], 분식: ['떡볶이', '김밥', '만두', '라볶이', '튀김', '어묵'],
  고기: ['삼겹살', '갈비', '불고기', '곱창', '목살', '닭갈비'], 면: ['냉면', '칼국수', '쌀국수', '우동', '메밀국수', '비빔국수'],
  '국밥·찌개': ['국밥', '순두부찌개', '전골', '김치찌개', '곰탕', '설렁탕'], 카페: ['샌드위치', '베이커리', '디저트', '토스트', '크로플', '팬케이크'],
};
export const CATEGORY_CHOICES = ['한식', '중식', '일식', '양식', '분식', '제가 골라드릴까요?'];
export function answerPlanFor(analysis = {}, state = {}, latest = '') {
  const slots = { ...(state.slots || {}), ...Object.fromEntries(Object.entries(analysis.slots || {}).filter(([, value]) => value !== null && value !== false && (!Array.isArray(value) || value.length))) };
  const food = slots.menu || slots.food_type, region = slots.region || slots.use_current_location;
  if (analysis.confidence != null && analysis.confidence < .6) return ['text', 'question', 'chips'];
  let plan;
  switch (analysis.intent) {
    case 'menu_trouble': plan = slots.menu ? region ? ['text', 'place_cards', 'source', 'question', 'chips'] : ['text', 'question', 'chips']
      : slots.food_type || AUTO_MENU.test(latest) ? ['text', 'menu_cards', 'notice', 'chips'] : ['text', 'question', 'chips']; break;
    case 'place_search': plan = food && region ? ['text', 'place_cards', 'source', 'question', 'chips'] : ['text', 'question', 'chips']; break;
    case 'followup': plan = ['text', 'place_cards', 'source']; break;
    case 'condition_change': plan = food && region ? ['text', 'place_cards', 'source', 'chips'] : ['text', 'question', 'chips']; break;
    case 'compare': plan = ['text', 'chips']; break;
    case 'specific_place': plan = ['text', 'place_cards']; break;
    case 'food_talk': plan = ['text', 'question']; break;
    case 'out_of_scope': plan = ['text', 'chips']; break;
    default: plan = ['text'];
  }
  if ((slots.parking || slots.companion === '회식' || slots.other?.length || state.preferences?.vibe || state.preferences?.budget) && ['place_search', 'condition_change'].includes(analysis.intent)) plan.splice(1,0,'notice');
  return plan;
}

export function applyAnswerPlan(response, payload = {}) {
  const meta = response.meta || {};
  const state = meta.responseModeState || { slots: {} };
  const latest = [...(payload.messages || [])].reverse().find(item => item.role === 'user')?.content || '';
  const intent = meta.analysis?.intent || meta.intent || (['compare', 'service', 'food_talk', 'out_of_scope'].includes(meta.variant) ? meta.variant : meta.mode === 'A' ? 'menu_trouble' : ['B','C'].includes(meta.mode) ? 'place_search' : meta.mode === 'D' ? 'condition_change' : 'general');
  const analysis = { ...(meta.analysis || {}), intent };
  let plan = meta.flow === 'menu_category' || meta.flow === 'region' || meta.flow === 'clarify' ? ['text', 'question', 'chips']
    : meta.flow === 'menu_options' ? ['text', 'menu_cards', 'notice', 'chips'] : answerPlanFor(analysis, state, latest);
  if (meta.unsupportedRegion) plan = ['text', 'question', 'chips'];
  if (meta.variant === 'preference_skip') plan = ['text', 'place_cards', 'source', 'chips'];
  // Sparse search alternatives are actionable even on a followup (no new question).
  if (meta.turnPolicy?.expansionChoices?.length && !plan.includes('chips')) plan.push('chips');
  const allow = block => plan.includes(block);
  const policy = { ...(meta.turnPolicy || {}) };
  const limit = intent === 'specific_place' ? 1 : 3;
  const restaurants = allow('place_cards') ? (response.restaurants || []).slice(0, limit) : [];
  if (!allow('question')) { policy.questionText = ''; policy.next_question = null; state.pendingQuestionSlot = null; }
  if (!allow('chips')) { policy.actionChips = []; policy.expansionChoices = []; }
  if (meta.flow === 'menu_options') {
    state.stage = 'menu_options_shown'; state.pendingQuestionSlot = 'menu'; state.consecutiveQuestions = 0;
    policy.intro = policy.intro || response.message; policy.menuHint = '끌리는 메뉴를 고르거나 먹고 싶은 걸 말해 주세요';
  }
  // Food conversation gets one conversational invitation, never restaurant cards.
  if (intent === 'food_talk') { policy.intro = response.message.replace(/[^.!?]*[?？]/g, '').trim(); policy.questionText = '이 음식으로 한 끼도 골라볼까요?'; policy.next_question = null; }
  const suggestions = allow('chips') ? (response.suggestions || []) : allow('menu_cards') ? (response.suggestions || []).filter(value => value.includes('|')) : [];
  if (intent === 'compare') policy.actionChips = ['다른 곳도 보여줘','조건 바꾸기'];
  if (intent === 'out_of_scope') suggestions.push('메뉴 고민하기','식당 찾기');
  analysis.stage = state.stage;
  if (meta.flow) {
    analysis.missing_slots = meta.flow === 'region' ? ['region'] : meta.flow === 'menu_category' ? ['menu'] : [];
    analysis.can_search = false;
  }
  analysis.next_question = policy.next_question || null;
  analysis.answer_plan = plan;
  return { ...response, restaurants, suggestions, meta: { ...meta, answer_plan: plan, analysis, answer_limits: { menu_cards: 3, place_cards: limit },
    menuCards: allow('menu_cards') ? (meta.menuCards || []).slice(0, 3) : [], notice: allow('notice') ? meta.notice : '', responseModeState: state, turnPolicy: policy } };
}
