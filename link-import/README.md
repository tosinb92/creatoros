# CreatorOS link import pilot

Extract creatoros-source.zip into a working directory. Copy app, lib, supabase and tests from this folder over the extracted application. Run npm ci, npm test, npm run typecheck and npm run build there. The GitHub baseline predates production. For production, overlay these additions on the complete deployed source after reconciling existing Studio layouts.

Apply the included additive migration to the existing project. Configure NEXT_PUBLIC_LINK_IMPORT=on at build time, VIZARD_API_KEY, SUPABASE_SERVICE_ROLE_KEY, CREATOROS_IMPORT_PILOT_USERS (comma-separated Supabase auth user IDs), and the existing public Supabase URL and publishable key. Open /studio/from-link with a pilot account. Never set server credentials in NEXT_PUBLIC variables. To disable, remove the flag and rebuild.

The provider finishes submitted jobs off-device. This version checks progress on returning to Studio, stores imported excerpt drafts on the current device, and does not automate followed-channel discovery or destination posting. A submission marked for review should be reconciled with the provider before any resubmission.
