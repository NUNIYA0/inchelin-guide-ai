import {registeredShortlist} from './registered-search.js';
import {menuMatches} from './menu-matching.js';

// Menu directions come from authored records. Choosing a direction still runs
// the normal evidence checks; this list never promises seats/hours/budget fit.
export function foodChangeOptions(catalog,conditions,api,cards=[]){
  if(!catalog.active||!conditions.location)return [];
  const c={...conditions,food:null},location=c.location;
  let rows=registeredShortlist(catalog.entries(),c,api.centers,Infinity);
  if(location.kind!=='region'){
    const known=new Set(cards.filter(card=>{
      const distance=api.distance(location,card);
      return distance!==null&&distance<=c.radiusMeters;
    }).map(card=>card.registeredSourceId).filter(Boolean));
    rows=rows.filter(row=>known.has(row.sourceId)||(api.distance(location,row)!==null&&api.distance(location,row)<=c.radiusMeters));
  }
  const options=[],seen=new Set();
  for(const row of rows){
    const menu=row.menus.find(menu=>menu.mainDish&&menu.name.trim().length<=24&&!seen.has(menu.name)&&!menuMatches(conditions.food,menu.name)&&(!c.budget||Number.isFinite(menu.priceKRW)&&menu.priceKRW<=Number(String(c.budget).replace(/[^\d]/g,''))));
    if(!menu)continue;
    seen.add(menu.name);options.push({label:menu.name,message:menu.name+' 먹을 곳으로 바꿔줘',contract:'food_selection',foodValue:menu.name});
    if(options.length===3)break;
  }
  return options;
}
