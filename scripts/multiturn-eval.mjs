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
const scenarios = (await readFile(new URL("../data/intent-eval-multiturn-100.jsonl", import.meta.url), "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse).filter(row => includeAll || validationId(row.scenario_id));

const scenarioResults = [];
for (const [scenarioIndex, scenario] of scenarios.entries()) {
  const turns = [];
  const history = [];
  for (const turn of scenario.turns) {
    const state = stateFromFixture(turn.state_before);
    const actual = await analyzeWithOpenAI({ apiKey, model, utterance: turn.utterance, state, history });
    const mode = decideMode(actual, applyAnalysisToState(state, actual)).mode;
    const pass = actual.intent === turn.expected.intent && mode === turn.expected.mode;
    turns.push({ turn: turn.turn, utterance: turn.utterance, expected_intent: turn.expected.intent, actual_intent: actual.intent, expected_mode: turn.expected.mode, actual_mode: mode, key: turn.key === true, pass });
    history.push({ role: "user", content: turn.utterance }, { role: "assistant", content: `이전 응답 모드: ${turn.expected.mode}` });
  }
  scenarioResults.push({ scenario_id: scenario.scenario_id, pattern: scenario.pattern, pass: turns.every(turn => turn.pass), turns });
  if ((scenarioIndex + 1) % 10 === 0) console.error(`evaluated ${scenarioIndex + 1}/${scenarios.length} scenarios`);
}

const turns = scenarioResults.flatMap(item => item.turns);
const keyTurns = turns.filter(turn => turn.key);
const firstFailures = scenarioResults.filter(item => !item.pass).map(item => ({ scenario_id: item.scenario_id, pattern: item.pattern, first_failure: item.turns.find(turn => !turn.pass) }));
const patternResults = {};
for (const scenario of scenarioResults) {
  const item = patternResults[scenario.pattern] || { passed: 0, total: 0 };
  item.total += 1;
  if (scenario.pass) item.passed += 1;
  patternResults[scenario.pattern] = item;
}
const report = {
  split: includeAll ? "all" : "validation-even-ids",
  model,
  scenarios: scenarioResults.length,
  turns: turns.length,
  turn_mode_pass_rate: turns.length ? turns.filter(turn => turn.expected_mode === turn.actual_mode).length / turns.length : 0,
  turn_full_pass_rate: turns.length ? turns.filter(turn => turn.pass).length / turns.length : 0,
  scenario_pass_rate: scenarioResults.length ? scenarioResults.filter(item => item.pass).length / scenarioResults.length : 0,
  key_turn_pass_rate: keyTurns.length ? keyTurns.filter(turn => turn.pass).length / keyTurns.length : null,
  patterns: Object.fromEntries(Object.entries(patternResults).map(([key, value]) => [key, { ...value, rate: value.total ? value.passed / value.total : null }])),
  first_failures: firstFailures,
};
console.log(JSON.stringify(report, null, 2));
if (report.turn_mode_pass_rate < 0.95 || report.scenario_pass_rate < 0.8 || (report.key_turn_pass_rate !== null && report.key_turn_pass_rate < 0.9)) process.exitCode = 1;

