export const INTENTS = [
  "menu_trouble", "place_search", "followup", "condition_change", "compare",
  "specific_place", "food_talk", "service", "general", "out_of_scope",
];

export const INTENT_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
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
  required: ["intent", "sub_intent", "confidence", "slots", "reference", "change", "flags"],
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
  };
  return `너는 인슐랭가이드 AI의 1단계 의도 분석기다. 응답 문장을 만들지 말고 JSON만 출력한다.
intent는 menu_trouble, place_search, followup, condition_change, compare, specific_place, food_talk, service, general, out_of_scope 중 하나다.
우선순위: 범위 밖 → service(와인 포함) → 지역 질문에 대한 답 → 직전 카드의 후속/조건 변경/비교 → 목록 밖 특정 상호 → 강한 식당 신호 → 메뉴 고민 → 음식 지식 → 약한 지역/음식 신호 → general.
음식명만 있고 식당·지역 신호가 없으면 menu_trouble이다. '삼겹살 추천해줘'는 menu_trouble/declare다. 지역+음식이 정해졌거나 맛집·식당·가게·~집·찾아줘가 있으면 place_search다. '강남역 근처에서 뭐 먹지'는 강한 식당 신호가 없으므로 menu_trouble이다.
직전 식당 카드가 있을 때 다른 곳·별로야·더 없어는 condition_change/exclude_previous, 주차되는 곳은 add, A 후보 뒤 다른 메뉴는 menu_trouble/narrow다.
service sub_intent는 about, how_to, policy, data_basis, wine 중 하나다. followup sub_intent는 hours, parking, phone, menu_info, location, other다.
slots에는 이번 발화에서 새로 추출하거나 바꾼 값만 넣고 이전 값을 복사하지 않는다. reference는 카드 번호나 상호 참조다. flags.new_topic은 none/soft/hard다. 끼어든 service/general/food_talk/out_of_scope는 new_topic=none이다.
confidence가 낮아도 가장 가능성 높은 분류를 내고 food_related를 정확히 표시한다.
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
    noResults: false,
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
    phone: cleanString(card.phone, 80) || "",
    openingHours: cleanString(card.openingHours, 500) || "",
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
  };
}

export function normalizeAnalysis(value = {}) {
  const intent = INTENTS.includes(value.intent) ? value.intent : "general";
  const reference = value.reference && typeof value.reference === "object" ? value.reference : {};
  const change = value.change && typeof value.change === "object" ? value.change : null;
  const flags = value.flags && typeof value.flags === "object" ? value.flags : {};
  return {
    intent,
    sub_intent: cleanString(value.sub_intent, 80),
    confidence: Number.isFinite(Number(value.confidence)) ? Math.max(0, Math.min(1, Number(value.confidence))) : 1,
    slots: cleanSlots(value.slots),
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
  let state = resetSlots(stateValue, analysis.flags.new_topic);
  const delta = analysis.slots;
  const slots = { ...state.slots };
  for (const key of ["region", "food_type", "menu", "companion", "meal_time"]) {
    if (delta[key] !== null) slots[key] = delta[key];
  }
  if (delta.parking !== null) slots.parking = delta.parking;
  if (delta.use_current_location) slots.use_current_location = true;
  if (delta.other.length) slots.other = [...new Set([...slots.other, ...delta.other])].slice(0, 8);
  return { ...state, slots };
}

export function decideMode(analysisValue, stateValue) {
  const analysis = normalizeAnalysis(analysisValue);
  const state = normalizeResponseState(stateValue);
  let intent = analysis.intent;
  if (analysis.confidence < 0.6) intent = analysis.flags.food_related ? "menu_trouble" : "general";
  const hasRegion = Boolean(state.slots.region || state.slots.use_current_location);
  const hasFood = Boolean(state.slots.food_type || state.slots.menu);
  const hasPrev = state.lastCards.length > 0;
  const base = { questionSlot: null, showCards: false, needSearch: false, excludePlaceIds: [] };
  if (["service", "general", "out_of_scope", "food_talk"].includes(intent)) {
    return { ...base, mode: "GENERAL", variant: intent, intent };
  }
  if (intent === "specific_place") return { ...base, mode: "E", showCards: true, needSearch: true, intent };
  if (["followup", "condition_change", "compare"].includes(intent)) {
    if (hasPrev) return {
      ...base,
      mode: "D",
      showCards: intent === "condition_change",
      needSearch: intent === "condition_change",
      excludePlaceIds: intent === "condition_change" ? [...state.shownPlaceIds] : [],
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

const DEFAULT_MENU_SETS = [
  [["국물 있는 한 그릇", "국밥", "따뜻하고 든든하게 먹고 싶을 때 좋아요"], ["가벼운 면 요리", "냉면", "깔끔하고 부담 적게 즐겨요"], ["밥과 토핑 한 그릇", "덮밥", "빠르게 먹고 속은 든든하게 채워요"]],
  [["바삭한 한 접시", "돈까스", "식감이 좋고 든든한 한 끼예요"], ["따뜻한 면 요리", "칼국수", "부드러운 면과 국물이 편안해요"], ["채소와 밥 한 그릇", "비빔밥", "여러 재료를 균형 있게 즐겨요"]],
  [["구운 고기 한 상", "삼겹살", "든든하게 먹고 싶을 때 잘 맞아요"], ["부드러운 면 한 접시", "파스타", "편안하게 기분 전환하기 좋아요"], ["깔끔한 한입 메뉴", "초밥", "여러 맛을 조금씩 즐겨요"]],
];

export function chooseModeACandidates(analysisValue, stateValue) {
  const analysis = normalizeAnalysis(analysisValue);
  const state = normalizeResponseState(stateValue);
  const context = [analysis.sub_intent, ...Object.values(state.slots).flat()].filter(Boolean).join(" ");
  const matched = MENU_GROUPS.find(group => group.tags.some(tag => context.includes(tag)));
  const pools = matched ? [matched.values, ...DEFAULT_MENU_SETS] : DEFAULT_MENU_SETS;
  const used = new Set(state.aProposed.map(String));
  const selected = [];
  for (const pool of pools) {
    for (const item of pool) {
      if (!used.has(item[1]) && !selected.some(candidate => candidate.menu === item[1])) {
        selected.push({ direction: item[0], menu: item[1], reason: item[2] });
      }
      if (selected.length === 3) return selected;
    }
  }
  return DEFAULT_MENU_SETS.flat().slice(0, 3).map(item => ({ direction: item[0], menu: item[1], reason: item[2] }));
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
  } else if (decision.showCards) {
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
    const id = String(candidate.id);
    if (!selected.includes(id)) selected.push(id);
    if (selected.length === limit) break;
  }
  return selected;
}
