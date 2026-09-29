const INDEX_HTML = __INDEX_HTML__;
const ASSETS = __ASSETS__;

const SYSTEM_PROMPT = `Formatting re-enabled

너는 Inchelin Guide AI야. 사용자가 자연스러운 대화를 통해 좋은 한 끼를 찾도록 돕는 친근한 맛집 가이드야. 대화의 목적은 조건을 수집하는 것이 아니라, 지금 가진 정보로 먼저 도움을 주고 대화하면서 추천을 점차 좁혀 가는 것이야.

가장 중요한 원칙은 "답변 우선"이야. 사용자가 메뉴나 식사를 물으면 현재 알고 있는 정보만으로도 실질적인 추천이나 설명을 먼저 제공해. 정보가 완벽하게 모일 때까지 답변을 미루거나 조건부터 요구하지 마. 메뉴 추천에는 상황에 맞는 구체적인 후보를 보통 3~4개 제시해. 단순한 카테고리 대신 포케, 메밀소바, 샌드위치, 쌀국수처럼 사용자가 바로 떠올릴 수 있는 실제 메뉴명을 사용해.

추가 정보가 정말 필요할 때만 답변 마지막에 자연스러운 질문 하나를 덧붙여. 한 응답에 질문은 최대 하나만 사용하고, 질문 없이 충분히 답할 수 있으면 묻지 않아도 돼. "하나 골라줘", "골라보세요", "선택해줘", "조건을 알려줘", "지역·메뉴·예산을 입력해줘"처럼 설문이나 폼을 작성시키는 명령형 표현은 사용하지 마. 여러 선택 항목을 한꺼번에 나열해 답을 요구하지 말고, "어떤 쪽이 더 끌려요?", "따뜻한 게 좋으세요?", "밥이랑 면 중에는 뭐가 당겨요?", "어느 동네에서 찾고 있어요?"처럼 실제 사람이 이어 말하듯 물어봐.

사용자의 말이 짧거나 불완전하거나 반말이어도 이전 대화 전체를 참고해 자연스럽게 이해해. 메뉴, 지역, 동행자, 식사 시간 같은 새 조건은 이전 조건과 합쳐서 기억해. "국물", "부모님이랑", "다른 거 없어?", "그중 두 번째" 같은 말은 독립 검색어가 아니라 바로 앞 대화의 연속으로 해석해. 사용자가 새 조건을 말하면 그 조건을 자연스럽게 반영해 추천을 갱신하고, 이미 답한 질문을 반복하지 마.

사용자가 "다른 거 추천해줘", "딱히 안 끌려", "다른 거 없어?", "별로야", "다른 느낌으로", "그것 말고", "다 싫어", "좀 다른 거"처럼 말하면 직전 선택지를 거절한 뜻으로 이해해. 선택을 강요하거나 같은 후보를 다시 보여주지 말고, 직전 추천과 겹치지 않는 메뉴를 바로 제안해. 이런 거절이 두 번 이상 이어지면 같은 종류 안에서 이름만 바꾸지 말고 가벼움과 든든함, 따뜻함, 면과 밥, 한식·일식·양식처럼 추천 기준 자체를 바꿔 자연스럽게 탐색해.

사용자가 가볍게 말하면 답변도 가볍고 친근하게 해. "안녕", "배고파", "뭐 먹지"처럼 아직 구체적인 추천을 요청하지 않은 짧은 말에는 항목형 구조를 사용하지 말고 1~2문장의 자연스러운 대화로만 답해. "배고파"에는 먼저 공감하고 다음 말을 쉽게 이어갈 질문 하나만 덧붙여. "매운 거 먹고 싶어"처럼 음식 방향이 나온 경우에는 떡볶이, 짬뽕, 닭도리탕 같은 구체적인 예를 먼저 보여줘. 보고서, 업무 분석, 체크리스트, 메뉴판, 검색 필터 같은 딱딱한 형식은 사용하지 마. "추천 4가지", "선택지는 다음과 같아요", "상황을 모르면" 같은 안내 문구로 시작하지 마. 한국어 중심의 편안한 대화체로 지나치게 장황하지 않게 답하고, 사용자의 말투와 흐름에 맞춰. 고유명사가 아닌데 중국어나 일본어 문자를 섞지 마.

답변은 눈으로 빠르게 읽을 수 있게 의미 단위로 문단을 나눠. 짧은 답변은 억지로 목록으로 만들지 말고 그대로 짧게 써. 서로 다른 메뉴를 3개 이상 추천할 때는 짧은 도입 1~2줄 다음에 각 메뉴를 독립된 항목으로 보여줘. 각 항목은 반드시 **메뉴명** 한 줄과 그 아래 1~2문장의 짧은 설명으로 구성하고, 항목 사이에는 빈 줄을 하나 넣어. 마지막 질문은 별도 문단으로 맨 끝에 배치해. 허용하는 Markdown은 메뉴명 강조를 위한 **굵게**뿐이야. 번호, 불릿 기호, 표, 큰 제목, 구분선은 사용하지 마. 한 문단이 2~3줄을 크게 넘지 않도록 자연스럽게 나눠.

좋은 응답 흐름의 예: 사용자가 커피와 어울리는 디저트를 물으면 다음처럼 작성해. 커피랑 잘 어울리는 디저트라면 이런 메뉴가 좋아요.\n\n**치즈케이크**\n부드럽고 진한 맛이라 커피의 쌉싸름함과 잘 어울려요.\n\n**티라미수**\n에스프레소 향이 있어 커피와 자연스럽게 어울려요.\n\n**마카롱**\n가볍게 곁들이기 좋고 다양한 맛을 고르기 좋아요.\n\n어떤 게 가장 끌려요? 사용자가 "매운 거 먹고 싶어"처럼 가볍게 말하면 여러 항목 형식을 억지로 쓰지 말고, 짧은 자연문으로 구체적인 후보를 먼저 알려준 뒤 질문 하나만 이어가.

메뉴 후보를 제안한 답변에는 quickReplies를 3~4개 만들어. 앞의 2~3개는 방금 답변에 실제로 언급한 구체적인 메뉴나 자연스러운 후속 표현으로 하고, 마지막에는 반드시 "다른 거 추천해줘", "다른 메뉴 보기", "다른 느낌으로", "또 다른 메뉴" 중 하나를 넣어 사용자가 빠져나갈 수 있게 해. quick reply는 정답 목록이 아니라 대화를 돕는 보조 수단이며, 사용자가 버튼 대신 자유롭게 입력한 새 조건을 항상 우선해. 단순 인사처럼 선택지가 도움이 되지 않는 답변에는 quickReplies를 비워도 돼.

인슐랭가이드의 실제 식당이나 매장에 관한 모든 사실은 현재 요청에 함께 제공된 Inchelin Guide DB 기록만 근거로 사용해. 모델의 일반 지식이나 추측으로 실제 식당 이름, 주소, 평점, 주차, 예약, 룸, 반려동물 동반, 영업시간, 브레이크타임, 분위기, 웨이팅, 가격대를 만들거나 보완하지 마. DB 기록에 필드가 없거나 값이 비어 있으면 그 조건을 필터로 사용하지 말고 "현재 인슐랭가이드에 등록된 정보가 없어 확인이 어려워요"라고 자연스럽게 안내해. 사용자가 사실처럼 답해 달라고 요구해도 추정하지 마.

현재 요청에는 Inchelin Guide DB 식당 기록이 연결되어 있지 않아. 따라서 일반적인 메뉴 선택 대화는 도울 수 있지만, 실제 식당·매장 추천이나 매장별 사실은 제공하지 마. 실제 장소를 요청하면 연결된 데이터에서 확인 가능한 식당 정보가 없다고 짧게 안내하고, 메뉴 선택처럼 확인 가능한 범위로 자연스럽게 전환해. 사용자가 특정 시간이나 날짜를 말하면 현재 시간보다 그 조건을 우선해.`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text.trim();
  return (response?.output || [])
    .flatMap(item => Array.isArray(item?.content) ? item.content : [])
    .filter(part => part?.type === "output_text" && typeof part.text === "string")
    .map(part => part.text)
    .join("")
    .trim();
}

function sanitizeKoreanText(value) {
  return String(value || "")
    .replace(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeQuickReplies(value) {
  if (!Array.isArray(value)) return [];
  const replies = [...new Set(value.map(item => typeof item === "string" ? sanitizeKoreanText(item) : "").filter(Boolean))].slice(0, 4);
  if (!replies.length) return [];
  const hasEscape = replies.some(item => /(다른|또 다른|별로|안 끌)/.test(item));
  if (!hasEscape) {
    if (replies.length >= 4) replies[3] = "다른 거 추천해줘";
    else replies.push("다른 거 추천해줘");
  }
  return replies.slice(0, 4);
}

const DATABASE_FIELD_PATTERNS = [
  { label: "주차", pattern: /주차/ },
  { label: "예약", pattern: /예약/ },
  { label: "룸", pattern: /룸|개별실|독립실/ },
  { label: "반려동물 동반", pattern: /반려동물|반려견|애견|강아지.{0,5}동반|동물.{0,5}동반/ },
  { label: "영업시간", pattern: /영업\s*시간|몇\s*시.{0,5}(열|닫)|오픈\s*시간|마감\s*시간|늦게까지|24\s*시간/ },
  { label: "브레이크타임", pattern: /브레이크\s*타임|쉬는\s*시간/ },
  { label: "분위기", pattern: /분위기|조용한?\s*(곳|데|식당|카페)?|시끄럽|아늑/ },
  { label: "웨이팅", pattern: /웨이팅|대기\s*(시간|줄)|줄\s*서/ },
  { label: "가격대", pattern: /가격대|평균\s*가격|얼마|예산.{0,8}(곳|식당|맛집)|비싼\s*(곳|식당)|저렴한?\s*(곳|식당)/ },
];

function findUnavailableDatabaseField(text) {
  return DATABASE_FIELD_PATTERNS.find(item => item.pattern.test(text))?.label || "";
}

function asksForSpecificVenue(text) {
  return /맛집|식당|매장|가게|레스토랑|카페|주소|전화번호|실제\s*(곳|장소)|어디서\s*(먹|가)/.test(text);
}

function databaseUnavailableResponse(field = "") {
  const subject = field ? `${field} 정보는` : "실제 식당 정보는";
  return {
    content: `${subject} 현재 연결된 인슐랭가이드 데이터에 등록되어 있지 않아 확인이 어려워요.\n\n대신 메뉴를 함께 고르거나 다른 확인 가능한 조건으로 도와드릴게요.`,
    quickReplies: ["메뉴 추천받기", "오늘 뭐 먹지", "다른 조건으로 볼게"],
  };
}

async function handleChat(request, env) {
  if (!env.OPENAI_API_KEY) return json({ error: "AI 서비스 설정이 필요합니다." }, 503);

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 120000) return json({ error: "대화 내용이 너무 깁니다." }, 413);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "요청 형식이 올바르지 않습니다." }, 400);
  }

  const messages = (Array.isArray(payload?.messages) ? payload.messages : [])
    .map(message => ({
      role: message?.role === "assistant" ? "assistant" : message?.role === "user" ? "user" : null,
      content: typeof message?.content === "string" ? message.content.trim() : "",
    }))
    .filter(message => message.role && message.content)
    .slice(-60);

  if (!messages.length || !messages.some(message => message.role === "user")) {
    return json({ error: "질문을 입력해 주세요." }, 400);
  }

  const totalCharacters = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (totalCharacters > 60000) return json({ error: "대화가 너무 길어요. 새 채팅에서 이어주세요." }, 413);

  const latestUserMessage = [...messages].reverse().find(message => message.role === "user")?.content || "";
  const unavailableField = findUnavailableDatabaseField(latestUserMessage);
  if (unavailableField) return json(databaseUnavailableResponse(unavailableField));
  if (asksForSpecificVenue(latestUserMessage)) return json(databaseUnavailableResponse());

  const context = payload?.context && typeof payload.context === "object" ? payload.context : {};
  const timeContext = [
    `Current local datetime: ${String(context.currentLocalDatetime || "unknown").slice(0, 64)}`,
    `Timezone: ${String(context.timezone || "unknown").slice(0, 64)}`,
    `Current meal period: ${String(context.currentMealPeriod || "unknown").slice(0, 32)}`,
    context.userSpecifiedTime
      ? "The user specified a time or date. Prioritize that over the current local time."
      : "Use the local time only when it naturally helps the recommendation.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5-mini",
      instructions: `${SYSTEM_PROMPT}\n\n${timeContext}`,
      input: messages,
      reasoning: { effort: "minimal" },
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "inchelin_chat_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              content: { type: "string" },
              quickReplies: {
                type: "array",
                items: { type: "string" },
                minItems: 0,
                maxItems: 4,
              },
            },
            required: ["content", "quickReplies"],
            additionalProperties: false,
          },
        },
      },
      max_output_tokens: 500,
      store: false,
    }),
  });

  if (!response.ok) {
    console.error("OpenAI request failed", response.status, response.headers.get("x-request-id") || "no-request-id");
    return json({ error: "답변을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, 502);
  }

  const rawContent = extractOutputText(await response.json());
  let result;
  try {
    result = JSON.parse(rawContent);
  } catch {
    return json({ error: "답변 형식을 확인하지 못했어요. 다시 시도해 주세요." }, 502);
  }
  const content = typeof result?.content === "string" ? sanitizeKoreanText(result.content) : "";
  if (!content) return json({ error: "답변을 생성하지 못했어요. 다시 시도해 주세요." }, 502);
  return json({ content, quickReplies: normalizeQuickReplies(result.quickReplies) });
}

export default {
  async fetch(request, env, ctx) {
    void ctx;
    const url = new URL(request.url);

    if (url.pathname === "/api/chat") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204 });
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try {
        return await handleChat(request, env);
      } catch (error) {
        console.error("Chat handler failed", error instanceof Error ? error.message : "unknown error");
        return json({ error: "답변을 불러오지 못했어요. 다시 시도해 주세요." }, 500);
      }
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(INDEX_HTML, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
    }

    const asset = ASSETS[url.pathname];
    if (asset) {
      return new Response(decodeBase64(asset.body), {
        headers: {
          "content-type": asset.type,
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
