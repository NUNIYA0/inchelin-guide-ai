// Local browser QA of the exact compiled Worker; no real external calls or keys.
import {createServer} from 'node:http';
import worker from '../build/dist/server/index.js';
globalThis.fetch=async url=>{
  if(!String(url).includes('naverapihub.apigw.ntruss.com/search/v1/local'))throw new Error('QA forbids upstream calls');
  const query=new URL(url).searchParams.get('query'),point=globalThis.InchelinPhase1.centers.find(c=>query.startsWith(c.label));
  return Response.json({items:point?[100,400,800].map((m,i)=>({title:'로컬 검사용 식당 '+i,category:'음식점>한식',roadAddress:'서울특별시 강남구 강남대로98길 8',address:'서울특별시 강남구 역삼동',mapx:String(Math.round(point.longitude*1e7)),mapy:String(Math.round((point.latitude+m/6371008.8*180/Math.PI)*1e7))})):[]});
};
const server=createServer(async(req,res)=>{
  try{const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const request=new Request('http://127.0.0.1:43140'+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
    const response=await worker.fetch(request,{NAVER_API_HUB_CLIENT_ID:'mock',NAVER_API_HUB_CLIENT_SECRET:'mock',CHAT_TIMING_LOGS:'false'},{});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Local QA failed');}
});
server.listen(43140,'127.0.0.1',()=>console.log('Local QA: http://127.0.0.1:43140/?demo=1 (fictional demo; upstream mocked)'));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
