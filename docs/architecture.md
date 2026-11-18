# How Collegikicks works

[Back to README](../README.md)

## Application flow

Root HTML pages load UI scripts, which call scheduling and state functions. Guest settings remain in the browser; authenticated account state is saved through Supabase. FastAPI separately provides tournament discovery, optional model-assisted notes and account deletion.

| Area                            | Responsibility                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Root HTML pages                 | Stable public routes, document structure and script loading                                      |
| `assets/js/planner/`            | Scheduling, athlete training templates, state, calendar controls, imports and assistant previews |
| `assets/js/account/`            | Authentication, profile editing, save conflicts and account-plan synchronization                 |
| `assets/js/tournaments/`        | Tournament search, display, selection and participation preferences                              |
| `assets/js/shared/`             | Shared navigation behavior                                                                       |
| `assets/css/`, `assets/images/` | Existing visual design and hero image                                                            |
| `config/`                       | Public account-service settings; never server secrets                                            |
| `backend/`                      | FastAPI routes, verified account deletion and cached tournament discovery                        |
| `supabase/`                     | Database tables, ownership policies and revision-checked save functions                          |
| `tools/`                        | Maintenance scripts for public school feeds                                                      |
| `tests/`                        | Scheduling, training and tournament regression checks                                            |

## Script order and shared state

These are classic deferred scripts, not ES modules. Top-level functions and lexical variables are shared across scripts. Keep their order in the HTML; moving files does not make them independent.

- Planner page: navigation → schedule utilities → planner state → training templates → planner core → planner UI → schedule/import UI → chat → public account config → account service → account/planner bridge.
- Tournament page: navigation → schedule utilities → planner state → tournament UI → account config → account service → account/planner bridge.
- Account pages: account config → account service → schedule utilities → planner state → training templates → planner core → account UI.

`planner-core.js` provides calendar calculations, training-day construction and `planForWeek`. `training.js` defines templates and `personalizeWeek`; its function bodies call core helpers after all deferred files have loaded. `planner.js` renders the planner and attaches its controls. `schedule.js` handles school blocks, commitments and tournament selections. `planner-state.js` owns `settings`, date keys and persistence dispatch.

`window.KyorugiAccount` is the shared account interface; `window.KyorugiPlannerState` exposes the current settings object. The account bridge waits for the session before enabling page controls and serializes save requests. Do not rename these globals, the `kyorugi-save` event, or storage keys during organizational work.

## Data ownership and paths

- Guest planner settings: localStorage key `kyorugi-planner-v1`.
- Account profile and plan: private Supabase `athlete_accounts` row owned by `auth.uid()`. The revision-checked RPC prevents silent overwrites from another device.
- Onboarding drafts: user-scoped sessionStorage keys beginning with `kyorugi-onboarding-`.
- Public schedules and catalogs: root `club-calendar.json` and `tournament-catalog.json`.
- Server-only credentials: backend environment or service dashboards; see [deployment](deployment.md).

Browser `fetch('club-calendar.json')` resolves relative to the HTML document, not the JavaScript file. Keep these root-relative-to-document fetches and the raw-GitHub fallback intact. The hero image URL resolves relative to `assets/css/style.css`, so it uses `../images/sparring.jpg`.

The account callback uses `new URL('profile.html', location.href)`, preserving the GitHub Pages repository subpath. Root `signup.html` and `login.html` remain supported account entry points, even though navigation uses one profile icon.

## User behavior

Choose your Taekwondo club to load its published practices and competitions when available. Berkeley starts with the coach-led schedule supplied for this planner. Override practice times with your coach’s current schedule. Published competitions appear on the weekly calendar. Use Tournaments in the top navigation to add multiple competitions to your schedule and adjust training.

Import a text-based PDF, ICS calendar, CSV, or TXT file. Select a week for a dated import or use Every week for a recurring class schedule. Review and edit the extracted blocks before applying them. CSV columns are `day,start,end,label`, with labels optional and weekdays or ISO dates accepted. One text row looks like `Wed 14:00–16:00 Chemistry`. Scanned PDFs and layouts with no recognizable rows can be entered manually using the review box.

The planner suggests workouts between 8 AM and 9 PM, with 15 minutes around commitments. It can move Monday strength to Tuesday and midweek conditioning to Thursday or Friday when appropriate. Team practices stay fixed. Files are processed locally. Guest time blocks, course load, tournament selections, and practice logs are saved in the browser; signed-in plans are saved to Supabase.

## Account and training behavior

- First-time onboarding has three steps. Optional details may be omitted. Drafts are scoped to the signed-in user in sessionStorage and removed after saving/sign-out. Profiles support custom schools without Berkeley fallback, rank labels, experience, discipline, goals and solo availability.
- Profile saves show the current week's before/after session titles. Existing logs and commitments are retained. Preview uses the published club calendar snapshot when reachable.
- Account planner saves are serialized and revision checked. A failed write retains edits in the current tab. Reload or explicit remote replacement resolves a conflict. Close the tab only after a successful save, or export data first.
- Guest import requires a summary and explicit replacement confirmation. The guest copy remains unchanged. Export includes the profile and planner but no authentication information.
- Recognized poomsae uses conservative technique/balance templates. Mixed training alternates deterministically by calendar week and configured session count; unavailable sessions are omitted rather than carried forward. Goal selection never increases the session cap. Rank and experience never increase intensity.
- Run `node tests/schedule.cjs`, `node tests/training.cjs`, and `python3 -m unittest discover -s tests -p 'test_*.py'`.
- Before production, verify real Google and email-link flows (including expired/canceled links), two-device profile/planner saves and conflicts, and account deletion. Verify with two test accounts that neither can read the other's row or choose the other's ID in a write. A mock browser check cannot verify live provider setup or database policies.

## Maintenance boundaries

This repository reorganization changes paths and readability only. Legacy database helpers in `supabase/schema.sql` are retained for compatibility and migration history, not removed as unused code. API origins, service names and branding-compatible internal identifiers are also retained. Future feature fixes should be separate changes with behavior-specific tests.

## Readability conventions

Use two-space indentation for frontend HTML, CSS and JavaScript. The existing Python files keep their established indentation. This cleanup used Prettier 3.6.2 as a temporary tool, with no package manifest or dependency installation in the repository:

```sh
prettier --write --tab-width 2 --single-quote --trailing-comma none --print-width 100 --embedded-language-formatting off '*.html' 'assets/**/*.js' 'assets/**/*.css' 'config/*.js' 'tests/*.cjs'
```

Preserve DOM text whitespace where it affects rendering and keep behavior refactors separate from formatting. The regression tests intentionally read classic script sources together; their paths are rooted at each test file's directory.
