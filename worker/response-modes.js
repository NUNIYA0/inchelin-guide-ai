import { normalizeFoodAxis, normalizeSearchRegion, FOOD_HIERARCHY, REGION_NORMALIZATION } from './search-axes.js';
import { ANSWER_BLOCKS, answerPlanFor, MENU_CATEGORIES } from './answer-plan.js';
import { isMainDish, MAIN_DISHES } from './main-dishes.js';
export const INTENTS = [
  "menu_trouble", "place_search", "followup", "condition_change", "compare",
  "specific_place", "food_talk", "service", "general", "out_of_scope",
];
export const TURN_ANALYSIS_FIELDS = {
  stage: { type: "string", enum: ["exploring", "narrowing", "ready", "refining", "menu_category_asked", "menu_options_shown", "region_asked"] },
  answer_plan: { type: 'array', items: { type: 'string', enum: ANSWER_BLOCKS }, maxItems: 9 },
  related_questions: {type:'array',maxItems:6,items:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}},
  missing_slots: { type: "array", items: { type: "string", enum: ["menu", "region", "companion", "sub_menu", "sub_region"] } },
  next_question: { anyOf: [{ type: "null" }, { type: "object", properties: {
    slot: { type: "string", enum: ["menu_category", "menu", "region", "companion", "sub_menu", "sub_region", "clarify"] },
    text: { type: "string" },
    chips: { type: "array", items: { type: "object", properties: { label: { type: "string" }, message: { type: "string" } }, required: ["label", "message"], additionalProperties: false } }
  }, required: ["slot", "text", "chips"], additionalProperties: false }] },
  can_search: { type: "boolean" },
};

export const INTENT_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    ...TURN_ANALYSIS_FIELDS,
    intent: { type: "string", enum: INTENTS },
    sub_intent: { type: ["string", "null"] },
    confidence: { type: "number" },
    slots: {
      type: "object",
      properties: {
        region: { type: ["string", "null"] }, use_current_location: { type: "boolean" }, food_type: { type: ["string", "null"] },
        menu: { type: ["string", "null"] }, companion: { type: ["string", "null"] }, meal_time: { type: ["string", "null"] },
        parking: { type: ["boolean", "null"] }, other: { type: "array", items: { type: "string" }, maxItems: 8 },
      },
      required: ["region", "use_current_location", "food_type", "menu", "companion", "meal_time", "parking", "other"], additionalProperties: false,
    },
    reference: { type: "object", properties: { target_index: { type: ["number", "null"] }, target_name: { type: ["string", "null"] } }, required: ["target_index", "target_name"], additionalProperties: false },
    change: { anyOf: [{ type: "null" }, { type: "object", properties: { slot: { type: ["string", "null"] }, action: { type: "string", enum: ["replace", "add", "exclude_previous"] } }, required: ["slot", "action"], additionalProperties: false }] },
    flags: { type: "object", properties: { answers_previous_question: { type: "boolean" }, new_topic: { type: "string", enum: ["none", "soft", "hard"] }, mentions_place_name: { type: "boolean" }, food_related: { type: "boolean" } }, required: ["answers_previous_question", "new_topic", "mentions_place_name", "food_related"], additionalProperties: false },
  },
  required: ["intent", "sub_intent", "confidence", "slots", "reference", "change", "flags", ...Object.keys(TURN_ANALYSIS_FIELDS)],
  additionalProperties: false,
};

export function buildIntentAnalysisInstructions(stateValue) {
  const state = normalizeResponseState(stateValue);
  const context = {
    last_mode: state.lastMode,
    question_slot: state.pendingQuestionSlot,
    last_cards: state.lastCards.map((card, index) => ({ position: index + 1, id: card.id, name: card.name })),
    shown_places: state.shownPlaces.map(place => ({ id: place.id, name: place.name })),
    a_candidates: state.aCandidates,
    accumulated_slots: state.slots,
    no_results: state.noResults,
    stage: state.stage, askedSlots: state.askedSlots, questionCount: state.questionCount, preferences: state.preferences,
    shownSuggestions: state.shownSuggestions,
  };
  return `너는 인슐랭가이드 AI의 1단계 의도 분석기다. 응답 문장을 만들지 말고 JSON만 출력한다.
맛집 검색의 최우선 축은 food_type과 region이다. 메뉴(menu)는 세부 음식이며 food_type은 상위 종류다. 음식·지역을 분위기·동행·예산보다 먼저 추출하고 확정한다.
둘 다 있으면 즉시 검색하고 하나만 있으면 없는 축 하나를 묻는다. '거기 말고 성수에서'는 region만, '그럼 국밥으로'는 음식 축만 바꿔 나머지 슬롯을 유지한다.
'맛있는 거'처럼 음식이 모호하면 지역부터 묻고 메뉴 탐색으로 이어간다. 지원 지역 안내에 확장 계획을 약속하지 않는다.
음식 사전: ${JSON.stringify(FOOD_HIERARCHY)}
지역 정규화: ${JSON.stringify(REGION_NORMALIZATION)}
intent는 menu_trouble, place_search, followup, condition_change, compare, specific_place, food_talk, service, general, out_of_scope 중 하나다.
우선순위: 범위 밖 → service(와인 포함) → 지역 질문에 대한 답 → 직전 카드의 후속/조건 변경/비교 → 목록 밖 특정 상호 → 강한 식당 신호 → 메뉴 고민 → 음식 지식 → 약한 지역/음식 신호 → general.
음식명만 있고 식당·지역 신호가 없으면 menu_trouble이다. '삼겹살 추천해줘'는 menu_trouble/declare다. 지역+음식이 정해졌거나 맛집·식당·가게·~집·찾아줘가 있으면 place_search다. '강남역 근처에서 뭐 먹지'는 강한 식당 신호가 없으므로 menu_trouble이다.
직전 식당 카드가 있을 때 다른 곳·별로야·더 없어는 condition_change/exclude_previous, 주차되는 곳은 add, A 후보 뒤 다른 메뉴는 menu_trouble/narrow다.
'다른 곳'은 슬롯이나 new_topic을 변경하지 않는다. '처음 거기', '첫 번째 거기', '두 번째 거기', '세 번째 거기'는 직전 카드의 1/1/2/3번이며 기존 focus보다 우선한다.
직전 카드 두 대상 이상을 언급하거나 '첫 번째랑 두 번째 중에 어디가 나아', '어디가 나아', '비교'라고 하면 compare다. 단일 followup이나 focus 해석보다 비교를 우선한다.
service sub_intent는 about, how_to, policy, data_basis, wine 중 하나다. followup sub_intent는 hours, parking, phone, menu_info, location, other다.
slots에는 이번 발화에서 새로 추출하거나 바꾼 값만 넣고 이전 값을 복사하지 않는다. reference는 카드 번호나 상호 참조다. flags.new_topic은 none/soft/hard다. 끼어든 service/general/food_talk/out_of_scope는 new_topic=none이다.
stage는 exploring(메뉴·지역 탐색), narrowing(한 축 부족), ready(지역+메뉴 첫 검색), refining(기존 카드 조건 변경)이다.
missing_slots는 지역·메뉴 등 실제 검색을 바꾸는 축만 적는다. next_question은 질문 하나(slot,text,chips{label,message}) 또는 null이다.
can_search는 지역+메뉴가 있을 때 true다. 분위기·예산은 질문하지 않고 선호로 기록하며 검증되지 않았음을 안내한다.
askedSlots는 다시 묻지 않는다. 바로 보여줘/그냥 추천해줘, 서비스/비교/특정식당 질문은 next_question=null이다.
answer_plan은 렌더할 블록 순서다. 메뉴 고민+종류 없음=text/question/chips, 종류 있음 또는 알아서 골라줘=text/menu_cards/notice, 음식+지역 검색=text/place_cards/source/question/chips, 한 축 부족=text/question/chips, followup=text/place_cards/source, condition_change=text/place_cards/source/chips, compare=text/chips, specific_place=text/place_cards(최대1), food_talk=text/question, service/general=text, out_of_scope=text/chips. 미확인 조건은 notice를 추가한다. 낮은 신뢰도는 text/question/chips이며 카드를 만들지 않는다.
메뉴 후보와 식당 카드, 비교, 특정식당, 음식 대화, 서비스/일반 답변에는 related_questions를 추가하되, 최종 노출은 서버 검증을 통과한 문장이 있을 때만 허용한다. 범위 밖은 시작 제안만, 종류/지역 질문 및 0건 안내에는 related_questions를 넣지 않는다. 칩과 연관 질문은 다른 블록이며 행동 칩은 최하단이다.
confidence가 낮아도 가장 가능성 높은 분류를 내고 food_related를 정확히 표시한다.
related_questions는 다음 탐색용 사용자 말투 해요체 문장 12~30자 2~3개다. 서로 다른 축(지역/음식/상황/비교/서비스)을 고르고 이미 한 말·보여준 제안을 반복하지 않는다. 영업시간·평점·가격·웨이팅·분위기 확인형은 금지한다. 현재 질문과 askedSlots를 다시 묻지 않는다. 메인 메뉴 사전(main_dish=true)의 음식만 제안한다: ${JSON.stringify(MAIN_DISHES)}. 사이드·반찬·음료·술·디저트를 제안하지 않는다. 종류/지역 질문과 검색 결과 0건에서는 빈 배열이다. related_questions 블록은 카드/메뉴 후보/비교/특정식당/음식대화/서비스/일반답변/범위밖시작 제안에만 허용한다.
<runtime_context>${JSON.stringify(context)}</runtime_context>`;
}

export function emptySlots() {
  return {
    region: null,
    use_current_location: false,
    food_type: null,
    menu: null,
    companion: null,
    meal_time: null,
    parking: null,
    other: [],
  };
}

export function emptyResponseState() {
  return {
    slots: emptySlots(),
    lastCards: [],
    shownPlaceIds: [],
    shownPlaces: [],
    focus: null,
    lastMode: null,
    pendingQuestionSlot: null,
    aCandidates: [],
    aProposed: [],
    shownSuggestions: [],
    menuCategory: null,
    regionFlexible: false,
    noResults: false,
    stage: "exploring",
    askedSlots: [],
    preferences: { companion: null, budget: null, vibe: null },
    questionCount: 0,
    refinementQuestionCount: 0,
    previousOpenings: [],
    consecutiveQuestions: 0,
  };
}

function cleanString(value, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) || null : null;
}

function cleanSlots(value = {}) {
  return {
    region: cleanString(value.region),
    use_current_location: value.use_current_location === true,
    food_type: cleanString(value.food_type),
    menu: cleanString(value.menu),
    companion: cleanString(value.companion),
    meal_time: cleanString(value.meal_time),
    parking: typeof value.parking === "boolean" ? value.parking : null,
    other: Array.isArray(value.other) ? value.other.map(item => cleanString(item, 100)).filter(Boolean).slice(0, 8) : [],
  };
}

export function normalizeResponseState(value = {}) {
  const base = emptyResponseState();
  const cleanCards = cards => Array.isArray(cards) ? cards.filter(Boolean).slice(0, 20).map(card => ({
    id: cleanString(card.id, 180) || cleanString(card.name, 180),
    name: cleanString(card.name, 180) || "",
    address: cleanString(card.address, 300) || "",
    category: cleanString(card.category, 160) || "",
    foodLabel: cleanString(card.foodLabel, 80) || "",
    regionLabel: cleanString(card.regionLabel, 80) || "",
    phone: cleanString(card.phone, 80) || "",
    openingHours: cleanString(card.openingHours, 500) || "",
    businessStatus: ["active", "temporarily_closed", "permanently_closed"].includes(card.businessStatus) ? card.businessStatus : null,
    parking: typeof card.parking === "boolean" ? card.parking : null,
    distanceMeters: card.distanceMeters !== null && card.distanceMeters !== undefined && card.distanceMeters !== "" && Number.isFinite(Number(card.distanceMeters)) ? Number(card.distanceMeters) : null,
    recommendationReason: cleanString(card.recommendationReason, 500) || "",
    representativeMenus: Array.isArray(card.representativeMenus) ? card.representativeMenus.map(String).slice(0, 8) : [],
  })) : [];
  const lastCards = cleanCards(value.lastCards || value.cards);
  const shownPlaces = cleanCards(value.shownPlaces);
  return {
    ...base,
    slots: { ...base.slots, ...cleanSlots(value.slots) },
    lastCards,
    shownPlaceIds: Array.isArray(value.shownPlaceIds || value.shown)
      ? [...new Set((value.shownPlaceIds || value.shown).map(String).filter(Boolean))].slice(0, 100)
      : [],
    shownPlaces,
    focus: cleanString(value.focus, 180),
    lastMode: ["A", "B", "C", "D", "E", "GENERAL"].includes(value.lastMode || value.last_mode) ? (value.lastMode || value.last_mode) : null,
    pendingQuestionSlot: cleanString(value.pendingQuestionSlot || value.question_slot, 40),
    aCandidates: Array.isArray(value.aCandidates || value.a_candidates) ? (value.aCandidates || value.a_candidates).map(String).filter(Boolean).slice(0, 12) : [],
    aProposed: Array.isArray(value.aProposed || value.a_proposed) ? [...new Set((value.aProposed || value.a_proposed).map(String).filter(Boolean))].slice(0, 80) : [],
    noResults: value.noResults === true || value.no_results === true,
    shownSuggestions: Array.isArray(value.shownSuggestions) ? value.shownSuggestions.slice(0,1000).filter(item=>item && typeof item.text==='string' && typeof item.key==='string').map(item=>({text:item.text.slice(0,100),key:item.key.slice(0,240)})) : [],
    menuCategory: MENU_CATEGORIES[value.menuCategory] ? value.menuCategory : null,
    regionFlexible: value.regionFlexible === true,
    stage: ["exploring", "narrowing", "ready", "refining", "menu_category_asked", "menu_options_shown", "region_asked"].includes(value.stage) ? value.stage : "exploring",
    askedSlots: Array.isArray(value.askedSlots) ? [...new Set(value.askedSlots)].filter(slot => ["menu_category", "menu", "region", "companion", "sub_menu", "sub_region", "clarify"].includes(slot)) : [],
    consecutiveQuestions: Math.min(2, Math.max(0, Number(value.consecutiveQuestions) || 0)),
    preferences: Object.fromEntries(["companion", "budget", "vibe"].map(key => [key, cleanString(value.preferences?.[key])])),
    questionCount: Math.min(3, Math.max(0, Math.trunc(Number(value.questionCount) || 0))),
    refinementQuestionCount: Math.min(2, Math.max(0, Math.trunc(Number(value.refinementQuestionCount) || 0))),
    previousOpenings: Array.isArray(value.previousOpenings) ? value.previousOpenings.map(item => cleanString(item, 60)).filter(Boolean).slice(-3) : [],
  };
}

export function normalizeAnalysis(value = {}) {
  const intent = INTENTS.includes(value.intent) ? value.intent : "general";
  const reference = value.reference && typeof value.reference === "object" ? value.reference : {};
  const change = value.change && typeof value.change === "object" ? value.change : null;
  const flags = value.flags && typeof value.flags === "object" ? value.flags : {};
  return {
    intent,
    answer_plan: answerPlanFor(value, { slots: value.slots }),
    stage: ["exploring", "narrowing", "ready", "refining", "menu_category_asked", "menu_options_shown", "region_asked"].includes(value.stage) ? value.stage : "exploring",
    missing_slots: Array.isArray(value.missing_slots) ? value.missing_slots.filter(slot => ["menu", "region", "companion", "sub_menu", "sub_region"].includes(slot)) : [],
    next_question: value.next_question && ["menu_category", "menu", "region", "companion", "sub_menu", "sub_region", "clarify"].includes(value.next_question.slot) ? {
      slot: value.next_question.slot, text: cleanString(value.next_question.text, 120) || "",
      chips: Array.isArray(value.next_question.chips) ? value.next_question.chips.slice(0, 8).map(item => ({ label: cleanString(item?.label, 40) || "", message: cleanString(item?.message, 160) || "" })) : [],
    } : null,
    can_search: value.can_search === true,
    related_questions: Array.isArray(value.related_questions) ? value.related_questions.slice(0,6).map(item=>({text:cleanString(typeof item==='string'?item:item?.text,100)||''})) : [],
    sub_intent: cleanString(value.sub_intent, 80),
    confidence: Number.isFinite(Number(value.confidence)) ? Math.max(0, Math.min(1, Number(value.confidence))) : 1,
    slots: (() => {
      const slots = cleanSlots(value.slots);
      const food = normalizeFoodAxis(slots.menu || slots.food_type);
      if (food) { slots.food_type = food.food_type; slots.menu = food.menu; }
      if (slots.region) slots.region = normalizeSearchRegion(slots.region);
      return slots;
    })(),
    reference: {
      target_index: [1, 2, 3].includes(Number(reference.target_index)) ? Number(reference.target_index) : null,
      target_name: cleanString(reference.target_name, 180),
    },
    change: change ? {
      slot: cleanString(change.slot, 40),
      action: ["replace", "add", "exclude_previous"].includes(change.action) ? change.action : null,
    } : null,
    flags: {
      answers_previous_question: flags.answers_previous_question === true,
      new_topic: ["none", "soft", "hard"].includes(flags.new_topic) ? flags.new_topic : "none",
      mentions_place_name: flags.mentions_place_name === true,
      food_related: flags.food_related !== false,
    },
  };
}

export function resetSlots(stateValue, kind) {
  const state = normalizeResponseState(stateValue);
  if (kind === "hard") return emptyResponseState();
  if (kind !== "soft") return state;
  return {
    ...emptyResponseState(),
    slots: {
      ...emptySlots(),
      region: state.slots.region,
      use_current_location: state.slots.use_current_location,
    },
  };
}

export function applyAnalysisToState(stateValue, analysisValue) {
  const analysis = normalizeAnalysis(analysisValue);
  if (analysis.change?.action === 'exclude_previous' || analysis.sub_intent === 'exclude_previous') {
    return normalizeResponseState(stateValue);
  }
  let state = resetSlots(stateValue, analysis.flags.new_topic);
  if (analysis.intent === "menu_trouble" && analysis.sub_intent === "narrow" && analysis.change?.slot === "menu") {
    state = { ...state, slots: { ...state.slots, menu: null, food_type: null }, lastCards: [], focus: null };
  }
  const delta = analysis.slots;
  const slots = { ...state.slots };
  if (delta.food_type && !delta.menu) slots.menu = null;
  for (const key of ["region", "food_type", "menu", "companion", "meal_time"]) {
    if (delta[key] !== null) slots[key] = delta[key];
  }
  if (delta.region && !delta.use_current_location) slots.use_current_location = false;
  if (delta.parking !== null) slots.parking = delta.parking;
  if (delta.use_current_location) slots.use_current_location = true;
  if (delta.other.length) slots.other = [...new Set([...slots.other, ...delta.other])].slice(0, 8);
  return { ...state, slots };
}

export function decideMode(analysisValue, stateValue) {
  const analysis = normalizeAnalysis(analysisValue);
  const state = normalizeResponseState(stateValue);
  let intent = analysis.intent;
  if (analysis.confidence < 0.6 && intent !== "service") intent = analysis.flags.food_related ? "menu_trouble" : "general";
  const hasRegion = Boolean(state.slots.region || state.slots.use_current_location);
  const hasFood = Boolean(state.slots.food_type || state.slots.menu);
  const hasPrev = state.lastCards.length > 0;
  const base = { questionSlot: null, showCards: false, needSearch: false, excludePlaceIds: [] };
  if (["service", "general", "out_of_scope", "food_talk"].includes(intent)) {
    return { ...base, mode: "GENERAL", variant: intent, intent };
  }
  if (intent === "specific_place") return { ...base, mode: "E", showCards: true, needSearch: true, intent };
  if (["followup", "condition_change", "compare"].includes(intent)) {
    if (intent === 'condition_change' && (!hasRegion || !hasFood)) return { ...base, mode: 'B', questionSlot: hasRegion ? 'menu' : 'region', intent };
    if (hasPrev) return {
      ...base,
      mode: "D",
      showCards: intent === 'condition_change' || analysis.change?.action === 'exclude_previous',
      needSearch: intent === 'condition_change' || analysis.change?.action === 'exclude_previous',
      excludePlaceIds: analysis.change?.action === 'exclude_previous' || analysis.sub_intent === 'exclude_previous' ? [...state.shownPlaceIds] : [],
      intent,
    };
    intent = "place_search";
  }
  if (intent === "menu_trouble") {
    if (hasRegion && hasFood) return { ...base, mode: "C", showCards: true, needSearch: true, intent };
    if (hasFood) return { ...base, mode: "B", questionSlot: "region", intent };
    return { ...base, mode: "A", intent };
  }
  if (intent === "place_search") {
    if (!hasFood && (hasRegion || state.pendingQuestionSlot === "menu" || analysis.sub_intent === "choose_menu")) return { ...base, mode: "B", questionSlot: "menu", intent };
    if (hasRegion) return { ...base, mode: "C", showCards: true, needSearch: true, intent };
    return { ...base, mode: "B", questionSlot: "region", intent };
  }
  return { ...base, mode: "GENERAL", variant: "general", intent: "general" };
}

const MENU_GROUPS = [
  { tags: ["든든", "해장", "국물", "따뜻"], values: [["국물 있는 한 그릇", "국밥", "국밥이나 찌개처럼 든든하게 속을 채워요"], ["칼칼한 면 요리", "칼국수", "따뜻한 국물과 면을 함께 즐겨요"], ["밥과 고기 한 접시", "불고기덮밥", "밥과 단백질을 한 번에 챙겨요"]] },
  { tags: ["가볍", "산뜻"], values: [["산뜻한 한 그릇", "포케", "채소와 곡물을 부담 없이 즐겨요"], ["깔끔한 면 요리", "메밀국수", "담백하고 가볍게 먹기 좋아요"], ["간단한 한 끼", "샌드위치", "빠르고 부담 적게 식사해요"]] },
  { tags: ["매운", "매콤"], values: [["얼큰한 국물", "순두부찌개", "따뜻하고 매콤하게 속을 채워요"], ["매콤한 면", "비빔국수", "새콤매콤하게 입맛을 살려요"], ["볶음 한 접시", "제육볶음", "밥과 함께 든든하게 즐겨요"]] },
  { tags: ["한식"], values: [["따뜻한 국물", "된장찌개", "밥과 함께 편안하게 먹어요"], ["든든한 고기", "불고기", "달큰한 양념과 밥이 잘 어울려요"], ["깔끔한 한 그릇", "비빔밥", "채소와 밥을 균형 있게 즐겨요"]] },
  { tags: ["중식"], values: [["국물 있는 면", "짬뽕", "얼큰한 국물로 든든하게 먹어요"], ["볶음밥 한 그릇", "볶음밥", "고슬고슬한 밥으로 편하게 먹어요"], ["바삭한 요리", "탕수육", "여럿이 나누어 먹기 좋아요"]] },
  { tags: ["일식"], values: [["깔끔한 덮밥", "가츠동", "밥과 고기를 한 그릇으로 즐겨요"], ["따뜻한 면", "우동", "부드러운 면과 국물이 편안해요"], ["담백한 한 끼", "초밥", "여러 재료를 조금씩 맛봐요"]] },
  { tags: ["양식"], values: [["부드러운 면 요리", "크림파스타", "고소하고 편안하게 즐겨요"], ["든든한 고기 요리", "스테이크", "기분 전환이 되는 한 접시예요"], ["가벼운 오븐 요리", "피자", "여럿이 나누어 먹기 좋아요"]] },
];

// Eighteen distinct directions; same-conversation proposals are never recycled.
export const MODE_A_POOL = [
  ["국밥", "따뜻한 국물", "국물과 밥으로 든든하게 먹어요", "국물", ["아침", "점심"]],
  ["냉면", "시원한 면", "산뜻한 국물이나 양념을 골라요", "찬면", ["점심"]],
  ["덮밥", "밥과 토핑", "간편하게 한 그릇으로 먹어요", "덮밥", ["아침", "점심"]],
  ["삼겹살", "고기 구이", "고기와 채소를 함께 구워 먹어요", "구이", ["저녁"]],
  ["파스타", "소스를 고르는 면", "오일·토마토·크림 중 취향을 골라요", "파스타", ["점심", "저녁"]],
  ["초밥", "여러 맛 한입씩", "서로 다른 토핑을 조금씩 맛봐요", "초밥", ["점심", "저녁"]],
  ["샌드위치", "간편한 빵 한 끼", "원하는 속재료로 가볍게 골라요", "빵", ["아침"]],
  ["포케", "채소와 곡물", "다양한 토핑을 산뜻하게 먹어요", "채소", ["아침", "점심"]],
  ["죽", "부드러운 한 그릇", "부드러운 식감으로 천천히 먹어요", "죽", ["아침"]],
  ["돈까스", "바삭한 한 접시", "바삭한 식감과 소스를 즐겨요", "튀김", ["점심"]],
  ["피자", "나눠 먹는 오븐 요리", "서로 다른 토핑을 함께 골라요", "오븐", ["저녁"]],
  ["치킨", "함께 나누는 닭요리", "구이와 양념 중 스타일을 골라요", "닭요리", ["저녁", "야식"]],
  ["떡볶이", "매콤한 분식", "떡과 소스를 취향에 맞게 골라요", "분식", ["야식"]],
  ["쌀국수", "향긋한 국물면", "향채와 토핑을 곁들여 먹어요", "국물면", ["점심"]],
  ["카레", "향신료 한 그릇", "맵기와 토핑을 골라 먹어요", "카레", ["점심"]],
  ["비빔밥", "채소와 비벼 먹는 밥", "여러 나물과 밥을 함께 즐겨요", "비빔밥", ["아침", "점심"]],
  ["전골", "함께 끓이는 한 냄비", "재료를 나누어 먹기 좋아요", "전골", ["저녁"]],
  ["만두", "속을 고르는 한 접시", "찜·구이 중 원하는 식감을 골라요", "만두", ["야식"]],
  ["제육볶음", "매콤한 고기와 밥", "매콤하게 먹고 싶을 때 골라봐요", "볶음", ["점심", "저녁"]],
  ["짬뽕", "얼큰한 국물면", "따뜻한 국물이 당길 때 골라요", "중식면", ["점심"]],
  ["볶음밥", "고슬고슬한 밥", "간편하게 한 끼 먹기 좋아요", "볶음밥", ["점심"]],
  ["탕수육", "바삭한 고기 요리", "함께 나눠 먹을 때 골라봐요", "중식튀김", ["저녁"]],
  ["김밥", "재료를 담은 한 줄", "간단하게 먹을 때 골라봐요", "김밥", ["점심"]],
  ["스테이크", "고기 한 접시", "고기 굽기를 골라 즐겨봐요", "스테이크", ["저녁"]],
  ["우동", "따뜻한 국물과 면", "부드러운 면이 당길 때 골라요", "우동", ["점심"]],
  ["갈비", "양념과 고기 구이", "양념 맛을 즐기고 싶을 때 골라요", "갈비", ["저녁"]],
  ["순두부찌개", "두부와 따뜻한 국물", "국물과 밥으로 한 끼 골라봐요", "찌개", ["점심"]],
  ["칼국수", "국물과 손칼국수 면", "따뜻한 한 그릇으로 골라요", "칼국수", ["점심"]],
  ["베이커리", "갓 구운 빵 한 끼", "빵을 골라 간단히 먹어요", "베이커리", ["아침"]],
  ["디저트", "달콤한 간식", "달콤하게 쉬어가고 싶을 때 골라요", "디저트", ["오후"]],
  ["불고기", "달큰한 양념과 고기", "밥과 함께 먹고 싶을 때 골라요", "불고기", ["점심", "저녁"]],
  ["마라탕", "얼얼한 국물 한 그릇", "재료를 골라 따뜻하게 먹어요", "마라탕", ["점심", "저녁"]],
  ["김치찌개", "김치와 따뜻한 국물", "밥과 함께 든든하게 먹어요", "김치찌개", ["점심"]],
  ...[
    ['짜장면','소스에 비벼 먹는 면'], ['군만두','바삭하게 구운 만두'], ['가츠동','고기를 올린 덮밥'], ['라멘','국물과 면 한 그릇'],
    ['리소토','소스와 익힌 쌀'], ['햄버거','빵과 패티 한 끼'], ['라자냐','겹겹이 쌓은 면 요리'],
    ['라볶이','떡과 라면 한 접시'], ['튀김','바삭한 간식 한 접시'], ['어묵','따뜻한 국물과 어묵'],
    ['곱창','구워 먹는 고기 요리'], ['목살','취향대로 굽는 고기'], ['닭갈비','양념과 닭고기 요리'],
    ['메밀국수','메밀 향을 즐기는 면'], ['비빔국수','양념에 비비는 국수'], ['곰탕','밥을 곁들이는 국물'], ['설렁탕','고기와 국물 한 그릇'],
    ['토스트','구운 빵 한 끼'], ['크로플','구운 반죽과 토핑'], ['팬케이크','부드러운 반죽 한 접시'],
  ].map(([menu,direction])=>[menu,direction,'식감과 조리법을 골라 즐겨봐요',menu === '튀김' ? '분식튀김' : menu,['점심']]),
  ...['쫄면','라면','김치볶음밥','잡채밥','마라샹궈','샐러드','베이글샌드위치','오믈렛'].map(menu=>[menu,'한 끼로 즐기는 메뉴','한 끼 메뉴로 골라봐요',menu,menu==='라면'?['점심','야식']:['점심']]),
].map(([menu, direction, reason, family, times]) => ({ menu, direction, reason, family, times, main_dish:isMainDish(menu) })).filter(item=>item.main_dish);

export function chooseModeACandidates(analysisValue, stateValue) {
  const analysis = normalizeAnalysis(analysisValue);
  const state = normalizeResponseState(stateValue);
  const context = [analysis.sub_intent, ...Object.values(state.slots).flat()].filter(Boolean).join(" ");
  const matched = MENU_GROUPS.find(group => group.tags.some(tag => context.includes(tag)));
  const pool = [...(matched?.values || []), ...MODE_A_POOL.map(item => [item.direction, item.menu, item.reason])];
  const used = new Set(state.aProposed.map(String));
  const selected = [];
  const meal = state.slots.meal_time || analysis.slots.meal_time || "";
  const category = !state.slots.menu && MENU_CATEGORIES[state.menuCategory || state.slots.food_type];
  const eligible = pool.filter(item=>isMainDish(item[1]) && (!category || category.includes(item[1])));
  const ranked = eligible.filter((item, index) => !used.has(item[1]) && eligible.findIndex(other => other[1] === item[1]) === index).map(item => {
    const entry = MODE_A_POOL.find(candidate => candidate.menu === item[1]);
    const random = new Uint32Array(1); crypto.getRandomValues(random);
    const score = (matched?.values.some(candidate => candidate[1] === item[1]) ? 10 : 0)
      + (entry?.times.includes(meal) ? 2 : 0) + random[0] / 0x100000000;
    return { direction: item[0], menu: item[1], reason: item[2], family: entry?.family || item[0], score };
  }).sort((a, b) => b.score - a.score);
  for (const item of ranked) {
    if (!selected.some(candidate => candidate.family === item.family)) selected.push(item);
    if (selected.length === 3) break;
  }
  return selected.map(({ direction, menu, reason }) => ({ direction, menu, reason }));
}

export function updateStateAfterResponse(stateValue, decision, { cards = [], aCandidates = [], noResults = false, focus = undefined } = {}) {
  const state = normalizeResponseState(stateValue);
  const normalizedCards = normalizeResponseState({ lastCards: cards }).lastCards;
  const ids = normalizedCards.map(card => card.id).filter(Boolean);
  const next = {
    ...state,
    lastMode: decision.mode,
    pendingQuestionSlot: decision.questionSlot || null,
    noResults: Boolean(noResults),
  };
  if (decision.mode === "A") {
    next.lastCards = [];
    next.aCandidates = [...aCandidates];
    next.aProposed = [...new Set([...state.aProposed, ...aCandidates])];
    next.focus = null;
  } else if (decision.showCards && !noResults) {
    next.lastCards = normalizedCards;
    next.shownPlaceIds = [...new Set([...state.shownPlaceIds, ...ids])];
    next.shownPlaces = [...state.shownPlaces, ...normalizedCards.filter(card => !state.shownPlaceIds.includes(card.id))].slice(-100);
    next.aCandidates = [];
    next.focus = null;
  }
  if (focus !== undefined) next.focus = focus;
  return next;
}

export function validateRestaurantSelection(selectedIds, candidates, excludedIds = [], limit = 3) {
  const excluded = new Set(excludedIds.map(String));
  const allowed = candidates.filter(candidate => !excluded.has(String(candidate.id)));
  const allowedIds = new Set(allowed.map(candidate => String(candidate.id)));
  const selected = [];
  for (const id of Array.isArray(selectedIds) ? selectedIds : []) {
    const normalized = String(id);
    if (allowedIds.has(normalized) && !selected.includes(normalized)) selected.push(normalized);
    if (selected.length === limit) break;
  }
  for (const candidate of allowed) {
    if (selected.length >= limit) break;
    const id = String(candidate.id);
    if (!selected.includes(id)) selected.push(id);
    if (selected.length === limit) break;
  }
  return selected.slice(0, limit);
}
