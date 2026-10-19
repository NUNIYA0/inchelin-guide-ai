import { readFile } from "node:fs/promises";
import { applyAnalysisToState, decideMode } from "../worker/response-modes.js";
import { analyzeWithOpenAI, stateFromFixture, validationId } from "./eval-lib.mjs";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is required. The key is read only from the current process environment.");
  process.exit(2);
}
const model = process.env.OPENAI_INTENT_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";
const includeAll = process.argv.includes("--all");
const rows = (await readFile(new URL("../data/intent-eval-500.jsonl", import.meta.url), "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse).filter(row => includeAll || validationId(row.id));

const results = [];
for (const [index, row] of rows.entries()) {
  const state = stateFromFixture(row.context);
  const actual = await analyzeWithOpenAI({ apiKey, model, utterance: row.utterance, state });
  const nextState = applyAnalysisToState(state, actual);
  const mode = decideMode(actual, nextState).mode;
  results.push({ row, actual, mode });
  if ((index + 1) % 25 === 0) console.error(`evaluated ${index + 1}/${rows.length}`);
}

const mismatches = results.filter(({ row, actual }) => row.expected.intent !== actual.intent);
const modeMismatches = results.filter(({ row, mode }) => row.expected.mode !== mode);
const intentNames = [...new Set(rows.map(row => row.expected.intent))].sort();
const perIntent = Object.fromEntries(intentNames.map(intent => {
  const group = results.filter(item => item.row.expected.intent === intent);
  return [intent, { correct: group.filter(item => item.actual.intent === intent).length, total: group.length }];
}));
const tricky = results.filter(item => item.row.difficulty === "tricky");
const confusion = {};
for (const item of results) {
  const key = `${item.row.expected.intent} -> ${item.actual.intent}`;
  confusion[key] = (confusion[key] || 0) + 1;
}
const report = {
  split: includeAll ? "all" : "validation-even-ids",
  model,
  total: results.length,
  intent_accuracy: results.length ? (results.length - mismatches.length) / results.length : 0,
  mode_accuracy: results.length ? (results.length - modeMismatches.length) / results.length : 0,
  tricky_accuracy: tricky.length ? tricky.filter(item => item.row.expected.intent === item.actual.intent).length / tricky.length : null,
  per_intent: Object.fromEntries(Object.entries(perIntent).map(([key, value]) => [key, { ...value, accuracy: value.total ? value.correct / value.total : null }])),
  confusion,
  mismatches: mismatches.map(item => ({ id: item.row.id, utterance: item.row.utterance, expected: item.row.expected.intent, actual: item.actual.intent })),
  mode_mismatches: modeMismatches.map(item => ({ id: item.row.id, utterance: item.row.utterance, expected: item.row.expected.mode, actual: item.mode })),
};
console.log(JSON.stringify(report, null, 2));
if (report.intent_accuracy < 0.9 || Object.values(report.per_intent).some(item => item.total && item.accuracy < 0.85) || (report.tricky_accuracy !== null && report.tricky_accuracy < 0.75)) process.exitCode = 1;

