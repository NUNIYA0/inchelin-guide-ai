import {actionSchema,readModelPlan,PLANNER_INSTRUCTIONS} from './semantic-contract.js';
import {findRegisteredRegion,registeredRegionMentions} from './region-catalog.js';
// Model chooses meaning/action. This module validates tools and condition deltas.
const actions=['answer','clarify','search','search_more','update_search','details','compare','map','service','reset'];
const slots=['location','radiusMeters','food','budget','companion','people','purpose','visit','visitAt','requireOpen','vibe','parking'];
const nullableString={type:['string','null']};
const choices={type:'array',maxItems:6,items:{type:'object',properties:{label:{type:'string'},message:{type:'string'}},required:['label','message'],additionalProperties:false}};
export function planSchema(faqIds){return actionSchema(faqIds,actions,slots);}
export const defaults=()=>({location:null,radiusMeters:1000,radiusConfirmed:false,food:null,budget:null,companion:null,people:null,purpose:null,visit:null,visitAt:null,requireOpen:false,vibe:null,parking:null});
export function isolateState(state,id,messageCount,regions=null){
  if(!id||state?.conversationId&&state.conversationId!==id||!state?.conversationId&&messageCount<=1)return {};
  const result=state&&typeof state==='object'?structuredClone(state):{};
  const raw=result.phase1?.conditions||{},conditions=defaults();
  for(const key of slots){
    const value=raw[key];
    if(key==='location'&&value?.kind==='region'){conditions.location=findRegisteredRegion(regions,value.regionId);continue;}
    if(key==='location'){const point=globalThis.InchelinPhase1.coords(value);conditions.location=point&&typeof value.label==='string'?{...point,label:value.label.slice(0,100),kind:value.kind==='current'?'current':'station',query:String(value.query||value.label).slice(0,100),district:typeof value.district==='string'?value.district.slice(0,30):null,...(typeof value.regionId==='string'?{regionId:value.regionId.slice(0,80)}:{}),...(typeof value.id==='string'?{id:value.id.slice(0,160)}:{})}:null;}
    else if(key==='radiusMeters')conditions[key]=Number.isFinite(value)&&value>0&&value<=100000?value:1000;
    else if(['parking','requireOpen'].includes(key))conditions[key]=typeof value==='boolean'?value:conditions[key];
    else conditions[key]=typeof value==='string'?value.slice(0,160):key==='people'&&Number.isInteger(value)?value:null;
  }
  conditions.radiusConfirmed=raw.radiusConfirmed===true;
  result.phase1={...(result.phase1||{}),conditions};
  result.lastCards=Array.isArray(result.lastCards)?result.lastCards.slice(0,3):[];
  result.shownPlaces=Array.isArray(result.shownPlaces)?result.shownPlaces.slice(-12):[];
  return result;
}
export function plannerInput(messages,state,context,faq){
  // Keep the visual archive, but exclude pre-reset messages from model context
  // and evidence validation. Otherwise a cleared slot can be 'restored' from it.
  const boundary=state.phase1?.resetBoundary;
  if(boundary){const index=messages.findLastIndex(m=>m.role==='user'&&m.content===boundary);if(index>=0)messages=messages.slice(index+1);}
  const conditions={...defaults(),...(state.phase1?.conditions||{})};
  const origins=Object.fromEntries(slots.map(key=>[key,state.phase1?.conditionOrigins?.[key]||(conditions[key]==null?'unset':key==='radiusMeters'&&!conditions.radiusConfirmed?'default':'inherited')]));
  return {untrustedConversation:messages.slice(-12).map(m=>({role:m.role,content:String(m.content).slice(0,1800)})),currentConditions:conditions,conditionOrigins:origins,pendingQuestion:state.phase1?.pendingQuestion||null,askedQuestions:(state.phase1?.askedQuestions||[]).slice(-8).map(({slot,text})=>({slot,text})),pendingUnknowns:state.phase1?.pendingUnknowns||[],acceptedUnknowns:state.phase1?.acceptedUnknowns||[],focusCardId:state.phase1?.focusCardId||null,visibleCards:(state.lastCards||[]).slice(0,3).map((c,i)=>({position:i+1,id:c.id,name:c.name,address:c.roadAddress||c.address})),previousCards:(state.shownPlaces||[]).slice(-12).map(c=>({id:c.id,name:c.name,address:c.roadAddress||c.address})),localTime:typeof context.currentLocalDatetime==='string'?context.currentLocalDatetime.slice(0,40):null,locationSelection:context.locationSelection?{id:String(context.locationSelection.id||'').slice(0,100),name:String(context.locationSelection.label||context.locationSelection.name||'').slice(0,100)}:null,currentLocationAvailable:Boolean(globalThis.InchelinPhase1.coords(context.currentLocation)),literalFacts:{regions:registeredRegionMentions(context.registeredRegions,messages.findLast(m=>m.role==='user')?.content||'')},supportedLocations:globalThis.InchelinPhase1.centers.map(c=>({name:c.label,aliases:c.aliases})),faq:faq.items.map(row=>({id:row.id,examples:row.examples?.slice(0,2)||[]}))};
}
const instructions=PLANNER_INSTRUCTIONS;
export async function analyzePlan(env,messages,state,context,faq,fetcher=fetch){
  if(!env.OPENAI_API_KEY||env.CONVERSATION_PLANNER_DISABLED==='true')throw new Error('planner_unavailable');
  const input=plannerInput(messages,state,context,faq);
  const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},signal:AbortSignal.timeout(16000),body:JSON.stringify({model:env.OPENAI_INTENT_MODEL||env.OPENAI_MODEL||'gpt-5-mini',store:false,instructions,input:[{role:'user',content:JSON.stringify(input)}],reasoning:{effort:'minimal'},max_output_tokens:2600,text:{format:{type:'json_schema',name:'inchelin_action_plan',strict:true,schema:planSchema(faq.items.map(row=>row.id))}}})});
  if(!response.ok)throw new Error('planner_failed');const data=await response.json();
  if(data.status&&data.status!=='completed')throw new Error('planner_incomplete');
  const parts=(data.output||[]).flatMap(item=>item.content||[]);if(parts.some(p=>p.type==='refusal'))throw new Error('planner_refused');
  const text=data.output_text||parts.filter(p=>p.type==='output_text').map(p=>p.text).join('');return validatePlan(readModelPlan(JSON.parse(text),input.untrustedConversation,state,input.literalFacts),state,faq);
}
export function validatePlan(plan,state,faq){
  if(typeof plan?.clearContext!=='boolean'||![true,false,null].includes(plan?.unknownConsent))throw new Error('invalid_control');
  if(!plan||!actions.includes(plan.action)||!Number.isFinite(plan.confidence)||plan.confidence<0||plan.confidence>1)throw new Error('plan_ambiguous');
  if(!Array.isArray(plan.changes)||plan.changes.length>14||!Array.isArray(plan.targetIds)||!Array.isArray(plan.detailFields))throw new Error('invalid_plan');
  if(['answer','service'].includes(plan.action)&&(plan.changes.length||plan.clearContext||plan.unknownConsent!==null))throw new Error('answer_cannot_change_conditions');
  const allowed=new Set([...(state.lastCards||[]),...(state.shownPlaces||[])].map(c=>c.id));
  if(plan.targetIds.length>3||plan.targetIds.some(id=>!allowed.has(id)))throw new Error('unknown_target');
  if(plan.detailFields.some(key=>!['menus','hours','phone','parking','seating','address'].includes(key)))throw new Error('unknown_detail');
  if(plan.action==='service'&&!faq.items.some(row=>row.id===plan.faqId))throw new Error('unknown_faq');
  const seen=new Set();for(const change of plan.changes){
    if(!slots.includes(change.slot)||seen.has(change.slot)||!['set','clear'].includes(change.op))throw new Error('invalid_change');seen.add(change.slot);
    if(change.op==='clear'){if(change.value!==null)throw new Error('invalid_clear');continue;}
    const value=change.value;
    if(['radiusMeters','budget'].includes(change.slot)){if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>(change.slot==='radiusMeters'?100000:10000000))throw new Error('invalid_number');}
    else if(['requireOpen','parking'].includes(change.slot)){if(typeof value!=='boolean')throw new Error('invalid_boolean');}
    else if(change.slot==='people'){if(!(typeof value==='number'&&Number.isInteger(value)&&value>0&&value<=10000)&&!(typeof value==='string'&&/^\d+\s*[~-]\s*\d+$/.test(value)))throw new Error('invalid_people');}
    else if(typeof value!=='string'||!value.trim()||value.length>160)throw new Error('invalid_text');
    if(change.slot==='visitAt'&&!Number.isFinite(Date.parse(value)))throw new Error('invalid_visit');
  }
  if(plan.question&&(typeof plan.question.text!=='string'||plan.question.text.length>240||![...slots,'clarify'].includes(plan.question.slot)||!Array.isArray(plan.question.choices)||plan.question.choices.length>6))throw new Error('invalid_question');
  if(plan.question?.choices.some(c=>typeof c.label!=='string'||c.label.length>24||typeof c.message!=='string'||c.message.length>160))throw new Error('invalid_choice');
  if(plan.action==='clarify'&&!plan.question)throw new Error('missing_question');
  return {acknowledgement:typeof plan.acknowledgement==='string'?plan.acknowledgement.slice(0,120):null,locationCardinality:plan.locationCardinality||null,peopleBasis:plan.peopleBasis||null,rejectedSlots:plan.rejectedSlots||[],openingTimeBasis:['current','requested_visit'].includes(plan.openingTimeBasis)?plan.openingTimeBasis:null,task:plan.task||(['search','search_more','update_search'].includes(plan.action)?'recommend':plan.action==='clarify'?'change_conditions':'information'),clarificationReason:plan.clarificationReason||null,action:plan.action,confidence:plan.confidence,changes:plan.changes.map(({slot,op,value})=>({slot,op,value})),question:plan.question?{slot:plan.question.slot,text:plan.question.text,choices:plan.question.choices.map(({label,message})=>({label,message})),replaceExisting:plan.question.replaceExisting===true}:null,answer:typeof plan.answer==='string'?plan.answer.slice(0,500):'',faqId:plan.faqId,targetIds:[...new Set(plan.targetIds)],detailFields:[...new Set(plan.detailFields)],unknownConsent:plan.unknownConsent,clearContext:plan.clearContext};
}
export async function applyPlan(plan,previous,context,resolveLocation){
  const prior=plan.clearContext||plan.action==='reset'?{}:previous.phase1||{};
  const conditions={...defaults(),...(prior.conditions||{})},origins={...(prior.conditionOrigins||{})};let locationError=null,locationQuestion=null;
  for(const change of plan.changes){
    const {slot,op,value}=change;origins[slot]='explicit';
    if(slot==='location'){
      conditions.location=null; // Clear stale coordinates before any lookup, even on failure.
      if(op==='set'){try{
        const resolved=await resolveLocation(value,context);
        if(resolved?.kind==='ambiguous'){locationError='ambiguous';locationQuestion=resolved.question;}else conditions.location=resolved;
      }catch{locationError='lookup_failed';}if(!conditions.location)locationError||='not_found';}
    }else if(slot==='radiusMeters'){
      conditions.radiusMeters=op==='clear'?1000:value;conditions.radiusConfirmed=op!=='clear';if(op==='clear')origins[slot]='default';
    }else if(slot==='budget')conditions.budget=op==='clear'?null:value.toLocaleString('ko-KR')+'원 이하';
    else conditions[slot]=op==='clear'?(slot==='requireOpen'?false:null):slot==='people'&&typeof value==='string'?value+'명':value;
    if((slot==='visit'||slot==='visitAt')&&(op==='clear'||!plan.changes.some(c=>c.slot==='visitAt')))conditions.visitAt=null;
    // Clearing a stale exact time must not erase a meal/date supplied in the
    // same plan. Visit updates are a batch, regardless of property order.
    if(slot==='visitAt'&&op==='clear'&&!plan.changes.some(c=>c.slot==='visit'&&c.op==='set')){conditions.visit=null;origins.visit='unset';}
    if(slot==='visit'&&op==='clear'&&!plan.changes.some(c=>c.slot==='visitAt'&&c.op==='set'))origins.visitAt='unset';
    if(op==='clear'&&slot!=='radiusMeters')origins[slot]='unset';
  }
  const soloSet=plan.changes.some(c=>c.slot==='companion'&&c.op==='set'&&c.value==='혼밥'),peopleSet=plan.changes.find(c=>c.slot==='people');
  if(soloSet&&!peopleSet&&conditions.people==null){conditions.people=1;origins.people='derived:companion';}
  if(peopleSet?.op==='set'&&peopleSet.value===1&&plan.peopleBasis==='solo')origins.people='derived:companion';
  if(plan.changes.some(c=>c.slot==='companion'&&c.op==='clear')&&!peopleSet&&origins.people==='derived:companion'){conditions.people=null;origins.people='unset';}
  for(const key of slots)origins[key]??=conditions[key]==null?'unset':key==='radiusMeters'&&!conditions.radiusConfirmed?'default':'inherited';
  if(plan.openingTimeBasis==='current'&&conditions.requireOpen){
    conditions.visit='지금';conditions.visitAt=typeof context.currentLocalDatetime==='string'&&Number.isFinite(Date.parse(context.currentLocalDatetime))?context.currentLocalDatetime.slice(0,40):null;
    origins.visit='explicit';origins.visitAt=conditions.visitAt?'explicit':'unset';
  }
  return {conditions,conditionOrigins:origins,locationError,locationQuestion};
}
