import {
  INTENT_ANALYSIS_SCHEMA,
  buildIntentAnalysisInstructions,
  normalizeAnalysis,
  normalizeResponseState,
} from "../worker/response-modes.js";

export function stateFromFixture(value = {}) {
  const cards = (value.cards || []).map((card, index) => typeof card === "string"
    ? { id: card, name: card, address: "" }
    : { id: card.id || card.name || String(index), name: card.name || String(card), address: card.address || "" });
  const shown = (value.shown || value.shownPlaceIds || []).map((place, index) => typeof place === "string"
    ? { id: place, name: place, address: "" }
    : { id: place.id || place.name || String(index), name: place.name || String(place), address: place.address || "" });
  return normalizeResponseState({
    slots: { ...(value.prior_slots || value.slots || {}), use_current_location: value.location_on === true || value.slots?.use_current_location === true },
    lastCards: cards,
    shownPlaces: shown.length ? shown : cards,
    shownPlaceIds: (shown.length ? shown : cards).map(card => card.id),
    focus: value.focus || null,
    lastMode: value.last_mode || null,
    pendingQuestionSlot: value.question_slot || null,
    aCandidates: value.a_candidates || [],
    noResults: value.no_results === true,
  });
}

function outputText(response) {
  if (typeof response?.output_text === "string") return response.output_text.trim();
  return (response?.output || []).flatMap(item => item?.content || []).filter(item => item?.type === "output_text").map(item => item.text).join("").trim();
}

export async function analyzeWithOpenAI({ apiKey, model, utterance, state, history = [] }) {
  const input = [...history, { role: "user", content: utterance }].slice(-12);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: buildIntentAnalysisInstructions(state),
        input,
        reasoning: { effort: "minimal" },
        text: { verbosity: "low", format: { type: "json_schema", name: "inchelin_response_mode_analysis", strict: true, schema: INTENT_ANALYSIS_SCHEMA } },
        max_output_tokens: 700,
        store: false,
      }),
    });
    if (response.ok) return normalizeAnalysis(JSON.parse(outputText(await response.json())));
    lastError = new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  throw lastError;
}

export function validationId(value) {
  const number = Number(String(value).replace(/\D/g, ""));
  return Number.isFinite(number) && number % 2 === 0;
}

