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
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `NAVER_LOCAL_SEARCH_API_URL` — 선택값. 기본값은 기존 지역 검색 API URL이며 API HUB 이관 시 새 엔드포인트로 교체한다.

최근 사용자 대화 최대 6개를 하나의 검색 문맥으로 만들어 단답형 후속 입력도 이전 조건과 함께 검색한다. API에서 실제로 받은 상호명, 주소, 전화번호와 네이버 URL만 카드에 사용한다. 이미지, 영업시간, 메뉴, 가격 등 응답에 없는 값은 숨긴다.

## 현재 위치 검색

브라우저는 사용자가 `현재 위치 근처`를 직접 선택하거나 입력해 전송했을 때만 `navigator.geolocation.getCurrentPosition()`을 호출한다. 좌표는 대화 기록이나 브라우저 저장소에 보관하지 않고 `/api/reverse-geocode` 요청에만 사용한다. Worker가 네이버 지도 Reverse Geocoding API로 지역명을 확인한 뒤, 지역명만 현재 대화의 검색 문맥에 저장한다.

추가 런타임 값:

- `NAVER_MAPS_API_KEY_ID`
- `NAVER_MAPS_API_KEY`
- `NAVER_REVERSE_GEOCODE_API_URL` — 선택값. 기본값은 네이버 지도 Reverse Geocoding URL이다.

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
