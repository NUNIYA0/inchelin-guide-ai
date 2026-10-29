import {menuMatches} from './menu-matching.js';
export const foodDirectionLabel=direction=>({warm:'따뜻한 음식',cold:'시원한 음식',broth:'국물 음식'}[direction]||'');
const cold=/냉(?!동)|비빔국수|비빔우동|막국수|메밀소바|자루(?:소바|우동)|물회|콩국수|아이스/;
const broth=/국밥|순대국|설렁탕|곰탕|해장국|북어국|북엇국|국수|칼국수|우동|쌀국수|라멘|라면|짬뽕|찌개|전골|샤브|온모밀|온메밀|(?:탕)(?!수육)/;
const cooked=/파스타|스파게티|리조토|리소토|볶음밥|제육|불고기|뚝배기|덮밥|돈까스|돈가스|돈카츠|스테이크|피자|떡볶이|볶음면/;
// These are menu directions inferred from authored dish names, not measured
// serving temperature, live weather, restaurant quality or seating claims.
export function foodDirectionScore(direction,menu){
 const name=String(menu||'');
 if(direction==='cold')return cold.test(name)?2:0;
 if(direction==='broth')return !cold.test(name)&&broth.test(name)?2:0;
 if(direction==='warm')return cold.test(name)?0:broth.test(name)?2:cooked.test(name)?1:0;
 return 0;
}
export function preferredMenus(menus,c){
 const broad=/^(한식|중식|일식|양식|분식|카페|고기)$/.test(c.food||'');
 return (menus||[]).filter(m=>!c.food||broad||menuMatches(c.food,m.name)).map(m=>({...m,directionScore:foodDirectionScore(c.foodDirection,m.name)})).filter(m=>m.directionScore>0).sort((a,b)=>b.directionScore-a.directionScore);
}
export const cardDirectionScore=(card,c)=>Math.max(0,...preferredMenus(card.registeredFacts?.menus,c).map(m=>m.directionScore));
export function directionDisplayMenu(card,c){
 const limit=c.budget?Number(String(c.budget).replace(/[^\d]/g,'')):null;
 const available=preferredMenus(card.registeredFacts?.menus,c).filter(m=>!limit||Number.isFinite(m.priceKRW)&&m.priceKRW<=limit);
 const menu=available.find(m=>m.mainDish===true)||available[0];
 return menu?{name:menu.name,priceKRW:menu.priceKRW}:null;
}
export function foodDirectionLead(cards,c){
 if(!c.foodDirection)return '';
 const menus=cards.flatMap(card=>preferredMenus(card.registeredFacts?.menus,c));
 const best=Math.max(0,...menus.map(m=>m.directionScore));
 const names=[...new Set(menus.filter(m=>m.directionScore===best).map(m=>m.name))].slice(0,2);
 if(!names.length)return '';
 const direction=c.foodDirection==='warm'&&best===2?'따뜻한 국물':foodDirectionLabel(c.foodDirection);
 return `${direction} 쪽으로 ${names.join('·')} 같은 등록 메뉴가 있어요.`;
}
