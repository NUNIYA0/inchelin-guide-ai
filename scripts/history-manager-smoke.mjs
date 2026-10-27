import assert from 'node:assert/strict';
import '../dist/assets/history-manager.js';
const api=globalThis.InchelinHistoryUI;
const original=[{id:'one',title:'기존 제목',messages:[{content:'보존할 대화'}]},{id:'two',title:'다른 대화'}];
let saved;
const renamed=api.changedHistories(original,'one','rename',' 새 제목 ',next=>{saved=next;});
assert.equal(renamed[0].title,'새 제목');assert.equal(original[0].title,'기존 제목');assert.equal(saved,renamed);assert.equal(renamed[0].messages,original[0].messages);
assert.throws(()=>api.changedHistories(original,'one','rename',' ',()=>{}),/empty_title/);
assert.throws(()=>api.changedHistories(original,'one','delete',null,()=>{throw new Error('quota');}),/quota/);assert.equal(original.length,2);

class Node {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.events={};this.attributes={};this.dataset={};this.style={};this.className='';this.disabled=false;this.hidden=false;this.isConnected=true;this.value='';this.classList={add:n=>{this.className+=' '+n;},remove:n=>{this.className=this.className.split(' ').filter(v=>v!==n).join(' ');},contains:n=>this.className.split(' ').includes(n)};}
  append(...items){for(const n of items){n.parent=this;this.children.push(n);}}
  setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}
  addEventListener(name,fn){(this.events[name]||=[]).push(fn);}
  emit(name,event={}){event.target??=this;event.preventDefault??=()=>{};event.stopPropagation??=()=>{};for(const fn of this.events[name]||[])fn(event);}
  click(){if(!this.disabled)this.emit('click');}
  focus(){document.activeElement=this;}select(){this.selectionStart=0;this.selectionEnd=this.value.length;}
  replaceWith(next){const index=this.parent.children.indexOf(this);this.parent.children.splice(index,1,next);next.parent=this.parent;this.isConnected=false;}
  closest(){return this.parent;}
  querySelectorAll(selector){return this.children.flatMap(n=>[...(selector==='[data-open-history]'&&n.dataset.openHistory?[n]:[]),...n.querySelectorAll(selector)]);}
  showModal(){this.open=true;}close(){this.open=false;this.emit('close');}
  getBoundingClientRect(){return{left:10,right:410,top:10,bottom:300};}
}
const oldDocument=globalThis.document;
globalThis.document={body:new Node('body'),documentElement:new Node('html'),activeElement:null,createElement:tag=>new Node(tag)};
try{
  let records=original.map(r=>({...r})),writes=0,fail=false,restored=[],deleted=[],toasts=[],manager;
  const list=new Node(),render=()=>{list.children=[];for(const record of records){const row=new Node(),button=new Node('button');row.className='history-row';button.dataset.openHistory=record.id;button.textContent=record.title;row.append(button);list.append(row);}};
  render();manager=api.create({list,getHistories:()=>records,setHistories:next=>{records=next;},save:next=>{writes++;if(fail)throw new Error('storage denied');saved=next;},render,restoreFocus:id=>restored.push(id),onDeleted:id=>deleted.push(id),toast:t=>toasts.push(t)});
  const input=()=>list.children[0].children[0],dialog=document.body.children[0];
  manager.rename('one');assert.equal(input().tagName,'input');assert.equal(input().value,'기존 제목');assert.equal(input().selectionEnd,input().value.length);assert.equal(document.activeElement,input());
  input().value='한글 입력';input().emit('keydown',{key:'Enter',isComposing:true});assert.equal(writes,0);input().emit('keydown',{key:'Enter',keyCode:229});assert.equal(writes,0);
  input().value=' ';input().emit('keydown',{key:'Enter'});assert.equal(writes,0);assert.equal(input().tagName,'input');
  input().value='저장한 제목';input().emit('keydown',{key:'Enter'});assert.equal(records[0].title,'저장한 제목');assert.equal(input().tagName,'button');assert.equal(restored.at(-1),'one');
  manager.rename('one');input().value='취소할 이름';input().emit('keydown',{key:'Escape'});assert.equal(records[0].title,'저장한 제목');assert.equal(input().tagName,'button');
  manager.rename('one');input().value='포커스 이탈';input().emit('blur');assert.equal(records[0].title,'저장한 제목');
  fail=true;manager.rename('one');input().value='실패할 이름';input().emit('keydown',{key:'Enter'});assert.equal(records[0].title,'저장한 제목');assert.match(toasts.at(-1),/기존 제목/);fail=false;
  const actions=dialog.children.at(-1),cancel=actions.children[0],remove=actions.children[1],error=dialog.children[3];
  manager.requestDelete('one');assert.equal(dialog.open,true);assert.equal(dialog.children[1].textContent,'저장한 제목');assert.equal(document.activeElement,cancel);assert.equal(document.body.style.overflow,'hidden');
  dialog.emit('keydown',{key:'Tab',shiftKey:true});assert.equal(document.activeElement,remove);dialog.emit('keydown',{key:'Tab',shiftKey:false});assert.equal(document.activeElement,cancel);
  cancel.click();assert.equal(dialog.open,false);assert.equal(records.length,2);assert.equal(restored.at(-1),'one');
  manager.requestDelete('one');dialog.emit('cancel');assert.equal(dialog.open,false);assert.equal(records.length,2);
  manager.requestDelete('one');fail=true;remove.click();assert.equal(records.length,2);assert.equal(dialog.open,true);assert.equal(error.hidden,false);assert.equal(remove.disabled,false);assert.equal(deleted.length,0);fail=false;
  remove.click();assert.equal(records.length,1);assert.equal(records[0].id,'two');assert.deepEqual(deleted,['one']);assert.equal(dialog.open,false);assert.notEqual(document.body.style.overflow,'hidden');
  const completedWrites=writes;remove.click();assert.equal(writes,completedWrites,'closed/deleted requests cannot execute twice');
}finally{globalThis.document=oldDocument;}
console.log('History manager smoke passed: inline rename/selection/IME/empty/blur/cancel, atomic storage failure, delete confirmation/cancel/error/success and focus callbacks.');

