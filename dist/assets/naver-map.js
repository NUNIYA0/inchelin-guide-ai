// Shared browser/Worker utility; no network access or address-based search queries.
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
  function mapLink({name,url='',placeId='',longitude=null,latitude=null}={}) {
    let source;
    try {source=new URL(url);}catch{}
    const trusted=source&&source.protocol==='https:'&&['map.naver.com','m.map.naver.com','place.naver.com','m.place.naver.com','naver.me'].includes(source.hostname);
    const match=trusted&&source.pathname.match(/\/(?:entry\/place|restaurant|place)\/(\d+)/);
    const id=/^\d+$/.test(String(placeId))?String(placeId):match?.[1];
    if(id)return 'https://map.naver.com/p/entry/place/'+id;
    if(trusted&&source.hostname==='naver.me')return source.href;
    const query=cleanName(name);if(!query)return '';
    const result=new URL('https://map.naver.com/p/search/'+encodeURIComponent(query));
    const lng=longitude===null||longitude===''?NaN:Number(longitude),lat=latitude===null||latitude===''?NaN:Number(latitude);
    if(Number.isFinite(lng)&&Number.isFinite(lat)&&Math.abs(lng)<=180&&Math.abs(lat)<85&&!(lng===0&&lat===0)) {
      // Naver's map center uses Web Mercator metres, not raw WGS84 degrees.
      const x=6378137*lng*Math.PI/180,y=6378137*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
      result.searchParams.set('c',`${x.toFixed(3)},${y.toFixed(3)},15,0,0,0,dh`);
    }
    return result.href;
  }
  globalThis.InchelinMapLinks=Object.freeze({cleanName,mapLink});
})();
