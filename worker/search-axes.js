// Supported quick-entry regions. These aliases describe address areas, not walking radii.
export const SEARCH_REGIONS = ['강남', '강남역', '역삼', '홍대', '성수', '종로', '여의도'];
export const REGION_NORMALIZATION = {
  강남역: ['강남역'], 강남: ['강남구', '강남'], 역삼: ['역삼역', '역삼1동', '역삼2동', '역삼동', '역삼'],
  홍대: ['홍대입구역', '홍대입구', '홍대', '서교동', '동교동'], 성수: ['성수동1가', '성수동2가', '성수동', '성수역', '성수'],
  종로: ['종로구', '종로1가', '종로2가', '종로3가', '종로4가', '종로5가', '종로6가', '종로'], 여의도: ['여의도역', '여의도동', '여의도'],
};
export function normalizeSearchRegion(value) {
  const text = String(value || '').trim();
  const choices = Object.entries(REGION_NORMALIZATION).flatMap(([region, aliases]) => aliases.map(alias => ({ region, alias }))).sort((a, b) => b.alias.length - a.alias.length);
  return choices.find(item => text === item.alias || new RegExp(`^(?:서울(?:특별시|시)?\\s*)?${item.alias}(?:\\s*(?:쪽|근처|주변|에서))?$`).test(text))?.region || text;
}
export function mentionedSearchRegion(text) {
  const choices = Object.entries(REGION_NORMALIZATION).flatMap(([region, aliases]) => aliases.map(alias => ({ region, alias })));
  const matches = choices.flatMap(item => [...String(text).matchAll(new RegExp(item.alias, 'g'))].map(match => ({ ...item, at: match.index })));
  // Longer aliases at the same start beat their parent, e.g. 강남역 over 강남.
  return matches.sort((a, b) => b.at - a.at || b.alias.length - a.alias.length)[0]?.region || '';
}
export const FOOD_HIERARCHY = [
  { food_type: '고기', menus: ['삼겹살', '갈비', '곱창', '불고기', '제육볶음'], aliases: ['고깃집', '고기', '구이', '육류'] },
  { food_type: '국밥·찌개', menus: ['국밥', '순두부찌개', '김치찌개', '찌개', '전골', '곰탕', '설렁탕'], aliases: ['국밥·찌개', '찌개/국밥', '국물 있는 거', '국물'] },
  { food_type: '면', menus: ['냉면', '칼국수', '비빔국수', '메밀국수', '쌀국수', '라멘', '우동', '국수'], aliases: ['면', '면요리'] },
  { food_type: '한식', menus: ['비빔밥', '덮밥', '불고기덮밥', '죽', '만두'], aliases: ['한식'] },
  { food_type: '일식', menus: ['돈까스', '돈가스', '초밥', '스시', '가츠동', '카레'], aliases: ['일식', '일본식'] },
  { food_type: '중식', menus: ['마라탕', '마라샹궈', '짬뽕', '탕수육', '볶음밥'], aliases: ['중식', '중국식'] },
  { food_type: '양식', menus: ['파스타', '피자', '스테이크', '햄버거', '버거'], aliases: ['양식'] },
  { food_type: '분식', menus: ['떡볶이', '김밥'], aliases: ['분식'] },
  { food_type: '카페', menus: ['디저트', '베이커리', '샌드위치'], aliases: ['카페', '커피', '빵'] },
  { food_type: '샐러드·포케', menus: ['샐러드', '포케'], aliases: [] },
  { food_type: '치킨', menus: ['치킨', '닭발'], aliases: [] },
  { food_type: '해산물', menus: ['해산물', '횟집'], aliases: [] },
  { food_type: '술집', menus: [], aliases: ['술집', '주점', '호프', '포차'] },
];
export function normalizeFoodAxis(value) {
  const text = String(value || '');
  if (/국밥·찌개|찌개\/국밥|국밥(?:이나|과|\/|·)\s*찌개/.test(text)) return { food_type: '국밥·찌개', menu: null };
  const matches = FOOD_HIERARCHY.flatMap(entry => entry.menus.flatMap(menu => [...text.matchAll(new RegExp(menu, 'g'))].map(match => ({ food_type: entry.food_type, menu, at: match.index, size: menu.length }))));
  const full = matches.filter(item => !matches.some(other => other !== item && other.at <= item.at && other.at + other.size >= item.at + item.size && other.size > item.size));
  const found = full.sort((a, b) => b.at - a.at || b.size - a.size)[0];
  if (found) return { food_type: found.food_type, menu: found.menu };
  const aliases = FOOD_HIERARCHY.flatMap(entry => entry.aliases.flatMap(alias => [...text.matchAll(new RegExp(alias === '면' ? '(?<![가-힣])면(?![가-힣])' : alias, 'g'))].map(match => ({ food_type: entry.food_type, menu: null, at: match.index, size: alias.length }))));
  const broad = aliases.sort((a, b) => b.at - a.at || b.size - a.size)[0];
  return broad ? { food_type: broad.food_type, menu: null } : null;
}
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
  const adjacent = { 강남: ['역삼', '강남역'], 강남역: ['역삼', '강남'], 역삼: ['강남역', '강남'], 홍대: ['성수', '종로'], 성수: ['홍대', '종로'], 종로: ['홍대', '성수'], 여의도: ['종로', '홍대'] }[region] || [];
  const category = SEARCH_FOODS.find(item => item.value === food || item.menus.includes(food));
  const similar = category?.menus.filter(menu => menu !== food).slice(0, 2) || [];
  return [...adjacent.slice(0, 2).map(value => ({ label: `${value}에서 찾기`, message: searchMessage({ region: value, food }) })),
    ...similar.map(value => ({ label: `${value}로 바꾸기`, message: searchMessage({ region, food: value }) }))];
}
