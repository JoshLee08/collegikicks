# Kyorugi Weekly Planner

**[Open the live collegiate planner on GitHub Pages](https://joshlee08.github.io/kyorugi-weekly-planner/)**

Choose your Taekwondo club and enter its recurring coach-led practice times. Berkeley starts with Tuesday and Thursday evenings and Saturday morning. The other clubs use the times you enter.

Import a text-based PDF, ICS calendar, CSV, or TXT file. Select a week for a dated import or use Every week for a recurring class schedule. Review and edit the extracted blocks before applying them. CSV columns are `day,start,end,label`, with labels optional and weekdays or ISO dates accepted. One text row looks like `Wed 14:00–16:00 Chemistry`. Scanned PDFs and layouts with no recognizable rows can be entered manually using the review box.

The planner suggests workouts between 8 AM and 9 PM, with 15 minutes around commitments. It can move Monday strength to Tuesday and midweek conditioning to Thursday or Friday when appropriate. Team practices stay fixed. Files are processed locally. Confirmed time blocks, course load, tournament dates, and practice logs are saved in the browser.

The frontend uses HTML, CSS, and JavaScript, published from the root of `main` on GitHub Pages.

## Chatbot setup

The browser supports a small set of phrases without a server. Notes produce a preview; only **Apply changes** saves it. Unqualified past-tense weekday notes that point to a future practice ask for clarification. Reply with a complete note, such as “This Saturday was hard,” to select the displayed week.

To enable model interpretation, install `backend/requirements.txt` in a Python virtual environment. Set these environment variables on the API host:

- `OPENAI_API_KEY`: your server-only OpenAI key.
- `OPENAI_MODEL`: a model supporting Structured Outputs.
- `KYORUGI_CHAT_TOKEN`: a long random private access token; enter it in the browser's assistant access field. Never commit either secret.

Run from this directory with `uvicorn backend.app:app --host 0.0.0.0 --port 8080 --workers 1`. Set `planApiOrigin` in `chat.js` to the API's HTTPS origin. Publish the static HTML, CSS, JavaScript and image to GitHub Pages; host Python separately. CORS allows `https://joshlee08.github.io` and `http://localhost:8000`.

The API accepts `message`, `week_start` (Monday, YYYY-MM-DD), `practice_days` (Monday is 0), and `timezone` (IANA name). The server computes today's date in that time zone. It returns `question` plus `changes`, with each change containing `operation`, `date`, and `value`. Supported operations are `log_practice`, `set_course_load`, `set_tournament_date`, and the Wednesday-only `set_bike` override. Coach-led practice timing is fixed; a tournament can take precedence on its date.

This private prototype uses a shared access token and a process-local limit of ten authorized requests per minute. Keep one worker; for public or multi-instance hosting, replace these with individual authentication and a shared rate limiter. Settings remain in each browser. The access token is not saved by the planner.

Run scheduling regression checks with `node tests/schedule.cjs`. These cover hard Tuesday, hard Saturday and next Monday, midterms, a Saturday tournament, a date-specific bike skip, ambiguous dates, and invalid proposals leaving settings unchanged. A live model request still needs configured server credentials.
