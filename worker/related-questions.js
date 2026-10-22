import { normalizeResponseState } from './response-modes.js';
import { MAIN_DISHES, SIDE_FOOD, isMainDish } from './main-dishes.js';
import { normalizeFoodAxis, normalizeSearchRegion, mentionedSearchRegion, SEARCH_REGIONS, ADJACENT_REGIONS } from './search-axes.js';
import { FORBIDDEN_COPY } from './conversation-copy.js';
import { RELATED_QUESTION_POLICY } from './answer-plan.js';
import { withParticle } from './korean.js';
import './response-rules.js';

export const RELATED_INTENTS = ['place_search','condition_change','followup','compare','service'];
// The per-intent table explicitly includes menu exploration, food conversation
// and named-place details, in addition to the five common routing intents.
const TABLE_INTENTS = {place_search:['specific_place'],condition_change:['specific_place'],followup:['specific_place'],menu_trouble:['menu_trouble','place_search'],food_talk:['menu_trouble','food_talk','place_search'],compare:['specific_place','followup'],specific_place:['specific_place','followup'],service:['menu_trouble'],general:['menu_trouble'],out_of_scope:['menu_trouble']};
export const RELATED_AXES={
  place_search:['region','food','companion','vibe','facility','compare','detail'],condition_change:['region','food','companion','vibe','facility','compare','detail'],followup:['region','food','companion','vibe','facility','compare','detail'],
  menu_trouble:['menu_batch','category','place','region','food'],compare:['detail','compare','region','food','companion'],specific_place:['detail','region','food','more','compare'],
  food_talk:['place','food_talk','category','menu_batch','region','food'],service:['service_criteria','service_regions','service_location','service_detail','start'],general:['service_criteria','service_regions','service_location','service_detail','start'],out_of_scope:['start']
};
const UNSUPPORTED = /영업|몇\s*시|전화|평점|별점|가격|예산|얼마|웨이팅|대기|분위기|조용|주차|단체석|인기|맛있|맛집\s*순위|예약/;
const SERVICE_TEXTS = ['추천은 어떤 기준으로 해?','오늘 뭐 먹을지 같이 골라줘','어떤 지역에서 식당을 찾을 수 있어?','현재 위치로 식당을 찾을 수 있어?'];
const compact = text=>String(text||'').replace(/[\s.,?!？~]/g,'');
// Companion, ambience and facilities are one user-facing situation axis.
export const relatedAxisGroup=axis=>['companion','vibe','facility'].includes(axis)?'situation':axis;
// Bounded, short-lived result cache: no user messages, coordinates or credentials.
const searchCache=new Map();
const pendingSearches=new Map();
export function clearRelatedSearchCache(){searchCache.clear();pendingSearches.clear();}
export async function confirmedCombination(key,search,timeoutMs=700){
  globalThis.InchelinResponseRules.prune(searchCache);
  key=globalThis.InchelinResponseRules.cacheKey(key);
  const cached=searchCache.get(key);
  if(cached && cached.expires>Date.now())return cached.found;
  if(pendingSearches.has(key))return pendingSearches.get(key);
  let timer;
  const pending=(async()=>{
  try {
    const found=await Promise.race([Promise.resolve().then(search),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);
    if(searchCache.size>=150)searchCache.delete(searchCache.keys().next().value);
    searchCache.set(key,{found:found===true,expires:Date.now()+(found?180000:15000)});
    return found===true;
  }catch{return false;}finally{clearTimeout(timer);pendingSearches.delete(key);}
  })();pendingSearches.set(key,pending);return pending;
}
function foodIn(text) {
  const parsed=normalizeFoodAxis(text)?.menu;
  return isMainDish(parsed)?parsed:MAIN_DISHES.filter(item=>text.includes(item.name)).sort((a,b)=>text.lastIndexOf(b.name)-text.lastIndexOf(a.name)||b.name.length-a.name.length)[0]?.name||'';
}
export function relatedAllowed(response) {
  const meta=response.meta||{},intent=meta.analysis?.intent||meta.intent||'general',state=meta.responseModeState||{};
  if(['missing_credentials','missing_configuration','authentication_failed','api_request_failed'].includes(meta.restaurantSearchStatus))return false;
  if (intent==='service' || meta.error || meta.variant==='hard_reset' || ['menu_category','region','clarify','side_main'].includes(meta.flow) || meta.unsupportedRegion || meta.analysis?.confidence<.6) return false;
  if ((meta.restaurantSearchStatus==='no_results' || state.noResults) && !response.restaurants?.length) return false;
  if (meta.turnPolicy?.answerLayout==='region' || meta.turnPolicy?.answerLayout==='category') return false;
  return !!RELATED_QUESTION_POLICY[intent] && (['compare','specific_place','food_talk','service','general','out_of_scope'].includes(intent) || !!response.restaurants?.length || !!meta.menuCards?.length);
}
function axisAndKey(text,analysis,state) {
  const intent=analysis.intent,region=mentionedSearchRegion(text),food=foodIn(text);
  if(intent==='condition_change' && /조용|분위기/.test(text))return {axis:'vibe',key:'vibe:quiet'};
  if(intent==='condition_change' && /단체석|주차/.test(text))return {axis:'facility',key:'facility:'+(/주차/.test(text)?'parking':'group')};
  if (intent==='service') {
    const topic=/기준/.test(text)?'criteria':/지역/.test(text)?'regions':/위치/.test(text)?'location':/상세보기/.test(text)?'detail':'';
    return topic?{axis:'service_'+topic,key:'service:'+topic}:null;
  }
  if (intent==='compare') {
    const names=state.lastCards.filter(card=>text.includes(card.name)).map(card=>card.id).sort();
    if(names.length<2) return null;
    return {axis:'compare',key:'compare:'+names.join(',')};
  }
  if (intent==='specific_place' || intent==='followup' && /상세|정보|자세/.test(text)) {
    const card=state.lastCards.find(card=>text.includes(card.name));
    return card?{axis:'detail',key:'detail:'+card.id}:null;
  }
  if (region && region!==state.slots.region) return {axis:'region',key:`region:${region}:${food||state.slots.menu||state.slots.food_type||''}`};
  if (food && food!==(state.slots.menu||'')) return {axis:'food',key:`food:${food}:${region||state.slots.region||''}`};
  if (analysis.slots?.companion && state.pendingQuestionSlot!=='companion' && (!state.askedSlots.includes('companion')||state.slots.companion)) return {axis:'companion',key:'companion:'+analysis.slots.companion+(/다른/.test(text)?':unseen':':refine')};
  if (/다른.{0,8}메뉴/.test(text)) return {axis:'menu_batch',key:'menu:'+(state.menuCategory||state.slots.food_type||'all')};
  const category=Object.keys({한식:1,중식:1,일식:1,양식:1,분식:1}).find(word=>text.includes(word));
  if(category && category!==state.menuCategory) return {axis:'category',key:'category:'+category};
  if (/다른.{0,3}(?:곳|식당)/.test(text)) return {axis:'more',key:'more:'+(state.slots.region||'')+':'+(state.slots.menu||'')};
  if (/먹을\s*곳|어디서.*먹/.test(text) && state.slots.menu) return {axis:'place',key:`place:${state.slots.menu}:${state.slots.region||''}`};
  if (intent==='food_talk' && food) return {axis:'food_talk',key:'food_talk:'+food};
  if (/오늘.*메뉴.*골라|오늘.*뭐.*먹/.test(text)) return {axis:'start',key:'start:menu'};
  return null;
}
export function relatedPattern(text,state) {
  let value=String(text);
  const tokens=[...state.lastCards.map(card=>[card.name,'{card}']),...MAIN_DISHES.map(item=>[item.name,'{food}']),...[...SEARCH_REGIONS,...Object.values(ADJACENT_REGIONS).flat()].map(name=>[name,'{region}'])].sort((a,b)=>b[0].length-a[0].length);
  for(const [name,token] of tokens)if(name)value=value.split(name).join(token);
  return compact(value.replace(/\{food\}(?:은|는|으로|로|을|를|이|가|과|와)/g,'{food}{particle}'));
}
export function relatedContext(response,payload={}) {
  const state=normalizeResponseState(response.meta?.responseModeState||payload.context?.responseModeState||{});
  const policy=response.meta?.turnPolicy||{},analysis=response.meta?.analysis||{};
  return {utterance:[...(payload.messages||[])].reverse().find(item=>item.role==='user')?.content||'',intent:analysis.intent||response.meta?.intent||'general',
    slots:state.slots,missing_slots:policy.missing_slots||analysis.missing_slots||[],cards:response.restaurants?.length?response.restaurants:state.lastCards,
    pending_question:policy.next_question|| (state.pendingQuestionSlot?{slot:state.pendingQuestionSlot,text:policy.questionText||''}:null),askedSlots:state.askedSlots,
    shownSuggestions:state.shownSuggestions,template_history:state.relatedTemplateHistory,axis_history:state.relatedAxisHistory};
}
export function validateRelated(textValue,{state,parentIntent,classify,history=[],pendingSlot=null}) {
  const text=typeof textValue==='string'?textValue.trim().replace(/다시\s*찾아줘/g,'찾아줘'):'';
  if ([...text].length<12 || [...text].length>40 || /[\r\n]/.test(text) || (text.match(/[?？]/g)||[]).length>1 || /[.!。].+/.test(text)) return null;
  const unnamed=state.lastCards.reduce((value,card)=>value.split(card.name).join(''),text);
  if(/첫\s*번째|두\s*번째|세\s*번째|처음|마지막|거기|그\s*곳|그\s*집|[123]\s*(?:번째|번\s*식당)/.test(unnamed))return null;
  const preferenceOnly=/조용하게.*(?:추천|찾아)|혼자.*(?:보여|찾아)|단체석.*좋겠어/.test(text)&&!/확인|보장|돼\?|있어\?/.test(text);
  if (!/(?:줘|어|야|해|까|래|있지)[.!?？]?$/.test(text) || /주세요|해\s*주세|같이\s*찾아주세/.test(text) || FORBIDDEN_COPY.test(text) || UNSUPPORTED.test(preferenceOnly?text.replace(/조용|분위기|단체석/g,''):text) || SIDE_FOOD.test(text)) return null;
  const region=mentionedSearchRegion(text);
  if (region && !SEARCH_REGIONS.includes(region)) return null;
  const analysis=classify(text,state);
  if (!analysis || ![...RELATED_INTENTS,...(TABLE_INTENTS[parentIntent]||[])].includes(analysis.intent) || analysis.confidence<.6) return null;
  if (pendingSlot==='companion' && (analysis.slots?.companion || /회식|혼밥|혼자|가족|데이트|몇\s*명|누구와|함께\s*가/.test(text)))return null;
  if (['menu','food_type','sub_menu'].includes(pendingSlot) && normalizeFoodAxis(text))return null;
  if (['region','sub_region'].includes(pendingSlot) && mentionedSearchRegion(text))return null;
  if(analysis.slots?.region && !SEARCH_REGIONS.includes(normalizeSearchRegion(analysis.slots.region)))return null;
  if (parentIntent==='out_of_scope' && !/오늘.*메뉴.*골라|오늘.*뭐.*먹/.test(text)) return null;
  const explicitFood=normalizeFoodAxis(text)?.menu;
  if (explicitFood && !isMainDish(explicitFood)) return null;
  const descriptor=axisAndKey(text,analysis,state);
  if (!descriptor || descriptor.axis===pendingSlot) return null;
  if(descriptor.axis==='companion' && (state.slots.companion||state.preferences.companion||state.askedSlots.includes('companion')))return null;
  if(descriptor.axis==='vibe' && state.preferences.vibe)return null;
  if(descriptor.axis==='facility' && (state.slots.parking!==null || state.slots.other.some(item=>/단체석/.test(item))))return null;
  if(['place_search','condition_change','followup'].includes(parentIntent)&&relatedAxisGroup(descriptor.axis)==='situation'&&state.relatedAxisHistory.at(-1)?.some(axis=>relatedAxisGroup(axis)==='situation'))return null;
  if([...text].length>30&&!['detail','compare'].includes(descriptor.axis))return null;
  if (descriptor.axis.startsWith('service_') && !['service','general'].includes(parentIntent))return null;
  if (!RELATED_AXES[parentIntent]?.includes(descriptor.axis))return null;
  if (descriptor.axis==='detail' && !state.lastCards.some(card=>'detail:'+card.id===descriptor.key && card.address && card.category))return null;
  const pattern=relatedPattern(text,state);
  if(state.relatedTemplateHistory.length>=2 && state.relatedTemplateHistory.every(round=>round.includes(pattern)))return null;
  if (state.shownSuggestions.some(old=>old.key===descriptor.key || compact(old.text)===compact(text))) return null;
  if (history.some(old=>compact(old)===compact(text))) return null;
  for (const old of history) { const prior=axisAndKey(old,classify(old,state)||{},state);if(prior?.key===descriptor.key)return null; }
  return {text,...descriptor,intent:analysis.intent,pattern};
}
export function relatedTemplates(state,intent,context={}) {
  const food=isMainDish(state.slots.menu)?state.slots.menu:state.aCandidates.find(isMainDish)||'국밥';
  const region=state.slots.region||'강남',other=[...new Set([...(region==='홍대'?['성수','종로','여의도']:ADJACENT_REGIONS[region]||[]),...SEARCH_REGIONS])].filter(area=>area!==region && SEARCH_REGIONS.includes(area));
  const similar=({국밥:['설렁탕','곰탕','냉면'],삼겹살:['갈비','불고기','국밥'],냉면:['메밀국수','칼국수','국밥'],파스타:['리소토','피자','스테이크'],초밥:['돈까스','라멘','우동']})[food]||['국밥','냉면','삼겹살'];
  // All variants retain the same grounded axis values; syntax is rotated after two rounds.
  const regions=other.flatMap(area=>[`${area}에서도 ${food} 먹을 곳 찾아줘`,`${region} 말고 ${area}에서 찾아줘`,`${area} 지역에서 ${food}도 찾아줘`]);
  const foods=similar.filter(name=>name!==food && isMainDish(name)).flatMap(name=>[`${food} 말고 ${name} 먹을 곳 찾아줘`,`${region}에서 ${withParticle(name,'은/는')} 어때?`,`${region}에서 ${withParticle(name,'으로/로')} 바꿔 찾아줘`]);
  const current=state.slots.companion;
  const situations=(current?/회식/.test(current)?[`회식하기 좋은 다른 ${food}집도 보여줘`,'회식할 곳을 같은 지역에서 찾아줘']:/혼자|혼밥/.test(current)?['혼자 가기 편한 곳으로 찾아줘',`혼자 먹을 다른 ${food}집도 찾아줘`]:/가족/.test(current)?['가족과 함께 먹을 곳으로 찾아줘']:[`${current} 먹을 곳으로 찾아줘`]:['회식하기 좋은 곳으로 찾아줘','가족과 함께 먹을 곳으로 찾아줘','혼자 먹을 곳으로 찾아줘']).filter(text=>context.pending_question?.slot!=='companion');
  const search=[regions[0],foods[0],situations[0],...regions.slice(1),...foods.slice(1),...situations.slice(1)].filter(Boolean);
  const menu=[`다른 ${state.menuCategory||'한식'} 메뉴도 보여줘`,'중식으로 먹을 메뉴를 골라줘',`${food} 먹을 곳도 같이 찾아줘`];
  const details=state.lastCards.slice(0,3).flatMap(card=>[`${card.name} 자세히 알려줘`,`${card.name} 상세 정보도 알려줘`]);
  const comparisons=state.lastCards.flatMap((card,i)=>state.lastCards.slice(i+1).map(other=>`${withParticle(card.name,'과/와')} ${other.name} 비교해줘`));
  if (['service','general'].includes(intent)) return [...SERVICE_TEXTS];
  if(intent==='out_of_scope') return ['오늘 뭐 먹을지 같이 골라줘'];
  if(intent==='menu_trouble') return [...menu,...search,...SERVICE_TEXTS];
  if(intent==='compare') return [...details,...comparisons,...SERVICE_TEXTS];
  if(intent==='specific_place') return [`${region}에서 ${food}집 다른 곳도 찾아줘`,'상세보기는 어떻게 이용하는 거야?',...details,...search,...SERVICE_TEXTS];
  if(intent==='food_talk') return [`${food} 먹을 곳도 같이 찾아줘`,`${food} 먹는 법도 조금 더 알려줘`,...menu,...SERVICE_TEXTS];
  return [...search,'조용하게 대화할 수 있는 곳으로 추천해줘','단체석 있는 곳이면 좋겠어',...details,...comparisons];
}
// Place responses reserve a primary-axis question; grounded detail/compare never
// substitute for a failed region/food lookup or repeat their axis to pad counts.
export function selectRelatedAxes(candidates,{placeResponse=false,pending=false,limit=3,singlePlace=false}={}) {
  const unique=[];
  for(const candidate of candidates)if(!unique.some(old=>relatedAxisGroup(old.axis)===relatedAxisGroup(candidate.axis)))unique.push(candidate);
  if(!placeResponse)return unique.slice(0,limit);
  if(pending) {
    const primary=unique.find(item=>['region','food'].includes(item.axis));
    const grounded=unique.find(item=>['detail','compare'].includes(item.axis));
    return [grounded,primary].filter(Boolean);
  }
  if(singlePlace){
    const situation=unique.find(item=>relatedAxisGroup(item.axis)==='situation');
    return [situation,...unique.filter(item=>['region','food'].includes(item.axis))].filter(Boolean).slice(0,limit);
  }
  const primary=unique.find(item=>['region','food','companion','vibe','facility'].includes(item.axis));
  if(!primary)return unique.filter(item=>['detail','compare'].includes(item.axis)).slice(0,2);
  const selected=unique.slice(0,limit);
  if(!selected.includes(primary))selected[selected.length-1]=primary;
  return selected;
}
export async function applyRelatedQuestions(response,payload,classify,preflight=async()=>false) {
  const meta={...(response.meta||{})};
  const state=normalizeResponseState(meta.responseModeState||payload.context?.responseModeState||{});
  const context=relatedContext({...response,meta},payload),parentIntent=context.intent;
  const previousState=normalizeResponseState(payload.context?.responseModeState||{}),previous=previousState.shownSuggestions;
  state.relatedTemplateHistory=previousState.relatedTemplateHistory.length?previousState.relatedTemplateHistory:state.relatedTemplateHistory;
  state.relatedAxisHistory=previousState.relatedAxisHistory.length?previousState.relatedAxisHistory:state.relatedAxisHistory;
  state.shownSuggestions=[...new Map([...previous,...state.shownSuggestions].map(item=>[item.key,item])).values()];
  const plan=(meta.answer_plan||['text']).filter(block=>block!=='related_questions');
  const raw=meta.relatedCandidates||meta.analysis?.related_questions||[];
  const proposed=Array.isArray(raw)?raw.slice(0,6):[];
  delete meta.relatedCandidates;if(meta.analysis) {meta.analysis={...meta.analysis};delete meta.analysis.related_questions;}
  let selected=[];
  if(relatedAllowed({...response,meta}) && state.shownSuggestions.length<1000) {
    const options={state,parentIntent,classify,history:(payload.messages||[]).filter(item=>item.role==='user').map(item=>item.content),pendingSlot:context.pending_question?.slot};
    const limit=meta.answer_plan?.includes('question')&&meta.turnPolicy?.questionText?2:3;
    const attempted=new Set();
    const chips=[...(response.suggestions||[]),...(meta.turnPolicy?.actionChips||[])].join(' ');
    const priorities=['region','food','companion','vibe','facility','detail','compare'];
    const axisScore=axis=>(state.relatedAxisHistory.at(-1)?.includes(axis)?4:0)+(state.relatedAxisHistory.at(-2)?.includes(axis)?2:0)+priorities.indexOf(axis)/10;
    const candidates=[...proposed.map(item=>({text:typeof item==='string'?item:item?.text,source:'model'})),...relatedTemplates(state,parentIntent,context).map(text=>({text,source:'template'}))]
      .map(candidate=>({...candidate,validated:validateRelated(candidate.text,options)})).filter(candidate=>candidate.validated);
    if(['place_search','condition_change','followup'].includes(parentIntent))candidates.sort((a,b)=>axisScore(a.validated.axis)-axisScore(b.validated.axis));
    const placeResponse=['place_search','condition_change','followup'].includes(parentIntent);
    const pending=limit===2;
    const available=[];
    const probeResults=new Map();
    for (const candidate of candidates) {
      const validated=candidate.validated;
      if(available.some(item=>item.validated.key===validated.key))continue;
      if(validated.axis==='menu_batch' && /다른 메뉴/.test(chips) || validated.axis==='more' && /다른 곳/.test(chips))continue;
      if(['region','food','place','companion','vibe','facility','more'].includes(validated.axis)) {
        if(!state.slots.region && !response.restaurants?.length)continue;
        const region=mentionedSearchRegion(validated.text)||state.slots.region;
        const food=foodIn(validated.text)||state.slots.menu||state.slots.food_type;
        const key=region+':'+food+':'+(/다른.{0,10}(?:곳|식당|집)/.test(validated.text)?'unseen':'any');
        if(!SEARCH_REGIONS.includes(region)||!food)continue;
        candidate.probeKey=key;
        candidate.check={region,food,text:validated.text,state,response};
      }
      available.push(candidate);
    }
    const choose=()=>selectRelatedAxes(available.filter(candidate=>!candidate.check||probeResults.get(candidate.probeKey)===true)
      .map(candidate=>({...candidate.validated,source:candidate.source})),{placeResponse,pending,limit,singlePlace:placeResponse&&response.restaurants?.length===1});
    // Failed first alternatives must not end fallback exploration. Up to three
    // bounded parallel batches try different supported combinations, at most 18
    // unique probes; ordinary successful first batches still return immediately.
    for(let round=0;round<3;round++) {
      const checks=[],axisAttempts=new Map();
      for(const candidate of available) {
        if(!candidate.check||attempted.has(candidate.probeKey)||checks.length>=6||(axisAttempts.get(candidate.validated.axis)||0)>=2)continue;
        attempted.add(candidate.probeKey);checks.push(candidate);
        axisAttempts.set(candidate.validated.axis,(axisAttempts.get(candidate.validated.axis)||0)+1);
      }
      await Promise.all(checks.map(async candidate=>{
        let timer,found=false;
        try {found=await Promise.race([Promise.resolve().then(()=>preflight(candidate.check)),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),850);})])===true;}
        catch { /* Failed or timed-out combinations never become suggestions. */ }
        finally {clearTimeout(timer);probeResults.set(candidate.probeKey,found);}
      }));
      selected=choose();
      if(selected.length>=limit||!checks.length)break;
    }
  }
  // Never fill an exhausted session with repeated or unanswerable questions.
  const questions=selected;
  state.relatedTemplateHistory=meta.variant==='hard_reset'?[]:[...state.relatedTemplateHistory,questions.map(item=>item.pattern)].slice(-2);
  state.relatedAxisHistory=meta.variant==='hard_reset'?[]:[...state.relatedAxisHistory,questions.map(item=>item.axis)].slice(-2);
  if(questions.length) {plan.push('related_questions');state.shownSuggestions.push(...questions.map(({text,key})=>({text,key})));}
  if(meta.analysis) meta.analysis.answer_plan=plan;
  return {...response,meta:{...meta,answer_plan:plan,responseModeState:state,relatedQuestions:questions}};
}
