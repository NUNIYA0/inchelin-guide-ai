// Inspect the spoken ending, ignoring trailing Markdown and punctuation.
export function koreanParticle(word, pair) {
  const ending = String(word ?? "").normalize("NFC").replace(/[\s\p{P}\p{S}]+$/gu, "").at(-1) || "";
  const code = ending.charCodeAt(0);
  const final = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : 0;
  const hasFinal = final > 0 || /[013678]/.test(ending);
  const rieul = final === 8 || /[178]/.test(ending);
  const forms = {
    "이/가": ["이", "가"], "을/를": ["을", "를"], "은/는": ["은", "는"],
    "으로/로": ["으로", "로"], "과/와": ["과", "와"], "이에요/예요": ["이에요", "예요"],
  };
  if (!forms[pair]) throw new Error(`Unsupported Korean particle pair: ${pair}`);
  return forms[pair][hasFinal && !(pair === "으로/로" && rieul) ? 0 : 1];
}

export function withParticle(word, pair) {
  return `${word ?? ""}${koreanParticle(word, pair)}`;
}

// Correct only standalone, known slot words in display copy, not arbitrary
// substrings such as '냉면가게'. Routing data and addresses remain untouched.
export function normalizeKoreanParticles(value, words = []) {
  if(typeof value!=='string')return value;
  const pairs={'은':'은/는','는':'은/는','이':'이/가','가':'이/가','을':'을/를','를':'을/를','으로':'으로/로','로':'으로/로','과':'과/와','와':'과/와'};
  for(const word of [...new Set(words.filter(word=>typeof word==='string'&&word))].sort((a,b)=>b.length-a.length)){
    const escaped=word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    value=value.replace(new RegExp(`(${escaped})([’'”"*]*)(으로|은|는|이|가|을|를|로|과|와)(?=\\s|[.!?,。]|$)`,'g'),(_,name,closing,particle)=>name+closing+koreanParticle(name,pairs[particle]));
  }
  return value;
}
