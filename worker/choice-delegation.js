const slots=['location','radiusMeters','food','budget','companion'];
// Standalone answers are interpreted only inside an actual pending question.
// Free-form paraphrases use the model's evidence-bearing delegation contract.
const shortReply=/^(?:아무데나|어디든|어디든지|아무거나|뭐든|뭐든지|상관없어(?:요)?|상관없어요|잘\s*모르겠어(?:요)?|(?:네가|너가|니가|알아서)\s*(?:골라\s*(?:줘|주세요)|정해\s*(?:줘|주세요)))[.!?\s]*$/;
export function applyChoiceDelegation(raw,latest,state){
  const pending=state.phase1?.pendingQuestion;
  if(!pending||!slots.includes(pending.slot)||pending.choices?.some(c=>c.contract==='unknown_consent'))return raw;
  const normalized=v=>String(v||'').normalize('NFKC').replace(/\s/g,'');
  const declared=raw.delegation?.slot===pending.slot&&typeof raw.delegation.evidence==='string'&&raw.delegation.evidence.trim()&&normalized(latest).includes(normalized(raw.delegation.evidence));
  if(!declared&&!shortReply.test(latest.trim()))return raw;
  const update=raw.changes[pending.slot];
  // Concrete new values and explicit negation take priority over a model's
  // accidental delegation tag.
  if(/(?:아무데나|아무거나)\s*(?:말고|아닌)|상관없(?:다는|다고)[^.!?]{0,12}아니/.test(latest))return raw;
  if(update?.op==='set'&&typeof update.value==='string'&&normalized(latest).includes(normalized(update.value)))return raw;
  if(pending.slot==='radiusMeters'&&/\d+(?:\.\d+)?\s*(?:km|m|킬로미터|미터)/.test(latest))return raw;
  // Additional explicitly supplied constraints in a compound reply survive.
  // A standalone delegation cannot erase unrelated preferences.
  const evidence=normalized(raw.delegation?.evidence||latest);
  const changes=Object.fromEntries(Object.entries(raw.changes).map(([k,v])=>[k,k!==pending.slot&&v?.evidence&&normalized(v.evidence)!==evidence&&normalized(latest).includes(normalized(v.evidence))?v:null]));
  const base={...raw,task:'change_conditions',action:'search',delegatedSlot:pending.slot,clearContext:false,unknownConsent:null,resultRequest:null,budgetRelation:null,openingTimeBasis:null,informationRequest:null,referencePositions:[],targetIds:[],detailFields:[],locationReference:null,locationCardinality:null,foodScope:null,clarificationReason:null,question:null,changes};
  const set=(slot,value)=>({op:'set',value,evidence:latest});
  if(pending.slot==='location'){
    const choice=pending.choices?.find(c=>c.contract==='location_selection'&&typeof c.locationValue==='string'&&c.locationValue!=='current');
    // Never choose an unrelated city or device permission on the user's behalf.
    if(!choice)return {...base,action:'clarify',clarificationReason:'missing_location',question:{...pending,text:'찾을 지역만 알려주시면 나머지는 함께 골라볼게요. 동네나 지역 이름을 말씀해 주세요.'},acknowledgement:null};
    return {...base,locationReference:'named',locationCardinality:'single',acknowledgement:`그럼 ${choice.label}부터 살펴볼게요.`,changes:{...changes,location:set('location',choice.locationValue)}};
  }
  if(pending.slot==='radiusMeters'){
    const options=(pending.choices||[]).map(c=>{const m=c.message?.match(/(\d+(?:\.\d+)?)\s*(km|m|킬로미터|미터)/);return m?Number(m[1])*(['km','킬로미터'].includes(m[2])?1000:1):null;}).filter(n=>n>0&&n<=100000);
    const radius=options.includes(1000)?1000:options[0];
    if(!radius)return {...base,action:'clarify',clarificationReason:'missing_radius',question:pending,acknowledgement:null};
    return {...base,acknowledgement:`그럼 직선 ${radius>=1000?radius/1000+'km':radius+'m'} 안에서 먼저 찾아볼게요.`,changes:{...changes,radiusMeters:set('radiusMeters',radius)}};
  }
  if(pending.slot==='food'){
    const choice=pending.choices?.find(c=>c.contract==='food_selection'&&typeof c.foodValue==='string');
    if(choice)return {...base,acknowledgement:`그럼 ${choice.foodValue} 먹을 곳부터 살펴볼게요.`,foodScope:'specific',changes:{...changes,food:set('food',choice.foodValue)}};
    return {...base,acknowledgement:null,action:'clarify',clarificationReason:'food_suggestions',question:{slot:'food',text:'등록된 메뉴 중에서 몇 가지 골라볼게요.',choices:[],replaceExisting:true}};
  }
  // Optional conditions have no invented numeric default. Keep an existing
  // budget/party preference; otherwise search with that optional axis unset.
  return {...base,acknowledgement:pending.slot==='budget'?(state.phase1.conditions?.budget?'그럼 예산은 지금 정한 범위로 두고 찾아볼게요.':'그럼 예산 제한 없이 먼저 찾아볼게요.'):'그럼 동행 조건은 그대로 두고 찾아볼게요.'};
}
