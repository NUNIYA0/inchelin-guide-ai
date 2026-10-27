// Presentation only. Restaurant facts and authored recommendations remain server-owned.
(() => {
  const el=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
  const safe=v=>typeof v==='string'&&(/^https:\/\//.test(v)||/^\/assets\//.test(v));
  function choosePhoto(card){const photos=(card.photos||[]).filter(p=>p?.source==='registered'&&safe(p.url));return photos.find(p=>p.isPrimary)||photos[0]||(card.imageUrl&&card.dataSource==='inchelin'&&safe(card.imageUrl)?{url:card.imageUrl,source:'registered'}:null);}
  function photo(card){
    const frame=el('div','restaurant-media'),fallback=el('div','restaurant-photo-empty'),logo=el('img','restaurant-photo-logo');
    logo.src='/assets/favicon-inchelin-v2.png';logo.alt='';logo.setAttribute('aria-hidden','true');fallback.append(logo,el('span','','등록된 사진이 없어요'));frame.append(fallback);
    const show=value=>{
      if(!value||!safe(value.url))return;
      const image=el('img','restaurant-image');image.alt=card.name+' 사진';image.loading='lazy';image.referrerPolicy='no-referrer';
      let credit;
      image.addEventListener('load',()=>{fallback.hidden=true;image.hidden=false;});
      image.addEventListener('error',()=>{image.remove();credit?.remove();fallback.hidden=false;});image.src=value.url;frame.append(image);
      if(value.source!=='registered'&&/^https:\/\//.test(value.sourceUrl||'')){credit=el('a','restaurant-photo-credit','사진 출처: '+value.attribution);credit.href=value.sourceUrl;credit.target='_blank';credit.rel='noopener noreferrer';frame.append(credit);}
    };
    const registered=choosePhoto(card);if(registered)show(registered);
    else if(card.photoLookupEnabled&&card.registeredSourceId){
      fetch('/api/restaurant-photo?id='+encodeURIComponent(card.registeredSourceId),{signal:AbortSignal.timeout(2500)}).then(r=>r.ok?r.json():null).then(data=>{if(data?.status==='photo')show(data.photo);}).catch(()=>{});
    }
    return frame;
  }
  function carousel(group,list){
    const cards=[...list.children].filter(n=>n.classList.contains('restaurant-card')),count=cards.length;
    list.setAttribute('aria-label','추천 식당 가로 목록');list.setAttribute('data-single',String(count<2));
    if(count<2)return;
    const header=el('div','restaurant-carousel-header'),title=el('p','restaurant-carousel-title','추천 식당'),controls=el('div','restaurant-carousel-controls'),counter=el('span','restaurant-carousel-count');counter.setAttribute('aria-live','polite');
    const nav=(direction,label)=>{const b=el('button','restaurant-carousel-nav');b.type='button';b.setAttribute('aria-label',label);const img=el('img');img.alt='';b.append(img);b.addEventListener('click',()=>move(direction));return b;};
    const previous=nav(-1,'이전 식당'),next=nav(1,'다음 식당');controls.append(counter,previous,next);header.append(title,controls);group.append(header);
    list.setAttribute('tabindex','0');
    const reduced=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const animate=left=>{if(list.scrollTo)list.scrollTo({left,behavior:reduced()?'auto':'smooth'});else list.scrollLeft=left;};
    const stride=()=>cards[0].getBoundingClientRect().width+12,max=()=>Math.max(0,(list.scrollWidth||0)-(list.clientWidth||0));
    function move(direction){animate(Math.max(0,Math.min(max(),Math.round((list.scrollLeft||0)/stride()+direction)*stride())));}
    function update(){
      const start=list.scrollLeft||0,end=max();previous.disabled=start<=2;next.disabled=end-start<=2;
      for(const [button,name] of [[previous,'prev'],[next,'next']])button.children[0].src='/assets/restaurant-ui/carousel-'+name+(button.disabled?'-disabled':'')+'.png';
      const step=Math.max(1,stride()),width=list.clientWidth||1,cardWidth=step-12;
      let visible=cards.map((_,i)=>i).filter(i=>i*step>=start-2&&i*step+cardWidth<=start+width+2);
      if(!visible.length)visible=[Math.min(count-1,Math.round(start/step))];
      const first=visible[0]+1,last=visible.at(-1)+1;counter.textContent=(first===last?first:first+'–'+last)+' / '+count;
    }
    list.addEventListener('scroll',update,{passive:true});
    list.addEventListener('keydown',event=>{if(event.target!==list||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();if(event.key==='Home')animate(0);else if(event.key==='End')animate(max());else move(event.key==='ArrowLeft'?-1:1);});
    let drag=null,suppressUntil=0;
    list.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0||event.target.closest('button,a,input,textarea'))return;drag={x:event.clientX,y:event.clientY,left:list.scrollLeft||0,id:event.pointerId,moved:false};});
    list.addEventListener('pointermove',event=>{
      if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(!drag.moved&&Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>8){drag=null;return;}
      if(!drag.moved&&Math.abs(dx)>8){drag.moved=true;list.setPointerCapture?.(drag.id);list.style.scrollSnapType='none';list.classList.add('dragging');}
      if(drag.moved){event.preventDefault();list.scrollLeft=drag.left-dx;}
    });
    const finish=()=>{if(!drag)return;const moved=drag.moved;try{list.releasePointerCapture?.(drag.id);}catch{}drag=null;list.style.scrollSnapType='';list.classList.remove('dragging');if(moved){suppressUntil=Date.now()+300;animate(Math.max(0,Math.min(max(),Math.round((list.scrollLeft||0)/stride())*stride())));}update();};
    list.addEventListener('pointerup',finish);list.addEventListener('pointercancel',finish);
    list.addEventListener('click',event=>{if(Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
    if(globalThis.ResizeObserver){const observer=new ResizeObserver(()=>{if(!list.isConnected){observer.disconnect();return;}update();});observer.observe(list);}
    (globalThis.requestAnimationFrame||((fn)=>fn()))(update);
    list.restaurantCarousel={update,move};
  }
  globalThis.InchelinRestaurantUI=Object.freeze({choosePhoto,photo,carousel});
})();
