// Opt-in fictional demonstration; never mixed with normal searches.
export function demoRecommendationSource(location){
  const label=location?.label||'강남역',latitude=location?.latitude??37.49795,longitude=location?.longitude??127.02762;
  return {schemaVersion:1,enabled:true,connected:true,restaurants:['가상 국밥집 A','가상 한식집 B','가상 식당 C'].map((name,index)=>({
    name,roadAddress:'가상주소 '+label+' '+(index+1),category:'한식',latitude:latitude+(index+1)*.001,longitude,
    menus:index===0?[{name:'국밥',priceKRW:9000,mainDish:true},{name:'냉면',priceKRW:10000,mainDish:true}]:index===1?[{name:'제육볶음',priceKRW:9500,mainDish:true},{name:'국밥',priceKRW:11000,mainDish:true}]:[{name:'국밥',priceKRW:13000,mainDish:true}],
    soloEvidence:index===0?{confirmed:true,source:'가상 데이터: 1인 메뉴 기록'}:null,
    openingSchedule:index<2?{source:'가상 영업시간(실제 매장 아님)',timeZone:'Asia/Seoul',validFrom:'2026-01-01T00:00:00+09:00',validUntil:'2028-01-01T00:00:00+09:00',hours:[{startMinute:11*60,endMinute:(index===0?22:18)*60}]}:null,
    recommendations:index===0?[
      {id:'demo-a1',recommenderName:'가상 추천인 가',reason:'혼자 국밥 한 그릇 먹기 편했어요. (가상 체험용 문구)',writtenAt:'2026-09-01T10:00:00+09:00',tags:['혼밥']},
      {id:'demo-a2',recommenderName:'가상 추천인 나',reason:'회식 때 함께 식사했어요. (가상 체험용 문구)',writtenAt:'2026-10-01T10:00:00+09:00',tags:['회식']},
      {id:'demo-a3',recommenderName:'가상 추천인 나',reason:'국밥을 먹었던 다른 날의 기록이에요. (가상 체험용 문구)',writtenAt:'2026-10-01T10:00:00+09:00',tags:[]}
    ]:index===1?[{id:'demo-b1',recommenderName:'가상 추천인 다',reason:'동료와 제육볶음을 먹었어요. (가상 체험용 문구)',writtenAt:'2026-10-02T10:00:00+09:00',tags:['동료']}]:[]
  }))};
}
