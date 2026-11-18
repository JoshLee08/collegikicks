# Maintaining school schedules and tournament data

[Back to README](../README.md)

Run all commands below from the repository root. The JSON files stay at the root because they are public URLs used by the website and fallbacks.

## Refresh school schedules and competitions

The website loads `club-calendar.json` from GitHub Pages when it opens. **Reload club calendar** loads the latest published copy. The browser uses that feed alongside private settings and files stored locally.

1. From the repository root, run `python3 tools/refresh_clubs.py`. The Python script fetches the public club pages, parses known layouts, validates dates, and updates the feed. An unavailable or unrecognized page leaves its last valid data in place.
2. Run `git diff -- club-calendar.json` to see what changed. Visit a changed club and week on the planner to confirm its practice blocks or competitions.
3. Commit and push the updated feed to `main`. GitHub Pages serves it from the same URL, and the website picks it up on reload.
4. For unattended refreshes, run the same Python command once daily from a scheduled GitHub Actions job. Start with manual dispatch to verify the diff. Give the job permission to write repository contents and have it publish changes through a pull request or an authenticated push that triggers your Pages build. GitHub does not trigger a branch-based Pages build for commits pushed with the workflow’s default `GITHUB_TOKEN`.
5. To add another public source, prefer an official ICS or JSON feed. Add a parser that produces weekday practice blocks or explicit competition date ranges and test it against a saved example before enabling it. Use `--fixtures /path/to/saved-pages --output /tmp/club-demo.json` to demonstrate a refresh without changing the live feed.

The script reads USC, UCSD, UCLA, UC Davis, and UCI practice pages plus the Menlo and UCLA competition pages. UCI’s term bounds and cancellations are respected. Fresno State’s Engage listing is linked for reference. A dated Davis Fall Open listed by Menlo also appears for UC Davis, with Menlo’s schedule attached as the source. A school without a published practice time can use a coach-entered override.

[GitHub Actions schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) · [GitHub Pages branch publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Tournament catalog

`club-calendar.json` contains parsed school practices and sourced events. `tournament-catalog.json` is the additional published tournament catalog used by the browser; it is not produced by the club-refresh script. Review catalog entries and official source URLs manually before publishing edits. Keep both filenames and root URLs stable.

Do not run refresh scripts as part of a file-organization or formatting task: they change data independently of source cleanup.
