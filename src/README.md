# Target source foundation

This directory is the additive home for the accepted FacilityOS target architecture.

W0-01 does **not** migrate existing `app/`, `lib/`, `components/` or `frappe_app/`
implementation into this directory. Existing operational code remains intact while later
authorised work packages introduce target modules behind stable application-service contracts.

Planned top-level boundaries:

- `modules/` — bounded FacilityOS domain modules
- `platform/` — auth, database, security, storage, jobs, observability and configuration adapters
- `shared/` — deliberately small shared kernel, errors, validation and test utilities

Dependency direction remains:

`Presentation -> Application -> Domain`

Infrastructure implements ports owned by the inward layers.
