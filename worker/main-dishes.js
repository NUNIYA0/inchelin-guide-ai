// Explicit taxonomy: a dish must be a meal, not simply a searchable food name.
export const DISH_DICTIONARY = [
  {name:'불고기덮밥',main_dish:true}, {name:'잡채밥',main_dish:true},
  {name:'마르게리타',main_dish:true},
  ...['국밥','냉면','덮밥','삼겹살','파스타','초밥','샌드위치','포케','죽','돈까스','돈가스','피자','치킨','떡볶이','쌀국수','카레','비빔밥','전골','제육볶음','짬뽕','볶음밥','김밥','스테이크','우동','갈비','순두부찌개','칼국수','불고기','마라탕','김치찌개','짜장면','가츠동','라멘','리소토','햄버거','라자냐','라볶이','곱창','목살','닭갈비','메밀국수','비빔국수','곰탕','설렁탕','토스트','쫄면','라면','김치볶음밥','마라샹궈','샐러드','베이글샌드위치','오믈렛'].map(name=>({name,main_dish:true})),
  ...['공기밥','계란찜','김치전','사이다','소주','맥주','막걸리','아이스크림','디저트','베이커리','크로플','팬케이크','군만두','만두','탕수육','튀김','어묵','커피','음료','반찬','곁들임','사이드'].map(name=>({name,main_dish:false})),
];
export const MAIN_DISHES = DISH_DICTIONARY.filter(item=>item.main_dish);
export const isMainDish = name=>MAIN_DISHES.some(item=>item.name === name);
export const SIDE_FOOD = /공기밥|계란찜|김치전|사이다|콜라|소주|맥주|막걸리|주류|음료|술(?:집|로|을)?|아이스크림|디저트|베이커리|크로플|팬케이크|군만두|만두|탕수육|튀김|어묵|커피|반찬|곁들임|사이드/;
export function isSideRequest(text) {
  const side=SIDE_FOOD.test(String(text));
  return side && !MAIN_DISHES.some(item=>String(text).includes(item.name));
}
