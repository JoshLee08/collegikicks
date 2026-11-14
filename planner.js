const storageKey = 'kyorugi-planner-v1';
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const longFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const byId = id => document.getElementById(id);
const pad = number => String(number).padStart(2, '0');

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, count) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count, 12);
}

function monday(date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

function dayDistance(start, end) {
  const utc = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utc(end) - utc(start)) / 86400000);
}

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === 'object') {
      return { tournament: saved.tournament || '', weeks: saved.weeks || {} };
    }
  } catch {}
  return { tournament: '', weeks: {} };
}

const settings = readSettings();
let weekStart = monday(new Date());
let selectedDay = 0;

function saveSettings() {
  try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch {}
}

function phaseFor(start, tournament) {
  if (!tournament) return 'base';
  const distance = dayDistance(start, tournament);
  if (distance < 0) return 'after';
  if (distance < 7) return 'event';
  return dayDistance(addDays(start, 6), tournament) <= 28 ? 'build' : 'base';
}

function trainingDay(title, type, time, content, minutes = [0, 0]) {
  return { title, type, time, content, minutes };
}

function buildWeek(phase, high, light, tournamentIndex) {
  const shorterLift = high || phase === 'event';
  const strength = trainingDay(
    shorterLift ? 'Short strength' : 'Strength & power', 'extra',
    shorterLift ? '20–25 min' : '35–40 min',
    [
      '<strong>Warm up for 7–8 minutes.</strong> Cycle easily, then do wall-push dead bugs and slow, controlled hip circles.',
      shorterLift
        ? '<strong>Lateral hops.</strong> 2 × 3 per side. Stick each landing and reset.'
        : '<strong>Lateral and single-leg forward hops.</strong> Do 2 × 3 per side of each. Stick each landing and stop if landings get unstable.',
      `<strong>Box squats.</strong> ${shorterLift ? '2' : '3'} × 4 with about three reps in reserve. Rest about two minutes between sets. A goblet box squat is an option while learning the barbell version.`,
      ...(shorterLift ? [] : ['<strong>Accessories.</strong> 2 × 5 Cossack squats per side and 2 × 20-second single-leg calf holds per side.'])
    ], shorterLift ? [20, 25] : [35, 40]
  );
  const intervals = phase === 'build' && light;
  const bike = high
    ? trainingDay('Study & recover', 'rest', 'Open study block', 'Use this time for coursework or sleep. An easy walk is optional.')
    : phase === 'event'
      ? trainingDay('Easy bike', 'extra', '15–20 min', 'Ride at a conversational pace. Keep the session light ahead of competition.', [15, 20])
      : trainingDay(intervals ? 'Bike sprints' : 'Aerobic bike', 'extra', '25–30 min',
        intervals
          ? '<strong>Warm up easily for 8–10 minutes.</strong> Ride 5 × (10 seconds hard + 80 seconds easy). Finish with 9–12 minutes of easy riding. If practice picks up in intensity, ride easy instead.'
          : '<strong>Ride 5 min easy, then do 5 × (2 min brisk + 1 min easy).</strong> Finish with at least 5 min easy. Aim for about 6/10 effort on the brisk efforts. If Tuesday was especially hard, ride easy throughout.', [25, 30]);

  const plan = [
    strength,
    trainingDay('Distance & first attacks', 'practice', 'Night practice', 'Pick a sequence to repeat in drills or live sparring. Try a lead-leg cut kick, rear-leg roundhouse, then an angled exit.'),
    bike,
    trainingDay('Reactions & score', 'practice', 'Night practice', 'Read your opponent’s first move and work on score management. If your coach runs situational rounds, try starting one point down with 30 seconds left.'),
    trainingDay('Rest & coursework', 'rest', 'Open evening', 'Keep the evening open for coursework and recovery ahead of Saturday practice.'),
    trainingDay('Live sparring', 'practice', 'Morning practice', 'When the coach schedules live sparring, use it as your hardest conditioning day. Try 3 × 2-minute rounds with 1 minute of rest, or use your event’s format. Use feints and small steps between explosive exchanges.'),
    trainingDay('Rest & plan', 'rest', 'Open day', 'Check your deadlines and schedule next week’s extra sessions in gaps between classes.')
  ];

  if (phase === 'event') {
    for (const [index, day] of plan.entries()) {
      if (day.type === 'practice') {
        day.title = index < tournamentIndex ? 'Technical practice' : 'Return to practice';
        day.content = index < tournamentIndex
          ? 'Use controlled technical rounds and brief, crisp exchanges if your coach’s session allows. Save hard rounds for the tournament.'
          : 'Check in with your coach and use an easy return to drills as recovery allows.';
      }
    }
    if (tournamentIndex === 1) plan[0] = trainingDay('Rest before competition', 'rest', 'Open day', 'Keep your legs fresh for tomorrow.');
    if (tournamentIndex === 3 && !high) plan[2] = trainingDay('Rest before competition', 'rest', 'Open day', 'Keep your legs fresh for tomorrow.');
    plan[tournamentIndex] = trainingDay('Tournament', 'practice', 'Competition day', 'Use your usual competition warm-up and follow your event’s schedule. Between rounds, reset your breathing and focus on one cue from your coach.');
  }
  return plan;
}

function render(focusDay = false) {
  const key = dateKey(weekStart);
  const weekSettings = settings.weeks[key] || {};
  const tournament = settings.tournament ? new Date(`${settings.tournament}T12:00:00`) : null;
  const phase = phaseFor(weekStart, tournament);
  const tournamentIndex = phase === 'event' ? dayDistance(weekStart, tournament) : -1;
  const plan = buildWeek(phase, weekSettings.course === 'high', weekSettings.rounds === 'light', tournamentIndex);
  const end = addDays(weekStart, 6);
  const weekLabel = weekStart.getMonth() === end.getMonth()
    ? `${dateFormatter.format(weekStart)}–${end.getDate()}`
    : `${dateFormatter.format(weekStart)} – ${dateFormatter.format(end)}`;
  byId('week-title').textContent = `${weekLabel}, ${end.getFullYear()}`;
  byId('tournament').value = settings.tournament;
  byId('clear-date').hidden = !settings.tournament;
  byId('course').value = weekSettings.course || 'normal';
  byId('rounds').value = weekSettings.rounds || 'regular';
  byId('phase').textContent = { base: 'Build your base', build: 'Competition build', event: 'Tournament week', after: 'Back to base' }[phase];
  const distance = tournament ? dayDistance(new Date(), tournament) : null;
  byId('countdown').textContent = distance === null ? 'Set a date to adapt the plan'
    : distance === 0 ? 'Tournament today'
    : distance > 0 ? `${distance} ${distance === 1 ? 'day' : 'days'} until tournament`
    : `Tournament was ${-distance} ${distance === -1 ? 'day' : 'days'} ago`;

  const minimum = plan.reduce((sum, day) => sum + day.minutes[0], 0);
  const maximum = plan.reduce((sum, day) => sum + day.minutes[1], 0);
  byId('minutes').textContent = minimum === maximum ? `${minimum} min` : `${minimum}–${maximum} min`;
  byId('rest-days').textContent = plan.filter(day => day.type === 'rest').length;
  const count = plan.filter((day, index) => day.type === 'practice' && index !== tournamentIndex).length;
  byId('practice-count').textContent = tournamentIndex < 0 ? `${count} team practices` : `${count} practices + tournament`;

  byId('week').innerHTML = plan.map((day, index) => `
    <button class="day ${day.type}" data-day="${index}" aria-pressed="${index === selectedDay}">
      <span class="day-top">${days[index]} · ${addDays(weekStart, index).getDate()}</span>
      <strong>${day.title}</strong>
      <span class="day-time">${day.time}</span>
    </button>`).join('');
  const day = plan[selectedDay];
  const content = Array.isArray(day.content)
    ? `<ol>${day.content.map(item => `<li>${item}</li>`).join('')}</ol>`
    : `<p>${day.content}</p>`;
  byId('details').innerHTML = `
    <div><p class="eyebrow">${longFormatter.format(addDays(weekStart, selectedDay))}</p>
    <h3>${day.title}</h3><p class="detail-meta">${day.time}</p></div>
    <div class="detail-content">${content}</div>`;
  if (focusDay) byId('week').children[selectedDay].focus();
}

function setWeekOption(field, value) {
  const key = dateKey(weekStart);
  settings.weeks[key] = { ...settings.weeks[key], [field]: value };
  saveSettings();
  render();
}

function goToWeek(date) {
  weekStart = monday(date);
  selectedDay = 0;
  render();
}

byId('course').addEventListener('change', event => setWeekOption('course', event.target.value));
byId('rounds').addEventListener('change', event => setWeekOption('rounds', event.target.value));
byId('tournament').addEventListener('change', event => {
  settings.tournament = event.target.value;
  saveSettings();
  render();
});
byId('clear-date').addEventListener('click', () => {
  settings.tournament = '';
  saveSettings();
  render();
  byId('tournament').focus();
});
byId('previous').addEventListener('click', () => goToWeek(addDays(weekStart, -7)));
byId('next').addEventListener('click', () => goToWeek(addDays(weekStart, 7)));
byId('today').addEventListener('click', () => goToWeek(new Date()));
byId('week').addEventListener('click', event => {
  const button = event.target.closest('[data-day]');
  if (!button) return;
  selectedDay = Number(button.dataset.day);
  render(true);
});
document.querySelector('.top-link').addEventListener('click', () => { byId('sources').open = true; });
render();
