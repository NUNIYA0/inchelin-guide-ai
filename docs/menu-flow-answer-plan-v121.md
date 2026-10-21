# v121 메뉴 고민 흐름과 답변 구성표

## 동작

1. 음식 종류가 없는 메뉴 고민은 카드 없이 ‘끌리는 쪽 있으세요?’와 한식/중식/일식/양식/분식/제가 골라드릴까요? 여섯 칩으로 시작해요.
2. 종류를 고르면 그 종류 안의 구체 메뉴 세 개를 보여줘요. 알아서 골라줘/아무거나는 서로 다른 방향 세 개를 골라요. 사용자 말에 나온 날씨·기분, 식사 시간대, 직전 제안을 반영하고 실제 날씨를 추정하지 않아요.
3. 메뉴를 정하면 지역이 없는 경우에만 ‘지금 어디세요?’와 위치 연결/강남/홍대/역삼/성수/직접 입력/상관없어요를 보여줘요. 이미 정한 지역은 유지해요.
4. 지역까지 정하면 실제 검색에서 음식·지역이 맞는 식당을 최대 세 곳 보여주고 동행 질문을 붙여요. 충분한 식당이 없으면 숫자를 꾸며 채우지 않아요.
5. 상관없어요는 해당 슬롯을 asked 처리하고 진행해요. 메뉴 제안 중이라면 하나를 골라 진행하고, 지역을 맡기면 강남을 선택했다고 명시해요. 현재 위치를 추정한 것처럼 말하지 않아요. 선택 가능한 메뉴를 모두 보여준 종류는 재사용 사실을 안내해요.
6. `state.stage`의 `menu_category_asked`, `menu_options_shown`, `region_asked`와 `askedSlots`, `consecutiveQuestions`를 연동해 같은 슬롯 재질문과 연속 세 번째 질문을 막아요.
7. 질문은 기본 템플릿을 사용해 생성 실패와 무관하게 동작해요. 메뉴 생성 실패·시간초과는 같은 종류의 코드 메뉴 목록으로 폴백해요. v119 금지어·음슴체·내부 필드 제거도 유지해요.

## 구성표

`worker/answer-plan.js`가 유일한 구성표예요. 분류 출력에 `answer_plan`을 추가했고, 분류 단계의 intent/슬롯/신뢰도를 기준으로 표와 정합성을 검사해 확정해요. 모델이 표 밖의 블록이나 식당을 임의로 추가하지 못해요.

| 조건 | answer_plan |
|---|---|
| 메뉴 고민, 종류 없음 | text → question → chips |
| 메뉴 고민, 종류 있음/AI에게 선택 맡김 | text → menu_cards(3) → notice(안내) |
| 음식+지역 검색 | text → place_cards(최대3) → source → question → chips |
| 검색에 한 축 부족 | text → question → chips |
| 다른 곳/N번째 식당 후속 | text → place_cards → source |
| 조건 변경 | text → place_cards → source → chips |
| 비교 | text(확인된 정보) → chips |
| 특정 식당 | text(요청 항목 모두/미확인 안내) → place_cards(최대1) |
| 음식 이야기 | text → question |
| 서비스/일반 | text(고정 안내/FAQ) |
| 범위 밖 | text → chips |

- 주차·분위기 등 확인할 수 없는 부가 조건은 notice를 추가해요. 검색 자체를 막지는 않아요.
- 낮은 신뢰도는 text/question/chips로 되묻고 검색·카드를 차단해요.
- 반복 질문·사용자가 생략한 질문은 실제 question 내용을 비워요. plan에 question이 있어도 데이터가 없으면 질문을 그리지 않아요.
- 프런트 렌더러는 plan에 없는 카드·출처·질문·칩·안내를 그리지 않아요. 식당 개수 제한은 별도 `answer_limits`로 최대 3/특정 식당 1개를 강제해요.
- 서비스 FAQ는 고정 답변을 유지하되 후보/분류/격식체 등의 표현을 자연스럽게 바꿨어요. 즉석 생성은 하지 않아요.
- 위치 권한 오류·비교할 식당 없음 같은 브라우저 자체 안내도 허용 블록을 명시해요. 전송 오류 재시도 UI는 AI 답변과 별개예요.

## 검증 결과

- `node scripts/build-worker.mjs && node scripts/policy-smoke.mjs` 통과.
- 요청한 메뉴 흐름 9개 시나리오 통과. 지역 유지, 직접 종류 입력, 제육 별칭, 상관없어요/아무거나 진행, 같은 슬롯 재질문 방지, 연속 질문 제한, 실패/시간초과 폴백도 통과.
- 구성표 11종 × 발화 2개(22개): 실제 요청 → 모킹 분류 → 정책 → 응답 payload 경로 통과. general 추가 2개, 특정 식당의 영업시간+전화번호 동시 질문도 통과.
- 구성표 11종 × 렌더 입력 2개(22개): 표 밖의 카드·질문·출처·칩·notice를 주입해도 그려지지 않는 DOM 회귀 통과.
- v119 문장 검사/내부 분석 필드 미노출, 기존 지역·음식 검증/비교/플러그인/핀/게임 테스트 유지.
- API 키·키 파일·런타임 환경변수는 확인하거나 변경하지 않았어요. 실제 AI 호출·의도분류 품질 평가도 하지 않았어요. 위 결과는 모킹 소프트웨어 회귀 테스트이며 AI 정확도 수치가 아니에요.
- 이번 버전의 실제 브라우저/360px 렌더 확인은 미완료예요. 프런트 구문과 DOM 렌더러 테스트만 실행했어요.

## 변경 파일 (18개)

1. `worker/answer-plan.js` (추가)
2. `worker/index.template.js`
3. `worker/response-modes.js`
4. `worker/turn-policy.js`
5. `worker/conversation-copy.js`
6. `worker/search-axes.js`
7. `dist/index.html`
8. `data/service-faq.json`
9. `scripts/build-worker.mjs`
10. `scripts/answer-plan-smoke.mjs` (추가)
11. `scripts/policy-smoke.mjs`
12. `scripts/conversation-ui-smoke.mjs`
13. `scripts/turn-policy-smoke.mjs`
14. `scripts/ai-search-policy-smoke.mjs`
15. `scripts/search-axes-smoke.mjs`
16. `scripts/conversation-copy-regression-smoke.mjs`
17. `scripts/conversation-usability-smoke.mjs`
18. `docs/menu-flow-answer-plan-v121.md` (이 보고서)
