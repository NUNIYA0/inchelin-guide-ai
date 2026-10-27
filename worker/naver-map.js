// One shared browser/Worker policy. IDs are read from verified data, never inferred.
(() => {
  function cleanName(value) {
    let name=String(value||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/[()[\]{}]/g,' ')
      .replace(/(?:서울특별시|서울시|경기도|부산광역시|인천광역시|도로명주소|주소\s*:).*$/,'')
      .replace(/\s+(?:[가-힣]+(?:대로|로|길)\d*(?:번길)?\s*\d|(?:지하|지상)?\s*\d+\s*층|B\d+|\d+\s*호|푸드코트|[가-힣]+(?:빌딩|건물)).*$/i,'')
      .replace(/[^가-힣a-zA-Z0-9&·\-\s]/g,' ').replace(/\s+/g,' ').trim();
    const words=name.split(' ');
    for(let size=1;size<=words.length/2;size++)if(words.length%size===0&&words.every((word,i)=>word===words[i%size])){name=words.slice(0,size).join(' ');break;}
    return name.slice(0,100);
  }
  const hosts=['map.naver.com','m.map.naver.com','place.naver.com','m.place.naver.com','pcmap.place.naver.com','naver.me'];
  const idValue=value=>/^\d{1,20}$/.test(String(value||''))?String(value):'';
  function allowedUrl(value){try{const u=new URL(String(value||''));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&hosts.includes(u.hostname)?u:null;}catch{return null;}}
  function parsePlaceUrl(value){
    const u=allowedUrl(value);if(!u)return {placeId:'',url:'',shareUrl:''};
    if(u.hostname==='naver.me')return {placeId:'',url:'',shareUrl:/^\/[A-Za-z0-9]+\/?$/.test(u.pathname)?u.origin+u.pathname:''};
    let id='';
    if(u.hostname==='map.naver.com')id=u.pathname.match(/^\/(?:p|v5)\/entry\/place\/(\d+)\/?$/)?.[1]||'';
    else if(u.hostname==='m.map.naver.com'&&u.pathname==='/siteview.naver')id=u.searchParams.get('code')||'';
    else if(['place.naver.com','m.place.naver.com','pcmap.place.naver.com'].includes(u.hostname))id=u.pathname.match(/^\/(?:restaurant|place)\/(\d+)(?:\/(?:home|information|menu|review|photo))?\/?$/)?.[1]||'';
    id=idValue(id);return {placeId:id,url:id?'https://map.naver.com/p/entry/place/'+id:'',shareUrl:''};
  }
  const nameKey=v=>cleanName(v).normalize('NFKC').replace(/\s/g,'').toLowerCase();
  const addressKey=v=>String(v||'').normalize('NFKC').replace(/서울특별시|서울시/g,'서울').replace(/경기도/g,'경기').replace(/[\s,()[\]]/g,'').toLowerCase();
  function verifiedPlace(card={}){
    const v=card.naverPlaceVerification,address=card.roadAddress||card.parcelAddress||card.address;
    if(v?.status!=='verified'||typeof v.source!=='string'||!v.source.trim()||!Number.isFinite(Date.parse(v.checkedAt))||!nameKey(card.name)||nameKey(v.name)!==nameKey(card.name)||!addressKey(address)||addressKey(v.address)!==addressKey(address))return {placeId:'',url:''};
    const parsed=parsePlaceUrl(card.naverPlaceUrl),resolved=parsePlaceUrl(v.resolvedUrl),id=idValue(card.naverPlaceId);
    if(card.naverPlaceUrl&&!allowedUrl(card.naverPlaceUrl))return {placeId:'',url:''};
    const target=parsed.placeId?parsed:parsed.shareUrl&&resolved.placeId?resolved:!card.naverPlaceUrl&&id&&id===idValue(v.placeId)?{placeId:id,url:'https://map.naver.com/p/entry/place/'+id}:null;
    if(!target||card.naverPlaceId&&!id||id&&id!==target.placeId||v.placeId&&idValue(v.placeId)!==target.placeId)return {placeId:'',url:''};
    return {placeId:target.placeId,url:target.url};
  }
  function destination(card={}){
    const exact=verifiedPlace(card);if(exact.url)return {...exact,kind:'detail',label:'지도 보기'};
    const name=cleanName(card.name),branch=cleanName(card.branch),address=String(card.roadAddress||card.parcelAddress||card.address||'').replace(/<[^>]*>/g,'').trim();
    if(!name||!address)return {placeId:'',url:'',kind:'unavailable',label:'주소 정보 없음'};
    const query=[name,branch&&!name.includes(branch)?branch:'',address].filter(Boolean).join(' ').slice(0,600);
    return {placeId:'',url:'https://map.naver.com/p/search/'+encodeURIComponent(query),kind:'search',label:'네이버지도에서 검색'};
  }
  function mapLink(card={}){return destination({...card,naverPlaceUrl:card.naverPlaceUrl||card.url,naverPlaceId:card.naverPlaceId||card.placeId}).url;}
  function linkFields(card){
    const d=destination(card),v=card.naverPlaceVerification;
    return {naverPlaceId:d.placeId||null,naverPlaceUrl:d.kind==='detail'?d.url:null,naverPlaceVerification:d.kind==='detail'?{status:'verified',name:card.name,address:card.roadAddress||card.parcelAddress||card.address,source:v.source,checkedAt:v.checkedAt,placeId:d.placeId}:null,mapUrl:d.url,mapLinkKind:d.kind,mapLinkLabel:d.label,naverLink:d.url};
  }
  const lookups=new Map();
  async function hydrate(card,fetcher=fetch){
    if(card.dataSource!=='inchelin'||!card.registeredSourceId||destination(card).kind==='detail')return null;
    const id=String(card.registeredSourceId),old=lookups.get(id);let task=old?.expires>Date.now()?old.task:null;
    if(!task){task=fetcher('/api/restaurant-place-link?id='+encodeURIComponent(id),{signal:AbortSignal.timeout(3000)}).then(r=>r.ok?r.json():null).catch(()=>null);lookups.set(id,{task,expires:Date.now()+3600000});if(lookups.size>1500)lookups.delete(lookups.keys().next().value);}
    const data=await task;if(!data)return null;
    const merged={...card,naverPlaceUrl:data.naverPlaceUrl,naverPlaceId:data.naverPlaceId,naverPlaceVerification:data.naverPlaceVerification};
    return destination(merged).kind==='detail'?linkFields(merged):null;
  }
  globalThis.InchelinMapLinks=Object.freeze({cleanName,allowedUrl,parsePlaceUrl,verifiedPlace,destination,mapLink,linkFields,hydrate});
})();
