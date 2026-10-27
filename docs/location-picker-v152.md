# Region / station picker

Uses the existing native `dialog` / bottom-sheet component, appended to body and
shown in the browser top layer. The new CSS affects only `.location-picker`.
Desktop: 560px wide, centered in the entire visual viewport. Mobile (<768px):
full-width bottom sheet. Only results scroll. VisualViewport resize/scroll updates
the available height and offset, keeping search and footer visible. Short viewports
hide secondary scope/help copy to retain space for results. Safe-area footer,
background scroll lock, native modal plus explicit Tab focus containment, autofocus, cancellation
and opener focus restoration are provided.

## Actual data scope

There is no arbitrary-address/POI geocoder connected. Search is local filtering of
the existing WGS84 station table: Gangnam, Yeoksam, Hongik University, Hapjeong,
Seongsu, Jongno 3-ga and Yeouido. Each station has its existing region alias as a
separate typed result, explicitly using that station as its center. They are not
independent district centroids. No new coordinates, sample Gwanghwamun records,
street addresses or subway lines are invented.

Search beyond that scope requires a real geographic search/geocoding provider or
an authoritative additional location catalogue (stable ID, type, label, WGS84
coordinates, address/line metadata). Current UI states the scope and absent metadata.
The default local lookup has no network loading latency; loading/failure/retry states
also support future asynchronous adapters and are tested with mocked failures.

## Contract

Only confirmation sends `{locationSelection:{id,label,type,centerLabel,latitude,
longitude,detail}}` alongside a natural-language user message. Worker validates ID,
label and coordinates against its own table and uses the canonical station center.
Existing food/radius/budget/time/companion conditions persist. Closing/cancelling
does not send a request or change conditions. Current-location permission handling,
restaurant sources, address-map links and sidebar remain unchanged.

## Verification

- Client DOM smoke: search/filter/clear, radio selection, confirm payload, cancellation,
  Esc, blank reopen, unsupported place, asynchronous loading/failure, coordinate
  validation and condition preservation; visual-viewport geometry unit checks.
- Browser preview: PC 1280x900 centering (x360/y110, 560x680), native focus restore,
  results scroll with fixed header/footer; mobile 390/360 widths and short-height
  viewport simulation. Preview uses real restaurant records with mocked coordinates.
- Real mobile OS keyboard and physical-device location permission: not verified.
- Full countrywide geographic search/address/line metadata: not connected.

## v153 mobile presentation

Mobile gets a visible decorative handle, 24px top corners, outlined cancel button,
roomier result rows, and a preferred height near 70% of the visual viewport (570px
minimum content target, 700px cap, always bounded by the actual available height).
Scope copy is visually hidden but remains available to assistive technology on
mobile. Keyboard-height compact mode keeps the original search/footer priority.
Desktop layout, location catalogue, selection and confirmation are unchanged.
Browser checked at 390x844, 360x800 and 390x440 (short-height simulation);
physical mobile keyboard remains unverified.
