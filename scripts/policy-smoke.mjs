import assert from "node:assert/strict";
import worker from "../build/dist/server/index.js";

function request(message, history = [], context = {}) {
  return new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [...history, { role: "user", content: message }], context }),
  });
}

async function runCase({ message, env, context, dbResponse, enrichmentResponse, naverResponse, aiResponse, expectedStatus = 200 }) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, body: options.body ? JSON.parse(options.body) : null });
    if (href.includes("db.example")) return Response.json(dbResponse);
    if (href.includes("enrich.example")) return Response.json(enrichmentResponse);
    if (href.includes("openapi.naver.com")) return Response.json(naverResponse);
    if (href.includes("api.openai.com")) {
      const body = options.body ? JSON.parse(options.body) : {};
      const selectedId = body.instructions?.match(/"restaurant_id":"([^"]+)"/)?.[1];
      return Response.json({ output_text: JSON.stringify(aiResponse || { message: "검색 결과를 확인했어요.", suggestions: [], selectedRestaurantIds: selectedId ? [selectedId] : [] }) });
    }
    throw new Error(`Unexpected URL: ${href}`);
  };
  try {
    const response = await worker.fetch(request(message, [], context), env, {});
    assert.equal(response.status, expectedStatus);
    return { body: await response.json(), calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /coords=127%2C37\.5/);
    return Response.json({
      results: [{
        name: "admcode",
        region: {
          area1: { name: "서울특별시" },
          area2: { name: "강남구" },
          area3: { name: "역삼동" },
          area4: { name: "" },
        },
      }],
    });
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/api/reverse-geocode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ latitude: 37.5, longitude: 127.0 }),
    }), {
      NAVER_MAPS_API_KEY_ID: "maps-id",
      NAVER_MAPS_API_KEY: "maps-key",
    }, {});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { locationName: "서울특별시 강남구 역삼동" });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const baseEnv = {
  OPENAI_API_KEY: "test-key",
  RESTAURANT_DATA_SOURCE: "inchelin",
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
  assert.match(openaiCall.body.instructions, /"data_source":"inchelin"/);
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
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "inchelin" },
    expectedStatus: 200,
  });
  assert.match(result.body.message, /등록 매장 데이터를 연결 중/);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "강남에서 물냉면 맛집 찾아줘",
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_CLIENT_ID: "naver-id",
      NAVER_CLIENT_SECRET: "naver-secret",
    },
    naverResponse: {
      items: [{
        title: "<b>평양면옥 강남점</b>",
        roadAddress: "서울특별시 강남구 테헤란로 123",
        telephone: "02-1234-5678",
        category: "한식>냉면",
        link: "https://map.naver.com/p/entry/place/123",
        mapx: "1270000000",
        mapy: "375000000",
      }],
    },
  });
  const naverCall = result.calls.find(call => call.href.includes("openapi.naver.com"));
  assert.ok(naverCall);
  assert.equal(result.body.restaurants[0].dataSource, "naver");
  assert.equal(result.body.restaurants[0].isRegisteredInInchelin, false);
  assert.equal(result.body.restaurants[0].recommender, "");
}

{
  const result = await runCase({
    message: "강남 물냉면 맛집 찾아줘",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.match(result.body.message, /네이버 맛집 검색 연결/);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "현재 위치 근처",
    context: { currentLocationName: "서울특별시 강남구 역삼동" },
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_CLIENT_ID: "naver-id",
      NAVER_CLIENT_SECRET: "naver-secret",
    },
    naverResponse: {
      items: [{
        title: "역삼식당",
        roadAddress: "서울특별시 강남구 역삼로 1",
        telephone: "02-0000-0000",
        category: "한식",
        link: "https://map.naver.com/p/entry/place/999",
        mapx: "1270000000",
        mapy: "375000000",
      }],
    },
  });
  const naverCall = result.calls.find(call => call.href.includes("openapi.naver.com"));
  assert.ok(naverCall);
  assert.match(new URL(naverCall.href).searchParams.get("query"), /서울특별시 강남구 역삼동/);
  assert.equal(result.body.restaurants[0].name, "역삼식당");
}

{
  const result = await runCase({
    message: "현재 위치 근처",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.match(result.body.message, /임의로 추정하지 않아요/);
  assert.ok(result.body.suggestions.includes("현재 위치 근처"));
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "점심 뭐 먹지?",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    aiResponse: {
      message: "점심 메뉴 같이 골라볼까요? 가볍게, 든든하게, 매콤하게 중에서 어떤 느낌이 좋으세요?",
      suggestions: ["가볍게", "든든하게", "매콤하게", "다른 거 추천해줘"],
      selectedRestaurantIds: [],
    },
  });
  assert.equal(result.body.message, "점심 메뉴 같이 골라볼까요?");
  assert.deepEqual(result.body.suggestions, ["가볍게", "든든하게", "매콤하게", "다른 메뉴"]);
}

console.log("Inchelin data policy smoke tests passed.");
