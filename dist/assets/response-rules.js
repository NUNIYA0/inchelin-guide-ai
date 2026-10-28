// Shared classic script / Worker module. Raw histories are archives, not response caches.
(() => {
  const VERSION='v169',TTL_MS=60*60*1000;
  function isCurrent(meta,now=Date.now()) {return meta?.responseRulesVersion===VERSION&&Number.isFinite(meta.generatedAt)&&now-meta.generatedAt>=0&&now-meta.generatedAt<TTL_MS;}
  const cacheKey=key=>VERSION+':'+key;
  function prune(cache,now=Date.now()) {for(const [key,value] of cache)if(!key.startsWith(VERSION+':')||!Number.isFinite(value.expires)||value.expires<=now||value.expires>now+TTL_MS)cache.delete(key);}
  globalThis.InchelinResponseRules=Object.freeze({VERSION,TTL_MS,isCurrent,cacheKey,prune});
})();
