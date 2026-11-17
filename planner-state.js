const storageKey = 'kyorugi-planner-v1';
const byId = id => document.getElementById(id);
const pad = number => String(number).padStart(2, '0');

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === 'object') {
      return { tournaments: Array.isArray(saved.tournaments) ? saved.tournaments.filter(validTournament) : [], tournament: saved.tournament || '', weeks: saved.weeks || {}, club: saved.club || 'berkeley', teams: saved.teams || {}, commitments: saved.commitments };
    }
  } catch {}
  return { tournament: '', weeks: {}, club: 'berkeley', teams: {} };
}

const settings = readSettings();
function saveSettings() {
  try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch {}
}

function renderTournamentSummary() {
  const today = dateKey(new Date());
  const upcoming = selectedTournaments(settings).filter(event => event.end >= today);
  byId('tournament-count').textContent = upcoming.length;
  const summary = byId('tournament-summary');
  if (summary) {
    summary.textContent = upcoming.length
      ? `${upcoming.length} upcoming · ${upcoming[0].title}`
      : 'No upcoming tournaments selected';
  }
}
