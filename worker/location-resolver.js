// The model supplies a name, never coordinates. Only trusted points/API results resolve it.
export async function resolveLocation(query,context,env,fetcher=fetch){
  const api=globalThis.InchelinPhase1;
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
  const unique=[...new Map(matches.map(p=>[p.latitude+':'+p.longitude,p])).values()];return unique.length===1?unique[0]:null;
}
