// Supported quick-entry regions. These aliases describe address areas, not walking radii.
export const SEARCH_REGIONS = ['강남', '강남역', '역삼', '홍대', '성수', '종로', '여의도'];
export const REGION_ALIASES = {
  강남: ['강남', '강남구'], 강남역: ['강남역', '역삼동', '서초동', '강남대로'],
  역삼: ['역삼', '역삼동'], 홍대: ['홍대', '서교동', '동교동'],
  성수: ['성수', '성수동'], 종로: ['종로', '종로구'], 여의도: ['여의도', '여의도동'],
  합정: ['합정', '합정동'], 상수: ['상수', '상수동'], 뚝섬: ['뚝섬', '성수동1가'], 서울숲: ['서울숲', '성수동1가'],
  안국: ['안국', '계동', '재동', '가회동'], 을지로: ['을지로'], 영등포: ['영등포'], 당산: ['당산'],
};
export const SEARCH_FOODS = [
  { name: '한식', value: '한식', menus: ['비빔밥', '불고기', '국밥'] },
  { name: '고기', value: '고기', menus: ['삼겹살', '갈비', '곱창'] },
  { name: '찌개/국밥', value: '국밥·찌개', menus: ['김치찌개', '순두부찌개', '국밥'] },
  { name: '면', value: '면', menus: ['냉면', '칼국수', '쌀국수'] },
  { name: '일식', value: '일식', menus: ['초밥', '라멘', '돈까스'] },
  { name: '중식', value: '중식', menus: ['마라탕', '짬뽕', '볶음밥'] },
  { name: '양식', value: '양식', menus: ['파스타', '피자', '스테이크'] },
  { name: '분식', value: '분식', menus: ['떡볶이', '만두'] },
  { name: '카페', value: '카페', menus: ['카페', '디저트', '베이커리'] },
  { name: '술집', value: '술집', menus: ['술집'] },
];
const compact = value => String(value || '').replace(/\s/g, '');
export function validSearchRegion(value) {
  return typeof value === 'string' && /^[가-힣a-zA-Z0-9·.\s-]{2,40}$/.test(value.trim()) && !/찾아줘|추천해줘|알려줘|먹을 곳|갈만한/.test(value);
}
export function searchMessage({ food = '', region = '', current = false }) {
  if (current) return `내 주변에서 ${food ? food + ' 먹을 곳' : '먹을 곳'} 찾아줘`;
  if (region && food) return `${region}에서 ${food} 먹을 곳 찾아줘`;
  if (region) return `${region}에서 먹을 곳 찾아줘`;
  if (food) return `${food} 먹고 싶어요`;
  return '';
}
export function placeMatchesRegion(place, region) {
  if (!region) return true;
  const address = compact([place.address, place.roadAddress, place.registered_data?.address, place.registered_data?.roadAddress].filter(Boolean).join(' '));
  const parts = String(region).trim().split(/\s+/);
  const key = parts.findLast(part => /(?:동|읍|면|역)$/.test(part)) || parts.findLast(part => /(?:구|군|시)$/.test(part)) || parts.at(-1);
  if (REGION_ALIASES[key] && !address.includes('서울') && /부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|전라|경상|제주/.test(address)) return false;
  const aliases = REGION_ALIASES[key] || [key, ...(/[동역]$/.test(key) ? [key.slice(0, -1)] : [])];
  return aliases.some(alias => address.includes(compact(alias)));
}
export function cardArea(card, region = '') {
  if (region && placeMatchesRegion(card, region)) return String(region).split(/\s+/).findLast(part => /(?:동|읍|면|역)$/.test(part)) || region;
  return String(card.address || '').match(/[가-힣]+(?:동|읍|면)(?=\s|\d|$)/)?.[0] || '';
}
export function nearbySuggestions(region, food) {
  const adjacent = { 강남: ['역삼', '강남역'], 강남역: ['역삼', '강남'], 역삼: ['강남역', '강남'], 홍대: ['합정', '상수'], 성수: ['뚝섬', '서울숲'], 종로: ['안국', '을지로'], 여의도: ['영등포', '당산'] }[region] || [];
  const category = SEARCH_FOODS.find(item => item.value === food || item.menus.includes(food));
  const similar = category?.menus.filter(menu => menu !== food).slice(0, 2) || [];
  return [...adjacent.slice(0, 2).map(value => ({ label: `${value}에서 찾기`, message: searchMessage({ region: value, food }) })),
    ...similar.map(value => ({ label: `${value}로 바꾸기`, message: searchMessage({ region, food: value }) }))];
}
