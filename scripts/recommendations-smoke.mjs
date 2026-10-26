import assert from 'node:assert/strict';
import {readFile,writeFile,rm,mkdir,readdir} from 'node:fs/promises';
import {createRecommendationCatalog,dedupeRestaurants,validateRecommendationSource} from '../worker/recommendations.js';
import {loadRecommendationSource,parseRecommendationCSV} from './recommendation-source.mjs';
import {fileURLToPath} from 'node:url';

export async function testRecommendations(runCase){
  const fixture=JSON.parse(await readFile(new URL('../tests/fixtures/recommendations.json',import.meta.url),'utf8'));
  const catalog=createRecommendationCatalog({...fixture,enabled:true,connected:true});
  const card={id:'test',name:'테스트 식당 0',roadAddress:'서울시 성동구 연무장길 0'};
  const bundle=c=>catalog.enrich([card],c)[0].recommendationBundle;
  assert.equal(bundle({}).representative.id,'fixture-b','date descending, id ascending');
  assert.equal(bundle({companion:'혼밥'}).representative.id,'fixture-a','condition relevance before date');
  assert.equal(bundle({purpose:'회식'}).representative.id,'fixture-b');
  assert.equal(bundle({}).additional.length,2,'recommendation count, not people');
  const repeat=structuredClone(fixture);repeat.restaurants.push(structuredClone(repeat.restaurants[0]));
  assert.equal(createRecommendationCatalog({...repeat,enabled:true,connected:true}).enrich([card],{})[0].recommendationBundle.totalCount,3);
  repeat.restaurants[3].recommendations[0].reason='conflicting';assert.throws(()=>validateRecommendationSource(repeat),/conflicting/);
  assert.throws(()=>validateRecommendationSource({schemaVersion:1,restaurants:[{recommendations:[]}]}),/address/);
  assert.equal(dedupeRestaurants([card,{...card,id:'second'},{...card,id:'third',name:'다른 식당'}]).length,2);
  assert.equal(dedupeRestaurants([{id:'a',name:'없음'},{id:'b',name:'없음'}]).length,2);
  assert.equal(catalog.enrich([{...card,name:'동일 건물 다른 식당'}],{})[0].recommendationBundle.totalCount,0);
  assert.equal(catalog.enrich([{...card,roadAddress:'다른 주소'}],{})[0].recommendationBundle.totalCount,0);
  const parcel=createRecommendationCatalog({schemaVersion:1,enabled:true,connected:true,restaurants:[{name:'지번 식당',parcelAddress:'서울시 마포구 서교동 1-2',recommendations:fixture.restaurants[0].recommendations}]});
  assert.equal(parcel.enrich([{id:'p',name:'지번 식당',parcelAddress:'서울특별시 마포구 서교동 1-2'}],{})[0].recommendationBundle.totalCount,3);
  const disabled=createRecommendationCatalog();assert.ok(!('recommendationBundle' in disabled.enrich([{...card,recommendationBundle:bundle({})}],{})[0]));
  const csv='name,roadAddress,parcelAddress,id,recommenderName,reason,writtenAt,tags\r\n"테스트, 식당",서울시 1,,csv-id,작성자,"줄 하나\n줄 둘 ""인용""",2026-01-01T00:00:00Z,혼밥|회식\r\n';
  assert.equal(parseRecommendationCSV(csv).restaurants[0].recommendations[0].reason,'줄 하나\n줄 둘 "인용"');
  assert.throws(()=>parseRecommendationCSV('name\nabc'),/header/);
  const root=fileURLToPath(new URL('../',import.meta.url));
  const loaderRoot=new URL('../build/recommendation-loader/',import.meta.url);
  await mkdir(new URL('data/',loaderRoot),{recursive:true});
  await writeFile(new URL('data/source.json',loaderRoot),JSON.stringify(fixture));
  await writeFile(new URL('data/source.csv',loaderRoot),csv);
  assert.equal((await loadRecommendationSource(fileURLToPath(loaderRoot),{enabled:true,connected:true,source:'data/source.json',format:'json'})).restaurants.length,3);
  assert.equal((await loadRecommendationSource(fileURLToPath(loaderRoot),{enabled:true,connected:true,source:'data/source.csv',format:'csv'})).restaurants[0].recommendations[0].reason,'줄 하나\n줄 둘 "인용"');
  await assert.rejects(loadRecommendationSource(fileURLToPath(loaderRoot),{enabled:true,connected:true,source:'data/missing.json',format:'json'}),/ENOENT/);
  assert.equal((await loadRecommendationSource(root,{enabled:false,connected:false,source:'missing'})).restaurants.length,0);
  await assert.rejects(loadRecommendationSource(root,{enabled:true,connected:true,source:'../secret',format:'json'}),/inside data/);
  const config=JSON.parse(await readFile(new URL('../data/recommendation-source.json',import.meta.url),'utf8'));assert.equal(config.enabled,true);assert.equal(config.connected,true);
  const workerText=await readFile(new URL('../build/dist/server/index.js',import.meta.url),'utf8');
  async function checkAssets(directory){for(const item of await readdir(directory,{withFileTypes:true})){const path=new URL(item.name+(item.isDirectory()?'/':''),directory);if(item.isDirectory())await checkAssets(path);else if(/\.(?:js|html|json)$/.test(item.name))assert.ok(!(await readFile(path,'utf8')).includes('테스트 전용 작성자'),'no fictional author in deployable assets: '+item.name);}}
  await checkAssets(new URL('../dist/',import.meta.url));
  assert.ok(!workerText.includes('테스트 전용 작성자'),'fixtures never embedded');
  assert.match(workerText,/"exclusive":true/);
  // A test-only copy of the real built Worker, never placed in deployable dist/.
  const testPath=new URL('../build/dist/server/index.recommendations-test.js',import.meta.url);
  const injected=workerText.replace(/const recommendationData = [^\n]+;/,'const recommendationData = '+JSON.stringify({...fixture,enabled:true,connected:true})+';');
  await writeFile(testPath,injected);
  try{
    const enabledWorker=(await import(testPath.href+'?test='+Date.now())).default;
    const r=await runCase('성수역에서 파스타',{workerOverride:enabledWorker});
    assert.equal(r.body.restaurants.length,3);
    assert.equal(r.body.restaurants[0].recommendationBundle.representative.reason,fixture.restaurants[0].recommendations[1].reason);
    const solo=await runCase('혼자 먹을 거야',{state:r.body.meta.responseModeState,workerOverride:enabledWorker});
    assert.equal(solo.body.restaurants[0].recommendationBundle.representative.reason,fixture.restaurants[0].recommendations[0].reason,'authored text survives finalization unchanged');
    assert.equal(solo.body.restaurants[0].recommendationBundle.totalCount,3);
    assert.equal(solo.body.restaurants[1].recommendationBundle.totalCount,1);
    assert.equal(solo.body.restaurants[2].recommendationBundle.totalCount,0);
    assert.equal(solo.body.meta.responseModeState.phase1.conditions.food,'파스타');
    assert.equal(solo.body.meta.responseModeState.phase1.conditions.location.label,'성수역');
    assert.equal(solo.body.meta.responseModeState.phase1.conditions.radiusMeters,1000);
    const meeting=await runCase('회식으로 갈 거야',{state:solo.body.meta.responseModeState,workerOverride:enabledWorker});assert.equal(meeting.body.restaurants[0].recommendationBundle.representative.id,'fixture-b');
    const forged=structuredClone(solo.body.meta.responseModeState);forged.lastCards[0].recommendationBundle.representative.reason='forged';
    const detail=await runCase('첫 번째 식당 자세히 알려줘',{state:forged,workerOverride:enabledWorker});assert.notEqual(detail.body.restaurants[0].recommendationBundle.representative.reason,'forged');
    const off=await runCase('첫 번째 식당 자세히 알려줘',{state:forged});assert.ok(!off.body.restaurants[0].recommendationBundle);
    const center=globalThis.InchelinPhase1.centers.find(c=>c.label==='성수역');
    const raw={title:'테스트 식당 0',roadAddress:'서울특별시 성동구 연무장길 0',address:'서울특별시 성동구 성수동2가 0',category:'음식점>양식>이탈리안음식',mapx:String(Math.round(center.longitude*1e7)),mapy:String(Math.round(center.latitude*1e7))};
    const duplicate=await runCase('성수역 파스타',{workerOverride:enabledWorker,data:{items:[raw,{...raw,title:'테스트 식당  0'}]}});assert.equal(duplicate.body.restaurants.length,1,'one actual response card per restaurant');
    return {enabled:r,solo,fixture};
  }finally{await rm(testPath,{force:true});}
}
