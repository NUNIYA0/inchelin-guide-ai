# Inchelin Guide 런타임 API 계약

AI Worker가 등록 매장 정책을 코드 수준에서 강제하기 위한 서버 간 계약이다. 두 API URL은 사용자 입력으로 받지 않고 Sites 런타임 환경 변수로만 설정한다.

## 1. 등록 매장 검색

`POST {INCHELIN_DB_API_URL}/v1/places/search`

요청 예시:

```json
{
  "query": "부모님과 갈 조용한 한식집",
  "conversation": ["오늘 저녁 뭐 먹을까?", "부모님이랑", "한식"],
  "mode": "recommend_or_lookup",
  "scope": "inchelin_registered_only",
  "match_fields": ["name", "address", "branch"],
  "limit": 6
}
```

응답 예시:

```json
{
  "ambiguous": false,
  "places": [
    {
      "id": "ig_123",
      "name": "예시식당",
      "address": "서울특별시 ...",
      "branch": "본점",
      "business_status": "active",
      "registered_data": {
        "category": "한식",
        "representative_menu": ["비빔밥"]
      },
      "facts": {}
    }
  ]
}
```

`places`에는 Inchelin Guide 등록 매장만 반환해야 한다. 자연어 조건 중 DB에 없는 필드는 필터로 사용하지 않는다. 같은 이름의 매장이 여러 개라 지점이나 주소를 확정할 수 없으면 `ambiguous: true`를 반환한다.

## 2. 등록 매장 보강

`POST {INCHELIN_ENRICHMENT_API_URL}/v1/enrich`

이 API는 등록 매장 검색에서 반환된 매장에 대해서만 호출된다.

요청 예시:

```json
{
  "place_id": "ig_123",
  "canonical_name": "예시식당",
  "canonical_address": "서울특별시 ...",
  "canonical_branch": "본점",
  "allowed_purpose": "registered_place_enrichment_only"
}
```

응답 예시:

```json
{
  "identity_confirmed": true,
  "matched_name": "예시식당",
  "matched_address": "서울특별시 ...",
  "facts": {
    "opening_hours": {
      "value": "11:00-21:00",
      "origin": "official",
      "checked_at": "2026-09-29T05:00:00Z",
      "source_url": "https://example.com/store",
      "resolution_status": "confirmed"
    }
  }
}
```

Worker는 다음 조건을 모두 만족한 필드만 AI에 전달한다.

- `identity_confirmed`가 참
- `matched_name`이 기준 상호명과 정규화 후 정확히 일치
- `matched_address`가 기준 주소와 정규화 후 정확히 일치
- 필드의 `resolution_status`가 `confirmed`
- 필드가 허용 목록에 포함

상호명이나 주소가 다르면 응답 전체를 버린다. 보강 API가 실패해도 다른 외부 매장을 검색하거나 신규 후보를 추가하지 않는다.

## 3. 상태 처리

- `active`: 추천 가능
- `temporarily_closed`: 등록 정보로 유지하되 현재 방문 추천에는 주의
- `permanently_closed`: 추천 결과에서 제외하고 직접 질문 시 폐업 안내
- `unknown`: 확인되지 않은 상태로 취급

## 4. 안전 실패

등록 매장 API가 설정되지 않았거나 장애가 발생하면 실제 매장을 추천하지 않는다. 등록 매장 검색 결과가 비어 있으면 미등록 안내를 반환하며 외부 보강 API는 호출하지 않는다.
