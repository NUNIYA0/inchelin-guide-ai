// Administrative groups come from the registered workbook, never a preset list
// of popular neighbourhoods. Original addresses preserve province distinctions.
const provinces={서울:['서울특별시','서울'],경기:['경기도','경기'],인천:['인천광역시','인천'],부산:['부산광역시','부산'],대구:['대구광역시','대구'],대전:['대전광역시','대전'],광주:['광주광역시','광주'],울산:['울산광역시','울산'],세종:['세종특별자치시','세종시','세종'],강원:['강원특별자치도','강원도','강원'],충북:['충청북도','충북'],충남:['충청남도','충남'],전북:['전북특별자치도','전라북도','전북'],전남:['전라남도','전남'],경북:['경상북도','경북'],경남:['경상남도','경남'],제주:['제주특별자치도','제주도','제주']};
export function addressRegion(address){
 const words=String(address||'').trim().split(/\s+/),province=Object.keys(provinces).find(p=>provinces[p].includes(words[0]));
 if(!province)return null;
 const district=province==='세종'?'세종시':/^[가-힣]+(?:시|군|구)$/.test(words[1]||'')?words[1]:null;
 return district?{province,district,id:province+':'+district,label:province+' '+district}:null;
}
export function buildRegionCatalog(rows){
 const map=new Map();let unassigned=0;
 for(const row of rows){const region=addressRegion(row.originalAddress)||addressRegion(row.roadAddress)||addressRegion(row.parcelAddress);if(!region){unassigned++;continue;}const current=map.get(region.id)||{...region,count:0};current.count++;map.set(region.id,current);}
 const regions=[...map.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'ko'));
 return {regions,provinces:Object.keys(provinces).map(name=>({id:name,label:name,count:regions.filter(r=>r.province===name).reduce((n,r)=>n+r.count,0)})).filter(r=>r.count),total:rows.length,unassigned};
}
export function belongsToRegion(address,region){const found=addressRegion(address);return Boolean(found&&found.id===region.id);}

// An administrative area is an address boundary, never an invented map point.
export function regionalLocation(region){return {id:'admin:'+region.id,regionId:region.id,kind:'region',type:'region',label:region.label,province:region.province,district:region.district};}
export function findRegisteredRegion(catalog,value){
 const key=String(value||'').trim().replace(/^admin:/,'');
 const parsed=addressRegion(key),canonical=parsed?.id;
 if(canonical&&catalog?.regions?.some(r=>r.id===canonical))return regionalLocation(catalog.regions.find(r=>r.id===canonical));
 const rows=(catalog?.regions||[]).filter(r=>r.id===key||r.label===key||r.district===key);
 return rows.length===1?regionalLocation(rows[0]):null;
}
export function registeredRegionMentions(catalog,text){
 const value=String(text||'').normalize('NFKC');
 return (catalog?.regions||[]).filter(r=>{
  const aliases=provinces[r.province]||[r.province],qualified=aliases.some(p=>value.includes(p+' '+r.district));
  if(qualified)return true;
  const same=(catalog?.regions||[]).filter(other=>other.district===r.district);
  return same.length===1&&new RegExp('(?:^|[\\s,])'+r.district+'(?=$|[\\s,.!?]|에서|으로|로|나|말고)').test(value);
 }).map(r=>({name:r.label,regionId:r.id,evidence:(provinces[r.province]||[]).map(p=>p+' '+r.district).find(p=>value.includes(p))||r.district}));
}

// Naver local search is a discovery source, not a complete rail directory.
// Only station-category results with matching administrative addresses pass.
export async function searchRegionStations(catalog,regionId,query,env,fetcher=fetch){
 const region=catalog.regions.find(r=>r.id===regionId);if(regionId&&!region)throw new Error('unknown_region');
 const clean=String(query||'').trim().slice(0,50);
 if(!region&&clean.length<2)return [];
 if(!env.NAVER_API_HUB_CLIENT_ID||!env.NAVER_API_HUB_CLIENT_SECRET)throw new Error('station_search_unavailable');
 const prefix=region?region.label+' ':'';
 const queries=clean?[prefix+clean+' 지하철역',prefix+(clean.endsWith('역')?clean:clean+'역')]:[region.label+' 지하철역',region.label+' 전철역'];
 const result=await Promise.all(queries.map(async query=>{
  const url=new URL('https://naverapihub.apigw.ntruss.com/search/v1/local');url.search=new URLSearchParams({query,display:'5',format:'json'});
  const response=await fetcher(url,{headers:{'X-NCP-APIGW-API-KEY-ID':env.NAVER_API_HUB_CLIENT_ID,'X-NCP-APIGW-API-KEY':env.NAVER_API_HUB_CLIENT_SECRET},signal:AbortSignal.timeout(4000)});if(!response.ok)throw new Error('station_search_failed');return (await response.json()).items||[];
 }));
 const text=s=>String(s||'').replace(/<[^>]*>/g,'').trim(),points=[];
 for(const row of result.flat()){
  const address=text(row.roadAddress||row.address),group=addressRegion(address);
  if(!/지하철|전철/.test(row.category||'')||!group||!catalog.regions.some(r=>r.id===group.id)||(region&&!belongsToRegion(address,region)))continue;
  const longitude=Number(row.mapx)/1e7,latitude=Number(row.mapy)/1e7;
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<33||latitude>39||longitude<124||longitude>132)continue;
  if(/출입구|출구/.test(row.category+' '+text(row.title)))continue;
  const label=text(row.title).match(/^(.+?역)(?:\s|$|\d|[가-힣]*선)/)?.[1]?.trim();if(!label)continue;
  points.push({id:'discovered:'+group.id+':'+label,label,centerLabel:label,type:'station',regionId:group.id,province:group.province,district:group.district,address,detail:address,latitude,longitude});
 }
 return [...new Map(points.map(p=>[p.id,p])).values()];
}
