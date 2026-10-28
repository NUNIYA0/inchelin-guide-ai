// Coordinate/category enrichment is bounded and never adds an unregistered restaurant.
import {menuMatches} from './menu-matching.js';
import {evaluateConditions} from './condition-evidence.js';
const cache=new Map(),TTL=3600000;
const nameKey=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[^가-힣a-z0-9]/g,'');
const streetKey=v=>{const m=String(v||'').match(/([가-힣0-9·]+(?:대로|로|길))\s+(\d+(?:-\d+)?)/);return m?nameKey(m[1])+':'+m[2]:'';};
const placeId=v=>String(v||'').match(/(?:place\/|placeId=)(\d+)/)?.[1]||'';
export function matchesRegisteredPlace(row,place){
  const info=place.registered_data||{},id=placeId(row.naverPlaceUrl),other=String(info.naverPlaceId||info.naver_place_id||'');
  if(id&&other&&id!==other)return false;
  const names=[row.name,...(row.aliases||[])].map(nameKey),address=streetKey(row.roadAddress||row.parcelAddress),found=streetKey(info.roadAddress||place.address);
  const district=String(row.roadAddress||'').match(/([가-힣]+(?:구|군))\s/)?.[1];
  return (names.includes(nameKey(place.name))||Boolean(id&&other&&id===other))&&Boolean(address&&address===found)&&(!district||String(info.roadAddress||place.address).includes(district));
}
const regionPatterns={강남역:/강남구|서초구/,역삼역:/강남구/,홍대입구역:/마포구/,합정역:/마포구/,성수역:/성동구|광진구/,종로3가역:/종로구|중구/,여의도역:/영등포구/};
export function registeredShortlist(rows,c,centers,limit=8){
  const closest=c.location.kind==='current'?[...centers].sort((a,b)=>Math.hypot(a.latitude-c.location.latitude,a.longitude-c.location.longitude)-Math.hypot(b.latitude-c.location.latitude,b.longitude-c.location.longitude))[0]:c.location;
  const label=closest?.label||c.location.label,pattern=regionPatterns[label]||(c.location.district?new RegExp(c.location.district):null);
  const food=c.food||'',broad=/^(한식|중식|일식|양식|분식|카페|고기)$/.test(food);
  return rows.filter(row=>(!pattern||pattern.test(row.roadAddress||row.parcelAddress||''))&&(!food||broad||row.menus.some(m=>menuMatches(food,m.name))))
    .map((row,index)=>({row,index,score:row.name.includes(label)?10:0}))
    .sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).map(v=>v.row);
}
export async function resolveRegisteredCards(catalog,c,api,lookup,options={}){
  const rows=catalog.entries(),pool=registeredShortlist(rows,c,api.centers,rows.length);
  const shortlist=pool.slice(0,options.progressive?24:8);let failures=0,attempted=0,matched=0,outside=0;
  const resolve=async row=>{
    attempted++;
    const key=row.sourceId||row.name+'|'+row.roadAddress;let found=cache.get(key);
    if(found&&found.expires<=Date.now()){cache.delete(key);found=null;}
    let place=found?.place;
    if(!place){try{const results=await lookup(row);place=results.find(p=>matchesRegisteredPlace(row,p));if(place){if(cache.size>1500)cache.delete(cache.keys().next().value);cache.set(key,{expires:Date.now()+TTL,place});}}catch{failures++;}}
    if(!place)return null;matched++;
    const info=place.registered_data||{},meters=api.distance(c.location,info);
    if(meters===null||meters>c.radiusMeters){outside++;return null;}
    return {id:'registered:'+key,registeredSourceId:row.sourceId,name:row.name,restaurantName:row.name,
      address:row.roadAddress||row.parcelAddress,roadAddress:row.roadAddress,parcelAddress:row.parcelAddress,
      category:info.category||'음식점',rawCategory:info.rawCategory||info.category||'음식점',
      latitude:info.latitude,longitude:info.longitude,dataSource:'inchelin',isRegisteredInInchelin:true,
      distanceMeters:Math.round(meters),distanceKind:'straight',originLabel:c.location.label,regionLabel:c.location.label,
      naverPlaceId:row.naverPlaceId||null,naverPlaceUrl:row.naverPlaceUrl||null,naverPlaceVerification:row.naverPlaceVerification||null,validationVersion:2};
  };
  const resolved=[];
  if(!options.progressive)resolved.push(...await Promise.all(shortlist.map(resolve)));
  else for(let offset=0;offset<shortlist.length;offset+=4){
    resolved.push(...await Promise.all(shortlist.slice(offset,offset+4).map(resolve)));
    const cards=catalog.enrich(resolved.filter(Boolean),c),accepted=options.acceptedUnknowns||[],excluded=new Set(options.excludeIds||[]);
    const usable=cards.filter(card=>!excluded.has(card.id)&&evaluateConditions(card,c).checks.every(check=>!check.blocking||check.status==='confirmed'||check.status==='experience'||check.status==='unknown'&&accepted.includes(check.key)));
    if(usable.length>=3)break;
    const unresolvable=new Set(['vibe','parking']);
    if(!rows.some(row=>row.openingSchedule))unresolvable.add('visit');
    if(c.companion!=='혼밥'||!rows.some(row=>row.soloEvidence||row.recommendations.some(rec=>rec.reason)))unresolvable.add('companion');
    const eligible=cards.filter(card=>!excluded.has(card.id)&&evaluateConditions(card,c).status!=='failed');
    if(eligible.length>=3&&eligible.every(card=>evaluateConditions(card,c).checks.every(check=>!check.blocking||check.status!=='unknown'||unresolvable.has(check.key))))break;
  }
  return {cards:catalog.enrich(resolved.filter(Boolean).sort((a,b)=>a.distanceMeters-b.distanceMeters),c),attempted,failures,diagnostics:{registeredTotal:rows.length,menuRegionCandidates:pool.length,lookedUp:attempted,identityMatched:matched,outsideRadius:outside,withinRadius:resolved.filter(Boolean).length,candidateLimit:options.progressive?24:8,truncated:pool.length>attempted}};
}
