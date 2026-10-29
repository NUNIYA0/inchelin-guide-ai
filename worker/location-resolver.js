import {findRegisteredRegion} from './region-catalog.js';
// Ambiguous geography aliases are location data, not an intent classifier.
// No station coordinates are inferred from this list; selections use lookup.
export function ambiguousLocationQuestion(query){
  const name=String(query||'').normalize('NFKC').replace(/\s/g,'').replace(/^서울(?:특별시)?(?:중구)?/,'');
  if(!['을지로','을지로역','을지로쪽','을지로일대','을지로근처','을지로주변'].includes(name))return null;
  return {slot:'location',text:'을지로는 어느 쪽이 편하세요? 역을 고르거나 서울 중구 전체에서 찾아볼 수 있어요.',choices:[
    ...['을지로입구역','을지로3가역','을지로4가역'].map(name=>({label:name,message:name+'에서 찾아줘',contract:'location_selection',locationValue:name})),
    {label:'서울 중구 전체',message:'서울 중구 전체에서 찾아줘',contract:'location_selection',locationValue:'서울 중구'}
  ]};
}
// The model supplies a name, never coordinates. Administrative boundaries have no center.
export async function resolveLocation(query,context,env,fetcher=fetch){
  const api=globalThis.InchelinPhase1;
  const area=findRegisteredRegion(context.registeredRegions,query);
  if(area)return area;
  const clarification=ambiguousLocationQuestion(query);
  if(clarification)return {kind:'ambiguous',question:clarification};
  const scoped=context.verifiedRegionSelection;
  if(scoped&&[scoped.label,scoped.centerLabel].includes(query))return {latitude:scoped.latitude,longitude:scoped.longitude,label:scoped.label,kind:'station',query:scoped.province+' '+scoped.district+' '+scoped.label,district:scoped.district,regionId:scoped.regionId,id:scoped.id};
  if(query==='current'){const point=api.coords(context.currentLocation);return point?{...point,label:'현재 위치',kind:'current',query:context.currentLocationName||'현재 위치'}:null;}
  const picked=api.locationOptions().find(row=>row.id===context.locationSelection?.id&&row.latitude===context.locationSelection.latitude&&row.longitude===context.locationSelection.longitude);
  if(picked&&[picked.label,picked.centerLabel].includes(query)){const center=api.centers.find(c=>c.label===picked.centerLabel);return {...center,kind:'station',id:picked.id,selectionLabel:picked.label};}
  const known=api.centers.find(c=>c.label===query||c.aliases.includes(query));if(known)return {...known,kind:'station'};
  const name=query==='광화문'?'광화문역':String(query).trim();if(!name.endsWith('역'))return null;
  if(!env.NAVER_API_HUB_CLIENT_ID||!env.NAVER_API_HUB_CLIENT_SECRET)throw new Error('location_unavailable');
  const url=new URL('https://naverapihub.apigw.ntruss.com/search/v1/local');url.search=new URLSearchParams({query:name,display:'5',format:'json'});
  const response=await fetcher(url,{headers:{'X-NCP-APIGW-API-KEY-ID':env.NAVER_API_HUB_CLIENT_ID,'X-NCP-APIGW-API-KEY':env.NAVER_API_HUB_CLIENT_SECRET},signal:AbortSignal.timeout(3000)});if(!response.ok)throw new Error('location_failed');
  const data=await response.json(),key=v=>String(v||'').replace(/<[^>]*>/g,'').replace(/\s/g,'');
  const matches=(data.items||[]).filter(row=>/지하철|전철/.test(row.category||'')&&key(row.title).replace(/\d+호선$/,'')===key(name)).map(row=>{const rawX=Number(row.mapx),rawY=Number(row.mapy),point=api.coords({longitude:Math.abs(rawX)>180?rawX/1e7:rawX,latitude:Math.abs(rawY)>90?rawY/1e7:rawY});return point?{...point,label:name,kind:'station',query:name,address:row.roadAddress||row.address||'',district:(row.roadAddress||row.address||'').match(/[가-힣]+구/)?.[0]||null}:null;}).filter(Boolean);
  const unique=[...new Map(matches.map(p=>[p.latitude+':'+p.longitude,p])).values()];
  if(unique.length===1)return unique[0];
  // Interchange lines may have separate records for the same named station.
  // Accept only a tight cluster and choose an actual provider point (medoid).
  if(unique.length>1&&unique.every(a=>unique.every(b=>api.distance(a,b)<=300)))return unique.map(point=>({point,total:unique.reduce((sum,other)=>sum+api.distance(point,other),0)})).sort((a,b)=>a.total-b.total||a.point.latitude-b.point.latitude||a.point.longitude-b.point.longitude)[0].point;
  return null;
}
