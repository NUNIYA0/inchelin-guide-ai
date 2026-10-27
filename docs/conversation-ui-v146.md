# Conversation UI redesign

The user-provided mockup guides presentation only. Existing API, classification,
search, geolocation, radius filtering, address-only Naver map URLs and registered
dataset remain unchanged. No unsupported microphone or feedback feature added.

- White page, light gray sidebar (open on desktop, drawer on mobile), right user
  bubble, background-free AI text, centered 760px conversation and fixed composer.
- Desktop restaurant grid: two columns; <=767px: one column. Natural-height rows.
- Cards show a main-menu entry and its recorded price, straight-line distance,
  exact authored recommender/reason pair. No author text is generated or merged.
  The main menu entry is the first existing `mainDish` entry, or first recorded menu;
  no claim that it is the restaurant's official signature menu is added.
- Address, provenance, other recorded menus, verification and existing comparison
  control move into a local card disclosure. Authored recommendations never move
  inside that disclosure. Existing extra-recommendation expansion stays independent.
- Map action is text-only; no photo or failed photo means no photo area.
- Supplied copy/refresh/location/search/alert PNGs are used with empty alternative
  text in labelled controls. Unimplemented thumbs feedback is deliberately not added.

Validation: build-worker + policy-smoke; actual client renderer smoke checks visible
authored pairs, no-photo rendering, local independent details, text-only map links,
comparison availability and unchanged conditions/requests. Existing 1099-source,
geolocation/mock, radius, map, retry, restore and scroll regressions remain enabled.
Browser preview inspected at 1280, 390 and 360px. Local preview uses real registered
records but mocked coordinates, makes no live upstream or AI calls. Actual mobile
hardware/geolocation permission testing is outside this presentation-only QA.

Data limitation: the supplied workbook has recommender names but no recommendation
reason text. Missing reasons stay missing. QA fixtures remain test-only.
