# v131 좁은 질문 구역 칩 줄바꿈 수정

- 동행 칩의 고정 4등분 flex-basis를 제거하고 `flex: 0 0 auto`, `min-width: fit-content`, `white-space: nowrap`으로 변경했습니다.
- 라벨도 줄바꿈하지 않고 체크 아이콘은 축소되지 않게 했습니다. 기존 `flex-wrap: wrap`으로 공간이 모자라면 칩 전체가 다음 줄로 내려갑니다.
- 종류·지역의 중첩 3열 타일은 변경하지 않았습니다. 대화/AI/검색 정책도 변경하지 않았습니다.

## 테스트

- `node scripts/build-worker.mjs` 및 `node scripts/policy-smoke.mjs`: 통과.
- `node scripts/responsive-card-browser.mjs`: 실제 로컬 Chrome에서 질문 구역 컨테이너 270/320/360px 각각의 일반·선택 상태 6개를 계측했습니다. 라벨 Range가 한 줄, 버튼 내부 가로 넘침 없음, 체크 아이콘이 버튼 안에 유지됨, 좁은 폭에서는 칩 자체가 다음 줄로 넘어감을 확인했습니다. 기존 1024/768/767/390/360px 카드 배치 회귀 검사도 유지합니다.
- 키 확인·AI 평가·실제 검색은 하지 않았습니다. 목 데이터의 브라우저 계측이며 로그인된 라이브 우측 패널 직접 조작 검수는 하지 않았습니다.

## 변경 파일

- `dist/index.html`
- `scripts/conversation-ui-smoke.mjs`
- `scripts/responsive-card-browser.mjs`
- `docs/answer-chips-v131.md`
