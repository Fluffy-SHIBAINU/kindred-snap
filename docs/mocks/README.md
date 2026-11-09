# UI mocks

The mocks are Design-canvas artboards (`*.dc.html`, one self-contained file per screen) published at https://claude.ai/artifact/XKVcy3AucQFU9QizihVyEm and mirrored here for the record. Each file carries the whole design kit (`docs/design/kit.css`) in its `<helmet>`, so it also opens standalone in a browser apart from the canvas runtime.

Rows on the canvas:

- `L01-*` landing page (Persuade): hero with the real phone UI, editorial "How a case moves", the interactive ground card, the particle field drawn statically.
- `M01…M11-*` caregiver flow (Operate), 390×844, linked as a clickable prototype.
- `E01…E05-*` the five required edge states: unreadable upload, missing Medicare Summary Notice, no discrepancy, needs staff review, connector unavailable.
- `S00-*` staff dashboard with charts; `S01…-*` staff pages: queue, case detail, actions, resolution, audit.
- `P01-*` the poster (Quiet Ledger).

All data in the mocks is the synthetic case in `docs/PLAN.md` §8. The hospital is a demo partner; its connection is simulated.
