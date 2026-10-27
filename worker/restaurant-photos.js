// Search is discovery, not proof of identity or permission. Only audited matches render.
const cache=new Map(),pending=new Map();
const key=v=>String(v||'').normalize('NFKC').replace(/[\s<>()]/g,'').toLowerCase();
const https=v=>typeof v==='string'&&/^https:\/\//.test(v)?v:null;
export async function lookupRestaurantPhoto(row,config,env,fetcher=fetch){
  if(!row)return {status:'not_found'};
  if(config?.enabled!==true)return {status:'not_configured'};
  const approved=(config.approvals||[]).filter(a=>a.restaurantSourceId===row.sourceId&&key(a.restaurantName)===key(row.name)&&key(a.roadAddress)===key(row.roadAddress)&&a.identityVerified===true&&a.rightsVerified===true&&a.rightsBasis?.trim()&&https(a.imageUrl)&&https(a.sourceUrl)&&a.attribution?.trim());
  if(!approved.length)return {status:'verification_required'};
  const id=env.NAVER_API_HUB_CLIENT_ID,secret=env.NAVER_API_HUB_CLIENT_SECRET;
  if(!id||!secret)return {status:'not_configured'};
  const cacheKey=row.sourceId+'|'+JSON.stringify(approved),old=cache.get(cacheKey);if(old?.expires>Date.now())return old.value;if(pending.has(cacheKey))return pending.get(cacheKey);
  const task=(async()=>{
    try{
      const url=new URL('https://naverapihub.apigw.ntruss.com/search/v1/image');
      url.search=new URLSearchParams({query:row.name+' '+row.roadAddress,display:'10',sort:'sim',filter:'large',format:'json'});
      const response=await fetcher(url.href,{headers:{'X-NCP-APIGW-API-KEY-ID':id,'X-NCP-APIGW-API-KEY':secret},signal:AbortSignal.timeout(1800)});
      if(!response.ok)return {status:'failed'};
      const data=await response.json();
      for(const item of data.items||[]){const audit=approved.find(a=>a.imageUrl===item.link);if(!audit||!key(String(item.title||'').replace(/<[^>]*>/g,'')).includes(key(row.name)))continue;
        return {status:'photo',photo:{url:audit.imageUrl,source:'naver-api-hub',sourceUrl:audit.sourceUrl,attribution:audit.attribution,rightsBasis:audit.rightsBasis,restaurantSourceId:row.sourceId}};
      }
      return {status:'not_verified'};
    }catch{return {status:'failed'};}
  })();pending.set(cacheKey,task);
  try{const value=await task;if(cache.size>500)cache.clear();cache.set(cacheKey,{value,expires:Date.now()+3600000});return value;}finally{pending.delete(cacheKey);}
}
