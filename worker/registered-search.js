// Coordinate/category enrichment is bounded and never adds an unregistered restaurant.
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
export function registeredShortlist(rows,c,centers){
  const closest=c.location.kind==='current'?[...centers].sort((a,b)=>Math.hypot(a.latitude-c.location.latitude,a.longitude-c.location.longitude)-Math.hypot(b.latitude-c.location.latitude,b.longitude-c.location.longitude))[0]:c.location;
  const label=closest?.label||c.location.label,pattern=regionPatterns[label];
  const food=c.food||'',broad=/^(한식|중식|일식|양식|분식|카페|고기)$/.test(food);
  return rows.filter(row=>(!pattern||pattern.test(row.roadAddress||row.parcelAddress||''))&&(!food||broad||row.menus.some(m=>m.name.includes(food))))
    .map((row,index)=>({row,index,score:row.name.includes(label)?10:0}))
    .sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,8).map(v=>v.row);
}
export async function resolveRegisteredCards(catalog,c,api,lookup){
  const shortlist=registeredShortlist(catalog.entries(),c,api.centers);let failures=0;
  const resolved=await Promise.all(shortlist.map(async row=>{
    const key=row.sourceId||row.name+'|'+row.roadAddress;let found=cache.get(key);
    if(found&&found.expires<=Date.now()){cache.delete(key);found=null;}
    let place=found?.place;
    if(!place){try{const results=await lookup(row);place=results.find(p=>matchesRegisteredPlace(row,p));if(place){if(cache.size>1500)cache.delete(cache.keys().next().value);cache.set(key,{expires:Date.now()+TTL,place});}}catch{failures++;}}
    if(!place)return null;
    const info=place.registered_data||{},meters=api.distance(c.location,info);
    if(meters===null||meters>c.radiusMeters)return null;
    return {id:'registered:'+key,registeredSourceId:row.sourceId,name:row.name,restaurantName:row.name,
      address:row.roadAddress||row.parcelAddress,roadAddress:row.roadAddress,parcelAddress:row.parcelAddress,
      category:info.category||'음식점',rawCategory:info.rawCategory||info.category||'음식점',
      latitude:info.latitude,longitude:info.longitude,dataSource:'inchelin',isRegisteredInInchelin:true,
      distanceMeters:Math.round(meters),distanceKind:'straight',originLabel:c.location.label,regionLabel:c.location.label,
      naverPlaceId:info.naverPlaceId||null,naverPlaceUrl:api.mapUrl(row.roadAddress||row.parcelAddress),validationVersion:2};
  }));
  return {cards:catalog.enrich(resolved.filter(Boolean).sort((a,b)=>a.distanceMeters-b.distanceMeters),c),attempted:shortlist.length,failures};
}
