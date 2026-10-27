import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {loadRecommendationSource} from './recommendation-source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(root, "build");
const hostingOutputRoot = resolve(root, "dist");
if (!outputRoot.startsWith(`${root}${sep}`)) throw new Error("Invalid build directory");
if (!hostingOutputRoot.startsWith(`${root}${sep}`)) throw new Error("Invalid hosting build directory");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

await rm(outputRoot, { recursive: true, force: true });
await rm(join(hostingOutputRoot, "server"), { recursive: true, force: true });
await rm(join(hostingOutputRoot, ".openai"), { recursive: true, force: true });
await mkdir(join(outputRoot, "dist", "server"), { recursive: true });
await mkdir(join(outputRoot, ".openai"), { recursive: true });
await mkdir(join(hostingOutputRoot, "server"), { recursive: true });
await mkdir(join(hostingOutputRoot, ".openai"), { recursive: true });

const html = await readFile(join(root, "dist", "index.html"), "utf8");
const searchAxes = await readFile(join(root, "worker", "search-axes.js"), "utf8");
const korean = await readFile(join(root, "worker", "korean.js"), "utf8");
const mainDishes = await readFile(join(root,'worker','main-dishes.js'),'utf8');
const relatedQuestions = await readFile(join(root,'worker','related-questions.js'),'utf8');
const naverMap = await readFile(join(root,'dist','assets','naver-map.js'),'utf8');
const requestTiming=await readFile(join(root,'worker','request-timing.js'),'utf8');
const responseRules=await readFile(join(root,'worker','response-rules.js'),'utf8');
const phase1Core=await readFile(join(root,'worker','phase1-core.js'),'utf8');
const recommendations=await readFile(join(root,'worker','recommendations.js'),'utf8');
const restaurantPhotos=await readFile(join(root,'worker','restaurant-photos.js'),'utf8');
const photoSource=JSON.parse(await readFile(join(root,'data','photo-source.json'),'utf8'));
const registeredSearch=await readFile(join(root,'worker','registered-search.js'),'utf8');
const conditionEvidence=await readFile(join(root,'worker','condition-evidence.js'),'utf8');
const recommendationConfig=JSON.parse(await readFile(join(root,'data','recommendation-source.json'),'utf8'));
const recommendationData=await loadRecommendationSource(root,recommendationConfig);
await writeFile(join(root,'dist','assets','recommendation-flags.js'),'globalThis.InchelinRecommendationFlags='+JSON.stringify({enabled:recommendationData.enabled,connected:recommendationData.connected})+';');
await writeFile(join(root,'dist','assets','phase1-core.js'),phase1Core);
await writeFile(join(root,'dist','assets','response-rules.js'),responseRules);
await writeFile(join(root, "dist", "assets", "search-axes-data-v1.js"), searchAxes);
await writeFile(join(root, "dist", "assets", "korean.js"), korean);
await writeFile(join(root,'dist','assets','main-dishes.js'),mainDishes);
const assetsRoot = join(root, "dist", "assets");
const assets = {};
for (const path of await walk(assetsRoot)) {
  const route = `/assets/${relative(assetsRoot, path).split(sep).join("/")}`;
  assets[route] = {
    type: mimeTypes[extname(path).toLowerCase()] || "application/octet-stream",
    body: (await readFile(path)).toString("base64"),
  };
}

const template = await readFile(join(root, "worker", "index.template.js"), "utf8");
const responseModes = await readFile(join(root, "worker", "response-modes.js"), "utf8");
const turnPolicy = await readFile(join(root, "worker", "turn-policy.js"), "utf8");
const conversationCopy = await readFile(join(root, "worker", "conversation-copy.js"), "utf8");
const answerPlan = await readFile(join(root, 'worker', 'answer-plan.js'), 'utf8');
const serviceFaq = JSON.parse(await readFile(join(root, "data", "service-faq.json"), "utf8"));
const registeredFaq=JSON.parse(await readFile(join(root,'data','registered-faq.json'),'utf8'));
for(const item of serviceFaq.items)if(registeredFaq[item.id])item.answer.registered=registeredFaq[item.id];
const worker = template
  .replace("__INDEX_HTML__", JSON.stringify(html))
  .replace("__ASSETS__", JSON.stringify(assets))
  .replace("__RECOMMENDATION_DATA__", JSON.stringify(recommendationData))
  .replace("__PHOTO_SOURCE__", JSON.stringify(photoSource))
  .replace("__SERVICE_FAQ__", JSON.stringify(serviceFaq));

const hostingManifest = await readFile(join(root, ".openai", "hosting.json"));
await Promise.all([
  ...[outputRoot,hostingOutputRoot].flatMap(directory=>{
    const server=directory===outputRoot?join(directory,'dist','server'):join(directory,'server');
    return [writeFile(join(server,'phase1-core.js'),phase1Core),writeFile(join(server,'main-dishes.js'),mainDishes),writeFile(join(server,'related-questions.js'),relatedQuestions),writeFile(join(server,'naver-map.js'),naverMap),writeFile(join(server,'request-timing.js'),requestTiming),writeFile(join(server,'response-rules.js'),responseRules)];
  }),
  writeFile(join(outputRoot, 'dist', 'server', 'answer-plan.js'), answerPlan),
  writeFile(join(outputRoot, 'dist', 'server', 'recommendations.js'), recommendations),
  writeFile(join(outputRoot,'dist','server','restaurant-photos.js'),restaurantPhotos),
  writeFile(join(hostingOutputRoot,'server','restaurant-photos.js'),restaurantPhotos),
  writeFile(join(outputRoot, 'dist', 'server', 'registered-search.js'), registeredSearch),
  writeFile(join(hostingOutputRoot, 'server', 'registered-search.js'), registeredSearch),
  writeFile(join(outputRoot, 'dist', 'server', 'condition-evidence.js'), conditionEvidence),
  writeFile(join(hostingOutputRoot, 'server', 'condition-evidence.js'), conditionEvidence),
  writeFile(join(hostingOutputRoot, 'server', 'recommendations.js'), recommendations),
  writeFile(join(hostingOutputRoot, 'server', 'answer-plan.js'), answerPlan),
  writeFile(join(outputRoot, "dist", "server", "index.js"), worker),
  writeFile(join(outputRoot, "dist", "server", "response-modes.js"), responseModes),
  writeFile(join(outputRoot, "dist", "server", "turn-policy.js"), turnPolicy),
  writeFile(join(outputRoot, "dist", "server", "conversation-copy.js"), conversationCopy),
  writeFile(join(outputRoot, "dist", "server", "korean.js"), korean),
  writeFile(join(outputRoot, "dist", "server", "search-axes.js"), searchAxes),
  writeFile(join(outputRoot, ".openai", "hosting.json"), hostingManifest),
  writeFile(join(hostingOutputRoot, "server", "index.js"), worker),
  writeFile(join(hostingOutputRoot, "server", "response-modes.js"), responseModes),
  writeFile(join(hostingOutputRoot, "server", "turn-policy.js"), turnPolicy),
  writeFile(join(hostingOutputRoot, "server", "conversation-copy.js"), conversationCopy),
  writeFile(join(hostingOutputRoot, "server", "korean.js"), korean),
  writeFile(join(hostingOutputRoot, "server", "search-axes.js"), searchAxes),
  writeFile(join(hostingOutputRoot, ".openai", "hosting.json"), hostingManifest),
]);
console.log(`Built Worker with ${Object.keys(assets).length} embedded assets.`);
