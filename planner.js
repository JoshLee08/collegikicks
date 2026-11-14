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

const practiceLabels = { light: 'Light', moderate: 'Moderate', hard: 'Hard' };

function teamPractice(time, nextStep) {
  return trainingDay('Berkeley team practice', 'practice', time,
    `The coaches set the session. Log your overall effort afterward. ${nextStep}`);
}

function buildWeek(phase, high, practice, previousSaturday, tournamentIndex) {
  const shorterLift = high || phase === 'event' || previousSaturday === 'hard';
  const strength = trainingDay(
    shorterLift ? 'Short strength' : 'Strength & power', 'extra',
    shorterLift ? '20–25 min' : '35–40 min',
    [
      ...(previousSaturday === 'hard' ? ['Saturday was hard. Use the shorter lift if recovered, or take Monday off if your legs still feel heavy.'] : []),
      '<strong>Warm up for 7–8 minutes.</strong> Cycle easily, then do wall-push dead bugs and slow, controlled hip circles.',
      shorterLift
        ? '<strong>Lateral hops.</strong> 2 × 3 per side. Stick each landing and reset.'
        : '<strong>Lateral and single-leg forward hops.</strong> Do 2 × 3 per side of each. Stick each landing and stop if landings get unstable.',
      `<strong>Box squats.</strong> ${shorterLift ? '2' : '3'} × 4 with about three reps in reserve. Rest about two minutes between sets. A goblet box squat is an option while learning the barbell version.`,
      ...(shorterLift ? [] : ['<strong>Accessories.</strong> 2 × 5 Cossack squats per side and 2 × 20-second single-leg calf holds per side.'])
    ], shorterLift ? [20, 25] : [35, 40]
  );
  const tuesday = practice[1];
  const intervals = phase === 'build' && tuesday === 'light';
  let bike;
  if (high) {
    bike = trainingDay('Study & recover', 'rest', 'Open study block', 'Use this time for coursework or sleep. An easy walk is optional.');
  } else if (phase === 'event' || tuesday === 'hard' || !tuesday) {
    const reason = phase === 'event' ? 'Keep the ride easy ahead of competition.'
      : tuesday === 'hard' ? 'Tuesday was hard. Ride only if your legs feel recovered.'
      : 'Tuesday’s effort is unlogged. Keep the ride easy until you know how practice went.';
    bike = trainingDay('Easy bike', 'extra', '15–20 min optional',
      `${reason} Keep a conversational pace or rest if you feel worn down.`, [15, 20]);
  } else {
    bike = trainingDay(intervals ? 'Bike sprints' : 'Aerobic bike', 'extra', '25–30 min',
      intervals
        ? '<strong>Warm up easily for 8–10 minutes.</strong> If you feel fresh after Tuesday, ride 5 × (10 seconds hard + 80 seconds easy), then cool down easily to 25–30 minutes. Ride easy if your legs feel heavy.'
        : '<strong>Ride 5 min easy, then do 5 × (2 min brisk + 1 min easy).</strong> Cool down easily to 25–30 minutes. Aim for about 6/10 on the brisk efforts. Ride easy if you are still tired from practice.',
      [25, 30]);
  }

  const plan = [
    strength,
    teamPractice('Tuesday night', 'This updates Wednesday’s bike session.'),
    bike,
    teamPractice('Thursday night', 'After a hard session, use Friday for recovery and coursework.'),
    trainingDay('Rest & coursework', 'rest', 'Open evening',
      practice[3] === 'hard' ? 'Thursday was hard. Prioritize sleep and recovery ahead of Saturday practice.' : 'Keep the evening open for coursework and recovery ahead of Saturday practice.'),
    teamPractice('Saturday morning', 'A hard session shortens next Monday’s lift.'),
    trainingDay('Rest & plan', 'rest', 'Open day', 'Check your Berkeley deadlines and schedule next week’s solo sessions in gaps between classes.')
  ];

  if (phase === 'event') {
    const tournamentRest = trainingDay('Rest & recover', 'rest', 'Open day', 'Use the time for recovery and tournament logistics.');
    for (const index of [0, 2]) {
      if (index >= tournamentIndex - 1 && plan[index].type === 'extra') plan[index] = tournamentRest;
    }
    plan[tournamentIndex] = trainingDay('Tournament', 'event', 'Competition day', 'Use your usual warm-up and follow the event’s schedule. Between rounds, reset your breathing and focus on one cue from your coach. The tournament takes priority if it overlaps a team practice.');
  }
  return plan;
}

function render(focusDay = false) {
  const key = dateKey(weekStart);
  const weekSettings = settings.weeks[key] || {};
  const tournament = settings.tournament ? new Date(`${settings.tournament}T12:00:00`) : null;
  const phase = phaseFor(weekStart, tournament);
  const tournamentIndex = phase === 'event' ? dayDistance(weekStart, tournament) : -1;
  const practice = weekSettings.practice || {};
  const previousSaturday = settings.weeks[dateKey(addDays(weekStart, -7))]?.practice?.[5];
  const plan = buildWeek(phase, weekSettings.course === 'high', practice, previousSaturday, tournamentIndex);
  const end = addDays(weekStart, 6);
  const weekLabel = weekStart.getMonth() === end.getMonth()
    ? `${dateFormatter.format(weekStart)}–${end.getDate()}`
    : `${dateFormatter.format(weekStart)} – ${dateFormatter.format(end)}`;
  byId('week-title').textContent = `${weekLabel}, ${end.getFullYear()}`;
  byId('tournament').value = settings.tournament;
  byId('clear-date').hidden = !settings.tournament;
  byId('course').value = weekSettings.course || 'normal';
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
  const count = plan.filter(day => day.type === 'practice').length;
  byId('practice-count').textContent = tournamentIndex < 0 ? `${count} team practices` : `${count} practices + tournament`;

  byId('week').innerHTML = plan.map((day, index) => `
    <button class="day ${day.type}" data-day="${index}" aria-pressed="${index === selectedDay}">
      <span class="day-top">${days[index]} · ${addDays(weekStart, index).getDate()}</span>
      <strong>${day.title}</strong>
      <span class="day-time">${day.time}${day.type === 'practice' && practiceLabels[practice[index]] ? ` · ${practiceLabels[practice[index]]}` : ''}</span>
    </button>`).join('');
  const day = plan[selectedDay];
  const content = Array.isArray(day.content)
    ? `<ol>${day.content.map(item => `<li>${item}</li>`).join('')}</ol>`
    : `<p>${day.content}</p>`;
  byId('detail-date').textContent = longFormatter.format(addDays(weekStart, selectedDay));
  byId('detail-title').textContent = day.title;
  byId('detail-time').textContent = day.time;
  byId('details').innerHTML = content;
  byId('practice-log').hidden = day.type !== 'practice';
  byId('practice-load').value = practice[selectedDay] || '';
  const practiceUpdates = {
    1: `Wednesday’s plan: ${plan[2].title}.`,
    3: practice[3] === 'hard' ? 'Friday’s recovery note has been updated.' : 'Friday is open for coursework and recovery.',
    5: practice[5] === 'hard' ? 'Next Monday’s lift will be shortened if it’s scheduled.' : 'Next Monday’s lift follows your coursework and tournament settings.'
  };
  byId('practice-feedback').textContent = practiceUpdates[selectedDay] || '';
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
byId('practice-load').addEventListener('change', event => {
  const practice = settings.weeks[dateKey(weekStart)]?.practice;
  setWeekOption('practice', { ...practice, [selectedDay]: event.target.value });
});
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
