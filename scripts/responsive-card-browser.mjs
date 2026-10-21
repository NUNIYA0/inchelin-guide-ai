// Local, offline browser layout test. No app requests or provider credentials.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const style = html.match(/<style>([^]*?)<\/style>/)[1];
const render = html.slice(html.indexOf('    function renderRestaurantCards('), html.indexOf('    function deactivateHistory'));
// Only the single card renderer is evaluated, not the app bootstrap/network code.
const fn = render.slice(0, render.indexOf('\n    }') + 6);
assert.ok(fn.includes('return group;'));
const root = await mkdtemp(path.join(tmpdir(), 'inchelin-card-layout-'));
try {
  const fixture = path.join(root, 'cards.html');
  await writeFile(fixture, `<!doctype html><meta charset="utf-8"><style>${style}
    body{display:block;margin:0;padding:16px}.fixture{width:100%;max-width:720px;margin:auto}.restaurant-group{width:100%}
  </style><main class="fixture" id="fixture"></main><pre id="report"></pre><script>
    const comparisonButtons=new Map();function renderComparisonTray(){};
    function uiIcon(){return document.createElement('span')};
    ${fn}
    const cards=[1,2,3].map((n)=>({id:String(n),name:'아주 긴 이름을 가진 삼겹살 식당 강남역 직영점 '+n,category:'한식',foodLabel:'삼겹살',regionLabel:'강남역',roadAddress:'서울특별시 강남구 아주아주긴도로명길 123 테스트빌딩 지하1층 103호',naverPlaceUrl:'https://example.invalid/'+n}));
    const host=document.getElementById('fixture');host.append(renderRestaurantCards(cards));
    const menu=document.createElement('div');menu.className='quick-replies menu-cards';menu.innerHTML=cards.map((c,i)=>'<button class="quick-reply menu-choice"><span class="quick-reply-title">'+['국밥','제육볶음','냉면'][i]+'</span><span class="quick-reply-description">한 끼로 골라볼 메뉴</span><span class="quick-reply-reason">따뜻하게 먹어봐요</span></button>').join('');host.append(menu);
    const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
    const capture=()=>({places:[...document.querySelectorAll('.restaurant-card')].map(rect),menus:[...menu.children].map(rect),columns:getComputedStyle(document.querySelector('.restaurant-list')).gridTemplateColumns.split(' ').length,menuColumns:getComputedStyle(menu).gridTemplateColumns.split(' ').length,clipped:[...document.querySelectorAll('.restaurant-title-link h3,.restaurant-address')].every(n=>getComputedStyle(n).overflow==='hidden'&&getComputedStyle(n).webkitLineClamp===(innerWidth<768?'1':'2')),overflow:document.documentElement.scrollWidth>innerWidth,viewport:innerWidth});
    const result=capture();host.replaceChild(renderRestaurantCards(cards.slice(0,2)),host.firstChild);result.two=capture().places;host.replaceChild(renderRestaurantCards(cards.slice(0,1)),host.firstChild);result.one=capture().places;document.getElementById('report').textContent=JSON.stringify(result);
    // Exact container widths, including selected history pills with the real SVG size.
    result.chips=[];
    for(const width of [270,320,360])for(const selected of [false,true]){
      const zone=document.createElement('section');zone.className='answer-question';zone.style.cssText='position:absolute;left:0;top:2000px;box-sizing:border-box;width:'+width+'px';
      const group=document.createElement('div');group.className='quick-replies quick-replies-followup answer-chips question-companion'+(selected?' history-inactive':'');
      group.innerHTML=['혼자','2~3명','회식','가족','상관없어요'].map((label,i)=>'<button class="quick-reply quick-reply-chip'+(i===4?' skip-chip':'')+(selected&&i===0?' history-selected':'')+'"><span class="quick-reply-title">'+label+'</span>'+(selected&&i===0?'<span class="history-check"><svg class="ui-icon"><path d="M5 12l4 4 10-10"/></svg></span>':'')+'</button>').join('');zone.append(group);document.body.append(zone);
      result.chips.push({width,selected,wrap:new Set([...group.children].map(n=>n.getBoundingClientRect().top)).size>1,valid:[...group.children].every(button=>{const title=button.querySelector('.quick-reply-title'),range=document.createRange();range.selectNodeContents(title);const bounds=button.getBoundingClientRect(),check=button.querySelector('.history-check')?.getBoundingClientRect();return range.getClientRects().length===1&&getComputedStyle(button).whiteSpace==='nowrap'&&getComputedStyle(button).minWidth==='fit-content'&&button.scrollWidth<=button.clientWidth&&bounds.right<=zone.getBoundingClientRect().right&&(!check||check.right<=bounds.right&&check.top>=bounds.top&&check.bottom<=bounds.bottom);})});
    }
    document.getElementById('report').textContent=JSON.stringify(result);
  </script>`, 'utf8');
  const browser = process.env.CARD_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  for (const width of [1024,768,767,390,360]) {
    // Exact iframe viewport avoids Windows window borders / minimum window sizes.
    const viewport=path.join(root,'viewport-'+width+'.html');
    await writeFile(viewport,`<!doctype html><iframe src="cards.html" style="border:0;width:${width}px;height:1100px" onload="document.getElementById('report').textContent=this.contentDocument.getElementById('report').textContent"></iframe><pre id="report"></pre>`);
    const run = spawnSync(browser, ['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--allow-file-access-from-files','--hide-scrollbars',`--user-data-dir=${path.join(root,'profile-'+width)}`,'--window-size=1280,1400','--dump-dom',pathToFileURL(viewport).href], {encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:4*1024*1024});
    assert.equal(run.status,0,run.error?.message || 'headless browser failed');
    const match=run.stdout.match(/<pre id="report">([^<]+)<\/pre>/);assert.ok(match,'browser generated measurements');
    const r=JSON.parse(match[1]);assert.equal(r.viewport,width);
    const columns=width>=768?3:1;assert.equal(r.columns,columns);assert.equal(r.menuColumns,columns);
    for(const set of [r.places,r.menus])if(width>=768)assert.ok(set.every(n=>Math.abs(n.h-set[0].h)<1),'desktop equal card heights');
    if(width<768)assert.ok(r.places.every(n=>n.h>=100&&n.h<=110),'mobile compact cards are 100–110px with one-line title/chips/address');
    assert.ok(r.clipped);assert.equal(r.overflow,false);
    assert.equal(r.chips.length,6);assert.ok(r.chips.every(item=>item.valid),'270/320/360px: no text/check wrapping or clipping, normal and selected');
    assert.ok(r.chips.filter(item=>item.width===270).every(item=>item.wrap),'narrow containers wrap whole pills, not their text');
    assert.ok(Math.abs(r.one[0].w-r.places[0].w)<1);assert.ok(Math.abs(r.two[0].w-r.places[0].w)<1);
    console.log(width+'px: '+columns+' columns, card layout passed; 270/320/360px chip containers normal/selected: one-line text/check, whole-pill wrapping passed.');
  }
} finally { await rm(root,{recursive:true,force:true}); }
