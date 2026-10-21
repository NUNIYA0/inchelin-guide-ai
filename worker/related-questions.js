import { normalizeResponseState } from './response-modes.js';
import { MAIN_DISHES, SIDE_FOOD, isMainDish } from './main-dishes.js';
import { normalizeFoodAxis, normalizeSearchRegion, mentionedSearchRegion, SEARCH_REGIONS, ADJACENT_REGIONS } from './search-axes.js';
import { FORBIDDEN_COPY } from './conversation-copy.js';
import { RELATED_QUESTION_POLICY } from './answer-plan.js';
import { withParticle } from './korean.js';

export const RELATED_INTENTS = ['place_search','condition_change','followup','compare','service'];
// The per-intent table explicitly includes menu exploration, food conversation
// and named-place details, in addition to the five common routing intents.
const TABLE_INTENTS = {place_search:['specific_place'],condition_change:['specific_place'],followup:['specific_place'],menu_trouble:['menu_trouble','place_search'],food_talk:['menu_trouble','food_talk','place_search'],compare:['specific_place','followup'],specific_place:['specific_place','followup'],service:['menu_trouble'],general:['menu_trouble'],out_of_scope:['menu_trouble']};
export const RELATED_AXES={
  place_search:['region','food','companion','compare','detail'],condition_change:['region','food','companion','compare','detail'],followup:['region','food','companion','compare','detail'],
  menu_trouble:['menu_batch','category','place','region','food'],compare:['detail','compare','region','food','companion'],specific_place:['detail','region','food','more','compare'],
  food_talk:['place','food_talk','category','menu_batch','region','food'],service:['service_criteria','service_regions','service_location','service_detail','start'],general:['service_criteria','service_regions','service_location','service_detail','start'],out_of_scope:['start']
};
const UNSUPPORTED = /영업|몇\s*시|전화|평점|별점|가격|예산|얼마|웨이팅|대기|분위기|조용|주차|단체석|인기|맛있|맛집\s*순위|예약/;
const SERVICE_TEXTS = ['추천은 어떤 기준으로 해?','오늘 뭐 먹을지 같이 골라줘','어떤 지역에서 식당을 찾을 수 있어?','현재 위치로 식당을 찾을 수 있어?'];
const compact = text=>String(text||'').replace(/[\s.,?!？~]/g,'');
// Bounded, short-lived result cache: no user messages, coordinates or credentials.
const searchCache=new Map();
export function clearRelatedSearchCache(){searchCache.clear();}
export async function confirmedCombination(key,search,timeoutMs=700){
  const cached=searchCache.get(key);
  if(cached && cached.expires>Date.now())return cached.found;
  let timer;
  try {
    const found=await Promise.race([Promise.resolve().then(search),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);
    if(searchCache.size>=150)searchCache.delete(searchCache.keys().next().value);
    searchCache.set(key,{found:found===true,expires:Date.now()+(found?180000:15000)});
    return found===true;
  }catch{return false;}finally{clearTimeout(timer);}
}
function foodIn(text) {
  const parsed=normalizeFoodAxis(text)?.menu;
  return isMainDish(parsed)?parsed:MAIN_DISHES.filter(item=>text.includes(item.name)).sort((a,b)=>text.lastIndexOf(b.name)-text.lastIndexOf(a.name)||b.name.length-a.name.length)[0]?.name||'';
}
export function relatedAllowed(response) {
  const meta=response.meta||{},intent=meta.analysis?.intent||meta.intent||'general',state=meta.responseModeState||{};
  if (meta.variant==='hard_reset' || ['menu_category','region','clarify','side_main'].includes(meta.flow) || meta.unsupportedRegion || meta.analysis?.confidence<.6) return false;
  if ((meta.restaurantSearchStatus==='no_results' || state.noResults) && !response.restaurants?.length) return false;
  if (meta.turnPolicy?.answerLayout==='region' || meta.turnPolicy?.answerLayout==='category') return false;
  return !!RELATED_QUESTION_POLICY[intent] && (['compare','specific_place','food_talk','service','general','out_of_scope'].includes(intent) || !!response.restaurants?.length || !!meta.menuCards?.length);
}
function axisAndKey(text,analysis,state) {
  const intent=analysis.intent,region=mentionedSearchRegion(text),food=foodIn(text);
  if (intent==='service') {
    const topic=/기준/.test(text)?'criteria':/지역/.test(text)?'regions':/위치/.test(text)?'location':/상세보기/.test(text)?'detail':'';
    return topic?{axis:'service_'+topic,key:'service:'+topic}:null;
  }
  if (intent==='compare') {
    const names=state.lastCards.filter((card,index)=>text.includes(card.name)||[/(?:첫\s*번째|처음|1\s*번째)/,/(?:두\s*번째|2\s*번째)/,/(?:세\s*번째|3\s*번째)/][index]?.test(text)).map(card=>card.id).sort();
    if(names.length<2) return null;
    return {axis:'compare',key:'compare:'+names.join(',')};
  }
  if (intent==='specific_place' || intent==='followup' && /상세|정보|자세/.test(text)) {
    const card=state.lastCards.find((card,index)=>text.includes(card.name)||[/(?:첫\s*번째|처음)/,/(?:두\s*번째)/,/(?:세\s*번째)/][index]?.test(text));
    return card?{axis:'detail',key:'detail:'+card.id}:null;
  }
  if (region && region!==state.slots.region) return {axis:'region',key:`region:${region}:${food||state.slots.menu||state.slots.food_type||''}`};
  if (food && food!==(state.slots.menu||'')) return {axis:'food',key:`food:${food}:${region||state.slots.region||''}`};
  if (analysis.slots?.companion && !state.slots.companion && !state.askedSlots.includes('companion') && state.pendingQuestionSlot!=='companion') return {axis:'companion',key:'companion:'+analysis.slots.companion};
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
    shownSuggestions:state.shownSuggestions,template_history:state.relatedTemplateHistory};
}
export function validateRelated(textValue,{state,parentIntent,classify,history=[],pendingSlot=null}) {
  const text=typeof textValue==='string'?textValue.trim():'';
  if ([...text].length<12 || [...text].length>30 || /[\r\n]/.test(text) || (text.match(/[?？]/g)||[]).length>1 || /[.!。].+/.test(text)) return null;
  if (!/(?:줘|어|야|해|까|래|있지)[.!?？]?$/.test(text) || /주세요|해\s*주세|같이\s*찾아주세/.test(text) || FORBIDDEN_COPY.test(text) || UNSUPPORTED.test(text) || SIDE_FOOD.test(text)) return null;
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
  if (!descriptor || descriptor.axis===pendingSlot || descriptor.axis==='companion' && state.askedSlots.includes('companion')) return null;
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
  const similar=({국밥:['설렁탕','곰탕','냉면'],삼겹살:['갈비','불고기','국밥'],냉면:['메밀국수','칼국수','국밥']})[food]||['국밥','냉면','삼겹살'];
  // All variants retain the same grounded axis values; syntax is rotated after two rounds.
  const regions=other.flatMap(area=>[`${area}에서도 ${food} 먹을 곳 찾아줘`,`${region} 말고 ${area}에서 찾아줘`,`${area} 지역에서 ${food}도 찾아줘`]);
  const foods=similar.filter(name=>name!==food && isMainDish(name)).flatMap(name=>[`${food} 말고 ${name} 먹을 곳 찾아줘`,`${region}에서 ${withParticle(name,'은/는')} 어때?`,`${region}에서 ${withParticle(name,'으로/로')} 바꿔 찾아줘`]);
  const situations=['회식하기 좋은 곳으로 다시 찾아줘','가족과 함께 먹을 곳으로 찾아줘','혼자 먹을 곳으로 다시 찾아줘'].filter(text=>!context.pending_question?.slot || context.pending_question.slot!=='companion');
  const search=[regions[0],foods[0],situations[0],...regions.slice(1),...foods.slice(1),...situations.slice(1)].filter(Boolean);
  const menu=[`다른 ${state.menuCategory||'한식'} 메뉴도 보여줘`,'중식으로 먹을 메뉴를 골라줘',`${food} 먹을 곳도 같이 찾아줘`];
  const details=state.lastCards.slice(0,3).flatMap(card=>[`${card.name} 자세히 알려줘`,`${card.name} 상세 정보도 알려줘`]);
  const comparisons=state.lastCards.length>=2?[`${state.lastCards[0].name}랑 ${state.lastCards[1].name} 비교해줘`]:[];
  if (['service','general'].includes(intent)) return [...SERVICE_TEXTS];
  if(intent==='out_of_scope') return ['오늘 뭐 먹을지 같이 골라줘'];
  if(intent==='menu_trouble') return [...menu,...search,...SERVICE_TEXTS];
  if(intent==='compare') return [...details,...comparisons,...SERVICE_TEXTS];
  if(intent==='specific_place') return [`${region}에서 ${food}집 다른 곳도 찾아줘`,'상세보기는 어떻게 이용하는 거야?',...details,...search,...SERVICE_TEXTS];
  if(intent==='food_talk') return [`${food} 먹을 곳도 같이 찾아줘`,`${food} 먹는 법도 조금 더 알려줘`,...menu,...SERVICE_TEXTS];
  return [...search,...details,...comparisons];
}
export async function applyRelatedQuestions(response,payload,classify,preflight=async()=>false) {
  const meta={...(response.meta||{})};
  const state=normalizeResponseState(meta.responseModeState||payload.context?.responseModeState||{});
  const context=relatedContext({...response,meta},payload),parentIntent=context.intent;
  const previousState=normalizeResponseState(payload.context?.responseModeState||{}),previous=previousState.shownSuggestions;
  state.relatedTemplateHistory=previousState.relatedTemplateHistory.length?previousState.relatedTemplateHistory:state.relatedTemplateHistory;
  state.shownSuggestions=[...new Map([...previous,...state.shownSuggestions].map(item=>[item.key,item])).values()];
  const plan=(meta.answer_plan||['text']).filter(block=>block!=='related_questions');
  const raw=meta.relatedCandidates||meta.analysis?.related_questions||[];
  const proposed=Array.isArray(raw)?raw.slice(0,6):[];
  delete meta.relatedCandidates;if(meta.analysis) {meta.analysis={...meta.analysis};delete meta.analysis.related_questions;}
  const selected=[];
  if(relatedAllowed({...response,meta}) && state.shownSuggestions.length<1000) {
    const options={state,parentIntent,classify,history:(payload.messages||[]).filter(item=>item.role==='user').map(item=>item.content),pendingSlot:context.pending_question?.slot};
    const limit=meta.answer_plan?.includes('question')&&meta.turnPolicy?.questionText?2:3;
    let searches=0;
    const chips=[...(response.suggestions||[]),...(meta.turnPolicy?.actionChips||[])].join(' ');
    for (const candidate of [...proposed.map(item=>({text:typeof item==='string'?item:item?.text,source:'model'})),...relatedTemplates(state,parentIntent,context).map(text=>({text,source:'template'}))]) {
      const validated=validateRelated(candidate.text,options);
      if(!validated || selected.some(item=>item.axis===validated.axis || item.key===validated.key))continue;
      if(['place_search','condition_change','followup'].includes(parentIntent) && validated.axis==='compare'
        && (!selected.some(item=>['region','food','companion'].includes(item.axis)) || state.lastCards.length<2))continue;
      if(validated.axis==='menu_batch' && /다른 메뉴/.test(chips) || validated.axis==='more' && /다른 곳/.test(chips))continue;
      if(['region','food','place','companion','more'].includes(validated.axis)) {
        if(!state.slots.region && !response.restaurants?.length)continue;
        const region=mentionedSearchRegion(validated.text)||state.slots.region;
        const food=foodIn(validated.text)||state.slots.menu||state.slots.food_type;
        if(!SEARCH_REGIONS.includes(region)||!food||searches++>=3)continue;
        if(!await preflight({region,food,text:validated.text,state,response}))continue;
      }
      selected.push({...validated,source:candidate.source});if(selected.length>=limit)break;
    }
  }
  // Never fill an exhausted session with repeated or unanswerable questions.
  const questions=selected;
  state.relatedTemplateHistory=meta.variant==='hard_reset'?[]:[...state.relatedTemplateHistory,questions.map(item=>item.pattern)].slice(-2);
  if(questions.length) {plan.push('related_questions');state.shownSuggestions.push(...questions.map(({text,key})=>({text,key})));}
  if(meta.analysis) meta.analysis.answer_plan=plan;
  return {...response,meta:{...meta,answer_plan:plan,responseModeState:state,relatedQuestions:questions}};
}
