# Collegikicks

A collegiate Taekwondo planner for sparring and recognized poomsae. Plan solo training around classes, coach-led practices and tournaments.

**[Level up your Taekwondo today](https://joshlee08.github.io/collegikicks/)**

## Preview locally

From the repository root:

```sh
python3 -m http.server 8000
```

Open [the planner](http://localhost:8000/), [tournaments](http://localhost:8000/tournaments.html), or [your profile](http://localhost:8000/profile.html). There is no frontend build or dependency-install step. Node.js is needed for JavaScript regression checks; Python 3 runs the preview server and Python checks.

Guest settings stay in this browser. Signing in with Google or an email link enables a private Supabase profile and account plan. Importing a guest plan requires confirmation. The optional FastAPI service powers live tournament discovery, model-assisted schedule notes and configured account deletion.

## Repository map

```text
.
├── index.html                   # Planner
├── tournaments.html             # Tournament discovery and selections
├── profile.html                 # Account entry and athlete profile
├── signup.html / login.html     # Supported account entry routes
├── assets/
│   ├── css/style.css            # Existing visual design
│   ├── images/                  # Hero and brand artwork
│   └── js/
│       ├── account/             # Sign-in, profiles and account synchronization
│       ├── planner/             # Scheduling, state, training, imports and chat
│       ├── tournaments/         # Tournament browser
│       └── shared/              # Navigation
├── config/account-config.js     # Public Supabase settings
├── backend/                     # Separately hosted FastAPI service
├── supabase/                    # SQL setup and ownership policies
├── tests/                       # Regression checks
├── tools/                       # Feed-maintenance scripts
├── docs/                        # Architecture, service setup and maintenance
├── club-calendar.json           # Public school schedule feed (stable URL)
├── tournament-catalog.json      # Public tournament catalog (stable URL)
├── render.yaml                  # Existing backend deployment definition
├── .gitignore                   # Local/generated files to exclude
└── .nojekyll                    # Keep GitHub Pages static publication buildless
```

## Run checks

```sh
node tests/schedule.cjs
node tests/training.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

JavaScript tests resolve source files from their own location and can also be invoked with absolute paths from another working directory. Run Python discovery from the repository root so backend imports resolve normally. These regression tests do not create accounts or verify real OAuth/SMTP credentials.

For optional UI regression checks, make Playwright and a Chromium browser available, start the local preview server, and run `node tests/ui.cjs`. Set `PREVIEW_URL` for another local URL or `CHROME_PATH` for an installed Chrome executable. These checks mock account services and email requests; they never modify real accounts.

## Guides

- [Architecture and data flow](docs/architecture.md): script ordering, state ownership and how the parts fit together.
- [Service setup and deployment](docs/deployment.md): public settings, server secrets, Supabase, Google, FastAPI and GitHub Pages.
- [Maintaining calendar data](docs/maintaining-calendar-data.md): refresh school feeds and review public tournament data.

Keep public HTML/feed URLs and authentication callbacks stable. Frontend source assets are grouped by responsibility; future changes should follow the same folders.
