// Local-only QA. Never packaged: all synthetic records live under tests/ or build/.
import {createServer} from 'node:http';
import {readFile,writeFile,rm} from 'node:fs/promises';
const fixture=JSON.parse(await readFile(new URL('../tests/fixtures/recommendations.json',import.meta.url),'utf8'));
const center={latitude:37.54458,longitude:127.05594};
const source={...fixture,enabled:true,connected:true,restaurants:fixture.restaurants.map((r,i)=>({...r,category:'한식',latitude:center.latitude+(i+1)*.001,longitude:center.longitude,menus:[{name:'국밥',priceKRW:i===1?12000:9000,mainDish:true}],soloEvidence:i===0?{confirmed:true,source:'테스트 1인 메뉴 기록'}:null}))};
const modulePath=new URL('../build/dist/server/index.preview-test.js',import.meta.url);
await writeFile(modulePath,(await readFile(new URL('../build/dist/server/index.js',import.meta.url),'utf8')).replace(/const recommendationData = [^\n]+;/,'const recommendationData = '+JSON.stringify(source)+';'));
const worker=(await import(modulePath.href)).default;
globalThis.fetch=async url=>{
  if(!String(url).includes('naverapihub.apigw.ntruss.com/search/v1/local'))throw new Error('QA forbids live upstream calls');
  const query=new URL(url).searchParams.get('query'),point=globalThis.InchelinPhase1.centers.find(c=>query.startsWith(c.label))||center;
  return Response.json({items:[100,400,800].map((m,i)=>({title:'테스트 식당 '+i,category:'음식점>한식',roadAddress:'서울특별시 성동구 연무장길 '+i,address:'서울특별시 성동구 성수동2가 '+i,mapx:String(Math.round(point.longitude*1e7)),mapy:String(Math.round((point.latitude+m/6371008.8*180/Math.PI)*1e7))}))});
};
const server=createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/assets/recommendation-flags.js')){res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});res.end('globalThis.InchelinRecommendationFlags={enabled:true,connected:true};');return;}
    if(/^\/qa(?:360|390)$/.test(req.url)){const width=req.url.endsWith('360')?360:390;res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<!doctype html><title>모바일 프레임 QA — 가상 데이터</title><body style="margin:0;background:#ddd;font:14px sans-serif"><p>로컬 QA · 가상 데이터 · 실제 DB 연동 아님 · '+width+'px iframe</p><iframe title="'+width+'px QA" src="/" style="width:'+width+'px;height:900px;border:1px solid #777"></iframe>');return;}
    const chunks=[];for await(const part of req)chunks.push(part);
    const request=new Request('http://127.0.0.1:43139'+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
    let response=await worker.fetch(request,{NAVER_API_HUB_CLIENT_ID:'mock-id',NAVER_API_HUB_CLIENT_SECRET:'mock-secret',CHAT_TIMING_LOGS:'false'},{});
    if(response.headers.get('content-type')?.includes('text/html')){response=new Response((await response.text()).replace('<body>','<body><div style="position:relative;z-index:9999;background:#fff2bd;color:#111;font:13px/1.5 sans-serif;text-align:center">로컬 QA · 가상 데이터 · 실제 DB 연동 아님</div>'),response);}
    const headers=Object.fromEntries(response.headers);res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Local QA request failed');}
});
server.listen(43139,'127.0.0.1',()=>console.log('Local QA: http://127.0.0.1:43139/qa360 (synthetic fixtures only)'));
process.on('SIGINT',()=>server.close(async()=>{await rm(modulePath,{force:true});process.exit(0);}));
