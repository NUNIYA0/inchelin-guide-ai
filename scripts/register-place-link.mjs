// Operator-only import: confirm the visible Place name/address before running.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import '../worker/naver-map.js';
const api=globalThis.InchelinMapLinks;
export async function resolvePlaceInput(value,fetcher=fetch){
  const direct=api.parsePlaceUrl(value);if(direct.placeId)return direct;
  if(!direct.shareUrl)throw new Error('허용된 네이버 플레이스 상세 또는 공유 링크가 필요해요.');
  let current=direct.shareUrl;
  for(let step=0;step<5;step++){
    const response=await fetcher(current,{redirect:'manual',signal:AbortSignal.timeout(3000)});
    const location=response.headers.get('location');if(!location)throw new Error('공유 링크의 웹 상세 목적지를 자동 확인하지 못했어요. 브라우저에서 상세 URL을 확인해 주세요.');
    const next=new URL(location,current);if(!api.allowedUrl(next.href))throw new Error('허용되지 않은 공유 링크 목적지예요.');
    const parsed=api.parsePlaceUrl(next.href);if(parsed.placeId)return {...parsed,shareUrl:direct.shareUrl};current=next.href;
  }
  throw new Error('공유 링크 이동 횟수를 초과했어요.');
}
export function placeOverride(row,link,name,address,checkedAt){
  if(name!==row.name||address!==(row.roadAddress||row.parcelAddress||row.address))throw new Error('등록 매장명·주소와 확인한 플레이스 매장명·주소가 달라요.');
  if(!link.placeId||!Number.isFinite(Date.parse(checkedAt)))throw new Error('확인된 ID와 확인 날짜가 필요해요.');
  return {sourceId:row.sourceId,name,address,naverPlaceUrl:link.url,naverPlaceId:link.placeId,naverPlaceShareUrl:link.shareUrl||null,naverPlaceVerification:{status:'verified',name,address,source:'manual-place-page',checkedAt,placeId:link.placeId}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=Object.fromEntries(process.argv.slice(2).reduce((all,v,i,a)=>v.startsWith('--')?[...all,[v.slice(2),a[i+1]]]:all,[]));
  const root=resolve(import.meta.dirname,'..'),config=JSON.parse(await readFile(resolve(root,'data/recommendation-source.json'),'utf8'));
  const source=JSON.parse(await readFile(resolve(root,config.source),'utf8')),row=source.restaurants.find(r=>r.sourceId===args['source-id']);
  if(!row)throw new Error('등록 식당 source-id가 필요해요.');
  const link=await resolvePlaceInput(args.url),entry=placeOverride(row,link,args['verified-name'],args['verified-address'],args['checked-at']||new Date().toISOString());
  const file=resolve(root,'data/private/place-links.json');let entries=[];try{entries=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const next=[...entries.filter(r=>r.sourceId!==row.sourceId),entry];await mkdir(dirname(file),{recursive:true});await writeFile(file,JSON.stringify(next,null,2)+'\n');
  console.log(JSON.stringify({sourceId:row.sourceId,url:entry.naverPlaceUrl,updated:true}));
}
