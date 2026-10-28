// Search concepts operate on registered menu text, never create a selling claim.
const key=v=>String(v||'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
const concepts={국밥:['국밥','순대국','곰탕','설렁탕','탕밥'],파스타:['파스타','스파게티','링귀니','링귀네','페투치네','까르보나라','카르보나라','알리오올리오','봉골레'],삼겹살:['삼겹'],돈까스:['돈까스','돈가스','돈카츠'],냉면:['냉면']};
export function menuMatches(food,name){const wanted=key(food),text=key(name);return Boolean(wanted&&text&&(text.includes(wanted)||(concepts[wanted]||[]).some(word=>text.includes(word))));}
