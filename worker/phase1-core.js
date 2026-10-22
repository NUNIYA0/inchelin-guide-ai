// v137 phase 1 contract, shared by Worker, browser and mocked tests. No AI/key access.
(() => {
  const centers=[
    {label:'강남역',latitude:37.49795,longitude:127.02762,aliases:['강남역','강남']},
    {label:'역삼역',latitude:37.50062,longitude:127.03645,aliases:['역삼역','역삼']},
    {label:'홍대입구역',latitude:37.55719,longitude:126.92538,aliases:['홍대입구역','홍대입구','홍대']},
    {label:'합정역',latitude:37.54956,longitude:126.91394,aliases:['합정역','합정']},
    {label:'성수역',latitude:37.54458,longitude:127.05594,aliases:['성수역','성수']},
    {label:'종로3가역',latitude:37.57042,longitude:126.99215,aliases:['종로3가역','종로3가','종로']},
    {label:'여의도역',latitude:37.52162,longitude:126.92424,aliases:['여의도역','여의도']},
  ];
  // Representative station points, not exits or walking-route origins. WGS84.
  const dishes=['삼겹살','제육볶음','순두부찌개','김치찌개','설렁탕','국밥','곰탕','냉면','칼국수','쌀국수','라멘','우동','초밥','스시','돈까스','파스타','스파게티','피자','스테이크','리소토','마라탕','짜장면','짬뽕','떡볶이','김밥','비빔밥','치킨','갈비','불고기','샐러드','한식','중식','일식','양식','분식','카페','고기'];
  const clean=s=>String(s||'').replace(/<[^>]*>/g,'').trim().slice(0,200);
  const coords=p=>p&&p.latitude!=null&&p.longitude!=null&&p.latitude!==''&&p.longitude!==''&&Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude))&&Math.abs(Number(p.latitude))<=90&&Math.abs(Number(p.longitude))<=180&&!(Number(p.latitude)===0&&Number(p.longitude)===0)?{latitude:Number(p.latitude),longitude:Number(p.longitude)}:null;
  function distance(a,b){if(!coords(a)||!coords(b))return null;const rad=n=>n*Math.PI/180,dlat=rad(b.latitude-a.latitude),dlng=rad(b.longitude-a.longitude),v=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlng/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)));}
  function findCenters(text){const matches=centers.flatMap(c=>c.aliases.flatMap(alias=>[...text.matchAll(new RegExp(alias+'(?=$|[\\s,.!?]|에서|으로|로|이나|이랑|랑|과|와|하고|또는|말고|역(?![가-힣])|쪽|근처|주변|맛집|음식|추천|냉면|삼겹살|파스타)','g'))].map(m=>({center:c,index:m.index,length:alias.length}))));return matches.sort((a,b)=>a.index-b.index||a.length-b.length);}
  function parse(text,previous={},context={}){
    text=clean(text);const c={location:null,radiusMeters:1000,food:null,budget:null,companion:null,people:null,purpose:null,visit:null,requireOpen:false,visitAt:null,vibe:null,parking:null,...JSON.parse(JSON.stringify(previous||{}))};
    if(c.location&&!coords(c.location))c.location=null;
    c.radiusMeters=Number.isFinite(Number(c.radiusMeters))&&Number(c.radiusMeters)>0?Number(c.radiusMeters):1000;
    const matches=findCenters(text),unique=[...new Set(matches.map(m=>m.center.label))];
    let ambiguous=/이나|또는|어디(?:로|가)/.test(text)&&unique.length>1;
    if(matches.length&&!ambiguous)c.location={...matches.at(-1).center,kind:'station'};
    if(/현재\s*위치|내\s*주변|지금\s*내\s*주변/.test(text)){
      const current=coords(context.currentLocation);
      c.location=current?{...current,label:'현재 위치',kind:'current',query:context.currentLocationName&&context.currentLocationName!=='현재 위치'?clean(context.currentLocationName):centers.slice().sort((a,b)=>distance(a,current)-distance(b,current))[0].label}:null;
    }
    const requested=text.match(/(\d+(?:\.\d+)?)\s*(km|킬로미터|킬로|m|미터)\s*(?:이내|안|로|으로|반경|범위|까지|$)/i);
    const meters=requested?Number(requested[1])*(/^(?:km|킬로)/i.test(requested[2])?1000:1):null;
    const invalidRadius=requested&&(!Number.isFinite(meters)||meters<=0);
    if(requested&&!invalidRadius)c.radiusMeters=meters;
    const foods=dishes.flatMap(food=>[...text.matchAll(new RegExp(food,'g'))].map(m=>({food,index:m.index}))).sort((a,b)=>a.index-b.index||a.food.length-b.food.length);
    if(foods.length)c.food=foods.at(-1).food;
    const budget=text.match(/(?:(\d+(?:\.\d+)?|한|일)?\s*만\s*(?:(\d+)\s*천)?\s*원|(\d[\d,]*)\s*원)\s*(이하|미만|정도|까지)?/);
    if(budget){const amount=budget[3]?Number(budget[3].replace(/,/g,'')):(/한|일/.test(budget[1]||'')?1:Number(budget[1]||1))*10000+Number(budget[2]||0)*1000;c.budget=(amount%10000===0?amount/10000+'만 원':amount.toLocaleString('ko-KR')+'원')+(budget[4]?' '+budget[4]:'');}
    if(/혼자|혼밥/.test(text)){c.companion='혼밥';c.people=1;}
    else if(/가족|회식|동료|친구|데이트|접대/.test(text))c.companion=text.match(/가족|회식|동료|친구|데이트|접대/)[0];
    const people=text.match(/(\d+(?:\s*[~〜-]\s*\d+)?)\s*명/);if(people)c.people=people[1]+'명';
    const purpose=text.match(/회식|데이트|가족\s*모임|접대|비즈니스/);if(purpose)c.purpose=purpose[0];
    const visit=text.match(/(?:(?:오늘|내일|모레|이번\s*주말|다음\s*주|\d{1,2}월\s*\d{1,2}일)\s*)?(?:(?:오전|오후|아침|점심|저녁|야식|늦은\s*밤)(?:\s*\d{1,2}시(?:\s*\d{1,2}분)?)?|\d{1,2}시(?:\s*\d{1,2}분)?)/);
    if(/(?:영업\s*중|영업하는|문\s*연|열려\s*있는).*(?:곳|식당|가게).*만|영업.*(?:필수|조건)|영업하는\s*곳만/.test(text))c.requireOpen=true;
    const visitExplicitThisTurn=Boolean(visit||/내일|모레|오늘/.test(text)&&/갈|방문|먹/.test(text));
    if(visit)c.visit=visit[0];else if(/내일|모레|오늘/.test(text)&&/갈|방문|먹/.test(text))c.visit=text.match(/내일|모레|오늘/)[0];
    if(c.requireOpen&&/지금|현재|영업\s*중/.test(text)&&!visit)c.visit='지금';
    if(visit||c.requireOpen&&/지금|현재|영업\s*중/.test(text)){
      const now=new Date(context.currentLocalDatetime||Date.now()),clock=Number.isFinite(now.getTime())?now:new Date();
      const local=new Date(clock.getTime()+9*3600000),hour=c.visit?.match(/(\d{1,2})시(?:\s*(\d{1,2})분)?/);
      if(c.visit==='지금')c.visitAt=clock.toISOString();
      else if(hour){let h=Number(hour[1]);if(/오후|저녁|야식|밤/.test(c.visit)&&h<12)h+=12;if(/오전|아침/.test(c.visit)&&h===12)h=0;const day=/모레/.test(c.visit)?2:/내일/.test(c.visit)?1:0,date=c.visit.match(/(\d{1,2})월\s*(\d{1,2})일/);c.visitAt=h<24&&Number(hour[2]||0)<60&&!/주말|다음\s*주/.test(c.visit)?new Date(Date.UTC(local.getUTCFullYear(),date?Number(date[1])-1:local.getUTCMonth(),date?Number(date[2]):local.getUTCDate()+day,h-9,Number(hour[2]||0))).toISOString():null;}
      else c.visitAt=null;
    }
    if(/조용|대화|아늑/.test(text))c.vibe=text.match(/조용|대화|아늑/)[0];
    if(/주차/.test(text))c.parking=true;
    const remove=[[/음식|메뉴/,'food'],[/예산|가격/,'budget'],[/인원/,'people'],[/혼밥|동행/,'companion'],[/방문|시간/,'visit'],[/목적/,'purpose'],[/분위기/,'vibe'],[/주차/,'parking']];
    if(/해제|제한\s*없|상관\s*없|빼줘|지워줘/.test(text))for(const [pattern,key] of remove)if(pattern.test(text)){c[key]=null;if(key==='companion'&&c.people===1)c.people=null;}
    if(/영업.*(?:해제|상관\s*없|빼줘|제한\s*없)/.test(text))c.requireOpen=false;
    if(!c.visit)c.visitAt=null;
    if(/위치.*(?:삭제|해제|빼줘)|지역.*(?:삭제|해제|빼줘)/.test(text))c.location=null;
    const unknownStation=!matches.length&&!/현재\s*위치|내\s*주변/.test(text)&&(text.match(/([가-힣]{2,15}역)(?:에서|으로|로|\s|$)/)?.[1]||text.match(/([가-힣]{2,12})(?:에서)/)?.[1]);
    if(unknownStation)c.location=null;
    return {conditions:c,ambiguous,unknownStation,invalidRadius,visitExplicitThisTurn,intents:[/비교|어디가\s*나아/.test(text)&&'compare',/지도/.test(text)&&'map',/영업|전화|메뉴\s*알려|가격|주차|주소|자세|상세/.test(text)&&'detail',/다시\s*추천|다른\s*곳/.test(text)&&'retry'].filter(Boolean)};
  }
  const mapUrl=address=>{const full=String(address||'').replace(/<[^>]*>/g,'').trim();return full?'https://map.naver.com/p/search/'+encodeURIComponent(full):'';};
  function conditionChips(c){if(!c.location)return [];return [{key:'location',label:c.location.label}, {key:'radiusMeters',label:c.radiusMeters<1000?c.radiusMeters+'m 이내':c.radiusMeters/1000+'km 이내'},...['visit','food','budget','companion','people','purpose','vibe','parking'].filter(k=>c[k]!=null&&!(k==='people'&&c[k]===1)).map(key=>({key,label:key==='parking'?'주차 필요':String(c[key]),removable:true}))].filter(Boolean);}
  function conditionNotice(c,visitExplicitThisTurn=false){
    const missing=[c.food&&'메뉴 판매 여부',c.budget&&'가격',(c.companion||c.people||c.purpose)&&'좌석',c.vibe&&'분위기',c.parking&&'주차'].filter(Boolean);
    return [missing.length?missing.join('·')+' 정보는 확인되지 않아 방문 전 매장 확인이 필요해요.':'',c.visit&&visitExplicitThisTurn?'말씀하신 시간의 영업 여부는 확인되지 않았어요.':''].filter(Boolean).join(' ');
  }
  function followups(c,{empty=false,detail=false}={}){
    if(detail)return[{label:'네이버지도 보기',message:'네이버지도 보기'}];
    if(empty)return[{label:'2km로 확대',message:'2km 이내로 찾아줘'},...(c.food?[{label:'음식 변경',message:'음식 종류 변경'}]:[]),...(c.budget?[{label:'예산 변경',message:'예산 변경'}]:[]),{label:'지역·역 선택',message:'지역·역 선택'}].filter(x=>!(c.radiusMeters>=2000&&x.label==='2km로 확대')).slice(0,3);
    if(c.radiusMeters<=500)return[{label:'1km로 확대',message:'1km 이내로 찾아줘'},{label:'예산 변경',message:'예산 변경'},{label:'음식 종류 변경',message:'음식 종류 변경'}];
    if(c.food&&c.budget)return[{label:'500m 이내로',message:'500m 이내로 찾아줘'},{label:'다른 메뉴로',message:'음식 종류 변경'},{label:'다시 추천',message:'다시 추천해줘'}];
    return [!c.food?{label:'한식으로',message:'한식으로 찾아줘'}:{label:'음식 종류 변경',message:'음식 종류 변경'},!c.budget?{label:'1만 원 이하로',message:'1만 원 이하로 찾아줘'}:{label:'500m 이내로',message:'500m 이내로 찾아줘'},!c.companion?{label:'혼밥하기 좋은 곳',message:'혼자 먹을 거야'}:{label:'다시 추천',message:'다시 추천해줘'}];
  }
  const defaults={morning:['아침으로 가볍게 먹을 곳 추천해줘','혼자 아침 먹기 좋은 곳 찾아줘','아침으로 든든한 국밥 먹고 싶어'],lunch:['오늘 점심 맛집 추천해줘','혼밥하기 좋은 점심 맛집 찾아줘','동료와 점심 먹기 좋은 곳 추천해줘'],afternoon:['늦은 점심 먹을 곳 찾아줘','지금 가기 좋은 카페 추천해줘','이른 저녁으로 가볍게 먹을 곳 찾아줘'],evening:['오늘 저녁 맛집 추천해줘','친구와 저녁 먹기 좋은 곳 찾아줘','혼자 저녁 먹기 좋은 곳 추천해줘'],lateNight:['야식 먹을 곳 추천해줘','늦은 시간 가볍게 먹을 곳 추천해줘','친구와 늦은 밤 먹을 곳 찾아줘']};
  const period=hour=>hour>=5&&hour<10?'morning':hour>=10&&hour<14?'lunch':hour>=14&&hour<17?'afternoon':hour>=17&&hour<21?'evening':'lateNight';
  function welcome(hour,generated=[]){const p=period(hour);return [...new Set([...(Array.isArray(generated)?generated:[]).filter(s=>typeof s==='string'&&s.length>8&&!/영업|디저트|강남|홍대|역삼|성수|종로|여의도/.test(s)),...defaults[p]])].slice(0,3).map(prompt=>({label:prompt,prompt}));}
  const phase2Fields=()=>({imageUrl:null,menus:null,prices:null,recommenderName:null,recommendationReason:null,otherRecommendations:null,openingHours:null});
  globalThis.InchelinPhase1=Object.freeze({centers,dishes,coords,distance,parse,mapUrl,conditionChips,conditionNotice,followups,period,welcome,phase2Fields});
})();
