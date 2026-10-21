// Local-only visual QA. Serves the real UI with synthetic cards; no model/provider calls.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const fixture = `
  showChatView();
  messagesEl.innerHTML = '';
  const fixtureCards = ['해정집', '옥동식', '홍대국밥'].map((name, index) => ({ id: 'qa-' + index, name, category: '국밥', foodLabel: '국밥', regionLabel: '홍대', address: '서울 마포구 서교동 테스트길 ' + (index + 1), dataSource: 'naver', naverPlaceUrl: 'https://map.naver.com/' }));
  if (new URL(location.href).searchParams.has('menu')) {
    renderMessage({ role: 'assistant', content: '저녁으로 먹을 메뉴를 함께 골라봐요.', quickReplies: ['국밥|따뜻한 국물과 밥', '피자|함께 나누는 한 판', '냉면|시원한 육수와 면', '상관없어요', '다른 메뉴 보기'], meta: { mode: 'A', menuCards: [{ name:'국밥', description:'따뜻한 국물과 밥', reason:'따뜻하게 먹고 싶을 때 골라봐요' }, { name:'피자', description:'함께 나누는 한 판', reason:'여럿이 나눠 먹기 좋아요' }, { name:'냉면', description:'시원한 육수와 면', reason:'시원하게 즐겨봐요' }], turnPolicy: { intro: '저녁으로 먹을 메뉴를 함께 골라봐요.', questionText: '어떤 메뉴가 끌리세요?' } } });
  } else {
    renderMessage({ role: 'assistant', content: '홍대에서 국밥 먹을 곳 3곳을 골라봤어요.', restaurants: fixtureCards, quickReplies: ['혼자','2~3명','회식','가족','상관없어요'], meta: { mode: 'C', searchConditions: {region:'홍대', food:'국밥'}, turnPolicy: { intro: '홍대에서 국밥 먹을 곳 3곳을 골라봤어요.', questionText: '누구와 가세요?', next_question: { slot: 'companion', chips: [] }, actionChips: ['다른 곳도 보여줘','조건 바꾸기'] } } });
  }
`;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/')) { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"로컬 UI 샘플은 AI를 호출하지 않아요."}'); return; }
    const target = resolve(root, '.' + (path === '/' ? '/index.html' : decodeURIComponent(path)));
    if (!target.startsWith(resolve(root) + sep)) { res.writeHead(403); res.end(); return; }
    let data = await readFile(target);
    if (path === '/' || path === '/index.html') data = Buffer.from(data.toString().replace('if (!loadSharedConversationFromHash()) updateShareVisibility();', fixture));
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' }[extname(target)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(4174, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4174/ (synthetic UI only)'));
