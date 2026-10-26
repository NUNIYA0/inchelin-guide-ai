import assert from 'node:assert/strict';
export function testConversationScroll(html){
  const source=html.match(/    function followConversation\(item\) \{[^]*?\n    \}/)?.[0];
  assert.ok(source);
  const callbacks=new Map(),calls=[],button={hidden:true};let seq=0;
  const win={scrollY:400,scrollTo(options){calls.push(options);this.scrollY=options.top;}};
  const harness=new Function('window','document','requestAnimationFrame','cancelAnimationFrame',`
    let autoFollowConversation=true,previousScrollY=0;
    ${source}
    return {follow:followConversation,setAuto:value=>autoFollowConversation=value};
  `)(win,{getElementById:()=>button},callback=>{callbacks.set(++seq,callback);return seq;},id=>callbacks.delete(id));
  const flush=()=>{const frames=[...callbacks.values()];callbacks.clear();frames.forEach(callback=>callback());};
  const row=top=>({isConnected:true,getBoundingClientRect:()=>({top})});
  harness.follow(row(600));harness.follow(row(120));assert.equal(callbacks.size,1,'only latest start anchor survives');flush();
  assert.deepEqual(calls,[{top:448,behavior:'instant'}],'anchor is answer top, not document bottom');
  harness.setAuto(false);harness.follow(row(900));flush();assert.equal(calls.length,1);assert.equal(button.hidden,false,'reading history shows jump control without moving');
  harness.setAuto(true);harness.follow(row(900));harness.setAuto(false);flush();assert.equal(calls.length,1,'manual scroll while waiting cancels pending move');
  harness.setAuto(true);const removed=row(900);harness.follow(removed);removed.isConnected=false;flush();assert.equal(calls.length,1,'detached loading row never scrolls');
  harness.follow(row(-1000));flush();assert.equal(calls.at(-1).top,0,'nonnegative start position');
  assert.match(html,/\.restaurant-list \{grid-auto-rows:auto;\}/,'group-label rows must not stretch to card height');
  const completion=html.indexOf('if (controller.signal.aborted || epoch!==conversationEpoch');
  assert.ok(html.indexOf('status=null;',completion)<html.indexOf("appendMessage('assistant', answer.content",completion),'remove loading row before rendering final answer');
  console.log('v144 scroll smoke passed: coalesced start anchor, no bottom target, user-scroll opt-out, detached loader guard, natural-height group labels.');
}
