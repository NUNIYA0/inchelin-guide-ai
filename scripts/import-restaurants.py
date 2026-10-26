"""Read-only XLSX ingestion; generated operational data is not Git-tracked."""
import argparse, hashlib, json, pathlib, re
import openpyxl

parser = argparse.ArgumentParser()
parser.add_argument('source')
parser.add_argument('output')
args = parser.parse_args()
source = pathlib.Path(args.source)
book = openpyxl.load_workbook(source, read_only=True, data_only=True)
sheet = book['05_정보확인완료_1099곳']
rows = list(sheet.values)
headers = rows[0]
required = ['번호', '맛집 상호명', '맛집 지역', '추천인', '네이버 매장명', '네이버 등록주소', '메뉴·가격', '영업시간', '연락처', '네이버지도 링크', '매칭상태', '수집일']
assert all(key in headers for key in required), 'Unexpected workbook columns'
restaurants = []
main = re.compile(r'국밥|설렁탕|곰탕|냉면|칼국수|쌀국수|라멘|우동|메밀|돈까스|돈카츠|제육|찌개|비빔밥|덮밥|볶음밥|짜장|짬뽕|파스타|스파게티|리소토|피자|초밥|스시|떡볶이|김밥|삼겹살|갈비|스테이크')
side = re.compile(r'추가|사리|공기밥|계란찜|음료|소주|맥주|와인|하이볼|콜라|사이다|주스|커피|아이스크림|\d+\s*(?:인|명)|인분|세트|코스|소\)|중\)|대\)|\(소|\(중|\(대')
for raw in rows[1:]:
    if not any(v is not None for v in raw):
        continue
    r = dict(zip(headers, raw))
    menus = []
    for line in str(r['메뉴·가격'] or '').splitlines():
        line = line.strip()
        if not line:
            continue
        match = re.search(r'\s+([0-9][0-9,]*)\s*원\s*$', line)
        name = line[:match.start()].strip() if match else line
        price = int(match[1].replace(',', '')) if match else None
        menus.append({'name': name, 'priceKRW': price, 'mainDish': bool(main.search(name) and not side.search(name))})
    address = str(r['네이버 등록주소'] or '').strip()
    assert address and str(r['네이버 매장명'] or '').strip(), 'Missing restaurant identity'
    restaurants.append({
        'sourceId': 'xlsx-261026-' + str(r['번호']), 'name': r['네이버 매장명'],
        'aliases': [r['맛집 상호명']], 'roadAddress': address, 'parcelAddress': '',
        'originalAddress': r['맛집 지역'], 'category': '', 'imageUrl': None,
        'menus': menus, 'menuText': r['메뉴·가격'], 'openingHoursText': r['영업시간'],
        'phone': r['연락처'], 'naverPlaceUrl': r['네이버지도 링크'],
        'collectedAt': str(r['수집일'])[:10], 'matchingStatus': r['매칭상태'],
        'recommendations': [{'id': 'xlsx-261026-' + str(r['번호']) + '-recommendation',
          'recommenderName': r['추천인'] or None, 'reason': None, 'writtenAt': None, 'tags': []}]
    })
assert len(restaurants) == 1099, 'Unexpected row count'
assert len({r['sourceId'] for r in restaurants}) == 1099
result = {'schemaVersion': 1, 'exclusive': True, 'sourceDate': '2026-10-26',
          'sourceHash': hashlib.sha256(source.read_bytes()).hexdigest(), 'restaurants': restaurants}
output = pathlib.Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(json.dumps({'rows': len(restaurants), 'menus': sum(len(r['menus']) for r in restaurants),
                  'missingReasons': len(restaurants), 'coordinatesInSource': 0, 'sha256': result['sourceHash']}))
