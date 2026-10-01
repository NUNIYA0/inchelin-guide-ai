# Restaurant Provider 구조

채팅 UI와 식당 데이터 공급자를 분리해 개발 단계의 네이버 검색과 향후 Inchelin Guide 정식 DB를 같은 화면에서 사용할 수 있게 한다.

## 모드 선택

`RESTAURANT_DATA_SOURCE` 환경 변수로 공급자를 선택한다.

- `naver`: `NaverRestaurantProvider`
- `inchelin`: `InchelinRestaurantProvider`

값이 없으면 개발 단계 기본값인 `naver`를 사용한다.

## 공통 계약

두 공급자는 다음 메서드를 제공한다.

```text
searchRestaurants({ query, messages, locationName })
getRestaurantDetail(place)
```

공급자는 공통 식당 레코드를 반환하고, AI는 검증된 `restaurant_id`만 선택한다. 카드 객체는 Worker가 공급자 레코드에서 조립하므로 모델이 식당 정보나 링크를 생성할 수 없다.

## NaverRestaurantProvider

개발 단계에서 네이버 지역 검색 API를 호출한다.

필요한 런타임 값:

- `RESTAURANT_DATA_SOURCE=naver`
- `NAVER_API_HUB_CLIENT_ID`
- `NAVER_API_HUB_CLIENT_SECRET`
- `NAVER_LOCAL_SEARCH_API_URL` — 선택값. 기본값은 NAVER API HUB 지역 검색 엔드포인트다.
- `PROVIDER_DEBUG_LOGS=true` — 개발 환경에서 데이터 소스, provider, 검색 query, API 상태, 결과 수, 오류 원인을 서버 로그에 기록한다. 인증정보는 기록하지 않는다.

자연어 대화에서 최근 지역과 음식 카테고리/메뉴를 분리해 `지역 + 음식 의도` 형태의 검색어를 만든다. 예를 들어 `강남에서 한식 먹고 싶어`는 `강남 한식`, 현재 위치가 `서울특별시 강남구 역삼동`이고 사용자가 국밥을 원하면 `역삼동 국밥`으로 요청한다.

네이버 지역 검색 결과는 공통 restaurant 객체로 정규화한다. 지역 검색 API가 제공하지 않는 이미지, 영업 상태, 영업시간, 대표 메뉴는 `null` 또는 빈 배열로 유지하고 임의로 생성하지 않는다. `mapx`, `mapy`는 네이버의 WGS84 정수 좌표 형식만 숫자 경도·위도로 변환한다.

최근 사용자 대화 최대 6개를 하나의 검색 문맥으로 만들어 단답형 후속 입력도 이전 조건과 함께 검색한다. API에서 실제로 받은 상호명, 주소, 전화번호와 네이버 URL만 카드에 사용한다. 이미지, 영업시간, 메뉴, 가격 등 응답에 없는 값은 숨긴다.

## 현재 위치 검색

브라우저는 사용자가 `현재 위치 근처`를 직접 선택하거나 입력해 전송했을 때만 `navigator.geolocation.getCurrentPosition()`을 호출한다. 좌표는 대화 기록이나 브라우저 저장소에 보관하지 않고 `/api/reverse-geocode` 요청에만 사용한다. Worker가 네이버 지도 Reverse Geocoding API로 지역명을 확인한 뒤, 지역명만 현재 대화의 검색 문맥에 저장한다.

추가 런타임 값:

- `NAVER_MAPS_API_KEY_ID`
- `NAVER_MAPS_API_KEY`
- `NAVER_GEOCODE_API_URL` — 선택값. 기본값은 네이버 지도 Geocoding URL이다.
- `NAVER_REVERSE_GEOCODE_API_URL` — 선택값. 기본값은 네이버 지도 Reverse Geocoding URL이다.

서버의 `/api/geocode`는 주소를 좌표로, `/api/reverse-geocode`는 좌표를 주소/지역명으로 변환한다. 지역 검색 API는 좌표 반경 검색으로 취급하지 않는다. 현재 위치는 역지오코딩으로 얻은 동네명을 지역 검색 query에 사용하며, 거리순 기능이 필요하면 추후 사용자 좌표와 결과 좌표 사이의 거리를 별도로 계산한다.

검색 상태는 `missing_credentials`, `authentication_failed`, `api_request_failed`, `no_results`, 정상 결과로 분리해 응답한다.

권한 거부는 세션 동안 기억해 같은 세션에서 권한 요청을 반복하지 않는다. 실패 시 좌표나 추정 위치를 사용하지 않고 서울, 강남, 직접 입력 선택지를 제공한다.

네이버 모드에서는 다음 표현을 사용하지 않는다.

- 인슐랭가이드 등록 맛집
- 등록된 맛집
- 추천인
- 인슐랭가이드 추천 맛집

## InchelinRestaurantProvider

정식 전환 시 `RESTAURANT_DATA_SOURCE=inchelin`로 바꾸고 기존 Inchelin DB API 환경 변수를 연결한다. 추천 후보는 Inchelin Guide DB에서만 가져오며 외부 정보는 동일 매장으로 확인된 등록 매장 보강에만 사용한다.

프론트의 대화, quick reply, 카드 렌더링 구조는 변경하지 않는다. 정식 모드에서만 추천인과 등록 맛집 표현을 사용할 수 있다.

## 실패 정책

- 공급자 인증값이 없거나 API 장애가 발생하면 가짜 식당을 만들지 않는다.
- 검색 결과가 없으면 지역 확대 또는 조건 변경을 제안한다.
- 정확한 네이버지도 URL이 확인되지 않으면 지도 버튼을 숨긴다.
- `permanently_closed` 매장은 카드 후보에서 제외한다.

## 대화형 검색 흐름

- 식사 의도는 있으나 지역이 없으면 지역만 확인한다.
- 지역만 먼저 입력되면 한식·중식·일식·양식·가볍게 수준의 큰 방향만 한 번 확인한다.
- 식사 의도와 지역이 모두 확인되면 추가 필터 질문 없이 바로 2~3개의 식당 카드를 요청한다.
- 직전 카드의 ID·상호·주소를 다음 요청 문맥에 포함해 `두 번째`, `비슷한 곳`, `다른 맛집` 같은 후속 표현을 해석한다.
- `다른 맛집`과 자연어 재추천에서는 직전 카드 ID를 후보에서 제외해 같은 결과 반복을 줄인다.
- 사용자가 새 지역을 말하면 가장 최근 지역을 검색 기준으로 사용하고, 이전 메뉴·동행자·식사 느낌은 유지한다.
