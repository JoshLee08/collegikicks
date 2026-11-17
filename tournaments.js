// Set to the Python host's HTTPS origin when deploying separately from GitHub Pages.
const tournamentApiOrigin = 'https://kyorugi-weekly-planner-api.onrender.com';
let tournamentCatalog = [];
let tournamentLocation = null;
const tournamentStates = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};

function tournamentState(event) {
  const suffix = event.location?.split(',').pop().trim() || '';
  return Object.keys(tournamentStates).find(code =>
    code === event.state || code === suffix || tournamentStates[code].toLowerCase() === suffix.toLowerCase()
  );
}

function tournamentMiles(event) {
  if (!tournamentLocation || !Number.isFinite(event.latitude) || !Number.isFinite(event.longitude)) return Infinity;
  const radians = degrees => degrees * Math.PI / 180;
  const latDelta = radians(event.latitude - tournamentLocation.latitude);
  const lonDelta = radians(event.longitude - tournamentLocation.longitude);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(tournamentLocation.latitude)) *
    Math.cos(radians(event.latitude)) * Math.sin(lonDelta / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

function setTournamentLocation(location, status) {
  tournamentLocation = location;
  const distance = byId('tournament-radius');
  const sort = byId('tournament-sort');
  distance.disabled = !location;
  sort.querySelector('[value="distance"]').disabled = !location;
  distance.value = location ? '250' : '';
  if (!location && sort.value === 'distance') sort.value = 'soonest';
  byId('tournament-nearby').textContent = location ? 'Clear my location' : 'Use my location';
  byId('tournament-nearby').disabled = false;
  byId('tournament-location-status').textContent = status;
  renderTournaments();
}

function useTournamentLocation() {
  if (tournamentLocation) return setTournamentLocation(null, '');
  if (!navigator.geolocation) return setTournamentLocation(null, 'Location is unavailable. Choose a state to narrow the results.');
  byId('tournament-nearby').disabled = true;
  byId('tournament-location-status').textContent = 'Finding your location…';
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => setTournamentLocation(coords, 'Approximate straight-line distance to the event city. Your location stays in this browser.'),
    () => setTournamentLocation(null, 'Could not use your location. Choose a state to narrow the results.'),
    { timeout: 10000, maximumAge: 300000 }
  );
}

function eventCard(event, selected) {
  const card = document.createElement('article');
  card.className = 'tournament-card';
  const title = document.createElement('h4');
  title.textContent = event.title;
  const details = document.createElement('p');
  const format = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  details.textContent = `${format(event.start)}${event.end !== event.start ? ' – ' + format(event.end) : ''} · ${event.location || 'Location to be confirmed'}`;
  card.append(title, details);
  const miles = tournamentMiles(event);
  const tags = [event.category, event.tentative && 'Tentative date', Number.isFinite(miles) && `About ${Math.round(miles)} mi away`].filter(Boolean);
  if (tags.length) {
    const metadata = document.createElement('p');
    metadata.textContent = tags.join(' · ');
    card.append(metadata);
  }
  if (selected && selectedTournaments(settings).some(other => other.id !== event.id && other.start <= event.end && other.end >= event.start)) {
    const conflict = document.createElement('p');
    conflict.textContent = 'Overlaps another selected tournament';
    card.append(conflict);
  }
  if (/^https:\/\//i.test(event.source || '')) {
    const link = document.createElement('a');
    link.href = event.source;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Event source ↗';
    card.append(link);
  }
  if (event.checked) {
    const checked = document.createElement('small');
    checked.textContent = `Source checked ${event.checked}`;
    card.append(checked);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = selected ? '✓ Added · Remove' : '+ Add';
  button.setAttribute('aria-label', `${selected ? 'Remove' : 'Add'} ${event.title} ${selected ? 'from' : 'to'} my schedule`);
  button.setAttribute('aria-pressed', String(selected));
  button.addEventListener('click', () => {
    if (selected) {
      settings.tournaments = (settings.tournaments || []).filter(item => item.id !== event.id);
      if (event.id === 'manual:' + settings.tournament) settings.tournament = '';
    } else {
      settings.tournaments = [...(settings.tournaments || []).filter(item => item.id !== event.id), event];
    }
    saveSettings();
    render();
    byId('tournament-status').textContent = `${event.title} ${selected ? 'removed from' : 'added to'} your schedule.`;
  });
  card.append(button);
  if (selected) {
    const view = document.createElement('button');
    view.type = 'button';
    view.textContent = 'View week →';
    view.addEventListener('click', () => {
      goToWeek(new Date(event.start + 'T12:00:00'));
      refreshScheduleEditor();
      document.querySelector('.schedule').scrollIntoView({ behavior: 'smooth' });
    });
    card.append(view);
  }
  return card;
}

function renderTournaments() {
  const selected = selectedTournaments(settings);
  const upcoming = selected.filter(event => event.end >= dateKey(new Date()));
  byId('tournament-count').textContent = upcoming.length;
  byId('tournament-summary').textContent = upcoming.length ? `${upcoming.length} upcoming · ${upcoming[0].title}` : 'No upcoming tournaments selected';
  const mine = byId('my-tournaments');
  mine.replaceChildren(...selected.map(event => eventCard(event, true)));
  if (!selected.length) mine.textContent = 'Your season starts here. Use + Add to choose tournaments.';
  const query = byId('tournament-search').value.trim().toLowerCase();
  const state = byId('tournament-state').value;
  const category = byId('tournament-type').value;
  const sort = byId('tournament-sort').value;
  const radius = Number(byId('tournament-radius').value);
  const byDate = (a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title);
  const matches = tournamentCatalog.filter(event =>
    (!state || tournamentState(event) === state) &&
    (!category || (event.category || 'Other') === category) &&
    (!radius || tournamentMiles(event) <= radius) &&
    `${event.title} ${event.location || ''} ${tournamentStates[tournamentState(event)] || ''}`.toLowerCase().includes(query)
  ).sort((a, b) => {
    if (sort === 'latest') return b.start.localeCompare(a.start) || a.title.localeCompare(b.title);
    if (sort === 'college') return Number(b.category === 'Collegiate') - Number(a.category === 'Collegiate') || byDate(a, b);
    if (sort === 'distance') return tournamentMiles(a) - tournamentMiles(b) || byDate(a, b);
    return byDate(a, b);
  });
  byId('tournament-result-count').textContent = `${matches.length} ${matches.length === 1 ? 'tournament' : 'tournaments'}`;
  const results = byId('tournament-results');
  results.replaceChildren(...matches.map(event => eventCard(event, selected.some(item => item.id === event.id))));
  if (!matches.length) results.textContent = query || state || category || radius
    ? 'No tournaments match these filters.'
    : 'No upcoming tournaments found in the available calendars.';
}

async function tournamentFeed(path, timeout) {
  const response = await fetch(path, { cache: 'no-cache', signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error('Unavailable');
  return response.json();
}

function mergeTournaments(live, curated) {
  const today = dateKey(new Date());
  const events = new Map();
  for (const event of [...live, ...curated]) {
    if (validTournament(event) && tournamentState(event)) events.set(event.id, event);
  }
  return [...events.values()].filter(event => event.end >= today);
}

async function loadTournaments() {
  const button = byId('refresh-tournaments');
  button.disabled = true;
  byId('tournament-status').textContent = 'Checking competition calendars…';
  let curated = [];
  const catalog = tournamentFeed('tournament-catalog.json', 10000).then(data => {
    if (!Array.isArray(data.events)) throw new Error('Invalid catalog');
    curated = data.events;
    tournamentCatalog = mergeTournaments(tournamentCatalog, curated);
    renderTournaments();
    return true;
  }).catch(() => false);
  try {
    let data;
    try {
      const url = new URL('/tournaments', tournamentApiOrigin || location.origin);
      url.searchParams.set('today', dateKey(new Date()));
      data = await tournamentFeed(url, 20000);
      if (!Array.isArray(data.events)) throw new Error('Invalid feed');
      byId('tournament-status').textContent = data.stale ? 'Some live calendars are unavailable. Showing published listings and available live results.' : 'Live competition calendars checked.';
    } catch {
      const feed = await tournamentFeed('club-calendar.json', 10000);
      const unique = new Map();
      for (const club of Object.values(feed.clubs)) {
        for (const event of club.events || []) {
          const id = event.start + ':' + event.title.toLowerCase().trim().replace(/\s+/g, ' ');
          unique.set(id, { ...event, id, source: club.source, checked: club.eventsChecked });
        }
      }
      data = { events: [...unique.values()] };
      byId('tournament-status').textContent = 'Live discovery is unavailable. Showing saved published listings; check dates with the organizer.';
    }
    await catalog;
    tournamentCatalog = mergeTournaments(data.events, curated);
  } catch {
    byId('tournament-status').textContent = await catalog
      ? 'Showing the published U.S. catalog. Live calendars and saved club listings are unavailable.'
      : 'Could not load tournaments. Try Refresh events again.';
  } finally {
    if (!(await catalog) && tournamentCatalog.length) {
      byId('tournament-status').textContent += ' The published U.S. catalog could not be loaded.';
    }
    button.disabled = false;
    renderTournaments();
  }
}
for (const [code, name] of Object.entries(tournamentStates).sort((a, b) => a[1].localeCompare(b[1]))) {
  byId('tournament-state').add(new Option(name, code));
}
for (const id of ['tournament-state', 'tournament-type', 'tournament-sort', 'tournament-radius']) {
  byId(id).addEventListener('change', renderTournaments);
}
byId('tournament-nearby').addEventListener('click', useTournamentLocation);
byId('tournament-search').addEventListener('input', renderTournaments);
byId('refresh-tournaments').addEventListener('click', loadTournaments);
renderTournaments();
loadTournaments();
