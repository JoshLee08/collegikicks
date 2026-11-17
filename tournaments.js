// Set to the Python host's HTTPS origin when deploying separately from GitHub Pages.
const tournamentApiOrigin = 'https://kyorugi-weekly-planner-api.onrender.com';
let tournamentCatalog = [];

function eventCard(event, selected) {
  const card = document.createElement('article');
  card.className = 'tournament-card';
  const title = document.createElement('h4');
  title.textContent = event.title;
  const details = document.createElement('p');
  const format = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  details.textContent = `${format(event.start)}${event.end !== event.start ? ' – ' + format(event.end) : ''} · ${event.location || 'Location to be confirmed'}`;
  card.append(title, details);
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
    link.textContent = 'Organizer schedule ↗';
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
  const matches = tournamentCatalog.filter(event => `${event.title} ${event.location}`.toLowerCase().includes(query));
  const results = byId('tournament-results');
  results.replaceChildren(...matches.map(event => eventCard(event, selected.some(item => item.id === event.id))));
  if (!matches.length) results.textContent = query ? 'No tournaments match your search.' : 'No upcoming tournaments found in the available calendars. Check back after the next update.';
}

async function loadTournaments() {
  const button = byId('refresh-tournaments');
  button.disabled = true;
  byId('tournament-status').textContent = 'Checking competition calendars…';
  try {
    let data;
    try {
      const url = new URL('/tournaments', tournamentApiOrigin || location.origin);
      url.searchParams.set('today', dateKey(new Date()));
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Unavailable');
      data = await response.json();
      if (!Array.isArray(data.events)) throw new Error('Invalid feed');
      byId('tournament-status').textContent = data.stale ? 'Some sources are unavailable. Showing saved listings; check dates with the organizer.' : 'Competition calendars checked. Listings refresh every 30 minutes.';
    } catch {
      const response = await fetch('club-calendar.json', { cache: 'no-cache', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Unavailable');
      const feed = await response.json();
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
    tournamentCatalog = data.events.filter(validTournament).filter(event => event.end >= dateKey(new Date())).sort((a, b) => a.start.localeCompare(b.start));
  } catch {
    byId('tournament-status').textContent = 'Could not load tournaments. Your selections are still saved. Try Refresh events again.';
  } finally {
    button.disabled = false;
    renderTournaments();
  }
}
byId('tournament-search').addEventListener('input', renderTournaments);
byId('refresh-tournaments').addEventListener('click', loadTournaments);
renderTournaments();
loadTournaments();
