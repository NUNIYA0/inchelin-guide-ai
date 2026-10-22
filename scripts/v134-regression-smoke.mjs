import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeResponseState} from '../worker/response-modes.js';
import {applyRelatedQuestions,selectRelatedAxes} from '../worker/related-questions.js';
import {mentionedSearchRegion,normalizeFoodAxis} from '../worker/search-axes.js';

export async function testV134(runCase){
  const env={OPENAI_API_KEY:'test-key',RESTAURANT_DATA_SOURCE:'naver',NAVER_API_HUB_CLIENT_ID:'stub',NAVER_API_HUB_CLIENT_SECRET:'stub'};
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const fn=name=>html.match(new RegExp('    (?:async )?function '+name+'\\([^]*?\\n    \\}'))[0];
  const client=new Function('getLocalTimeState','hasExplicitTimeCondition','currentId','currentLocationName','currentLocationCoords',
    ['safeHttpUrl','normalizeNaverPlaceDetails','normalizeRestaurant','normalizeMessage','buildAIRequest'].map(fn).join('\n')+';return {normalizeMessage,buildAIRequest};')(()=>({}),()=>false,'fixture-session','',null);
  const realistic=(region,food)=>({items:[0,1,2].map(i=>({title:'테스트'+food+'식당'+i,
    category:food==='파스타'?'음식점>양식>이탈리아음식>파스타':food==='초밥'?'음식점>일식>초밥':'음식점>한식>'+food,
    roadAddress:({홍대:'서울특별시 마포구 월드컵북로5길',성수:'서울특별시 성동구 연무장길',역삼:'서울특별시 강남구 테헤란로',여의도:'서울특별시 영등포구 국제금융로'})[region]+' '+(i+1),
    address:'서울특별시 '+({홍대:'마포구 서교동',성수:'성동구 성수동2가',역삼:'강남구 역삼동',여의도:'영등포구 여의도동'})[region]+' '+(i+1),
    mapx:String(1269200000+i),mapy:String(375500000+i)}))});
  const alternate=(region,food)=>({items:[0,1,2].map(i=>({title:region+food+'다른식당'+i,category:'음식점>'+food,roadAddress:'서울 '+region+' 테스트길 '+i}))});
  const contract=(body,pending)=>{
    const qs=body.meta.relatedQuestions;
    assert.equal(qs.length,pending?2:3,JSON.stringify(qs));
    assert.equal(new Set(qs.map(q=>q.axis)).size,qs.length);
    assert.ok(qs.filter(q=>q.axis==='detail').length<=1);assert.ok(qs.filter(q=>q.axis==='compare').length<=1);
    assert.ok(qs.some(q=>(pending?['region','food']:['region','food','companion','vibe','facility']).includes(q.axis)));
    if(pending)assert.equal(qs.filter(q=>['detail','compare'].includes(q.axis)).length,1);
    assert.ok(qs.every(q=>!/첫\s*번째|두\s*번째|거기|그\s*곳|어떤 지역/.test(q.text)));
  };
  let count=0;
  for(const [region,food] of [['홍대','냉면'],['성수','파스타'],['역삼','국밥'],['여의도','초밥']]) {
    const prompt=`${region}에서 ${food} 먹을래`;
    const initial=await runCase({message:prompt,env,naverResponse:q=>{
      const area=mentionedSearchRegion(q)||region,dish=normalizeFoodAxis(q)?.menu||food;
      return area===region&&dish===food?realistic(region,food):alternate(area,dish);
    }});
    assert.equal(initial.body.restaurants.length,3,prompt);assert.ok(initial.body.restaurants.every(c=>c.parcelAddress));
    contract(initial.body,false);
    for(const [label,message] of [['혼자','혼자 가요'],['2~3명','2~3명이에요'],['회식','회식이에요'],['가족','가족과 가요']]){
      const assistant=client.normalizeMessage({role:'assistant',content:initial.body.message,restaurants:initial.body.restaurants,meta:initial.body.meta});
      const request=client.buildAIRequest([{role:'user',content:prompt},assistant,{role:'user',content:message}]);
      assert.ok(request.context.responseModeState.lastCards.every(c=>c.parcelAddress));
      const refined=await runCase({message,history:request.messages.slice(0,-1),context:request.context,env,naverResponse:q=>{
        const area=mentionedSearchRegion(q),dish=normalizeFoodAxis(q)?.menu;
        return area===region&&dish===food?{items:realistic(region,food).items.slice(0,1)}:alternate(area,dish);
      }});
      assert.equal(refined.body.restaurants.length,3,`${region}/${food}/${label}`);
      assert.deepEqual(new Set(refined.body.restaurants.map(c=>c.id)),new Set(initial.body.restaurants.map(c=>c.id)));
      assert.equal(refined.body.meta.responseModeState.slots.region,region);assert.equal(refined.body.meta.responseModeState.slots.menu,food);
      assert.ok(refined.body.restaurants.every(c=>c.parcelAddress));count++;
      contract(refined.body,false);
    }
    const two={...initial.body.meta.responseModeState,lastCards:initial.body.meta.responseModeState.lastCards.slice(0,2)};
    const filled=await runCase({message:'회식이에요',context:{responseModeState:two},env,naverResponse:q=>{
      const area=mentionedSearchRegion(q)||region,dish=normalizeFoodAxis(q)?.menu||food;
      const data=area===region&&dish===food?realistic(region,food):alternate(area,dish);
      return {items:data.items.map(item=>({...item,title:'새'+item.title}))};
    }});
    assert.equal(filled.body.restaurants.length,3);assert.ok(two.lastCards.every(old=>filled.body.restaurants.some(c=>c.id===old.id)),'new search only fills gaps, never replaces original IDs');
    const drift={...initial.body.meta.responseModeState,pendingQuestionSlot:null};
    const relabeled=await runCase({message:'회식이에요',context:{responseModeState:drift},env,analyzerEnabled:true,
      modeIntentAnalysis:{intent:'place_search',confidence:1,slots:{food_type:'한식'},flags:{new_topic:'soft'}},naverResponse:realistic(region,food)});
    assert.equal(relabeled.body.restaurants.length,3);assert.deepEqual(new Set(relabeled.body.restaurants.map(c=>c.id)),new Set(initial.body.restaurants.map(c=>c.id)),'optional answer cannot reset axes through another analysis branch');
  }
  const classify=text=>({intent:/비교/.test(text)?'compare':/상세|자세/.test(text)?'specific_place':'condition_change',confidence:1,slots:{region:mentionedSearchRegion(text),...normalizeFoodAxis(text),companion:/회식/.test(text)?'회식':null}});
  const cards=['면담 홍대점','평양면옥 홍대점','냉면식당 홍대점'].map((name,i)=>({id:'p'+i,name,category:'냉면',address:'서울 마포구 서교동 '+i}));
  for(const pending of [true,false]){
    const state=normalizeResponseState({slots:{region:'홍대',menu:'냉면',companion:pending?null:'회식'},lastCards:cards,pendingQuestionSlot:pending?'companion':null});
    const response={message:'골라봤어요.',restaurants:cards,meta:{intent:'place_search',answer_plan:['text','place_cards',...(pending?['question']:[])],responseModeState:state,turnPolicy:pending?{questionText:'누구와 가세요?',next_question:{slot:'companion'}}:{}}};
    const probes=[];
    const result=await applyRelatedQuestions(response,{messages:[]},classify,async check=>{
      probes.push(check.region+':'+check.food);
      // The first two region and food alternatives fail. A later supported fallback works.
      return check.region==='강남역'||check.food==='국밥';
    });
    contract(result,pending);assert.ok(probes.length>4,'fallback proceeds beyond the two failed first alternatives');
    assert.ok(result.meta.relatedQuestions.some(q=>q.axis==='region'||q.axis==='food'));
    const fail=await applyRelatedQuestions(response,{messages:[]},classify,async()=>false);
    assert.equal(new Set(fail.meta.relatedQuestions.map(q=>q.axis)).size,fail.meta.relatedQuestions.length);
    assert.ok(fail.meta.relatedQuestions.every(q=>['detail','compare'].includes(q.axis)),'no unverified primary-axis padding');
  }
  const valid=['region','food','companion','detail','compare'].map(axis=>({axis,key:axis}));
  assert.deepEqual(selectRelatedAxes(valid,{placeResponse:true,pending:true,limit:2}).map(q=>q.axis),['detail','region']);
  assert.equal(selectRelatedAxes([...valid].reverse(),{placeResponse:true}).filter(q=>['region','food','companion'].includes(q.axis)).length,1);
  console.log(`v134: ${count} realistic parcel-address/client round-trip preference cases (4 regions × 4 companions) retain 3→3; unique axes/caps; pending 2/nonpending 3; late verified fallback and fail-closed passed.`);
}
