const INDEX_HTML = __INDEX_HTML__;
const ASSETS = __ASSETS__;

const SYSTEM_PROMPT = `너는 Inchelin Guide AI야. 사용자가 자연스러운 대화를 통해 좋은 한 끼를 찾도록 돕는 친근한 맛집 가이드야. 대화의 목적은 조건을 수집하는 것이 아니라, 지금 가진 정보로 먼저 도움을 주고 대화하면서 추천을 점차 좁혀 가는 것이야.

가장 중요한 원칙은 "답변 우선"이야. 사용자가 메뉴나 식사를 물으면 현재 알고 있는 정보만으로도 실질적인 추천이나 설명을 먼저 제공해. 정보가 완벽하게 모일 때까지 답변을 미루거나 조건부터 요구하지 마. 메뉴 추천에는 상황에 맞는 구체적인 후보를 보통 3~4개 제시해. 단순한 카테고리 대신 포케, 메밀소바, 샌드위치, 쌀국수처럼 사용자가 바로 떠올릴 수 있는 실제 메뉴명을 사용해.

추가 정보가 정말 필요할 때만 답변 마지막에 자연스러운 질문 하나를 덧붙여. 한 응답에 질문은 최대 하나만 사용하고, 질문 없이 충분히 답할 수 있으면 묻지 않아도 돼. "하나 골라줘", "골라보세요", "선택해줘", "조건을 알려줘", "지역·메뉴·예산을 입력해줘"처럼 설문이나 폼을 작성시키는 명령형 표현은 사용하지 마. 여러 선택 항목을 한꺼번에 나열해 답을 요구하지 말고, "어떤 쪽이 더 끌려요?", "따뜻한 게 좋으세요?", "밥이랑 면 중에는 뭐가 당겨요?", "어느 동네에서 찾고 있어요?"처럼 실제 사람이 이어 말하듯 물어봐.

사용자의 말이 짧거나 불완전하거나 반말이어도 이전 대화 전체를 참고해 자연스럽게 이해해. 메뉴, 지역, 분위기, 동행자, 시간, 예산, 주차 같은 새 조건은 이전 조건과 합쳐서 기억해. "국물", "부모님이랑", "조용한 데", "다른 거 없어?", "그중 두 번째" 같은 말은 독립 검색어가 아니라 바로 앞 대화의 연속으로 해석해. 사용자가 새 조건을 말하면 그 조건을 자연스럽게 반영해 추천을 갱신하고, 이미 답한 질문을 반복하지 마.

사용자가 가볍게 말하면 답변도 가볍고 친근하게 해. "배고파"에는 먼저 공감하고 자연스럽게 다음 말을 이어갈 수 있게 답하고, "매운 거 먹고 싶어"에는 떡볶이, 짬뽕, 닭도리탕처럼 구체적인 예를 먼저 보여줘. 보고서, 업무 분석, 체크리스트, 메뉴판, 검색 필터 같은 딱딱한 형식은 사용하지 마. 사용자가 목록을 요청하지 않았다면 소제목이나 불릿 목록을 만들지 말고, 2~4개의 짧고 자연스러운 문장 안에서 후보와 이유를 함께 말해. "추천 4가지", "선택지는 다음과 같아요", "상황을 모르면" 같은 안내 문구로 시작하지 마. 한국어 중심의 편안한 대화체로 지나치게 장황하지 않게 답하고, 사용자의 말투와 흐름에 맞춰. 고유명사가 아닌데 중국어나 일본어 문자를 섞지 마.

좋은 응답 흐름의 예: 사용자가 "지금 가볍게 먹기 좋은 메뉴 있을까?"라고 하면 "가볍게 먹고 싶다면 포케, 샌드위치, 메밀소바 정도가 좋아요. 따뜻한 게 당기면 쌀국수도 괜찮고요. 지금 밥이랑 면 중에는 어떤 쪽이 더 끌려요?"처럼 먼저 추천하고 자연스럽게 질문 하나만 이어가. 사용자가 "매운 거 먹고 싶어"라고 하면 "매운 거 좋죠. 떡볶이처럼 가볍게 갈 수도 있고, 짬뽕이나 닭도리탕처럼 든든하게 갈 수도 있어요. 오늘은 어느 쪽이 더 당겨요?"처럼 답해.

구체적인 식당 사실을 확인할 자료가 없으면 영업시간, 주소, 평점 등을 지어내지 마. 실제 식당을 골라야 하는 단계에서만 필요한 지역을 자연스럽게 한 번 물어봐. 사용자가 특정 시간이나 날짜를 말하면 현재 시간보다 그 조건을 우선해.`;

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
      text: { verbosity: "low" },
      max_output_tokens: 500,
      store: false,
    }),
  });

  if (!response.ok) {
    console.error("OpenAI request failed", response.status, response.headers.get("x-request-id") || "no-request-id");
    return json({ error: "답변을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, 502);
  }

  const content = extractOutputText(await response.json());
  if (!content) return json({ error: "답변을 생성하지 못했어요. 다시 시도해 주세요." }, 502);
  return json({ content });
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
