import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../build/dist/server/index.js";
import { koreanParticle, withParticle } from "../worker/korean.js";
import { CATEGORY_MENUS, GAME_NOTICE, secureRandomInt, autoCandidates, spinWheel, makeLadder, resultMessage, categoryRequest, normalizeOptions, wheelLabel } from "../dist/assets/meal-tools-v2.js";
import { testMealToolsUI } from "./meal-tools-smoke.mjs";
import {
  applyAnalysisToState,
  chooseModeACandidates,
  decideMode,
  normalizeResponseState,
  resetSlots,
  updateStateAfterResponse,
  validateRestaurantSelection,
} from "../worker/response-modes.js";

function request(message, history = [], context = {}) {
  return new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [...history, { role: "user", content: message }], context }),
  });
}

async function runCase({ message, history = [], env, context, dbResponse, enrichmentResponse, naverResponse, naverStatus = 200, imageResponse, linkHtml, linkRedirect, blogResponse, webResearchResponse = "웹 검색에서 동일 매장의 메뉴판과 리뷰를 확인했습니다.", aiResponse, intentAnalysis, modeIntentAnalysis, analyzerEnabled = false, expectedStatus = 200 }) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, headers: new Headers(options.headers), body: options.body ? JSON.parse(options.body) : null });
    if (href.includes("db.example")) return Response.json(dbResponse);
    if (href.includes("enrich.example")) return Response.json(enrichmentResponse);
    if (href.startsWith("https://naver.me/") && linkRedirect) return new Response(null, { status: 302, headers: { location: linkRedirect } });
    if (href.startsWith("https://naver.me/") && linkHtml !== undefined) return new Response(linkHtml, { status: 200, headers: { "content-type": "text/html" } });
    if ((href.includes("map.naver.com/") || href.includes("place.naver.com/")) && linkHtml !== undefined) {
      return new Response(linkHtml, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (href.includes("/search/v1/blog")) return Response.json(blogResponse || { items: [] });
    if (href.includes("naverapihub.apigw.ntruss.com")) return Response.json(naverResponse, { status: naverStatus });
    if (href.includes("openapi.naver.com/v1/search/image")) return Response.json(imageResponse || { items: [] });
    if (href.endsWith("/v1/chat/completions")) {
      return Response.json({ choices: [{ message: { content: webResearchResponse } }] });
    }
    if (href.includes("api.openai.com")) {
      const body = options.body ? JSON.parse(options.body) : {};
      if (body.text?.format?.name === "inchelin_response_mode_analysis") {
        assert.ok(modeIntentAnalysis, "Live-routing regression must provide a stubbed mode analysis");
        return Response.json({ output_text: JSON.stringify(modeIntentAnalysis) });
      }
      if (body.text?.format?.name === "inchelin_intent_analysis") {
        assert.ok(intentAnalysis, "Semantic routing tests must provide intentAnalysis");
        return Response.json({ output_text: JSON.stringify(intentAnalysis) });
      }
      const selectedId = body.instructions?.match(/"restaurant_id":"([^"]+)"/)?.[1];
      return Response.json({ output_text: JSON.stringify(aiResponse || { message: "검색 결과를 확인했어요.", suggestions: [], selectedRestaurantIds: selectedId ? [selectedId] : [] }) });
    }
    throw new Error(`Unexpected URL: ${href}`);
  };
  try {
    const response = await worker.fetch(request(message, history, context), { ...env, INTENT_ANALYZER_DISABLED: analyzerEnabled ? "false" : "true" }, {});
    assert.equal(response.status, expectedStatus);
    return { body: await response.json(), calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const result = await runCase({
    message: "https://naver.me/test 해산물 빼고, 맛있는 메뉴 추천해줘",
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    linkRedirect: "https://map.naver.com/p/entry/place/12345",
    linkHtml: '<html><head><meta property="og:title" content="테스트피자 : 네이버 지도"></head><body>메뉴 마르게리타 토마토 모차렐라 고르곤졸라 치즈</body></html>',
    blogResponse: {
      items: [
        { title: "테스트피자 방문 후기", description: "마르게리타는 토마토와 치즈가 들어간 메뉴였어요.", bloggername: "방문자", link: "https://blog.naver.com/review/1" },
      ],
    },
    aiResponse: {
      message: "링크의 식당과 메뉴 정보를 확인했어요. 해산물 제외 조건에 맞는 후보예요.",
      suggestions: ["마르게리타|공식 메뉴 설명과 리뷰에서 토마토·치즈 구성으로 확인됐어요"],
      selectedRestaurantIds: [],
    },
  });
  assert.match(result.body.message, /링크의 식당/);
  assert.deepEqual(result.body.suggestions.map(item => item.split("|")[0]), ["마르게리타"]);
  assert.equal(result.calls.filter(call => call.href.startsWith("https://naver.me/")).length, 1);
  assert.equal(result.calls.filter(call => call.href.includes("/search/v1/blog")).length, 1);
  assert.equal(result.calls.filter(call => call.href.includes("/search/v1/local")).length, 0);
  const answerCall = result.calls.filter(call => call.href.includes("api.openai.com")).at(-1);
  assert.match(answerCall.body.instructions, /linked_place_research/);
  assert.match(answerCall.body.instructions, /테스트피자/);
}

{
  const result = await runCase({
    message: "https://naver.me/no-menu 이 가게에서 해산물 빼고 추천해줘",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    linkRedirect: "https://map.naver.com/p/entry/place/99999",
    linkHtml: '<html><head><meta property="og:title" content="정보부족식당 : 네이버 지도"></head><body>매장 안내</body></html>',
    aiResponse: {
      message: "웹에서 매장 메뉴와 리뷰를 추가로 확인했어요.",
      suggestions: ["마르게리타|검색된 메뉴와 리뷰에서 토마토·치즈 구성으로 확인됐어요"],
      selectedRestaurantIds: [],
    },
  });
  assert.match(result.body.message, /웹에서/);
  assert.deepEqual(result.body.suggestions.map(item => item.split("|")[0]), ["마르게리타"]);
  const searchCall = result.calls.find(call => call.href.endsWith("/v1/chat/completions"));
  assert.equal(searchCall.body.model, "gpt-5-search-api");
  assert.deepEqual(searchCall.body.web_search_options, { search_context_size: "high" });
  assert.match(searchCall.body.messages[0].content, /URL·장소 ID·매장명과 지점명을 각각 검색/);
  const webAnswerCall = result.calls.filter(call => call.href.endsWith("/v1/responses")).at(-1);
  assert.equal(webAnswerCall.body.tools, undefined);
  assert.match(webAnswerCall.body.instructions, /linked_web_research/);
  assert.match(webAnswerCall.body.instructions, /추가 검색 여부를 되묻지 말고 카드로 제시/);
}

{
  const result = await runCase({
    message: "https://naver.me/deleted 해당 링크 메뉴에서 해산물 없는 피자 알려줘",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    linkHtml: '<html><head><title>페이지를 찾을 수 없습니다.</title></head><body>페이지의 주소가 변경 혹은 삭제되어 요청하신 페이지를 찾을 수 없습니다.</body></html>',
  });
  assert.match(result.body.message, /페이지를 찾을 수 없는 링크/);
  assert.match(result.body.message, /만료·삭제/);
  assert.deepEqual(result.body.suggestions, []);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

{
  const result = await runCase({
    message: "링크 접속이 안 되는 거야?",
    history: [
      { role: "user", content: "https://naver.me/no-menu 이 가게 메뉴 추천해줘" },
      { role: "assistant", content: "매장 페이지는 확인했지만 메뉴 근거가 부족해요." },
    ],
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    linkRedirect: "https://map.naver.com/p/entry/place/99999",
    linkHtml: '<html><head><meta property="og:title" content="정보부족식당 : 네이버 지도"></head><body>매장 안내</body></html>',
  });
  assert.match(result.body.message, /링크와.*매장 페이지는 확인/);
  assert.doesNotMatch(result.body.message, /어느 지역/);
  assert.deepEqual(result.body.suggestions, []);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /map-geocode\/v2\/geocode\?query=/);
    return Response.json({
      status: "OK",
      addresses: [{
        roadAddress: "서울특별시 강남구 테헤란로 1",
        jibunAddress: "서울특별시 강남구 역삼동 1",
        x: "127.0276",
        y: "37.4979",
      }],
    });
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/api/geocode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: "서울특별시 강남구 테헤란로 1" }),
    }), {
      NAVER_MAPS_API_KEY_ID: "maps-id",
      NAVER_MAPS_API_KEY: "maps-key",
    }, {});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.longitude, 127.0276);
    assert.equal(body.latitude, 37.4979);
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

function semanticAnalysis(overrides = {}) {
  return {
    intent: "food_conversation",
    questionScope: "intermediate",
    requestedAction: "none",
    restaurantName: "",
    location: "",
    foodCategory: "",
    foodPreference: "",
    situation: "",
    mealTime: "",
    parking: null,
    distancePreference: "",
    pricePreference: "",
    openingStatus: "unknown",
    partySize: "",
    otherConditions: [],
    referencesPreviousResults: false,
    needsRestaurantSearch: false,
    needsLocation: false,
    ...overrides,
  };
}

{
  const result = await runCase({
    message: "맛집 추천하는 기준이 뭐야?",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.match(result.body.message, /지역, 음식 종류/);
  assert.deepEqual(result.body.restaurants, []);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "두 번째 식당을 추천한 이유가 뭐야?",
    context: {
      hasRestaurantResults: true,
      recentRestaurants: [
        { id: "r-1", name: "첫번째식당", address: "서울 강남구 1", recommendationReason: "한식 조건과 일치하는 곳이에요." },
        { id: "r-2", name: "두번째식당", address: "서울 강남구 2", recommendationReason: "현재 위치에서 420m 거리예요." },
      ],
    },
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.match(result.body.message, /두번째식당/);
  assert.match(result.body.message, /420m/);
  assert.deepEqual(result.body.restaurants, []);
  assert.equal(result.calls.length, 0);
}

{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /query=/);
    return Response.json({
      items: [{
        title: "<b>신주옥미 강남점</b>",
        roadAddress: "서울특별시 강남구 테헤란로10길 21 A동 1층 103호",
        address: "서울특별시 강남구 역삼동 123",
        link: "https://map.naver.com/p/entry/place/123456789",
      }],
    });
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/api/naver-place-match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restaurantName: "신주옥미 강남점",
        address: "서울특별시 강남구 테헤란로10길 21 A동 1층 103호",
      }),
    }), {
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    }, {});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.matched, true);
    assert.equal(body.naverPlaceId, "123456789");
    assert.equal(body.naverPlaceUrl, "https://map.naver.com/p/entry/place/123456789");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    items: [{
      title: "신주옥미 강남점",
      roadAddress: "서울특별시 서초구 다른로 99",
      link: "https://map.naver.com/p/entry/place/999999999",
    }],
  });
  try {
    const response = await worker.fetch(new Request("https://example.test/api/naver-place-match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restaurantName: "신주옥미 강남점", address: "서울특별시 강남구 테헤란로10길 21" }),
    }), {
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    }, {});
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.matched, false);
    assert.equal(body.code, "exact_match_not_found");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

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
  assert.match(result.body.message, /어느 지역에서 찾을까요/);
  assert.deepEqual(result.body.suggestions.map(item => item.split("|")[0]), ["현재 위치 연결", "지역 직접 입력"]);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "든든하게",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    aiResponse: { message: "한 끼 제대로 먹고 싶다면 **국밥**이나 **찌개**가 잘 맞아요.", suggestions: [], selectedRestaurantIds: [] },
  });
  assert.equal(result.body.suggestions.length, 3);
  assert.ok(result.body.suggestions.some(item => item.includes("국밥")));
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

{
  const result = await runCase({
    message: "점심 메뉴 추천해줘",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.equal(result.body.suggestions.length, 3);
  assert.match(result.body.message, /원하는 지역의 식당/);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "매콤한 저녁 메뉴 추천해줘",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    aiResponse: {
      message: "매콤하게 즐기기 좋은 저녁 메뉴로 골라봤어요.",
      suggestions: ["제육덮밥|매콤하고 든든하게 먹기 좋아요", "마파두부덮밥|부드럽고 얼얼한 맛이 잘 어울려요"],
      selectedRestaurantIds: [],
    },
  });
  assert.equal(result.body.suggestions.length, 3);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

{
  const result = await runCase({
    message: "가볍게 먹을 메뉴 뭐가 좋아?",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    aiResponse: { message: "가볍게 먹기엔 **메밀소바**가 잘 맞아요.", suggestions: [], selectedRestaurantIds: [] },
  });
  assert.equal(result.body.suggestions.length, 3);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

{
  const result = await runCase({
    message: "지금 가볍게 먹기 좋은 메뉴 있을까?",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    aiResponse: { message: "가볍게 먹기엔 **샌드위치**나 **메밀소바**가 괜찮아요.\n\n오늘은 따뜻한 쪽이 좋아요?", suggestions: [], selectedRestaurantIds: [] },
  });
  assert.ok(result.body.suggestions.some(item => /포케|메밀국수|샌드위치/.test(item)));
  assert.doesNotMatch(result.body.message, /어느 지역/);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

{
  const result = await runCase({
    message: "오늘 뭐 먹지?",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.equal(result.body.suggestions.length, 3);
  assert.doesNotMatch(result.body.message, /메뉴 추천.*맛집 추천/);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "메뉴 추천",
    history: [
      { role: "user", content: "지금 가볍게 먹기 좋은 메뉴 있을까?" },
      { role: "assistant", content: "메뉴 아이디어를 먼저 추천해드릴까요? 아니면 실제 맛집을 찾아드릴까요?" },
    ],
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    aiResponse: { message: "가볍게 먹기엔 **샐러드**나 **메밀소바**가 좋아요.", suggestions: [], selectedRestaurantIds: [] },
  });
  assert.equal(result.body.suggestions.length, 3);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

{
  const result = await runCase({
    message: "맛집 추천",
    history: [
      { role: "user", content: "지금 가볍게 먹기 좋은 메뉴 있을까?" },
      { role: "assistant", content: "메뉴 아이디어를 먼저 추천해드릴까요? 아니면 실제 맛집을 찾아드릴까요?" },
    ],
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.match(result.body.message, /어느 지역에서 찾을까요/);
  assert.deepEqual(result.body.suggestions.map(item => item.split("|")[0]), ["현재 위치 연결", "지역 직접 입력"]);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "강남에서 물냉면 맛집 찾아줘",
    context: { currentLocation: { latitude: 37.5, longitude: 127.001 } },
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
      NAVER_IMAGE_SEARCH_CLIENT_ID: "image-id",
      NAVER_IMAGE_SEARCH_CLIENT_SECRET: "image-secret",
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
    imageResponse: {
      items: [{
        title: "평양면옥 강남점 서울특별시 강남구 테헤란로",
        link: "https://images.example/pyongyang.jpg",
        thumbnail: "https://images.example/pyongyang-thumb.jpg",
      }],
    },
  });
  const naverCall = result.calls.find(call => call.href.includes("naverapihub.apigw.ntruss.com"));
  assert.ok(naverCall);
  assert.equal(naverCall.headers.get("X-NCP-APIGW-API-KEY-ID"), "naver-id");
  assert.equal(naverCall.headers.get("X-NCP-APIGW-API-KEY"), "naver-secret");
  assert.equal(result.body.restaurants[0].dataSource, "naver");
  assert.equal(result.body.restaurants[0].validationVersion, 2);
  assert.equal(result.body.restaurants[0].isRegisteredInInchelin, false);
  assert.equal(result.body.restaurants[0].recommendedBy, "");
  assert.equal(result.body.restaurants[0].imageUrl, "https://images.example/pyongyang-thumb.jpg");
  assert.equal(result.body.restaurants[0].category, "냉면");
  assert.equal(result.body.restaurants[0].longitude, 127);
  assert.equal(result.body.restaurants[0].latitude, 37.5);
  assert.ok(result.body.restaurants[0].distanceMeters > 0);
  assert.match(result.body.restaurants[0].recommendationReason, /직선거리 \d+(?:\.\d+)?[mk]/);
  assert.equal(result.body.restaurants[0].naverPlaceId, "123");
  assert.equal(result.body.restaurants[0].naverPlaceUrl, "https://map.naver.com/p/entry/place/123");
  assert.equal(new URL(naverCall.href).searchParams.get("query"), "강남 냉면");
}

{
  const result = await runCase({
    message: "강남이야",
    history: [
      { role: "user", content: "오늘 저녁 메뉴 추천해줘" },
      { role: "assistant", content: "저녁 메뉴로 골라봤어요." },
      { role: "user", content: "김치찌개" },
      { role: "assistant", content: "어느 지역에서 찾을까요?" },
    ],
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    naverResponse: {
      items: [{
        title: "시골밥상",
        category: "음식점>한식>찌개",
        address: "서울특별시 강남구 역삼동 1",
        roadAddress: "서울특별시 강남구 테헤란로 1",
        mapx: "1270276000",
        mapy: "374979000",
      }],
    },
  });
  assert.equal(result.body.restaurants.length, 1);
  assert.equal(result.body.restaurants[0].name, "시골밥상");
  assert.equal(result.body.restaurants[0].distanceMeters, null);
  assert.doesNotMatch(result.body.restaurants[0].recommendationReason, /거리|\d+\s*m/);
  assert.equal(result.body.meta.responseModeState.lastCards[0].distanceMeters, null);
  assert.equal(result.body.meta.responseModeState.shownPlaces[0].distanceMeters, null);
  assert.match(result.body.restaurants[0].naverPlaceUrl, /^https:\/\/map\.naver\.com\/p\/search\//);
  const localCall = result.calls.find(call => call.href.includes("/search/v1/local"));
  assert.match(new URL(localCall.href).searchParams.get("query"), /강남/);
  assert.match(new URL(localCall.href).searchParams.get("query"), /찌개/);
}

{
  const result = await runCase({
    message: "신림역 6번 출구 근처에서 혼자 저녁 먹을 곳 추천해줘",
    context: {
      currentLocationName: "서울특별시 관악구 신림동",
      currentLocation: { latitude: 37.4842, longitude: 126.9297 },
    },
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    naverResponse: {
      items: [
        {
          title: "신림애견카페",
          roadAddress: "서울특별시 관악구 신림로 10",
          category: "생활,편의>애견카페",
          link: "https://map.naver.com/p/entry/place/901",
          mapx: "1269298000",
          mapy: "374843000",
        },
        {
          title: "신림당구클럽",
          roadAddress: "서울특별시 관악구 신림로 11",
          category: "스포츠,오락>당구장",
          link: "https://map.naver.com/p/entry/place/902",
          mapx: "1269299000",
          mapy: "374844000",
        },
        {
          title: "신림혼밥식당",
          roadAddress: "서울특별시 관악구 신림로 12",
          category: "음식점>한식",
          link: "https://map.naver.com/p/entry/place/903",
          mapx: "1269310000",
          mapy: "374850000",
        },
        {
          title: "깨진�<상호>",
          roadAddress: "서울특별시 관악구 신림로 13",
          category: "음식점>한식",
          link: "https://map.naver.com/p/entry/place/904",
          mapx: "1269320000",
          mapy: "374851000",
        },
      ],
    },
  });
  assert.deepEqual(result.body.restaurants.map(restaurant => restaurant.name), ["신림혼밥식당"]);
  assert.equal(result.body.restaurants[0].category, "한식");
  assert.ok(result.body.restaurants[0].distanceMeters > 0);
  assert.notEqual(result.body.restaurants[0].distanceMeters, 10);
}

{
  const result = await runCase({
    message: "신림역 근처 저녁 맛집 추천해줘",
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    naverResponse: {
      items: [{
        title: "신림커피",
        roadAddress: "서울특별시 관악구 신림로 20",
        category: "음식점>카페,디저트",
        link: "https://map.naver.com/p/entry/place/905",
      }],
    },
  });
  assert.deepEqual(result.body.restaurants, []);
  assert.equal(result.body.meta.restaurantSearchStatus, "no_results");
}

{
  const result = await runCase({
    message: "신림역 근처 카페 추천해줘",
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    naverResponse: {
      items: [{
        title: "신림커피",
        roadAddress: "서울특별시 관악구 신림로 20",
        category: "음식점>카페,디저트",
        link: "https://map.naver.com/p/entry/place/905",
      }],
    },
  });
  assert.equal(result.body.restaurants[0].name, "신림커피");
  assert.equal(result.body.restaurants[0].category, "카페");
  assert.equal(result.body.restaurants[0].distanceMeters, null);
}

{
  const result = await runCase({
    message: "강남 물냉면 맛집 찾아줘",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.match(result.body.message, /인증정보가 아직 설정되지 않았어요/);
  assert.equal(result.body.meta.restaurantSearchStatus, "missing_credentials");
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "강남 물냉면 맛집 찾아줘",
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_API_HUB_CLIENT_ID: "wrong-id",
      NAVER_API_HUB_CLIENT_SECRET: "wrong-secret",
    },
    naverResponse: { errorMessage: "Authentication failed" },
    naverStatus: 401,
  });
  assert.match(result.body.message, /인증에 실패/);
  assert.equal(result.body.meta.restaurantSearchStatus, "authentication_failed");
}

{
  const result = await runCase({
    message: "강남 한식 맛집 찾아줘",
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    naverResponse: { errorMessage: "Temporary upstream error" },
    naverStatus: 500,
  });
  assert.match(result.body.message, /요청에 실패/);
  assert.equal(result.body.meta.restaurantSearchStatus, "api_request_failed");
}

{
  const result = await runCase({
    message: "강남 한식 맛집 찾아줘",
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    naverResponse: { items: [] },
  });
  assert.match(result.body.message, /찾지 못했어요/);
  assert.equal(result.body.meta.restaurantSearchStatus, "no_results");
}

{
  const result = await runCase({
    message: "신림역 주변",
    history: [
      { role: "user", content: "오늘 뭐 먹을지 같이 골라줘" },
      { role: "assistant", content: "한 끼로 먹기 좋은 곳을 찾아볼게요. 어느 지역에서 찾을까요?" },
    ],
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      INTENT_ANALYZER_DISABLED: "false",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    intentAnalysis: semanticAnalysis({
      intent: "restaurant_recommendation",
      location: "신림역 주변",
      distancePreference: "주변",
      needsRestaurantSearch: true,
    }),
    naverResponse: {
      items: [{
        title: "신림식당",
        roadAddress: "서울특별시 관악구 신림로 1",
        category: "한식",
        link: "https://map.naver.com/p/entry/place/881",
        mapx: "1269290000",
        mapy: "374840000",
      }],
    },
  });
  const naverCall = result.calls.find(call => call.href.includes("naverapihub.apigw.ntruss.com"));
  assert.equal(new URL(naverCall.href).searchParams.get("query"), "신림역 맛집");
  assert.equal(result.body.restaurants[0].name, "신림식당");
}

{
  const result = await runCase({
    message: "신림역 주변",
    history: [
      { role: "user", content: "든든하게 먹을 곳 추천해줘" },
      { role: "assistant", content: "어느 지역에서 찾을까요?" },
    ],
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      INTENT_ANALYZER_DISABLED: "false",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    intentAnalysis: semanticAnalysis({
      intent: "food_conversation",
      location: "신림역 주변",
      distancePreference: "주변",
      needsRestaurantSearch: false,
    }),
    naverResponse: { items: [] },
  });
  assert.match(result.body.message, /신림역에서 조건에 맞는 곳을 찾지 못했어요/);
  assert.equal(result.body.meta.restaurantSearchStatus, "no_results");
  assert.ok(result.calls.filter(call => call.href.includes("naverapihub.apigw.ntruss.com")).length >= 2);
}

{
  const result = await runCase({
    message: "현재 위치 근처",
    history: [
      { role: "user", content: "든든한 한 끼 원해요" },
      { role: "assistant", content: "좋아요. 어느 지역에서 찾고 계세요?" },
    ],
    context: { currentLocationName: "서울특별시 강남구 역삼동" },
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
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
  const naverCall = result.calls.find(call => call.href.includes("naverapihub.apigw.ntruss.com"));
  assert.ok(naverCall);
  assert.equal(new URL(naverCall.href).searchParams.get("query"), "역삼동 든든한 식사");
  assert.equal(result.body.restaurants[0].name, "역삼식당");
}

{
  const result = await runCase({
    message: "현재 위치 근처",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.match(result.body.message, /임의로 추정하지 않아요/);
  assert.deepEqual(result.body.suggestions.map(item => item.split("|")[0]), ["현재 위치 연결", "지역 직접 입력"]);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "강남",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.match(result.body.message, /네이버 맛집 검색 인증정보/);
  assert.equal(result.body.meta.restaurantSearchStatus, "missing_credentials");
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "강남",
    history: [
      { role: "user", content: "든든한 한 끼 원해요" },
      { role: "assistant", content: "좋아요. 어느 지역에서 찾고 계세요?" },
    ],
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    naverResponse: {
      items: [{
        title: "강남국밥",
        roadAddress: "서울특별시 강남구 강남대로 1",
        category: "음식점>한식>국밥",
        link: "https://map.naver.com/p/entry/place/111",
        mapx: "127111",
        mapy: "37111",
      }],
    },
  });
  assert.equal(result.body.restaurants[0].name, "강남국밥");
  assert.deepEqual(result.body.suggestions, ["다른 곳도 보여줘", "현재 위치 연결", "조건 바꾸기"]);
}

{
  const result = await runCase({
    message: "강남에서 오늘 점심 든든한 거 먹고 싶어",
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    naverResponse: {
      items: [{
        title: "강남점심식당",
        roadAddress: "서울특별시 강남구 강남대로 2",
        category: "음식점>한식",
        link: "https://map.naver.com/p/entry/place/222",
        mapx: "127222",
        mapy: "37222",
      }],
    },
  });
  assert.equal(result.body.restaurants[0].name, "강남점심식당");
  const naverCall = result.calls.find(call => call.href.includes("naverapihub.apigw.ntruss.com"));
  assert.match(new URL(naverCall.href).searchParams.get("query"), /^강남 든든/);
}

{
  const recentRestaurants = [
    { id: "naver:이전식당:127100:37100", name: "이전식당", address: "서울 강남구 1" },
    { id: "naver:두번째식당:127200:37200", name: "두번째식당", address: "서울 강남구 2" },
  ];
  const result = await runCase({
    message: "두 번째가 좋아",
    history: [
      { role: "user", content: "강남에서 냉면 먹고 싶어" },
      { role: "assistant", content: "강남에서 냉면 맛집을 찾아봤어요." },
    ],
    context: { hasRestaurantResults: true, recentRestaurants },
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.match(result.body.message, /두번째식당/);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
  assert.equal(result.calls.filter(call => call.href.includes("naverapihub.apigw.ntruss.com")).length, 0);
}

{
  const result = await runCase({
    message: "두 번째 괜찮은데 주차돼?",
    history: [
      { role: "user", content: "강남역 근처 한식 추천해줘" },
      { role: "assistant", content: "강남역 근처에서 한식 맛집을 찾아봤어요." },
    ],
    context: {
      hasRestaurantResults: true,
      recentRestaurants: [
        { id: "one", name: "첫번째식당", address: "서울 강남구 1", parking: null },
        { id: "two", name: "두번째식당", address: "서울 강남구 2", parking: true },
      ],
    },
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.match(result.body.message, /두번째식당/);
  assert.match(result.body.message, /주차가 가능/);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "안녕",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    aiResponse: {
      message: "점심 메뉴 같이 골라볼까요? 가볍게, 든든하게, 매콤하게 중에서 어떤 느낌이 좋으세요?",
      suggestions: ["가볍게", "든든하게", "매콤하게", "다른 거 추천해줘"],
      selectedRestaurantIds: [],
    },
  });
  assert.match(result.body.message, /오늘 메뉴 고민/);
  assert.deepEqual(result.body.suggestions, []);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

// Semantic QA: the model-provided intent/state drives routing, not exact input strings.
{
  const result = await runCase({
    message: "여기는 어떤 원칙으로 가게를 골라 보여주는 거야?",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver", INTENT_ANALYZER_DISABLED: "false" },
    intentAnalysis: semanticAnalysis({ intent: "service_explanation" }),
    aiResponse: {
      message: "**지역과 음식 종류**, 현재 확인 가능한 영업 정보와 사용자가 말한 상황을 함께 보고 있어요.",
      suggestions: [],
      selectedRestaurantIds: [],
    },
  });
  assert.match(result.body.message, /지역, 음식 종류/);
  assert.deepEqual(result.body.restaurants, []);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
  assert.equal(result.calls.filter(call => call.href.includes("naverapihub.apigw.ntruss.com")).length, 0);
}

{
  const result = await runCase({
    message: "속 편한 따뜻한 메뉴가 생각나",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver", INTENT_ANALYZER_DISABLED: "false" },
    intentAnalysis: semanticAnalysis({
      intent: "menu_recommendation",
      foodPreference: "따뜻하고 속 편한 음식",
    }),
    aiResponse: { message: "따뜻하고 부담이 적다면 **순두부찌개**나 **쌀국수**가 잘 맞아요.", suggestions: [], selectedRestaurantIds: [] },
  });
  assert.equal(result.body.suggestions.length, 3);
  assert.doesNotMatch(result.body.message, /어느 지역/);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
  assert.equal(result.calls.filter(call => call.href.includes("naverapihub.apigw.ntruss.com")).length, 0);
}

{
  const result = await runCase({
    message: "오늘 저녁 메뉴 추천해줘",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver", INTENT_ANALYZER_DISABLED: "false" },
  });
  assert.equal(result.body.suggestions.length, 3);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "회사 사람들이랑 갈 만한 곳 좀 찾아봐",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver", INTENT_ANALYZER_DISABLED: "false" },
    intentAnalysis: semanticAnalysis({
      intent: "restaurant_recommendation",
      situation: "직장 동료 회식",
      needsRestaurantSearch: true,
      needsLocation: true,
    }),
  });
  assert.match(result.body.message, /어느 지역에서 찾을까요/);
  assert.deepEqual(result.body.suggestions.map(item => item.split("|")[0]), ["현재 위치 연결", "지역 직접 입력"]);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

{
  const result = await runCase({
    message: "판교 쪽에서 팀 저녁 모임 장소 부탁해",
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      INTENT_ANALYZER_DISABLED: "false",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    intentAnalysis: semanticAnalysis({
      intent: "restaurant_recommendation",
      location: "판교",
      situation: "직장 동료 회식",
      mealTime: "저녁",
      needsRestaurantSearch: true,
    }),
    naverResponse: {
      items: [{
        title: "판교모임식당",
        roadAddress: "경기도 성남시 분당구 판교역로 1",
        category: "한식",
        link: "https://map.naver.com/p/entry/place/777",
        mapx: "1271110000",
        mapy: "374000000",
      }],
    },
  });
  const naverCall = result.calls.find(call => call.href.includes("naverapihub.apigw.ntruss.com"));
  assert.match(new URL(naverCall.href).searchParams.get("query"), /^판교 (?:팀|모임|직장 동료 회식)/);
  assert.equal(result.body.restaurants[0].name, "판교모임식당");
}

{
  const recentRestaurants = [
    { id: "one", name: "첫번째식당", address: "서울 강남구 1", recommendationReason: "한식 조건과 일치해요." },
    { id: "two", name: "두번째식당", address: "서울 강남구 2", recommendationReason: "확인된 위치에서 약 420m 거리예요." },
  ];
  const result = await runCase({
    message: "아까 두 번째를 고른 까닭은 뭐였어?",
    history: [{ role: "user", content: "강남역 근처 한식집 보여줘" }],
    context: { hasRestaurantResults: true, recentRestaurants },
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver", INTENT_ANALYZER_DISABLED: "false" },
    intentAnalysis: semanticAnalysis({
      intent: "recommendation_followup",
      requestedAction: "recommendation_reason",
      location: "강남역",
      foodCategory: "한식",
      referencesPreviousResults: true,
    }),
  });
  assert.match(result.body.message, /두번째식당/);
  assert.match(result.body.message, /420m/);
  assert.deepEqual(result.body.restaurants, []);
  assert.equal(result.calls.filter(call => call.href.includes("naverapihub.apigw.ntruss.com")).length, 0);
}

{
  const result = await runCase({
    message: "송도에서 신선한 회를 먹을 식당 찾아줘",
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      INTENT_ANALYZER_DISABLED: "false",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    intentAnalysis: semanticAnalysis({
      intent: "restaurant_recommendation",
      location: "송도",
      foodCategory: "회",
      needsRestaurantSearch: true,
    }),
    naverResponse: {
      items: [{
        title: "송도횟집",
        roadAddress: "인천광역시 연수구 송도동 1",
        category: "일식>생선회",
        link: "https://map.naver.com/p/entry/place/778",
        mapx: "1266000000",
        mapy: "374000000",
      }],
    },
  });
  const naverCall = result.calls.find(call => call.href.includes("naverapihub.apigw.ntruss.com"));
  assert.equal(new URL(naverCall.href).searchParams.get("query"), "송도 회");
  assert.doesNotMatch(new URL(naverCall.href).searchParams.get("query"), /회식/);
}

{
  const result = await runCase({
    message: "아까 조건에서 음식만 중식으로 바꿔서 다시 볼래",
    history: [
      { role: "user", content: "강남에서 한식집 찾아줘" },
      { role: "assistant", content: "강남 한식집을 찾아봤어요." },
    ],
    context: {
      hasRestaurantResults: true,
      recentRestaurants: [{ id: "old", name: "이전식당", address: "서울 강남구 1" }],
    },
    env: {
      OPENAI_API_KEY: "test-key",
      RESTAURANT_DATA_SOURCE: "naver",
      INTENT_ANALYZER_DISABLED: "false",
      NAVER_API_HUB_CLIENT_ID: "naver-id",
      NAVER_API_HUB_CLIENT_SECRET: "naver-secret",
    },
    intentAnalysis: semanticAnalysis({
      intent: "condition_change",
      location: "강남",
      foodCategory: "중식",
      referencesPreviousResults: true,
      needsRestaurantSearch: true,
    }),
    naverResponse: {
      items: [{
        title: "새한식당",
        roadAddress: "서울특별시 강남구 강남대로 3",
        category: "한식",
        link: "https://map.naver.com/p/entry/place/779",
        mapx: "1272000000",
        mapy: "375000000",
      }],
    },
  });
  const naverCall = result.calls.find(call => call.href.includes("naverapihub.apigw.ntruss.com"));
  assert.equal(new URL(naverCall.href).searchParams.get("query"), "강남 중식");
  assert.deepEqual(result.body.restaurants, [], "a Korean-category result must not fill a Chinese-food search");
}

{
  const recentRestaurants = [
    { id: "r1", name: "첫번째식당", address: "서울 강남구 1", distanceMeters: 310 },
    { id: "r2", name: "두번째식당", address: "서울 강남구 2", distanceMeters: 700 },
    { id: "r3", name: "세번째식당", address: "서울 강남구 3", distanceMeters: 480 },
  ];
  const result = await runCase({
    message: "처음 거랑 마지막 거 중 어디가 더 가까워?",
    history: [{ role: "user", content: "강남에서 점심 먹을 곳 보여줘" }],
    context: { hasRestaurantResults: true, recentRestaurants },
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver", INTENT_ANALYZER_DISABLED: "false" },
    intentAnalysis: semanticAnalysis({
      intent: "restaurant_comparison",
      requestedAction: "compare",
      location: "강남",
      referencesPreviousResults: true,
    }),
    aiResponse: { message: "확인된 거리 기준으로는 **첫 번째 식당**이 더 가까워요.", suggestions: [], selectedRestaurantIds: [] },
  });
  assert.match(result.body.message, /첫번째식당/);
  assert.deepEqual(result.body.restaurants, []);
  assert.equal(result.calls.filter(call => call.href.includes("naverapihub.apigw.ntruss.com")).length, 0);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

{
  const result = await runCase({
    message: "오늘 가볍게 뭐 먹지?",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    aiResponse: {
      message: "가볍게 먹기 좋은 비빔국수와 든든한 불고기 덮밥 중 어떤 느낌이 더 좋으세요?",
      suggestions: [
        "비빔국수|새콤달콤하고 가볍게 먹기 좋아요",
        "불고기 덮밥|든든하고 포만감 있는 한 끼예요",
      ],
      selectedRestaurantIds: [],
    },
  });
  assert.equal(result.body.suggestions.length, 3);
  assert.ok(result.body.suggestions.every(item => item.includes("|")));
  assert.doesNotMatch(result.body.message, /포케|메밀국수|샌드위치/);
}

{
  const result = await runCase({
    message: "오늘 뭐 먹을지 같이 골라줘",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.equal(result.body.suggestions.length, 3);
  assert.doesNotMatch(result.body.message, /한식|중식|일식|양식/);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "오늘 따뜻한 국물 뭐 먹지?",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    aiResponse: {
      message: "따뜻한 국물 메뉴로 골라봤어요.",
      suggestions: ["순두부찌개|부드럽고 얼큰하게 속을 채워요"],
      selectedRestaurantIds: [],
    },
  });
  assert.notDeepEqual(result.body.suggestions.map(item => item.split("|")[0]), ["한식", "중식", "일식", "양식"]);
  assert.equal(result.body.suggestions.length, 3);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

// Multiple card references must take precedence over a single-card focus.
{
  const env = { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver", NAVER_API_HUB_CLIENT_ID: "naver-id", NAVER_API_HUB_CLIENT_SECRET: "naver-secret" };
  const first = await runCase({ message: "강남역에서 냉면 먹을 곳 추천해줘", env, naverResponse: { items: [
    { title: "강남평양냉면", category: "음식점>한식>냉면", roadAddress: "서울 강남구 강남대로 1", mapx: "1270000000", mapy: "375000000" },
    { title: "강남함흥냉면", category: "음식점>한식>냉면", roadAddress: "서울 강남구 테헤란로 2", mapx: "1270001000", mapy: "375000100" },
  ] } });
  assert.equal(first.body.restaurants.length, 2);
  const state = { ...first.body.meta.responseModeState, focus: first.body.restaurants[0].id };
  for (const message of [
    "첫 번째랑 두 번째 중에 어디가 나아?", "첫 번째랑 두 번째", "1번과 2번 중에 골라줘", "어디가 나아?", "둘 중 비교해줘",
    "강남평양냉면이랑 강남함흥냉면 중에 어디가 좋아?",
  ]) {
    const result = await runCase({
      message, env, analyzerEnabled: true,
      history: [{ role: "user", content: "강남역에서 냉면 먹을 곳 추천해줘" }, { role: "assistant", content: first.body.message }],
      context: { responseModeState: state, recentRestaurants: first.body.restaurants },
      modeIntentAnalysis: { intent: "followup", sub_intent: "location", confidence: 1, slots: {}, reference: { target_index: 1 }, flags: {} },
      aiResponse: { message: "첫 번째가 더 맛있고 평점도 높고 인기가 많아요.", suggestions: [], selectedRestaurantIds: [] },
    });
    assert.equal(result.body.meta.mode, "D");
    assert.equal(result.body.meta.variant, "compare");
    for (const card of first.body.restaurants) {
      assert.ok(result.body.message.includes(card.name));
      assert.ok(result.body.message.includes(`분류: ${card.category}`));
      assert.ok(result.body.message.includes(`주소: ${card.address}`));
    }
    assert.match(result.body.message, /지금 확인되는 정보로는 우열을 가리기 어려워요/);
    assert.doesNotMatch(result.body.message, /평점|맛있|인기|직선거리|영업 여부:/);
    assert.deepEqual(result.body.restaurants, []);
    assert.deepEqual(result.body.suggestions, []);
    assert.equal(result.calls.length, 0, "compare must not analyze, generate, or search again");
  }
  const cards = [
    { id: "one", name: "첫냉면집", category: "냉면", address: "서울 강남구 역삼동 1", businessStatus: "active", openingHours: "11:00-21:00", distanceMeters: 120 },
    { id: "two", name: "둘째냉면집", category: "냉면", address: "서울 강남구 역삼동 2", businessStatus: "temporarily_closed", distanceMeters: 450 },
    { id: "three", name: "세번째식당", category: "한식", address: "서울 강남구 역삼동 3", businessStatus: "unknown", distanceMeters: 900 },
  ];
  const context = { responseModeState: { lastCards: cards, focus: "three" }, currentLocation: { latitude: 37.5, longitude: 127 } };
  const confirmed = await runCase({ message: "첫 번째랑 두 번째 중에 어디가 나아?", env, context });
  assert.match(confirmed.body.message, /직선거리: 120m/);
  assert.match(confirmed.body.message, /직선거리: 450m/);
  assert.match(confirmed.body.message, /영업 여부: 영업 중으로 확인됨/);
  assert.match(confirmed.body.message, /영업 여부: 임시 휴업으로 확인됨/);
  assert.match(confirmed.body.message, /영업시간: 11:00-21:00/);
  assert.doesNotMatch(confirmed.body.message, /세번째식당|900m/);
  const noCoords = await runCase({ message: "첫 번째랑 두 번째 비교해줘", env, context: { responseModeState: context.responseModeState } });
  assert.doesNotMatch(noCoords.body.message, /직선거리|120m|450m/);
  const single = await runCase({ message: "첫 번째 식당 주소 알려줘", env, context });
  assert.equal(single.body.meta.mode, "D");
  assert.match(single.body.message, /첫냉면집/);
  assert.doesNotMatch(single.body.message, /둘째냉면집|우열/);
}

// Unknown region names and request words must not contaminate region/menu slots.
{
  const env = { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver", NAVER_API_HUB_CLIENT_ID: "naver-id", NAVER_API_HUB_CLIENT_SECRET: "naver-secret" };
  for (const message of ["울릉도에서 마라탕 먹을 곳 찾아줘", "울릉도 근처 마라탕 추천해줘", "울릉도 주변 마라탕 알려줘"]) {
    const result = await runCase({ message, env, analyzerEnabled: true, naverResponse: { items: [] } });
    assert.equal(result.body.meta.responseModeState.slots.region, "울릉도");
    assert.equal(result.body.meta.responseModeState.slots.menu, "마라탕");
    assert.equal(result.body.message, "울릉도에서 마라탕 조건에 맞는 곳을 찾지 못했어요.");
    assert.deepEqual(result.body.suggestions, ["지역 넓히기", "메뉴 바꾸기"]);
    assert.deepEqual(result.body.restaurants, []);
    const searches = result.calls.filter(call => call.href.includes("/search/v1/local"));
    assert.equal(searches.length, 1);
    assert.equal(new URL(searches[0].href).searchParams.get("query"), "울릉도 마라탕");
    assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
  }
  const state = normalizeResponseState({ slots: { menu: "마라탕", region: "울릉도" }, pendingQuestionSlot: "region" });
  for (const message of ["찾아줘", "추천해줘", "알려줘", "먹을 곳", "갈만한"]) {
    const result = await runCase({ message, env, context: { responseModeState: { ...state, slots: { ...state.slots, region: null } } } });
    assert.equal(result.body.meta.responseModeState.slots.region, null);
    assert.equal(result.calls.length, 0);
  }
  const invalidModelRegion = await runCase({ message: "갈 만한 곳 알려줘", env, analyzerEnabled: true, context: { responseModeState: { ...state, slots: { ...state.slots, region: null } } }, modeIntentAnalysis: { intent: "place_search", confidence: 1, slots: { region: "찾아줘", menu: "마라탕" }, flags: {}, reference: {} } });
  assert.equal(invalidModelRegion.body.meta.responseModeState.slots.region, null);
  assert.equal(invalidModelRegion.body.meta.mode, "B");
  const wider = await runCase({ message: "지역 넓히기", env, context: { responseModeState: state } });
  assert.equal(wider.body.meta.responseModeState.slots.menu, "마라탕");
  assert.equal(wider.body.meta.responseModeState.pendingQuestionSlot, "region");
  const menuChange = await runCase({ message: "메뉴 바꾸기", env, context: { responseModeState: state } });
  assert.equal(menuChange.body.meta.responseModeState.slots.region, "울릉도");
  assert.equal(menuChange.body.meta.mode, "A");
  assert.equal(menuChange.body.suggestions.length, 3);
}

{
  const previous = normalizeResponseState({ slots: { region: "역삼", menu: "삼겹살", food_type: "한식", companion: "가족", meal_time: "저녁", use_current_location: true, parking: true, other: ["조용"] }, lastCards: [{ id: "old", name: "이전식당" }], shownPlaceIds: ["old"], shownPlaces: [{ id: "old", name: "이전식당" }], focus: "old", pendingQuestionSlot: "region" });
  for (const message of ["처음부터 다시 할게", "처음부터 다시 시작할래", "초기화해줘"]) {
    const result = await runCase({ message, analyzerEnabled: true, env: {}, context: { responseModeState: previous, recentRestaurants: previous.lastCards, currentLocationName: "역삼", currentLocation: { latitude: 37.5, longitude: 127 } } });
    assert.equal(result.body.message, "좋아요, 처음부터 다시 시작할게요. 오늘은 어떤 메뉴나 분위기가 끌리세요?");
    assert.equal(result.body.meta.variant, "hard_reset");
    assert.equal(result.body.meta.mode, "GENERAL");
    assert.deepEqual(result.body.meta.responseModeState, normalizeResponseState({}));
    assert.deepEqual(result.body.suggestions, []);
    assert.deepEqual(result.body.restaurants, []);
    assert.doesNotMatch(result.body.message, /지역|위치/);
    assert.equal(result.calls.length, 0);
    const after = await runCase({ message: "삼겹살 먹고 싶어", env: { OPENAI_API_KEY: "test-key" }, context: { responseModeState: result.body.meta.responseModeState, recentRestaurants: previous.lastCards } });
    assert.equal(after.body.meta.mode, "B");
    assert.equal(after.body.meta.responseModeState.slots.region, null);
    assert.deepEqual(after.body.meta.responseModeState.lastCards, [], "old cards must not rehydrate after a reset");
  }
  const soft = await runCase({ message: "이번엔 점심 뭐 먹지?", env: { OPENAI_API_KEY: "test-key" }, context: { responseModeState: previous } });
  assert.equal(soft.body.meta.mode, "A");
  assert.equal(soft.body.suggestions.length, 3);
  assert.equal(soft.body.meta.responseModeState.slots.region, "역삼");
  assert.equal(soft.body.meta.responseModeState.slots.menu, null);
}

// Stateful reproduction: menu -> typed region -> alternate restaurants.
{
  const env = { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver", NAVER_API_HUB_CLIENT_ID: "naver-id", NAVER_API_HUB_CLIENT_SECRET: "naver-secret" };
  const makePlace = (title, category, number) => ({ title, category, roadAddress: `서울 강남구 역삼동 ${number}`, mapx: String(1270000000 + number), mapy: String(375000000 + number) });
  const firstItems = [makePlace("역삼돼지구이", "한식>돼지고기구이", 1), makePlace("역삼삼겹살", "한식>삼겹살", 2), makePlace("역삼고깃집", "한식>육류", 3)];
  const first = await runCase({ message: "삼겹살 먹고 싶어", env });
  assert.equal(first.body.meta.mode, "B");
  const history = [{ role: "user", content: "삼겹살 먹고 싶어" }, { role: "assistant", content: first.body.message }];
  const second = await runCase({ message: "역삼", history, context: { responseModeState: first.body.meta.responseModeState }, env, naverResponse: { items: firstItems } });
  assert.equal(second.body.restaurants.length, 3);
  assert.equal(second.body.meta.responseModeState.slots.menu, "삼겹살");
  assert.equal(second.body.meta.responseModeState.slots.region, "역삼");
  assert.deepEqual(second.body.suggestions, ["다른 곳도 보여줘", "현재 위치 연결", "조건 바꾸기"]);
  history.push({ role: "user", content: "역삼" }, { role: "assistant", content: second.body.message });
  const newItem = makePlace("역삼새돼지구이", "한식>돼지고기구이", 7);
  const third = await runCase({
    message: "다른 곳도 보여줘", history, analyzerEnabled: true,
    context: { responseModeState: second.body.meta.responseModeState, recentRestaurants: second.body.restaurants }, env,
    naverResponse: { items: [firstItems[0], makePlace("오몬자", "음식점>일식", 4), makePlace("효뜨", "음식점>아시아음식", 5), makePlace("도래집", "음식점>한식", 6), newItem] },
    aiResponse: { message: "바로 갈 수 있는 근처 삼겹살집 다른 3곳이에요. (제안 이유는 카드에만 있어요.)", suggestions: ["다른 맛집"], selectedRestaurantIds: ["outside"] },
  });
  assert.equal(third.body.meta.mode, "D");
  assert.equal(third.body.restaurants.length, 1, "do not pad with unrelated food categories");
  assert.equal(third.body.restaurants[0].name, "역삼새돼지구이");
  assert.deepEqual(third.body.meta.responseModeState.slots, second.body.meta.responseModeState.slots);
  assert.ok(third.body.restaurants.every(card => !second.body.restaurants.some(old => old.id === card.id)));
  assert.match(third.body.message, /역삼 지역에서 삼겹살.*1곳/);
  assert.match(third.body.message, /조건에 맞는 곳은 여기까지예요\. 지역이나 메뉴를 바꿔볼까요\?/);
  assert.doesNotMatch(third.body.message, /제안 이유|근처|바로 갈 수 있는|3곳/);
  for (const card of third.body.restaurants) {
    assert.equal(card.distanceMeters, null);
    assert.doesNotMatch(card.recommendationReason, /영업|거리/);
    assert.ok(!card.recommendationReason.includes(card.address));
  }
  const searchCalls = third.calls.filter(call => call.href.includes("/search/v1/local"));
  assert.equal(searchCalls.length, 1);
  assert.equal(new URL(searchCalls[0].href).searchParams.get("query"), "역삼 삼겹살");
  assert.equal(third.calls.filter(call => call.body?.text?.format?.name === "inchelin_response_mode_analysis").length, 0);
  const fourth = await runCase({
    message: "다른 곳도 보여줘", history,
    context: { responseModeState: third.body.meta.responseModeState, recentRestaurants: third.body.restaurants }, env,
    naverResponse: { items: [...firstItems, newItem, makePlace("도래집", "음식점>한식", 6)] },
  });
  assert.deepEqual(fourth.body.restaurants, []);
  assert.equal(fourth.body.message, "조건에 맞는 곳은 여기까지예요. 지역이나 메뉴를 바꿔볼까요?");
  assert.deepEqual(fourth.body.meta.responseModeState.slots, second.body.meta.responseModeState.slots);
  assert.deepEqual(fourth.body.meta.responseModeState.lastCards, third.body.meta.responseModeState.lastCards);
  assert.equal(fourth.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
  const preserve = applyAnalysisToState(second.body.meta.responseModeState, { intent: "condition_change", sub_intent: "exclude_previous", change: { action: "exclude_previous" }, slots: { region: "홍대", food_type: "일식", menu: "초밥" }, flags: { new_topic: "hard" } });
  assert.deepEqual(preserve.slots, second.body.meta.responseModeState.slots, "exclude_previous must not accept hallucinated slot replacement/reset");
}

{
  const cards = [
    { id: "first", name: "첫집", address: "서울 역삼동 1", parking: true, distanceMeters: 300 },
    { id: "second", name: "둘째집", address: "서울 역삼동 2", parking: false, distanceMeters: 100 },
    { id: "last", name: "마지막집", address: "서울 역삼동 3", parking: false, distanceMeters: 200 },
  ];
  const state = { lastMode: "C", lastCards: cards, focus: "last", slots: { region: "역삼", menu: "삼겹살" } };
  for (const [message, expectedName, expectedId] of [["처음 거기 주차돼?", "첫집", "first"], ["첫 번째 거기 주차돼?", "첫집", "first"], ["두 번째 거기 주차돼?", "둘째집", "second"], ["세 번째 거기 주차돼?", "마지막집", "last"]]) {
    const result = await runCase({ message, analyzerEnabled: true, context: { responseModeState: state }, env: { OPENAI_API_KEY: "test-key" } });
    assert.ok(result.body.message.includes(expectedName));
    assert.equal(result.body.meta.responseModeState.focus, expectedId);
    assert.deepEqual(result.body.restaurants, []);
    assert.equal(result.calls.length, 0, "ordinal references must override model/focus guesses");
  }
  const nearest = await runCase({ message: "가까운 순으로", context: { responseModeState: state, recentRestaurants: cards, currentLocation: { latitude: 37.5, longitude: 127 } }, env: { OPENAI_API_KEY: "test-key" } });
  assert.deepEqual(nearest.body.restaurants.map(card => card.id), ["second", "last", "first"]);
  assert.deepEqual(nearest.body.suggestions, ["다른 곳도 보여줘", "가까운 순으로", "조건 바꾸기"]);
  assert.equal(nearest.calls.length, 0);
  const noCoords = await runCase({ message: "가까운 순으로", context: { responseModeState: state }, env: { OPENAI_API_KEY: "test-key" } });
  assert.deepEqual(noCoords.body.restaurants, []);
  assert.ok(noCoords.body.suggestions.some(item => /위치|주변/.test(item)));
  const change = await runCase({ message: "조건 바꾸기", context: { responseModeState: state }, env: { OPENAI_API_KEY: "test-key" } });
  assert.match(change.body.message, /어떤 조건/);
  assert.deepEqual(change.body.restaurants, []);
  assert.equal(change.calls.length, 0);
}

// FAQ grounding: three representative questions for each service sub-intent.
const serviceFaq = JSON.parse(await readFile(new URL("../data/service-faq.json", import.meta.url), "utf8"));
const previousCards = [{ id: "old", name: "이전고깃집", address: "서울 강남구 테헤란로 1", category: "고깃집" }];
{
  const decision = decideMode({ intent: "service", confidence: 0.4, flags: { food_related: true } }, { lastCards: previousCards, slots: { region: "강남", menu: "삼겹살" } });
  assert.equal(decision.mode, "GENERAL");
  assert.equal(decision.showCards, false);
  assert.equal(decision.needSearch, false);
}
for (const message of ["등록 안 된 식당도 나와?", "등록 안 된 곳도 추천해?", "추천은 어떤 기준으로 해?"]) {
  const faq = serviceFaq.items.find(item => item.examples.includes(message));
  const result = await runCase({
    message,
    analyzerEnabled: true,
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    history: [{ role: "user", content: "https://naver.me/previous 강남 삼겹살집 찾아줘" }, { role: "assistant", content: "식당 세 곳을 찾았어요." }],
    context: { recentRestaurants: previousCards, hasRestaurantResults: true, responseModeState: { lastMode: "C", lastCards: previousCards, slots: { region: "강남", menu: "삼겹살" } } },
    aiResponse: { message: "다른 출처 포함 여부는 확인해볼게요", suggestions: [], selectedRestaurantIds: ["old"] },
  });
  assert.equal(result.body.message, faq.answer.naver, "service answer must equal FAQ text verbatim");
  assert.equal(result.body.meta.mode, "GENERAL");
  assert.equal(result.body.meta.variant, "service");
  assert.deepEqual(result.body.restaurants, []);
  assert.deepEqual(result.body.suggestions, []);
  assert.equal(result.calls.length, 0, "known service questions must bypass AI, research and restaurant search");
}

// The live analyzer is enabled here, but its response is stubbed locally.
{
  const result = await runCase({
    message: "마스코트 제작자는 누구인가요?",
    analyzerEnabled: true,
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    context: { recentRestaurants: previousCards, responseModeState: { lastCards: previousCards } },
    modeIntentAnalysis: { intent: "service", sub_intent: "about", confidence: 1, flags: {}, slots: {}, reference: {} },
    aiResponse: { message: "다른 출처 포함 여부는 확인해볼게요", suggestions: [], selectedRestaurantIds: ["old"] },
  });
  assert.equal(result.body.message, serviceFaq.fallback_answer);
  assert.equal(result.body.meta.mode, "GENERAL");
  assert.deepEqual(result.body.restaurants, []);
  assert.equal(result.calls.length, 1, "model-classified service may analyze but must never generate an answer");
  assert.equal(result.calls[0].body.text.format.name, "inchelin_response_mode_analysis");
}

for (const [word, expected] of [
  ["국밥", ["이", "을", "은", "으로", "과"]],
  ["파스타", ["가", "를", "는", "로", "와"]],
  ["삼겹살", ["이", "을", "은", "로", "과"]],
  ["**삼겹살**", ["이", "을", "은", "로", "과"]],
  ["국밥 ", ["이", "을", "은", "으로", "과"]],
  ["삼겹살".normalize("NFD"), ["이", "을", "은", "로", "과"]],
]) {
  assert.deepEqual(["이/가", "을/를", "은/는", "으로/로", "과/와"].map(pair => koreanParticle(word, pair)), expected);
}
assert.equal(withParticle("삼겹살", "으로/로"), "삼겹살로");
assert.equal(withParticle("국밥", "으로/로"), "국밥으로");
assert.equal(withParticle("피자", "을/를"), "피자를");

{
  const result = await runCase({
    message: "강남 고깃집 추천해줘",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver", NAVER_API_HUB_CLIENT_ID: "naver-id", NAVER_API_HUB_CLIENT_SECRET: "naver-secret" },
    naverResponse: { items: [
      { title: "테헤란고기", category: "음식점>한식>고깃집", roadAddress: "서울 강남구 테헤란로 10", mapx: "1270276000", mapy: "374979000" },
      { title: "논현고기", category: "음식점>한식>고깃집", roadAddress: "서울 강남구 논현로 20", mapx: "1270277000", mapy: "374979100" },
      { title: "역삼고기", category: "음식점>한식>고깃집", roadAddress: "서울 강남구 역삼로 30", mapx: "1270278000", mapy: "374979200" },
    ] },
  });
  assert.equal(result.body.restaurants.length, 3);
  assert.equal(new Set(result.body.restaurants.map(card => card.recommendationReason)).size, 3);
  for (const card of result.body.restaurants) {
    assert.match(card.recommendationReason, /강남 지역 조건과 일치/);
    assert.ok(!card.recommendationReason.includes(card.address));
    assert.doesNotMatch(card.recommendationReason, /영업 여부는 확인되지 않았어요/);
    assert.doesNotMatch(card.recommendationReason, /거리|\d+(?:\.\d+)?\s*(?:m|km)\b|인기|평점|분위기|현재 영업 중/);
    assert.equal(card.distanceMeters, null);
  }
}

for (const message of ["삼겹살 먹고 싶어", "파스타 먹고 싶어", "한식 먹고 싶어", "피자 먹고 싶어"]) {
  const result = await runCase({ message, env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" } });
  assert.equal(result.body.meta.mode, "B");
  const menuAnswer = result.body.message.split("\n\n")[0];
  assert.ok(menuAnswer.split(/[.!]/).filter(sentence => sentence.trim()).length >= 2);
  assert.ok(menuAnswer.split(/[.!]/).filter(sentence => sentence.trim()).length <= 4);
  assert.match(menuAnswer, /곁들|마무리/);
  if (message.includes("삼겹살")) {
    assert.match(menuAnswer, /삼겹살\*\*로/);
    assert.doesNotMatch(menuAnswer, /삼겹살\*\*으로/);
    assert.match(menuAnswer, /두툼|얇게/);
    assert.match(menuAnswer, /된장찌개|냉면/);
  }
  assert.equal((result.body.message.match(/\?/g) || []).length, 1);
  assert.match(result.body.message, /어느 지역/);
  assert.match(result.body.message, /현재 위치/);
  assert.equal(result.body.meta.responseModeState.pendingQuestionSlot, "region");
  assert.deepEqual(result.body.restaurants, []);
  assert.equal(result.calls.length, 0);
}

for (const [message, expected] of [
  ["등록 안 된 식당도 나와?", /등록 식당만 보여주는 것이 아니라 네이버 검색/],
  ["인슐랭가이드에 등록된 곳만 추천해?", /전환 중/],
  ["추천은 어떤 기준으로 해?", /조건의 일치와 영업 정보 검증 여부/],
  ["식당 정보는 어떻게 검증해?", /상호명·주소·음식점 분류/],
  ["추천 카드는 왜 3개야?", /최대 3곳/],
  ["거리는 어떻게 계산해?", /직선거리/],
  ["거리순 추천이야?", /지역을 글로만 입력하거나 좌표가 없으면 거리 문구를 표시하지/],
]) {
  const result = await runCase({ message, env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" } });
  assert.equal(result.body.meta.mode, "GENERAL");
  assert.match(result.body.message, expected);
  assert.doesNotMatch(result.body.message, /정확히 안내드리기 어려워요|평점순|인기순/);
  assert.deepEqual(result.body.restaurants, []);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({ message: "등록 안 된 식당도 나와?", env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "inchelin" } });
  assert.match(result.body.message, /등록된 식당만 추천/);
  assert.doesNotMatch(result.body.message, /현재 베타/);
}

{
  const state = normalizeResponseState({ lastCards: [null, undefined, "", 0, 123].map((distanceMeters, index) => ({ id: String(index), distanceMeters })) });
  assert.deepEqual(state.lastCards.map(card => card.distanceMeters), [null, null, null, 0, 123]);
}

for (const [message, expected] of [
  ["인슐랭가이드가 뭐야?", /대화형 AI 맛집 가이드/],
  ["너 AI야?", /AI가 대화를 이해/],
  ["누가 만들었어?", /정확히 안내드리기 어려워요/],
  ["대화 삭제는 어떻게 해?", /점 세 개/],
  ["공유 링크는 어떻게 만들어?", /공유하기/],
  ["지난 대화는 어디서 봐?", /최근 대화/],
  ["로그인해야 돼?", /로그인하지 않아도/],
  ["위치 정보는 왜 필요해?", /가까운 음식점/],
  ["모바일에서도 돼?", /모바일 화면/],
  ["추천은 어떤 기준으로 해?", /지역, 음식 종류/],
  ["등록 안 된 식당도 나와?", /네이버 검색/],
  ["추천 카드는 왜 3개야?", /최대 3곳/],
  ["와인 추천해줘", /^와인 추천은 준비 중이에요\.$/],
  ["삼겹살에 어울리는 와인 알려줘", /^와인 추천은 준비 중이에요\.$/],
  ["와인 특강도 있어?", /^와인 추천은 준비 중이에요\.$/],
]) {
  const result = await runCase({ message, env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" } });
  assert.match(result.body.message, expected, `FAQ mismatch: ${message}`);
  assert.deepEqual(result.body.restaurants, []);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 0);
}

// Response mode V2: all 500 golden rows must resolve to the expected mode without an AI call.
const intentRows = (await readFile(new URL("../data/intent-eval-500.jsonl", import.meta.url), "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
for (const row of intentRows) {
  const context = row.context || {};
  const cards = (context.cards || []).map((card, index) => typeof card === "string"
    ? { id: card, name: card, address: "" }
    : { id: card.id || card.name || String(index), name: card.name || String(card), address: card.address || "" });
  let state = normalizeResponseState({
    slots: { ...(context.prior_slots || {}), use_current_location: context.location_on === true },
    lastCards: cards,
    shownPlaces: cards,
    shownPlaceIds: cards.map(card => card.id),
    aCandidates: context.a_candidates || [],
    lastMode: context.last_mode || null,
    pendingQuestionSlot: context.question_slot || null,
    noResults: context.no_results === true,
  });
  const expected = row.expected;
  const analysis = {
    intent: expected.intent,
    sub_intent: expected.sub_intent,
    confidence: 1,
    slots: {
      region: expected.slots?.region ?? null,
      use_current_location: expected.slots?.use_current_location === true,
      food_type: expected.slots?.food_type ?? null,
      menu: expected.slots?.menu ?? null,
      companion: expected.slots?.companion ?? null,
      meal_time: expected.slots?.meal_time ?? null,
      parking: expected.slots?.parking ?? null,
      other: Array.isArray(expected.slots?.other) ? expected.slots.other : [],
    },
    reference: expected.reference || {},
    change: expected.change || null,
    flags: { answers_previous_question: false, new_topic: "none", food_related: true },
  };
  state = applyAnalysisToState(state, analysis);
  assert.equal(decideMode(analysis, state).mode, expected.mode, `golden mode mismatch: ${row.id} ${row.utterance}`);
}

{
  const prior = normalizeResponseState({
    slots: { region: "강남역", menu: "한식", companion: "가족", meal_time: "점심", parking: true, other: ["조용"] },
    lastCards: [{ id: "old", name: "이전식당" }], shownPlaceIds: ["old"], focus: "old",
  });
  const soft = resetSlots(prior, "soft");
  assert.equal(soft.slots.region, "강남역");
  assert.equal(soft.slots.menu, null);
  assert.deepEqual(soft.lastCards, []);
  const hard = resetSlots(prior, "hard");
  assert.equal(hard.slots.region, null);
  assert.deepEqual(hard.shownPlaceIds, []);
}

{
  let state = normalizeResponseState({});
  const analysis = { intent: "menu_trouble", sub_intent: "open", confidence: 1, slots: {}, reference: {}, flags: { food_related: true } };
  const all = [];
  for (let round = 0; round < 3; round += 1) {
    const candidates = chooseModeACandidates(analysis, state);
    assert.equal(candidates.length, 3);
    all.push(...candidates.map(item => item.menu));
    state = updateStateAfterResponse(state, { mode: "A", questionSlot: null, showCards: false }, { aCandidates: candidates.map(item => item.menu) });
  }
  assert.equal(new Set(all).size, 9, "three Mode A rounds must not repeat menu candidates");
}

{
  const candidates = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(validateRestaurantSelection(["outside", "c", "a", "d"], candidates, ["a"], 3), ["c", "d", "b"]);
  const compare = decideMode({ intent: "compare", confidence: 1, slots: {}, flags: {} }, normalizeResponseState({ lastCards: [{ id: "a", name: "A" }, { id: "b", name: "B" }] }));
  assert.equal(compare.mode, "D");
  assert.equal(compare.needSearch, false);
}

const indexHtml = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
// Plugin layout groups only the existing six entries, then the two existing games.
{
  const definitions = indexHtml.slice(indexHtml.indexOf("    const PLUGINS ="), indexHtml.indexOf("    const GUIDES ="));
  const renderSource = indexHtml.match(/    function renderPlugins\(\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(renderSource);
  const nodes = { '#pluginSearch': { value: '' }, '#pluginCount': {}, '#pluginGrid': {} };
  const panel = new Function('$', 'pinned', `${definitions}\nlet activeFilter = 'all';\n${renderSource}\nreturn { plugins: PLUGINS, sections: PLUGIN_SECTIONS, render(filter, term = '') { activeFilter = filter; $('#pluginSearch').value = term; renderPlugins(); return $('#pluginGrid').innerHTML; } };`)(selector => nodes[selector], [1]);
  assert.deepEqual(panel.plugins.map(p => p.name), ['메뉴 탐색', '상황별 추천', '지역별 찾기', '등록 맛집 비교', '맛집 검색 데이터', '최신 매장 정보']);
  assert.deepEqual(panel.plugins.map(p => p.id), [1, 2, 3, 4, 5, 6], 'preserve existing pin identities');
  assert.deepEqual(panel.sections.map(section => section.title), ['탐색', '추천·비교', '데이터', '재미']);
  const html = panel.render('all');
  const sections = [...html.matchAll(/data-plugin-section="([^"]+)"[\s\S]*?<\/section>/g)];
  assert.deepEqual(sections.map(section => section[1]), ['explore', 'recommend', 'data', 'fun']);
  for (const [index, names] of [['메뉴 탐색', '지역별 찾기'], ['상황별 추천', '등록 맛집 비교'], ['맛집 검색 데이터', '최신 매장 정보']].entries()) {
    for (const name of names) assert.ok(sections[index][0].includes(name));
    assert.equal((sections[index][0].match(/data-plugin="/g) || []).length, 2);
  }
  assert.ok(sections.at(-1)[0].includes('data-meal-tool="wheel"'));
  assert.ok(sections.at(-1)[0].includes('data-meal-tool="ladder"'));
  assert.equal((html.match(/data-plugin="/g) || []).length, 6);
  assert.equal((html.match(/data-meal-tool="/g) || []).length, 2);
  assert.equal(nodes['#pluginCount'].textContent, '8개 항목');
  for (const type of ['explore', 'recommend', 'data', 'fun']) {
    const filtered = panel.render(type);
    assert.deepEqual([...filtered.matchAll(/data-plugin-section="([^"]+)"/g)].map(match => match[1]), [type]);
  }
  const searched = panel.render('all', '돌림판');
  assert.ok(searched.includes('data-meal-tool="wheel"'));
  assert.ok(!searched.includes('data-meal-tool="ladder"'));
  assert.match(panel.render('all', '없는 항목'), /검색 결과가 없어요/);
  const taskMenu = indexHtml.match(/<div class="task-menu" id="taskMenu"[\s\S]*?<\/div>/)?.[0];
  assert.ok(taskMenu);
  assert.equal((taskMenu.match(/<button/g) || []).length, 3);
  for (const label of ['카테고리로 찾기', '사진 업로드', '플러그인']) assert.ok(taskMenu.includes(label));
  assert.doesNotMatch(taskMenu, /돌림판|사다리게임/);
  const filters = indexHtml.match(/id="pluginFilters"[\s\S]*?<\/div>/)?.[0];
  assert.deepEqual([...filters.matchAll(/data-filter="([^"]+)"/g)].map(match => match[1]), ['all', 'explore', 'recommend', 'data', 'fun']);
  assert.match(indexHtml, /onOpen: \(\) => \{ closeOverlay\('pluginOverlay'\)/);
}
// Browser-only menu tools: no network calls or external dependencies.
{
  testMealToolsUI();
  assert.deepEqual(CATEGORY_MENUS.map(item => item.name), ["한식", "중식", "일식", "양식", "분식", "고기·구이", "면", "국밥·찌개"]);
  for (const menu of new Set(CATEGORY_MENUS.flatMap(item => item.menus))) {
    const request = categoryRequest(menu);
    assert.equal(request.freshMenu, true);
    const result = await runCase({ message: request.message, env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" }, context: { responseModeState: { slots: {}, lastCards: [] } } });
    assert.equal(result.body.meta.mode, "B", `${menu} must enter the existing region-question flow`);
    assert.match(result.body.message, /어느 지역/);
    assert.equal(result.calls.length, 0);
  }
  assert.throws(() => categoryRequest("지원하지 않는 메뉴"));
  assert.deepEqual(autoCandidates([{ role: "assistant", meta: { mode: "A", responseModeState: { aCandidates: ["국밥", "냉면", "피자"] } } }]), ["국밥", "냉면", "피자"]);
  assert.deepEqual(autoCandidates([{ role: "assistant", meta: { mode: "A", responseModeState: { aCandidates: ["국밥"] } } }, { role: "assistant", restaurants: [{ name: "첫식당" }, { name: "둘째식당" }] }]), ["첫식당", "둘째식당"]);
  assert.deepEqual(autoCandidates([{ role: "assistant", restaurants: [{ name: "이전식당" }] }, { role: "assistant", meta: { variant: "hard_reset" } }]), []);
  assert.equal(normalizeOptions(Array(10).fill("메뉴")).length, 8);
  assert.deepEqual(normalizeOptions([" 냉면 ", "", "   ", "국밥"]), ["냉면", "국밥"]);
  let calls = 0;
  const value = secureRandomInt(3, { getRandomValues(array) { array[0] = calls++ === 0 ? 0xffffffff : 5; return array; } });
  assert.equal(value, 2);
  assert.equal(calls, 2, "random selection must reject modulo-biased samples");
  assert.throws(() => secureRandomInt(0));
  for (const count of [2, 8]) {
    const options = Array.from({ length: count }, (_, index) => `메뉴${index}`);
    assert.equal(spinWheel(options, () => 0).value, options[0]);
    assert.equal(spinWheel(options, limit => limit - 1).value, options.at(-1));
  }
  assert.throws(() => spinWheel(["국밥"]));
  assert.throws(() => spinWheel(Array(9).fill("국밥")));
  assert.throws(() => spinWheel(["국밥", ""]));
  for (let count = 2; count <= 8; count += 1) {
    let step = count;
    const menus = Array.from({ length: count }, (_, index) => `메뉴${index}`);
    const ladder = makeLadder(count, menus, limit => step++ % limit);
    assert.equal(new Set(ladder.paths.map(path => path.destination)).size, count, "ladder assignments must form a permutation");
    for (const bridges of ladder.rows) assert.ok(bridges.every((column, i) => i === 0 || column - bridges[i - 1] > 1), "adjacent ladder bridges must not overlap");
    for (const path of ladder.paths) {
      assert.equal(path.menu, menus[path.destination]);
      assert.equal(path.points.at(-1).column, path.destination);
      assert.ok(path.points.every(point => point.column >= 0 && point.column < count));
    }
  }
  assert.throws(() => makeLadder(1, ["냉면"]));
  assert.throws(() => makeLadder(9, Array(9).fill("냉면")));
  assert.throws(() => makeLadder(2, ["냉면", ""]));
  assert.equal(resultMessage("wheel", "냉면"), `돌림판 결과: 냉면\n${GAME_NOTICE}`);
  assert.equal(resultMessage("ladder", "국밥", 2), `사다리게임 결과: 2번 → 국밥\n${GAME_NOTICE}`);
  assert.ok(indexHtml.includes('data-meal-tool="category"'));
  assert.equal(wheelLabel("아주긴크림파스타메뉴", 8), "아주긴…");
  assert.equal(Array.from(wheelLabel("🍕🍜🍚🍖🍔", 8)).length, 4);
  const toolsScript = await readFile(new URL("../dist/assets/meal-tools-v2.js", import.meta.url), "utf8");
  assert.doesNotMatch(toolsScript, /Math\.random|\bfetch\(/);
  assert.match(toolsScript, /prefers-reduced-motion: reduce/);
  assert.match(toolsScript, /if \(reduced\(\)\) \{ action\(\); return; \}/);
  const asset = await worker.fetch(new Request("https://example.test/assets/meal-tools-v2.js"), {}, {});
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /javascript/);
  const askSource = indexHtml.match(/    function ask\(question, \{ freshMenu = false \} = \{\}\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(askSource);
  const requests = [];
  const ask = new Function("showChatView", "appendMessage", "$", "resizeInput", "buildAIRequest", "generateAnswer", `let generating = false, chatMessages = [], lastAIRequest, currentLocationName = '역삼', currentLocationCoords = { latitude: 37.5, longitude: 127 };\n${askSource}\nreturn ask;`)(() => {}, () => {}, () => ({}), () => {}, () => ({ messages: [{ role: "user", content: "이전 지역 조건" }], context: { currentLocationName: "역삼", currentLocation: { latitude: 37.5, longitude: 127 }, responseModeState: { slots: { region: "역삼" } } } }), request => requests.push(request));
  ask("마라탕 먹고 싶어", { freshMenu: true });
  assert.deepEqual(requests[0].messages, [{ role: "user", content: "마라탕 먹고 싶어" }]);
  assert.deepEqual(requests[0].context.responseModeState.slots, {});
  assert.equal(requests[0].context.currentLocation, null);
  assert.equal(requests[0].context.hasRestaurantResults, false);
  const inlineScripts = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  for (const [, script] of inlineScripts) assert.doesNotThrow(() => new Function(script));
}
{
  const buildRequestSource = indexHtml.match(/    function buildAIRequest\(nextMessages\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(buildRequestSource);
  const buildRequest = new Function("getLocalTimeState", "hasExplicitTimeCondition", "currentId", "currentLocationName", "currentLocationCoords", `${buildRequestSource}\nreturn buildAIRequest;`)(() => ({}), () => false, "test-session", "", null);
  const clearedState = normalizeResponseState({});
  const built = buildRequest([
    { role: "assistant", content: "이전 식당", restaurants: [{ id: "old", name: "이전식당" }] },
    { role: "user", content: "처음부터 다시 할게" },
    { role: "assistant", content: "처음부터 시작할게요", meta: { variant: "hard_reset", responseModeState: clearedState } },
    { role: "user", content: "삼겹살 먹고 싶어" },
  ]);
  assert.deepEqual(built.context.recentRestaurants, []);
  assert.equal(built.context.hasRestaurantResults, false);
  assert.equal(built.context.currentLocation, null);
  assert.deepEqual(built.context.responseModeState, clearedState);
  assert.match(indexHtml, /answer\.meta\?\.variant === 'hard_reset'[\s\S]*?currentLocationName = '';[\s\S]*?currentLocationCoords = null;/);
}
assert.match(indexHtml, /quick-replies-followup/);
assert.match(indexHtml, /quick-reply-chip[^}]*min-height: 32px/);
{
  const routeSource = indexHtml.match(/    function routeQuestion\(question\) \{[\s\S]*?\n    \}/)?.[0];
  const locationSource = indexHtml.match(/    function isCurrentLocationIntent\(value\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(routeSource && locationSource);
  const sent = [];
  let locationRequests = 0;
  const route = new Function("ask", "requestCurrentLocation", `${locationSource}\n${routeSource}\nreturn routeQuestion;`)(value => sent.push(value), () => { locationRequests += 1; });
  for (const label of ["다른 곳도 보여줘", "가까운 순으로", "조건 바꾸기"]) route(label);
  assert.deepEqual(sent, ["다른 곳도 보여줘", "가까운 순으로", "조건 바꾸기"]);
  route("현재 위치 연결");
  assert.equal(locationRequests, 1, "location chip must keep the existing browser geolocation action");
}
assert.match(
  indexHtml,
  /: \{ placeId: '', url: candidate \};/,
  "frontend must preserve a validated Naver Map search URL when no numeric place ID exists"
);

console.log("Inchelin data policy smoke tests passed.");
