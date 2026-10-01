import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(root, "build");
if (!outputRoot.startsWith(`${root}${sep}`)) throw new Error("Invalid build directory");

const mimeTypes = {
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
await mkdir(join(outputRoot, "dist", "server"), { recursive: true });
await mkdir(join(outputRoot, ".openai"), { recursive: true });

const html = await readFile(join(root, "dist", "index.html"), "utf8");
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
const worker = template
  .replace("__INDEX_HTML__", JSON.stringify(html))
  .replace("__ASSETS__", JSON.stringify(assets));

await writeFile(join(outputRoot, "dist", "server", "index.js"), worker);
await writeFile(join(outputRoot, ".openai", "hosting.json"), await readFile(join(root, ".openai", "hosting.json")));
console.log(`Built Worker with ${Object.keys(assets).length} embedded assets.`);
