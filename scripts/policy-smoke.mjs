import assert from "node:assert/strict";
import worker from "../build/dist/server/index.js";

function request(message, history = [], context = {}) {
  return new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [...history, { role: "user", content: message }], context }),
  });
}

async function runCase({ message, history = [], env, context, dbResponse, enrichmentResponse, naverResponse, naverStatus = 200, imageResponse, aiResponse, intentAnalysis, expectedStatus = 200 }) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, headers: new Headers(options.headers), body: options.body ? JSON.parse(options.body) : null });
    if (href.includes("db.example")) return Response.json(dbResponse);
    if (href.includes("enrich.example")) return Response.json(enrichmentResponse);
    if (href.includes("naverapihub.apigw.ntruss.com")) return Response.json(naverResponse, { status: naverStatus });
    if (href.includes("openapi.naver.com/v1/search/image")) return Response.json(imageResponse || { items: [] });
    if (href.includes("api.openai.com")) {
      const body = options.body ? JSON.parse(options.body) : {};
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
    const response = await worker.fetch(request(message, history, context), { INTENT_ANALYZER_DISABLED: "true", ...env }, {});
    assert.equal(response.status, expectedStatus);
    return { body: await response.json(), calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  assert.deepEqual(result.body.suggestions, ["내 주변에서 찾기"]);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "든든하게",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    aiResponse: { message: "한 끼 제대로 먹고 싶다면 **국밥**이나 **찌개**가 잘 맞아요.", suggestions: [], selectedRestaurantIds: [] },
  });
  assert.match(result.body.message, /국밥/);
  assert.deepEqual(result.body.suggestions, []);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 1);
}

{
  const result = await runCase({
    message: "점심 메뉴 추천해줘",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    aiResponse: { message: "점심이라면 **제육덮밥**, **메밀소바**, **순두부찌개**가 좋아요.", suggestions: [], selectedRestaurantIds: [] },
  });
  assert.match(result.body.message, /제육덮밥/);
  assert.deepEqual(result.body.suggestions, []);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 1);
}

{
  const result = await runCase({
    message: "가볍게 먹을 메뉴 뭐가 좋아?",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    aiResponse: { message: "가볍게 먹기엔 **메밀소바**가 잘 맞아요.", suggestions: [], selectedRestaurantIds: [] },
  });
  assert.match(result.body.message, /메밀소바/);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 1);
}

{
  const result = await runCase({
    message: "지금 가볍게 먹기 좋은 메뉴 있을까?",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
    aiResponse: { message: "가볍게 먹기엔 **샌드위치**나 **메밀소바**가 괜찮아요.\n\n오늘은 따뜻한 쪽이 좋아요?", suggestions: [], selectedRestaurantIds: [] },
  });
  assert.match(result.body.message, /샌드위치/);
  assert.doesNotMatch(result.body.message, /어느 지역/);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 1);
}

{
  const result = await runCase({
    message: "오늘 뭐 먹지?",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.deepEqual(result.body.suggestions.map(item => item.split("|")[0]), ["한식", "중식", "일식", "양식"]);
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
  assert.match(result.body.message, /샐러드/);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 1);
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
  assert.deepEqual(result.body.suggestions, ["내 주변에서 찾기"]);
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
  assert.ok(["김민준", "이서연", "박도윤"].includes(result.body.restaurants[0].recommendedBy));
  assert.equal(result.body.restaurants[0].imageUrl, "https://images.example/pyongyang-thumb.jpg");
  assert.equal(result.body.restaurants[0].category, "냉면");
  assert.equal(result.body.restaurants[0].longitude, 127);
  assert.equal(result.body.restaurants[0].latitude, 37.5);
  assert.ok(result.body.restaurants[0].distanceMeters > 0);
  assert.match(result.body.restaurants[0].recommendationReason, /거리에서 찾은/);
  assert.equal(result.body.restaurants[0].naverPlaceId, "123");
  assert.equal(result.body.restaurants[0].naverPlaceUrl, "https://map.naver.com/p/entry/place/123");
  assert.equal(new URL(naverCall.href).searchParams.get("query"), "강남 냉면");
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
  assert.match(result.body.message, /신림역 주변\*\*은 확인했어요/);
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
  assert.deepEqual(result.body.suggestions, ["내 주변에서 찾기"]);
  assert.equal(result.calls.length, 0);
}

{
  const result = await runCase({
    message: "강남",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.match(result.body.message, /\*\*강남\*\*에서 찾고 계시는군요/);
  assert.match(result.body.message, /\*\*오늘은 어떤 음식이 생각나세요\?\*\*/);
  assert.deepEqual(result.body.suggestions, []);
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
  assert.deepEqual(result.body.suggestions, []);
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
  assert.equal(new URL(naverCall.href).searchParams.get("query"), "강남 든든한 식사");
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
  const openaiCall = result.calls.find(call => call.href.includes("api.openai.com"));
  assert.ok(openaiCall);
  assert.match(openaiCall.body.instructions, /"position":2/);
  assert.match(openaiCall.body.instructions, /두번째식당/);
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
  assert.equal(result.body.message, "점심 메뉴 같이 골라볼까요? 가볍게, 든든하게, 매콤하게 중에서 어떤 느낌이 좋으세요?");
  assert.deepEqual(result.body.suggestions, []);
  const openaiCall = result.calls.find(call => call.href.includes("api.openai.com"));
  assert.match(openaiCall.body.instructions, /고정된 질문 순서/);
  assert.match(openaiCall.body.instructions, /추가 질문 없이 즉시 검색 결과/);
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
  assert.match(result.body.message, /지역과 음식 종류/);
  assert.deepEqual(result.body.restaurants, []);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 2);
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
  assert.match(result.body.message, /순두부찌개/);
  assert.doesNotMatch(result.body.message, /어느 지역/);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 2);
  assert.equal(result.calls.filter(call => call.href.includes("naverapihub.apigw.ntruss.com")).length, 0);
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
  assert.deepEqual(result.body.suggestions, ["내 주변에서 찾기"]);
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 1);
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
  assert.equal(new URL(naverCall.href).searchParams.get("query"), "판교 직장 동료 회식");
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
  assert.equal(result.body.restaurants[0].name, "새한식당");
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
  assert.match(result.body.message, /첫 번째 식당/);
  assert.deepEqual(result.body.restaurants, []);
  assert.equal(result.calls.filter(call => call.href.includes("naverapihub.apigw.ntruss.com")).length, 0);
  const answerCall = result.calls.filter(call => call.href.includes("api.openai.com")).at(-1);
  assert.match(answerCall.body.instructions, /"position":1/);
  assert.match(answerCall.body.instructions, /310/);
  assert.match(answerCall.body.instructions, /내부적으로 육하원칙으로 점검/);
  assert.match(answerCall.body.instructions, /먼저 결론을 말하는 자연스러운 한국어 문장/);
  assert.match(answerCall.body.instructions, /가장 중요한 질문 하나/);
  assert.match(answerCall.body.instructions, /클릭형 카드/);
  assert.match(answerCall.body.instructions, /카드 제목\|한 문장의 짧은 추천 이유/);
  assert.match(answerCall.body.instructions, /카드를 누르지 않고도 입력창에서 자연어/);
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
  assert.deepEqual(result.body.suggestions, [
    "비빔국수|새콤달콤하고 가볍게 먹기 좋아요",
    "불고기 덮밥|든든하고 포만감 있는 한 끼예요",
  ]);
  assert.doesNotMatch(result.body.message, /비빔국수|불고기 덮밥/);
  assert.match(result.body.message, /카드에서 선택하거나 다른 메뉴/);
}

{
  const result = await runCase({
    message: "오늘 뭐 먹을지 같이 골라줘",
    env: { OPENAI_API_KEY: "test-key", RESTAURANT_DATA_SOURCE: "naver" },
  });
  assert.deepEqual(result.body.suggestions.map(item => item.split("|")[0]), ["한식", "중식", "일식", "양식"]);
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
  assert.equal(result.calls.filter(call => call.href.includes("api.openai.com")).length, 1);
}

console.log("Inchelin data policy smoke tests passed.");
