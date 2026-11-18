// Set to the Python host's HTTPS origin when deploying separately from GitHub Pages.
const tournamentApiOrigin = 'https://kyorugi-weekly-planner-api.onrender.com';
let tournamentCatalog = [];
let tournamentLocation = null;
const tournamentsPerPage = 10;
let tournamentPage = 0;
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

function tournamentType(event) {
  const usatkdSource = /^https:\/\/(?:[a-z0-9-]+\.)*usatkd\.org(?:[/:?#]|$)/i.test(event.source || '');
  if (event.sanctioningBody === 'USATKD' || event.category === 'National pathway' ||
      usatkdSource) {
    return 'National pathway';
  }
  if (event.category === 'Collegiate' || /collegiate|college|university|(?:uc davis|berkeley|ucla).*open/i.test(event.title)) {
    return 'Collegiate';
  }
  return 'Open';
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
  distance.disabled = !location;
  distance.value = location ? '250' : '';
  byId('tournament-nearby').textContent = location ? 'Clear my location' : 'Use my location';
  byId('tournament-nearby').disabled = false;
  byId('tournament-location-status').textContent = status;
  resetTournamentPage();
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

const tournamentDateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function eventCard(event, selected, savedList = false) {
  const card = document.createElement('article');
  const info = document.createElement('div');
  info.className = 'tournament-card-info';
  card.append(info);
  card.className = 'tournament-card';
  const date = document.createElement('p');
  date.className = 'tournament-date';
  const start = new Date(event.start + 'T12:00:00');
  date.textContent = event.start === event.end ? tournamentDateFormat.format(start)
    : tournamentDateFormat.formatRange(start, new Date(event.end + 'T12:00:00'));
  const title = document.createElement('h3');
  title.textContent = event.title;
  const location = document.createElement('p');
  location.textContent = event.location || 'Location to be confirmed';
  info.append(date, title, location);

  const miles = tournamentMiles(event);
  const tags = [tournamentType(event), event.tentative && 'Tentative date', Number.isFinite(miles) && `About ${Math.round(miles)} mi away`].filter(Boolean);
  if (tags.length) {
    const metadata = document.createElement('p');
    metadata.className = 'tournament-meta';
    metadata.textContent = tags.join(' · ');
    info.append(metadata);
  }
  if (selected && selectedTournaments(settings).some(other => other.id !== event.id && other.start <= event.end && other.end >= event.start)) {
    const conflict = document.createElement('p');
    conflict.className = 'tournament-conflict';
    conflict.textContent = 'Overlaps another selected tournament';
    info.append(conflict);
  }

  if(selected){
    const label=document.createElement('label');label.textContent='Your participation (not organizer confirmation)';
    const select=document.createElement('select');select.setAttribute('aria-label','Your participation in '+event.title);
    const saved=(settings.tournaments||[]).find(item=>item.id===event.id);
    for(const value of ['Unspecified','Sparring','Poomsae','Both']){const option=document.createElement('option');option.value=value;option.textContent=value;select.append(option);}
    select.value=saved?.participation||'Unspecified';select.onchange=()=>{if(saved){saved.participation=select.value;saveSettings();}};label.append(select);info.append(label);
  }
  const actions = document.createElement('div');
  actions.className = 'tournament-links';
  const button = document.createElement('button');
  button.type = 'button';
  button.classList.toggle('primary', !selected);
  button.textContent = selected ? 'Remove from plan' : 'Add to plan';
  button.setAttribute('aria-label', `${selected ? 'Remove' : 'Add'} ${event.title} ${selected ? 'from' : 'to'} my plan`);
  button.dataset.tournament = event.id;
  button.addEventListener('click', () => {
    if (selected) {
      settings.tournaments = (settings.tournaments || []).filter(item => item.id !== event.id);
      if (event.id === 'manual:' + settings.tournament) settings.tournament = '';
    } else {
      settings.tournaments = [...(settings.tournaments || []).filter(item => item.id !== event.id), event];
    }
    saveSettings();
    const nextSaved = card.nextElementSibling?.querySelector('button') || card.previousElementSibling?.querySelector('button');
    renderTournaments();
    const match = id => byId(id).querySelector(`button[data-tournament="${CSS.escape(event.id)}"]`);
    const nextFocus = savedList && nextSaved
      ? byId('my-tournaments').querySelector(`button[data-tournament="${CSS.escape(nextSaved.dataset.tournament)}"]`)
      : match('tournament-results');
    (nextFocus || byId('tournament-search')).focus();
    byId('tournament-status').textContent = `${event.title} ${selected ? 'removed from' : 'added to'} your schedule.`;
  });
  actions.append(button);
  if (selected) {
    const view = document.createElement('a');
    view.href = `./?week=${encodeURIComponent(event.start)}#week-title`;
    view.textContent = 'View week →';
    view.setAttribute('aria-label', `View week for ${event.title}`);
    actions.append(view);
  }
  if (/^https:\/\//i.test(event.source || '')) {
    const link = document.createElement('a');
    link.href = event.source;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Organizer ↗';
    actions.append(link);
  }
  card.append(actions);
  if (event.checked) {
    const checked = document.createElement('small');
    checked.textContent = `Source checked ${event.checked}`;
    card.append(checked);
  }
  return card;
}

function renderTournaments() {
  const selected = selectedTournaments(settings);
  renderTournamentSummary();
  const mine = byId('my-tournaments');
  mine.replaceChildren(...selected.map(event => eventCard(event, true, true)));
  if (!selected.length) mine.textContent = 'No tournaments in your plan. Add one from the results.';
  const query = byId('tournament-search').value.trim().toLowerCase();
  const state = byId('tournament-state').value;
  const category = byId('tournament-type').value;
  const sort = byId('tournament-sort').value;
  const radius = Number(byId('tournament-radius').value);
  const byDate = (a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title);
  const matches = tournamentCatalog.filter(event =>
    (!state || tournamentState(event) === state) &&
    (!category || tournamentType(event) === category) &&
    (!radius || tournamentMiles(event) <= radius) &&
    `${event.title} ${event.location || ''} ${tournamentStates[tournamentState(event)] || ''}`.toLowerCase().includes(query)
  ).sort((a, b) => {
    if (sort === 'latest') return b.start.localeCompare(a.start) || a.title.localeCompare(b.title);
    return byDate(a, b);
  });
  const pageCount = Math.ceil(matches.length / tournamentsPerPage);
  tournamentPage = Math.min(tournamentPage, Math.max(0, pageCount - 1));
  const first = tournamentPage * tournamentsPerPage;
  const pageEvents = matches.slice(first, first + tournamentsPerPage);
  byId('tournament-result-count').textContent = matches.length
    ? `${first + 1}–${first + pageEvents.length} of ${matches.length} ${matches.length === 1 ? 'tournament' : 'tournaments'}`
    : '0 tournaments';
  for (const pagination of document.querySelectorAll('.tournament-pagination')) {
    pagination.hidden = !matches.length;
    pagination.querySelector('[data-page-status]').textContent = `Page ${tournamentPage + 1} of ${pageCount}`;
    pagination.querySelector('[data-page-direction="-1"]').disabled = tournamentPage === 0;
    pagination.querySelector('[data-page-direction="1"]').disabled = tournamentPage + 1 >= pageCount;
  }
  const results = byId('tournament-results');
  results.replaceChildren(...pageEvents.map(event => eventCard(event, selected.some(item => item.id === event.id))));
  if (!matches.length) {
    const filtered = query || state || category || radius;
    const empty = document.createElement('div');
    empty.className = 'tournament-empty';
    const message = document.createElement('p');
    message.textContent = filtered ? 'No tournaments match these filters.' : 'No upcoming tournaments found in the available calendars.';
    empty.append(message);
    if (filtered) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.textContent = 'Clear filters';
      clear.addEventListener('click', () => {
        for (const id of ['tournament-search', 'tournament-state', 'tournament-type', 'tournament-radius']) byId(id).value = '';
        resetTournamentPage();
        byId('tournament-search').focus();
      });
      empty.append(clear);
    }
    results.append(empty);
  }
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
function resetTournamentPage() {
  tournamentPage = 0;
  renderTournaments();
}

for (const button of document.querySelectorAll('[data-page-direction]')) {
  button.addEventListener('click', () => {
    tournamentPage += Number(button.dataset.pageDirection);
    renderTournaments();
    const heading = byId('available-tournaments-title');
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    });
  });
}
for (const button of document.querySelectorAll('[data-tournament-view]')) {
  button.addEventListener('click', () => {
    const view = button.dataset.tournamentView;
    byId('tournament-results').classList.toggle('compact', view === 'compact');
    for (const option of document.querySelectorAll('[data-tournament-view]')) {
      const selected = option.dataset.tournamentView === view;
      option.setAttribute('aria-pressed', String(selected));
      option.toggleAttribute('data-resting', !selected);
    }
  });
}

for (const [code, name] of Object.entries(tournamentStates).sort((a, b) => a[1].localeCompare(b[1]))) {
  byId('tournament-state').add(new Option(name, code));
}
for (const id of ['tournament-state', 'tournament-type', 'tournament-sort', 'tournament-radius']) {
  byId(id).addEventListener('change', resetTournamentPage);
}
byId('tournament-nearby').addEventListener('click', useTournamentLocation);
byId('tournament-search').addEventListener('input', resetTournamentPage);
byId('refresh-tournaments').addEventListener('click', loadTournaments);
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  Object.assign(settings, readSettings());
  renderTournaments();
});
renderTournaments();
loadTournaments();
