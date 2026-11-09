# Fixtures

Everything about patients here is synthetic. Policy data is real public record, quoted from each hospital's own published documents through the Waive atlas (CC BY 4.0).

- `case-synthetic.json` — the demo case: Dorothy M. Hale (synthetic), her daughter Jenna, a bill from the synthetic demo partner "Riverbend Community Hospital", the matching Medicare Summary Notice, the $240.00 line-3 discrepancy, income and the synthetic 75% assistance tier, the simulated response, and the five edge cases.
- `hospitals.json` — the three pilot hospitals (Cedars-Sinai Medical Center, CA; Alexian Brothers Medical Center, IL; NYU Langone Hospitals, NY) with their published assistance thresholds, tiers, application windows and contacts, each value with its verbatim quote and dated source, plus the 2026 and 2025 HHS poverty guidelines and the state transition that makes the tool timely (with confidence notes).
- `atlas/ma.json` — the Massachusetts atlas export (32 hospitals). The other eight state exports live in the private `waive-data` checkout; point `ATLAS_DIR` at `…/waive-data/data/atlas` to load them locally.
- `cases/` and `documents/` — created in Phase 2 of `docs/BUILD.md`.
