import assert from "node:assert/strict";
import worker from "../build/dist/server/index.js";

function request(message, history = []) {
  return new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [...history, { role: "user", content: message }] }),
  });
}

async function runCase({ message, env, dbResponse, enrichmentResponse, expectedStatus = 200 }) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, body: options.body ? JSON.parse(options.body) : null });
    if (href.includes("db.example")) return Response.json(dbResponse);
    if (href.includes("enrich.example")) return Response.json(enrichmentResponse);
    if (href.includes("api.openai.com")) {
      return Response.json({ output_text: JSON.stringify({ message: "등록 매장 근거 답변", suggestions: [], selectedRestaurantIds: ["ig-1"] }) });
    }
    throw new Error(`Unexpected URL: ${href}`);
  };
  try {
    const response = await worker.fetch(request(message), env, {});
    assert.equal(response.status, expectedStatus);
    return { body: await response.json(), calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const baseEnv = {
  OPENAI_API_KEY: "test-key",
  INCHELIN_DB_API_URL: "https://db.example",
  INCHELIN_DB_API_TOKEN: "db-token",
};

{
  const result = await runCase({
    message: "OO식당 어때?",
    env: baseEnv,
    dbResponse: { places: [] },
  });
  assert.match(result.body.message, /등록되지 않은/);
  assert.equal(result.calls.filter(call => call.href.includes("enrich.example")).length, 0);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

{
  const result = await runCase({
    message: "등록식당 영업시간 알려줘",
    env: { ...baseEnv, INCHELIN_ENRICHMENT_API_URL: "https://enrich.example" },
    dbResponse: {
      places: [{ id: "ig-1", name: "등록식당", address: "강원도 춘천시 중앙로 1", business_status: "active" }],
    },
    enrichmentResponse: {
      identity_confirmed: true,
      matched_name: "등록식당",
      matched_address: "강원특별자치도 춘천시 중앙로 1",
      facts: {
        opening_hours: {
          value: "11:00-21:00",
          origin: "official",
          checked_at: "2026-09-29T05:00:00Z",
          source_url: "https://official.example/store",
          resolution_status: "confirmed",
        },
      },
    },
  });
  const openaiCall = result.calls.find(call => call.href.includes("api.openai.com"));
  assert.ok(openaiCall);
  assert.match(openaiCall.body.instructions, /inchelin_registered_only/);
  assert.match(openaiCall.body.instructions, /11:00-21:00/);
  assert.equal(result.body.restaurants[0].id, "ig-1");
  assert.equal(result.body.restaurants[0].isRegisteredInInchelin, true);
}

{
  const result = await runCase({
    message: "폐업식당 알려줘",
    env: baseEnv,
    dbResponse: {
      places: [{ id: "ig-2", name: "폐업식당", address: "서울시 중구 2", business_status: "permanently_closed" }],
    },
  });
  assert.match(result.body.message, /폐업/);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

{
  const result = await runCase({
    message: "등록식당 주차 돼?",
    env: { ...baseEnv, INCHELIN_ENRICHMENT_API_URL: "https://enrich.example" },
    dbResponse: {
      places: [{ id: "ig-3", name: "등록식당", address: "서울시 중구 3", business_status: "active" }],
    },
    enrichmentResponse: {
      identity_confirmed: true,
      matched_name: "같은이름다른지점",
      matched_address: "서울시 강남구 9",
      facts: {
        parking: { value: true, origin: "map", checked_at: "2026-09-29", resolution_status: "confirmed" },
      },
    },
  });
  assert.match(result.body.message, /주차 정보는 현재/);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

{
  const result = await runCase({
    message: "맛집 추천해줘",
    env: { OPENAI_API_KEY: "test-key" },
    expectedStatus: 200,
  });
  assert.match(result.body.message, /등록 매장 데이터를 연결 중/);
  assert.equal(result.calls.length, 0);
}

console.log("Inchelin data policy smoke tests passed.");
