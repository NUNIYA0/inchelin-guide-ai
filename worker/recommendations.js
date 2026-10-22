// Authored records are data, never model output. Do not rewrite names or reasons.
export const normalizeAddress = value => String(value || '').normalize('NFKC').toLowerCase()
  .replace(/서울특별시|서울시/g,'서울').replace(/부산광역시/g,'부산').replace(/경기도/g,'경기')
  .replace(/[\s,()[\]]/g,'');
const normalizeName = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s()[\]·]/g,'');
const addressKeys = row => [...new Set([row.roadAddress,row.parcelAddress,row.address].map(normalizeAddress).filter(Boolean))];
const sameAddress = (a,b) => a.roadAddress&&b.roadAddress
  ? normalizeAddress(a.roadAddress)===normalizeAddress(b.roadAddress)
  : addressKeys(a).some(key=>addressKeys(b).includes(key));
export function dedupeRestaurants(cards) {
  const seen = new Set();
  return cards.filter(card => {
    const address=normalizeAddress(card.roadAddress||card.parcelAddress||card.address);
    // Distinct businesses in the same building must not be merged.
    const key=address?address+'|'+normalizeName(card.name):'id:'+card.id;
    if(seen.has(key))return false;seen.add(key);return true;
  });
}
export function validateRecommendationSource(source) {
  if(source?.schemaVersion!==1 || !Array.isArray(source.restaurants))throw new Error('Recommendation source: schemaVersion 1 and restaurants[] required');
  const ids=new Map();
  const restaurants=source.restaurants.map(row=>{
    if(!addressKeys(row).length || !Array.isArray(row.recommendations))throw new Error('Recommendation restaurant: address and recommendations[] required');
    const recommendations=row.recommendations.map(rec=>{
      if(typeof rec.id!=='string'||!rec.id.trim())throw new Error('Recommendation: stable id required');
      for(const key of ['recommenderName','reason','writtenAt'])if(rec[key]!=null&&typeof rec[key]!=='string')throw new Error('Recommendation: '+key+' must be string or null');
      if(rec.writtenAt && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(rec.writtenAt)||!Number.isFinite(Date.parse(rec.writtenAt))))throw new Error('Recommendation: writtenAt must be ISO timestamp with timezone');
      if(rec.tags!=null&&(!Array.isArray(rec.tags)||rec.tags.some(tag=>typeof tag!=='string')))throw new Error('Recommendation: tags must be strings');
      const clean={id:rec.id,recommenderName:rec.recommenderName??null,reason:rec.reason??null,writtenAt:rec.writtenAt||null,tags:rec.tags||[]};
      const owner=normalizeAddress(row.roadAddress||row.parcelAddress||row.address)+'|'+normalizeName(row.name);
      const signature=JSON.stringify([owner,clean]);
      if(ids.has(clean.id)&&ids.get(clean.id)!==signature)throw new Error('Recommendation: conflicting duplicate id '+clean.id);
      ids.set(clean.id,signature);return clean;
    });
    const menus=Array.isArray(row.menus)?row.menus.map(menu=>{
      if(typeof menu.name!=='string'||!menu.name.trim()||menu.priceKRW!=null&&(!Number.isFinite(menu.priceKRW)||menu.priceKRW<0))throw new Error('Invalid registered menu');
      return {name:menu.name,priceKRW:menu.priceKRW??null,mainDish:menu.mainDish===true};
    }):[];
    const location=Number.isFinite(row.latitude)&&Number.isFinite(row.longitude)&&Math.abs(row.latitude)<=90&&Math.abs(row.longitude)<=180?{latitude:row.latitude,longitude:row.longitude}:{};
    return {name:row.name||'',roadAddress:row.roadAddress||'',parcelAddress:row.parcelAddress||'',address:row.address||'',recommendations,category:typeof row.category==='string'?row.category:'',menus,...location,imageUrl:typeof row.imageUrl==='string'&&/^https:\/\//.test(row.imageUrl)?row.imageUrl:null,soloEvidence:row.soloEvidence?.confirmed===true&&typeof row.soloEvidence.source==='string'&&row.soloEvidence.source.trim()?{confirmed:true,source:row.soloEvidence.source}:null};
  });
  return {schemaVersion:1,restaurants};
}
const conditionWords = c => [c.food,c.companion,c.purpose,c.vibe,c.parking?'주차':null,c.people].filter(Boolean).map(String);
const authoredTime=rec=>rec.writtenAt?Date.parse(rec.writtenAt):-Infinity;
function relevance(rec,c) {
  const text=[rec.reason||'',...rec.tags].join(' ');
  return conditionWords(c).reduce((score,word)=>score+(text.includes(word)||word==='혼밥'&&/혼자|혼밥/.test(text)?1:0),0);
}
export function createRecommendationCatalog(source={enabled:false,connected:false,restaurants:[]}) {
  const active=source.enabled===true&&source.connected===true;
  const rows=active?validateRecommendationSource(source).restaurants:[];
  function match(card){const matches=rows.filter(row=>sameAddress(card,row)),exact=matches.filter(row=>normalizeName(row.name)===normalizeName(card.name)),owners=new Set(matches.map(row=>normalizeName(row.name)));return {matches,selected:exact.length?exact:owners.size===1&&owners.has('')?matches:[]};}
  function bundle(card,conditions={}) {
    if(!active)return undefined;
    const matches=rows.filter(row=>sameAddress(card,row));
    const exactName=matches.filter(row=>normalizeName(row.name)===normalizeName(card.name));
    const owners=new Set(matches.map(row=>normalizeName(row.name)));
    // A nameless address record is safe only when the address is unambiguous.
    const selected=exactName.length?exactName:owners.size===1&&owners.has('')?matches:[];
    const records=[...new Map(selected.flatMap(row=>row.recommendations).map(rec=>[rec.id,rec])).values()];
    records.sort((a,b)=>relevance(b,conditions)-relevance(a,conditions)||authoredTime(b)-authoredTime(a)||(a.id<b.id?-1:a.id>b.id?1:0));
    return {status:matches.length&&!selected.length?'ambiguous':selected.length?'matched':'unmatched',representative:records[0]||null,additional:records.slice(1),totalCount:records.length};
  }
  function enrich(cards,conditions){return dedupeRestaurants(cards).map(card=>{const {recommendationBundle,registeredFacts,...clean}=card;if(!active)return clean;const row=match(clean).selected[0];return {...clean,...(row?{registeredFacts:{category:row.category,menus:row.menus,soloEvidence:row.soloEvidence},imageUrl:row.imageUrl||null}:{}),recommendationBundle:bundle(clean,conditions)};});}
  return {active,enrich,search(){return dedupeRestaurants(rows.filter(row=>row.name&&Number.isFinite(row.latitude)&&Number.isFinite(row.longitude)).map(row=>({id:'registered:'+normalizeAddress(row.roadAddress||row.parcelAddress||row.address)+'|'+normalizeName(row.name),name:row.name,restaurantName:row.name,address:row.roadAddress||row.parcelAddress||row.address,roadAddress:row.roadAddress,parcelAddress:row.parcelAddress,latitude:row.latitude,longitude:row.longitude,category:row.category||'음식점',rawCategory:row.category||'음식점',dataSource:'inchelin',isRegisteredInInchelin:true,validationVersion:2})));}};
}
