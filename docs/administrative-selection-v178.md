# v178: administrative region selection

- Picker ends at province → city/county/district → Select. It does not discover or require a rail station.
- Province and district options/counts come from the registered workbook, not a preset popular-region list. Opening the picker browses Seoul initially but does not commit a location.
- `admin:<province>:<district>` selections are resolved against the server's generated region catalog. Client coordinates/names are not authoritative. Region locations have no latitude/longitude or invented centroid.
- Region recommendations filter original registered addresses first, then road/parcel addresses. They do not geocode, apply a radius, display distance, or ask a radius question. Existing food/budget/consent checks and verified place links remain in use.
- Current-location and directly typed station requests retain coordinate/radius behavior. Switching to a region discards old coordinates. Stored radius is not applied or displayed for regional recommendations.
- Real snapshot: 1,099 rows; 1,091 classifiable addresses in 17 provinces / 182 groups. Eight ambiguous original addresses remain unassigned, unchanged from the prior address audit. No restaurant is invented or reassigned.

## Verification

- `node scripts/build-worker.mjs` and `node scripts/policy-smoke.mjs`.
- All 182 groups match the actual snapshot counts without station/provider/coordinate dependencies.
- Mocked planner API journeys: district selection → three registered cards; another-results exclusion; Jeju without a metro; food change retaining region; region ↔ current-location transition; fresh-session isolation. Actual restaurant snapshot is used; upstream AI/provider replies are mocked.
- Client DOM: single selection, apply enabled on district selection, cancellation, direct regional search and no station lookup.
- Browser preview: 1280px centered modal and 360px bottom sheet; selected styling, enabled Select, no horizontal overflow. Mobile virtual keyboard and physical GPS success were not tested. No live AI evaluation or key-file access.

Source data, authored recommendations, menus and evaluation examples are preserved. Live AI interpretation of the revised flow remains unverified in this release.
