// Numeric stage timings only: never log prompts, queries, headers or credentials.
let requests=0;
export function createChatTiming() {
  const start=performance.now(),stages={intent:0,search:0,details:0,copy:0,decode:0,policy:0,suggestions:0},firstInIsolate=requests++===0;
  const measure=async(name,action)=>{const t=performance.now();try{return await action();}finally{stages[name]=(stages[name]||0)+performance.now()-t;}};
  return {measure,finish(){const values={...stages,total:performance.now()-start};return {firstInIsolate,stages:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,Math.round(value*10)/10]))};}};
}
