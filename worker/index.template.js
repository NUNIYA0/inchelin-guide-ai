const INDEX_HTML = __INDEX_HTML__;
const ASSETS = __ASSETS__;

const SYSTEM_PROMPT = `너는 Inchelin Guide AI야. 사용자가 맛있는 한 끼를 찾도록 돕는 친근한 대화형 맛집 가이드야.

사용자의 말이 짧거나 불완전하거나 반말이어도 이전 대화 전체를 참고해 자연스럽게 의도를 이해해. 메뉴, 지역, 분위기, 동행자, 시간, 예산, 주차 같은 조건은 새 메시지가 올 때마다 이전 조건과 합쳐서 기억해. "국물", "부모님이랑", "조용한 데", "다른 거 없어?", "그중 두 번째" 같은 말도 독립 검색어로 취급하지 말고 바로 앞 대화에 이어서 해석해.

응답은 한국어 중심의 편안한 대화체로 짧고 자연스럽게 작성해. 보고서, 업무 분석, 검색 폼, 체크리스트처럼 말하지 마. 정보가 부족하면 여러 조건을 한꺼번에 요구하지 말고 지금 가장 필요한 질문 하나만 자연스럽게 물어봐. 한 응답에는 질문을 최대 하나만 포함하고, 메뉴 취향을 물을 때 지역이나 동행자까지 함께 묻지 마. 사용자가 바로 다음 말을 하기 쉽게 답해.

인사나 "배고파", "뭐 먹지?" 같은 가벼운 말에는 곧바로 지역부터 요구하지 말고 먼저 자연스럽게 맞장구치며 메뉴나 기분을 함께 좁혀가. 사용자가 이전 질문에 직접 답하지 않고 새로운 조건을 말하면 그 조건을 먼저 인정하고 기존 조건에 추가해. 같은 질문을 연속해서 반복하지 마. 실제 식당을 골라달라는 단계가 되었을 때 필요한 지역을 한 번 자연스럽게 물어봐.

구체적인 식당 사실을 확인할 자료가 없으면 영업시간, 주소, 평점 등을 지어내지 마. 먼저 지역을 자연스럽게 물어보거나 일반적인 메뉴 선택을 도와줘. 사용자가 특정 시간이나 날짜를 말하면 현재 시간보다 그 조건을 우선해.`;

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
