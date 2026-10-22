# v138 추천 원문 데이터 연결

현재 실제 인슐랭 추천 DB는 연결되지 않았다. `data/recommendation-source.json`의 `enabled`, `connected`는 모두 `false`이며 배포 카드에는 추천 영역이 없다. `tests/fixtures/recommendations.json`은 smoke 전용 가상 데이터로, 빌드 입력이나 배포 데이터로 사용하지 않는다.

## 입력과 활성화

1. 실제 앱의 동일 추천 레코드에서 식당별 도로명주소(없으면 지번주소), 상호, 추천 ID, 추천인 이름, 원문 이유, 작성일, 선택 태그를 추출한다. 이름과 이유를 다른 레코드끼리 결합하거나 AI로 보완하지 않는다. 공개 동의·노출 가능한 실제 원문인지 운영자가 확인해야 한다.
2. JSON이면 `data/recommendations.json`에 `schemaVersion: 1`, `restaurants: []` 구조로 저장한다. 상세 형식은 `data/recommendations.schema.json`. 각 식당은 `name`, `roadAddress`, `parcelAddress`, `recommendations`를 가진다. 각 추천은 `id`, `recommenderName`, `reason`, `writtenAt`, `tags`를 가진다.
3. Excel은 직접 읽지 않는다. Excel에서 **CSV UTF-8**로 내보낸 `data/recommendations.csv`, 또는 동일 스키마 JSON 변환본을 읽는다. 외부 라이브러리·서버·업로드 UI는 추가하지 않았다. CSV 헤더는 `name,roadAddress,parcelAddress,id,recommenderName,reason,writtenAt,tags`. 한 행은 추천 1건이며 같은 식당을 여러 행에 적을 수 있다. `tags`는 `|`로 구분하고, 쉼표·줄바꿈·큰따옴표가 있는 셀은 CSV 인용 규칙을 따른다. 추천 0건 식당은 ID 등 추천 열을 비운 행으로 표현한다.
4. 작성일은 시간대가 있는 ISO 8601(`YYYY-MM-DDTHH:mm:ss+09:00` 또는 `Z`). 누락은 null/빈 셀이다. ID는 비어 있지 않은 영속 문자열로, 서로 다른 추천끼리는 달라야 한다. 이름·이유가 없으면 null로 남긴다. 원문 공백·줄바꿈·문장부호를 보존한다.
5. 운영자가 실제 데이터를 검수한 뒤 config의 `source`를 `data/recommendations.json` 또는 `data/recommendations.csv`, `format`을 `json` 또는 `csv`, 두 플래그를 모두 true로 바꿔 빌드·smoke·배포한다. 경로는 `data/` 내부만 허용하며, 활성 상태에서 파일 누락/형식 오류/충돌 ID는 빌드를 실패시킨다. 꺼짐 상태에서는 파일을 읽지 않는다. 이번 배포에서는 활성화하지 않았다.

실제 원문 파일은 **공개 Git 저장소에 무심코 커밋하지 말고** 운영 데이터의 접근·공개 정책을 먼저 정한다. 현재 로더는 빌드 시 읽어 Worker에 포함하는 정적 스냅샷 어댑터이며 데이터 변경 시 재배포가 필요하다. 전체 원문 DB는 브라우저 정적 자산으로 발행하지 않고, 현재 카드에 매칭된 추천만 응답에 붙인다. 지금은 데이터가 없으므로 공개 데이터 취급 정책도 미확정이다.

## 병합과 대표 추천

- 주소는 NFKC·공백·괄호·쉼표 및 서울/서울시/서울특별시 등 일부 행정명 표기를 정규화한다. 양쪽 도로명주소가 있으면 그 일치를 우선하고, 없을 때 지번/일반 주소로 확인한다. 임의 지오코딩이나 상호만으로 다른 주소를 연결하지 않는다. 층·호수 등 의미 있는 정보는 삭제하지 않으므로 표기가 다른 실제 원본은 운영 정제가 필요하다.
- 같은 건물의 다른 가게를 합치지 않도록 정규화 상호로 보조 확인한다. 이름 없는 주소 레코드는 그 주소가 모호하지 않을 때만 연결한다. 상호 불일치/모호한 연결은 원문을 붙이지 않는다. 검색 카드 중 같은 정규화 주소+상호는 하나로 합쳐 3곳을 선정한다. 주소 없는 카드들은 임의로 병합하지 않는다.
- 대표는 현재 제공된 음식·동행·방문 목적·분위기·주차·인원 키워드와 원문/태그 관련성 우선, 그다음 작성일 내림차순, 추천 ID 문자열 오름차순이다. 작성일 누락은 가장 뒤다. 키워드 관련성은 실제 시설 확인이나 품질 우열 보장이 아니다. 가격·주차 등의 확인 불가 안내는 별도로 유지한다.
- ID가 같은 동일 추천은 한 번만, 내용이나 소유 식당이 다른 중복 ID는 오류다. 작성자가 같아도 ID가 다르면 별개 추천으로 센다. 조건이 바뀌거나 상세 요청을 해도 신뢰한 원본 데이터에서 대표를 재선정하며, 클라이언트 상태가 보낸 원문은 신뢰하지 않는다.
- 원문은 conversation-copy 생성/문체 변환의 대상이 아니다. 서버의 비공개 분석 필드 제거 시에도 추천 번들의 `reason`만 보존한다. 브라우저는 HTML이 아닌 `textContent`로 이름·이유를 표시한다.

## 카드 표시

두 플래그가 켜진 연결 상태에서만 원문 영역을 그린다. 추천 0건은 `등록된 추천이 없어요`, 이름/이유 누락은 각각 `추천인 정보 없음`/`추천 이유 없음`. 모호한 연결도 잘못된 이름을 붙이지 않고 0건 처리한다. 1건은 버튼이 없고, 여러 건은 대표 외 **추천 건수**만 `[다른 추천 N개 보기]`에 표시한다. 펼침은 카드의 DOM 상태만 바꾸며 API 호출·조건 변경·지도 이동을 하지 않는다. 지도는 v137 전체 주소 검색 URL을 그대로 쓴다. 프로필 사진·메뉴·가격·영업시간 조회와 AI 추천 이유 생성은 추가하지 않았다.

## 검증과 한계

`node scripts/build-worker.mjs` → `node scripts/policy-smoke.mjs`. 활성화 테스트는 fixture를 주입한 **build/의 테스트용 Worker 복사본**과 실제 클라이언트 함수/가짜 DOM으로 실행하고, 끝나면 복사본을 삭제한다. 배포용 `dist/`는 항상 실제 꺼짐 설정으로 빌드한다. 네이버/AI 외부 호출 없이 테스트하며 네이버 응답도 전부 모킹한다.

실제 DB/실제 Excel 파일을 받은 적이 없어 실제 주소 매칭률·실제 작성자 원문 정합성·운영 데이터 규모 성능은 미검증이다. 실제 브라우저 픽셀/모바일 터치·실사용 지도 앱 왕복도 이번 작업에서는 미검증이며, DOM/상태/URL 불변 검사는 통과해야 한다. 실제 데이터 연동 완료를 의미하지 않는다.

## 변경 파일

- 데이터 계약: `data/recommendation-source.json`, `data/recommendations.schema.json`
- 서버: `worker/recommendations.js`, `worker/index.template.js`, `worker/conversation-copy.js`, `worker/phase1-core.js`, `worker/response-rules.js`
- 화면: `dist/index.html`, `dist/assets/recommendations-ui.js`
- 빌드로 동기화되는 자산: `dist/assets/recommendation-flags.js`, `dist/assets/phase1-core.js`, `dist/assets/response-rules.js`
- 로더·빌드·검사: `scripts/recommendation-source.mjs`, `scripts/build-worker.mjs`, `scripts/recommendations-smoke.mjs`, `scripts/policy-smoke.mjs`, `scripts/phase1-client-smoke.mjs`, `tests/fixtures/recommendations.json`
- 연결·운영 설명: `docs/recommendation-data.md`
