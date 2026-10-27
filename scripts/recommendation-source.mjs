import {readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {validateRecommendationSource} from '../worker/recommendations.js';

// Excel export adapter: UTF-8 CSV (one authored recommendation per row).
export function parseRecommendationCSV(text) {
  const rows=[];let row=[],cell='',quoted=false;
  text=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted)quoted=false;else if(!cell)quoted=true;else throw new Error('Invalid CSV quote');}
    else if(ch===','&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}
    else cell+=ch;
  }
  if(quoted)throw new Error('Unclosed CSV quote');
  row.push(cell);if(row.some(Boolean))rows.push(row);
  const headers=rows.shift()||[];
  for(const key of ['name','roadAddress','parcelAddress','id','recommenderName','reason','writtenAt','tags'])if(!headers.includes(key))throw new Error('CSV missing header: '+key);
  const restaurants=rows.map(values=>{
    if(values.length!==headers.length)throw new Error('CSV column count mismatch');
    const r=Object.fromEntries(headers.map((key,i)=>[key,values[i]]));
    return {name:r.name,roadAddress:r.roadAddress,parcelAddress:r.parcelAddress,category:r.category||'',...(r.latitude&&r.longitude?{latitude:Number(r.latitude),longitude:Number(r.longitude)}:{}),imageUrl:r.imageUrl||null,photos:r.photos?JSON.parse(r.photos):[],menus:r.menus?JSON.parse(r.menus):[],soloEvidence:r.soloEvidence?JSON.parse(r.soloEvidence):null,naverPlaceUrl:r.naverPlaceUrl||null,naverPlaceId:r.naverPlaceId||null,naverPlaceVerification:r.naverPlaceVerification?JSON.parse(r.naverPlaceVerification):null,recommendations:r.id?[{id:r.id,recommenderName:r.recommenderName||null,reason:r.reason||null,writtenAt:r.writtenAt||null,tags:r.tags?r.tags.split('|'):[]}]:[]};
  });
  return validateRecommendationSource({schemaVersion:1,restaurants});
}
export async function loadRecommendationSource(root,config) {
  if(!config.enabled||!config.connected)return {schemaVersion:1,enabled:false,connected:false,restaurants:[]};
  if(typeof config.source!=='string'||!config.source)throw new Error('Connected recommendation source path required');
  const path=resolve(root,config.source),rel=relative(resolve(root,'data'),path);
  if(rel.startsWith('..')||isAbsolute(rel))throw new Error('Recommendation source must be inside data/');
  const text=await readFile(path,'utf8');
  if(!['json','csv'].includes(config.format))throw new Error('Recommendation format must be json or csv');
  let data=config.format==='csv'?parseRecommendationCSV(text):validateRecommendationSource(JSON.parse(text));
  // Optional operator-confirmed links; never join businesses by name alone.
  const linksPath=resolve(root,'data/private/place-links.json');let overrides=[];
  try{overrides=JSON.parse(await readFile(linksPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!Array.isArray(overrides))throw new Error('Place link overrides must be an array');
  if(overrides.length)data=validateRecommendationSource({...data,restaurants:data.restaurants.map(row=>{const entry=overrides.find(v=>v.sourceId===row.sourceId&&v.name===row.name&&v.address===(row.roadAddress||row.parcelAddress||row.address));return entry?{...row,naverPlaceUrl:entry.naverPlaceUrl,naverPlaceId:entry.naverPlaceId,naverPlaceVerification:entry.naverPlaceVerification,naverPlaceShareUrl:entry.naverPlaceShareUrl}:row;})});
  return {...data,enabled:true,connected:true};
}
