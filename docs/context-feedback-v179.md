# v179 feedback fixes before live 300-turn verification

- Added model-selected location/reference cardinality and people-origin fields to the strict structured action schema. Multiple alternative areas ask for one area; a singular unresolved place reference cannot execute a two-place comparison.
- Exposed registered region literal candidates to the model. Validated region and money literals can repair omitted inputs only after the model chooses a recommendation/change task. Information requests are not routed by these literals.
- Distinguished solo-derived people=1 from explicitly supplied head counts. Clearing companion removes derived people only; unrelated explicit counts survive.
- Strengthened instructions for current-location transitions, compound slots, exact evidence quoting, and distance explanations. Updated the region FAQ to match administrative selection.
- Added allowlisted execution audit metadata (task/action/changed slot keys/rejected slot keys/clarification reason/target count/final action/resolved location kind). No model reasoning, evidence text, or hidden instructions are returned. Existing Server-Timing supplies measured stage duration.
- Unit/API-mock regressions verify compound input, cardinality, derived people, explicit counts, region→current failure, and audit shape. Existing registered dataset and UI remain unchanged.

Live evaluation results are written separately under the workspace QA directory. A mock regression passing is not a claim that every live model response is fixed. No secret files are accessed.
