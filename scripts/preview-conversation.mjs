// Local UI QA only. Actual source records; coordinates mocked, no credentials or AI calls.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
import worker from '../build/dist/server/index.js';
const root=resolve(import.meta.dirname,'../dist');
const source=JSON.parse(await readFile(new URL('../data/private/restaurants-261026.json',import.meta.url),'utf8'));
globalThis.fetch=async value=>{
  const url=new URL(value);if(!url.hostname.includes('naverapihub'))throw new Error('Local QA blocks upstream calls');
  const query=url.searchParams.get('query'),row=source.restaurants.find(r=>query.startsWith(r.name+' '));
  return Response.json({items:row?[{title:row.name,roadAddress:row.roadAddress,address:row.roadAddress,category:'음식점>한식',mapx:'1270276000',mapy:'374982000'}]:[]});
};
createServer(async(req,res)=>{
  try{
    if(req.method==='GET'&&!req.url.startsWith('/api/')){
      const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root))throw new Error('path');
      let body=await readFile(path);const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(path)]||'application/octet-stream';
      if(extname(path)==='.html')body=Buffer.from(body.toString().replace('<body>','<body><div style="position:relative;z-index:50;background:#fff5d6;text-align:center;font:12px/24px sans-serif">로컬 화면 검증 · 실제 등록 정보 / 거리만 테스트 좌표</div>'));
      res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(body);return;
    }
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const response=await worker.fetch(new Request('http://localhost'+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})}),{NAVER_API_HUB_CLIENT_ID:'mock',NAVER_API_HUB_CLIENT_SECRET:'mock',CHAT_TIMING_LOGS:'false'},{});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Local UI preview failed');}
}).listen(43146,'127.0.0.1',()=>console.log('UI preview http://127.0.0.1:43146'));
