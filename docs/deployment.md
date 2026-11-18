# Local services and deployment

[Back to README](../README.md)

All commands and file paths below are relative to the repository root. GitHub Pages publishes the buildless frontend from the root of `main`; Python is hosted separately. Keep the five HTML routes, `.nojekyll`, feed URLs and authentication callbacks stable.

## Public settings and server-only secrets

| Setting                                   | Location                               | Visibility                        |
| ----------------------------------------- | -------------------------------------- | --------------------------------- |
| Supabase project URL and publishable key  | `config/account-config.js`             | Public; retain the working values |
| Account deletion API origin               | `apiOrigin` in that file               | Public URL; currently unset       |
| Assistant API origin                      | `assets/js/planner/chat.js`            | Public URL                        |
| Tournament API origin                     | `assets/js/tournaments/tournaments.js` | Public URL                        |
| OpenAI API key and assistant token        | Backend host environment               | Server-only secrets               |
| Supabase service-role key                 | Backend host environment               | Server-only secret                |
| Google client secret and SMTP credentials | Supabase provider settings             | Service-only secrets              |

Never place server-only secrets in static files or Git. Keep existing `KYORUGI_*` configuration names and storage identifiers for compatibility with saved data and deployments.

## Run the optional backend

```sh
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r backend/requirements.txt
uvicorn backend.app:app --host 0.0.0.0 --port 8080 --workers 1
```

`render.yaml` retains the existing service name, build command and start command. This cleanup does not change the API service root or require renaming it.

## Schedule assistant

The browser supports a small set of phrases without a server. Notes produce a preview; only **Apply changes** saves it. Unqualified past-tense weekday notes that point to a future practice ask for clarification. Reply with a complete note, such as “This Saturday was hard,” to select the displayed week.

To enable model interpretation, install `backend/requirements.txt` in a Python virtual environment. Set these environment variables on the API host:

- `OPENAI_API_KEY`: your server-only OpenAI key.
- `OPENAI_MODEL`: a model supporting Structured Outputs.
- `KYORUGI_CHAT_TOKEN`: a long random private access token; enter it in the browser's assistant access field. Never commit either secret.

Run from the repository root with `uvicorn backend.app:app --host 0.0.0.0 --port 8080 --workers 1`. Set `planApiOrigin` in `assets/js/planner/chat.js` to the API's HTTPS origin. Publish the static HTML, CSS, JavaScript and image to GitHub Pages; host Python separately. CORS allows `https://joshlee08.github.io` and `http://localhost:8000`.

The API accepts `message`, `week_start` (Monday, YYYY-MM-DD), `practice_days` (Monday is 0), `timezone` (IANA name), and optional `club` context. The server computes today's date in that time zone. It returns `question` plus `changes`, with each change containing `operation`, `date`, and `value`. Supported operations are `log_practice`, `set_course_load`, `set_tournament_date`, and the Wednesday-only `set_bike` override. Coach-led practice timing is fixed; a tournament can take precedence on its date.

The optional assistant uses a shared access token and a process-local limit of ten authorized requests per minute. Keep one worker; for public or multi-instance hosting, replace these with individual authentication and a shared rate limiter. Guest settings remain in each browser; authenticated planner data uses Supabase. The assistant access token is not saved by the planner.

Run scheduling regression checks with `node tests/schedule.cjs`. These cover hard Tuesday, hard Saturday and next Monday, midterms, a Saturday tournament, a date-specific bike skip, ambiguous dates, and invalid proposals leaving settings unchanged. A live model request still needs configured server credentials.

## Tournament discovery service

The top navigation links to **Tournaments**, with searchable upcoming listings and a **My tournaments** list. **+ Add** saves planned attendance in the browser, reserves every date of a multi-day event, and adapts training to the next selected competition. Remove selections or jump to their week from the list. Overlapping tournaments are flagged. Existing personal dates remain visible as Personal tournament entries and can be removed. Adding an event does not register or pay the organizer.

The Python API now exposes `GET /tournaments?today=YYYY-MM-DD` (the optional date is the browser's local date). It pulls the official Menlo and UCLA competition calendars through the existing validated parsers, deduplicates events by title and start date, and includes ongoing events. Source requests run concurrently with time and size limits. Responses are cached for 30 minutes; failed sources retain their last successful in-process data or use `club-calendar.json`, with a stale indicator and source-check dates. Only known source URLs are fetched. Restarting the API resets the in-memory cache.

Install `backend/requirements.txt` and run the existing uvicorn command above. Tournament discovery needs no OpenAI credentials. Set `tournamentApiOrigin` at the top of `assets/js/tournaments/tournaments.js` to that API's HTTPS origin for GitHub Pages; an empty value uses the current origin. Allow any additional frontend origin explicitly in the backend CORS settings. GitHub Pages cannot execute Python: without a reachable API, the UI clearly labels its fallback to the published JSON snapshot. This change does not deploy the API or automatically refresh that snapshot. Use the existing refresh script to maintain it.

Run `python3 -m unittest discover -s tests -p 'test_*.py'` for discovery fallback, caching, validation and deduplication tests, and `node tests/schedule.cjs` for scheduling tests including multiple tournaments and cross-week events.

## Athlete account configuration

Guest use remains browser-local. Account pages use Supabase Auth (Google and email links) and a private Postgres account row containing a profile, planner state and revision. Profile preferences are applied to the planner after an explicit current-week preview. The account planner does not store private plans in the guest localStorage key.

### Configure services

1. Create a Supabase project. Run `supabase/schema.sql` in its SQL Editor. The script also migrates profiles from the first prototype. Ownership is derived from `auth.uid()`, not a supplied user ID. Only owners can read their row; writes go through a revision-checked RPC.
2. In `config/account-config.js`, set `url` to the project URL, `publishableKey` to the public publishable key, and `apiOrigin` to the separately hosted FastAPI HTTPS origin. This file is public. Never put service-role keys or Google client secrets in it.
3. Enable the email provider. Configure the Site URL as `https://joshlee08.github.io/kyorugi-weekly-planner/`. Allow the exact redirect `https://joshlee08.github.io/kyorugi-weekly-planner/profile.html` and development redirect `http://localhost:8000/profile.html`. Configure custom SMTP for public email delivery.
4. Enable Google in Supabase. Create a Google web OAuth client, configure the Supabase callback shown in the provider settings as its authorized redirect URI, and enter the client ID and secret in Supabase. The website callback above is a separate post-authentication redirect.
5. On the backend host, configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for account deletion. The backend verifies the caller with Supabase before deleting that identity. Foreign keys cascade deletion to private account records. Existing assistant credentials remain separate; creating an account does not enable assistant access.
6. Serve the repository with `python3 -m http.server 8000`. Open `http://localhost:8000/signup.html`. Use a development Supabase project for testing. GitHub Pages serves only frontend files; Python still needs its own host. Keep frontend and API CORS origins aligned.

Official setup references: [email links](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [redirects](https://supabase.com/docs/guides/auth/redirect-urls), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Current configuration and verification limits

The connected Supabase project now has the private `athlete_accounts` table, save RPC, and production/local callback URLs configured. Google and email providers are enabled. Live end-to-end sign-in and ownership tests remain required; the public provider/redirect checks alone do not verify an entire login. Custom SMTP and backend account-deletion secrets still require service configuration.

## Publish a reviewed change

1. Run the README checks and preview all five pages locally.
2. Test asset URLs under the `/kyorugi-weekly-planner/` repository subpath. Bump asset query versions when changing content at an existing URL so browsers do not retain stale scripts.
3. Commit and push only when publication is requested. Wait for the GitHub Pages workflow to succeed.
4. Verify the live planner, tournaments, account page and service settings. Publishing static files does not configure backend secrets, Google or SMTP.
