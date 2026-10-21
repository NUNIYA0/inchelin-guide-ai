# v130 지도·이력·모바일 카드·문장·이어서 질문

## 변경 내용

1. 지도 링크는 네이버 고유 장소 ID/링크 → 안전한 네이버 단축 링크 → 정리한 상호+유효 좌표 중심 → 상호 검색 순으로 만듭니다. 좌표는 WGS84를 지도 중심용 Web Mercator로 변환합니다. 외부 식당 홈페이지 링크는 네이버 장소 고유 링크로 취급하지 않습니다. 지도 검색어에 주소를 더하지 않으며 괄호·특수문자·주소 꼬리·반복 상호를 정리합니다. 기존 저장 카드의 주소형 검색 URL도 다시 만듭니다. 기본은 상호만 사용합니다.
2. 이전 응답의 상세보기와 비교 버튼은 계속 동작합니다. 메뉴·답변 칩·연관 질문의 이력 비활성 규칙은 유지합니다.
3. 767px 이하 식당 카드: 높이 자동/최소 높이 없음, 이름·칩·주소 각 한 줄, 하단 우측 비교 버튼. 긴 이름·주소 목 데이터의 실제 Chrome 계측은 약 102px입니다. 768px 이상 3열 및 동일 행 높이는 유지합니다.
4. 회식 등 동행 응답은 상황+지역+음식+곳 수를 한 문장으로 안내합니다. 예: `회식 자리로 강남 삼겹살집 3곳을 골라봤어요.` 중복 요약/확인 문장을 붙이지 않으며 주요 음식·지원 지역·동행 어휘의 문장 간 중복 검사를 추가했습니다.
5. 질문 대기 중에는 서로 다른 축 2개, 대기 질문이 없으면 3개를 목표로 합니다. 장소 응답은 지역·음식 변경을 우선하고 상황·카드 상세·비교를 섞습니다. 축당 최대 2개 조합, 응답당 최대 6개 서로 다른 조합만 결과 존재 확인을 시도하며 기존 단기 캐시를 재사용합니다. 검증 실패·세션 중복·시간초과이면 3개를 억지로 채우지 않습니다. 긴 상호로 길이 제한을 넘으면 실제 카드 순서로 상세·비교를 제안할 수 있습니다. FAQ는 장소 응답에 붙이지 않습니다.

## 검증

- `node scripts/build-worker.mjs`: 통과(34 assets).
- `node scripts/policy-smoke.mjs`: 전체 모킹 회귀 통과. 정리/인코딩/고유 링크 우선/좌표 링크/폴백/기존 주소형 URL 정리, 이전 카드 상세·비교 활성, 회식 한 문장·어휘 중복, 3축/대기 중 2축, 검증 실패 미노출 포함.
- `node scripts/responsive-card-browser.mjs`: 실제 로컬 Chrome의 1024/768/767/390/360px 목 데이터 계측 통과. PC 3열·같은 높이, 모바일 1열·100~110px, 이름/주소 말줄임, 가로 넘침 없음, 결과 1~2개 폭 유지 확인.
- 키 파일 확인, AI 평가, 실제 음식점 검색·지도 접속은 하지 않았습니다. 좌표/장소 ID 예시는 테스트 목 데이터이며 실제 업체 위치·ID라는 주장이 아닙니다. 로그인된 라이브 대화 직접 클릭 검수는 미실시입니다.

## 생성 URL 예시 3개

1. 상호만 폴백 — 땅코참숯구이 강남역직영점:
   `https://map.naver.com/p/search/%EB%95%85%EC%BD%94%EC%B0%B8%EC%88%AF%EA%B5%AC%EC%9D%B4%20%EA%B0%95%EB%82%A8%EC%97%AD%EC%A7%81%EC%98%81%EC%A0%90`
2. 상호 정리+좌표 중심(목 데이터) — 시장냉면 홍대점:
   `https://map.naver.com/p/search/%EC%8B%9C%EC%9E%A5%EB%83%89%EB%A9%B4%20%ED%99%8D%EB%8C%80%EC%A0%90?c=14129003.730%2C4516891.991%2C15%2C0%2C0%2C0%2Cdh`
3. 검색 결과 고유 링크 우선(목 ID):
   `https://map.naver.com/p/entry/place/123456789`

## 변경 파일(16개)

- `dist/index.html`
- `dist/assets/naver-map.js` (신규, 브라우저·Worker 공용 순수 함수)
- `worker/index.template.js`
- `worker/conversation-copy.js`
- `worker/turn-policy.js`
- `worker/response-modes.js`
- `worker/related-questions.js`
- `scripts/build-worker.mjs`
- `scripts/policy-smoke.mjs`
- `scripts/v130-regression-smoke.mjs` (신규)
- `scripts/conversation-ui-smoke.mjs`
- `scripts/turn-policy-smoke.mjs`
- `scripts/related-context-smoke.mjs`
- `scripts/history-alternatives-smoke.mjs`
- `scripts/responsive-card-browser.mjs`
- `docs/map-history-mobile-v130.md` (본 보고서)
