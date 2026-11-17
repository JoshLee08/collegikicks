const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const longFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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

const requestedWeek = new URLSearchParams(window.location.search).get('week');
const requestedDate = requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek)
  ? new Date(requestedWeek + 'T12:00:00') : null;
const initialDate = requestedDate && dateKey(requestedDate) === requestedWeek ? requestedDate : new Date();
let weekStart = monday(initialDate);
let selectedDay = dayDistance(weekStart, initialDate);
let dayDetailsOpen = true;

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
  return trainingDay('Team practice', 'practice', time,
    `The coaches set the session. Log your overall effort afterward. ${nextStep}`);
}

function buildWeek(phase, high, practice, previousSaturday, tournamentIndex, team = berkeleyPractices) {
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
  const tuesday = team.some(block => block.day === 1) ? practice[1] : undefined;
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
    trainingDay('Rest & coursework', 'rest', 'Open day', 'Use the open block for coursework or recovery.'),
    bike,
    trainingDay('Rest & coursework', 'rest', 'Open day', 'Use the open block for coursework or recovery.'),
    trainingDay('Rest & coursework', 'rest', 'Open evening',
      team.some(block => block.day === 3) && practice[3] === 'hard'
        ? 'Thursday was hard. Prioritize sleep and recovery.' : 'Keep the evening open for coursework and recovery.'),
    trainingDay('Rest & coursework', 'rest', 'Open day', 'Use the open block for coursework or recovery.'),
    trainingDay('Rest & plan', 'rest', 'Open day', 'Check your deadlines and plan next week’s solo sessions.')
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

function planForWeek(start, state) {
  const week = state.weeks[dateKey(start)] || {};
  const enrolled = selectedTournaments(state);
  const nextEvent = enrolled.find(event => event.end >= dateKey(start));
  const tournament = nextEvent ? new Date(`${nextEvent.start < dateKey(start) ? dateKey(start) : nextEvent.start}T12:00:00`) : null;
  const phase = phaseFor(start, tournament);
  const tournamentIndex = phase === 'event' ? dayDistance(start, tournament) : -1;
  const team = teamBlocks(state, start);
  const practice = week.practiceByClub?.[state.club] || (state.club === 'berkeley' ? week.practice : {}) || {};
  const previous = state.weeks[dateKey(addDays(start, -7))];
  const previousPractice = previous?.practiceByClub?.[state.club] || (state.club === 'berkeley' ? previous?.practice : {});
  const previousSaturday = teamBlocks(state, addDays(start, -7)).some(block => block.day === 5) ? previousPractice?.[5] : undefined;
  const plan = buildWeek(phase, week.course === 'high', practice, previousSaturday, tournamentIndex, team);
  for (let index = 0; index < 7; index++) {
    const key = dateKey(addDays(start, index));
    if (enrolled.some(event => event.start <= key && event.end >= key)) {
      plan[index] = trainingDay('Tournament', 'event', 'Competition day', 'Your selected tournaments are listed below. Follow the organizer’s schedule and your coach’s guidance.');
    }
  }
  const commitments = week.commitments ?? state.commitments;
  const wednesday = plan[2];
  if (wednesday.type === 'extra' && week.bike === 'skip') {
    plan[2] = trainingDay('Rest & recover', 'rest', 'Open day', 'You chose to skip this Wednesday’s ride.');
  } else if (wednesday.type === 'extra' && week.bike === 'easy') {
    plan[2] = trainingDay('Easy bike', 'extra', '15–20 min optional', 'Keep a conversational pace. Rest if you feel worn down.', [15, 20]);
  }
  const hasTeam = index => team.some(block => block.day === index);
  for (const preferred of [0, 2]) {
    const workout = plan[preferred];
    if (workout.type !== 'extra') continue;
    const candidates = preferred === 0 ? [0, 1] : [2, 3, 4];
    let scheduled = false;
    for (const index of candidates) {
      if (hasTeam(index) || plan[index].type === 'event' || (index !== preferred && plan[index].type !== 'rest')) continue;
      if (phase === 'event' && index >= tournamentIndex - 1) continue;
      if (index !== preferred && (workout.title === 'Bike sprints' || practice[index - 1] === 'hard')) continue;
      const slot = commitments ? findWorkoutSlot(commitments.filter(block => block.day === index), workout.minutes[1]) : undefined;
      if (slot === null) continue;
      if (index !== preferred) {
        plan[preferred] = trainingDay('Rest & coursework', 'rest', 'Workout moved', `Find this workout on ${weekdayNames[index]}.`);
      }
      plan[index] = { ...workout, time: slot === undefined ? workout.time : `${displayTime(slot)} · ${workout.time}` };
      scheduled = true;
      break;
    }
    if (!scheduled) {
      plan[preferred] = trainingDay('Rest & coursework', 'rest', 'No open workout window',
        'Keep this day for coursework and recovery.');
    }
  }
  for (let day = 0; day < 7; day++) {
    const sessions = team.filter(block => block.day === day);
    if (!sessions.length || plan[day].type === 'event') continue;
    const time = sessions.length > 1 ? `${sessions.length} team sessions` : sessions[0].approximate
      ? sessions[0].label : `${displayTime(sessions[0].start)}–${displayTime(sessions[0].end)}`;
    plan[day] = teamPractice(time, 'Log your overall effort for the day.');
  }
  return { plan, practice, tournament, phase, tournamentIndex, team, commitments: commitments || [], events: clubEvents(state, start) };
}

function render(focusDay = false) {
  const weekSettings = settings.weeks[dateKey(weekStart)] || {};
  const { plan, practice, tournament, phase, tournamentIndex, team, commitments, events } = planForWeek(weekStart, settings);
  const club = publishedClubs[settings.club];
  const manual = settings.teams?.[settings.club];
  byId('club-note').textContent = manual
    ? `${team.length} coach-entered practice blocks this week.`
    : settings.club === 'berkeley' ? 'Using your Tuesday and Thursday nights and Saturday morning.'
    : team.length ? `${team.length} published practices this week. Check the club page for term changes.`
    : club?.practices?.length ? 'No published practices apply to this week.'
    : 'Enter your coach’s practice times to add team sessions.';
  const sources = byId('club-sources');
  sources.replaceChildren();
  for (const [url, label] of [[club?.source, 'Club schedule'], [club?.practiceSource, 'Practice hours']]) {
    if (!url || (label === 'Practice hours' && url === club.source)) continue;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = label;
    sources.append(link);
  }
  const checked = [club?.practiceChecked, club?.eventsChecked].filter(Boolean).sort().at(-1);
  byId('club-checked').textContent = checked ? `Source checked ${dateFormatter.format(new Date(`${checked}T12:00:00`))}` : '';
  const end = addDays(weekStart, 6);
  const weekLabel = weekStart.getMonth() === end.getMonth()
    ? `${dateFormatter.format(weekStart)}–${end.getDate()}`
    : `${dateFormatter.format(weekStart)} – ${dateFormatter.format(end)}`;
  byId('week-title').textContent = `${weekLabel}, ${end.getFullYear()}`;
  const classSummary = byId('class-summary');
  const scopedClasses = Array.isArray(weekSettings.commitments);
  const classCount = commitments.length;
  classSummary.textContent = `${classCount} class ${classCount === 1 ? 'block' : 'blocks'} · ${scopedClasses ? 'This week' : 'Every week'}`;
  classSummary.hidden = !classCount;
  byId('add-classes').hidden = !classSummary.hidden;
  renderTournamentSummary();
  byId('course').value = weekSettings.course || 'normal';
  byId('phase').textContent = { base: 'Build your base', build: 'Competition build', event: 'Tournament week', after: 'Back to base' }[phase];
  const distance = tournament ? dayDistance(new Date(), tournament) : null;
  byId('countdown').textContent = distance === null ? 'Add a tournament to adapt the plan'
    : distance === 0 ? 'Tournament today'
    : distance > 0 ? `${distance} ${distance === 1 ? 'day' : 'days'} until tournament`
    : `Tournament was ${-distance} ${distance === -1 ? 'day' : 'days'} ago`;

  const minimum = plan.reduce((sum, day) => sum + day.minutes[0], 0);
  const maximum = plan.reduce((sum, day) => sum + day.minutes[1], 0);
  byId('minutes').textContent = minimum === maximum ? `${minimum} min` : `${minimum}–${maximum} min`;
  const restDays = plan.filter(day => day.type === 'rest').length;
  byId('rest-days').textContent = `${restDays} rest ${restDays === 1 ? 'day' : 'days'}`;
  const count = plan.filter(day => day.type === 'practice').length;
  const eventDays = plan.filter(day => day.type === 'event').length;
  byId('practice-count').textContent = `${count} team ${count === 1 ? 'practice' : 'practices'}${eventDays ? ` + ${eventDays} competition ${eventDays === 1 ? 'day' : 'days'}` : ''}`;

  const week = byId('week');
  const dayDetail = byId('day-detail');
  const active = document.activeElement;
  const focusedDay = active?.dataset.day;
  const detailWasFocused = dayDetail.contains(active);
  if (week.contains(dayDetail)) week.after(dayDetail);
  const today = dateKey(new Date());
  const dayMarkup = plan.map((day, index) => {
    const date = addDays(weekStart, index);
    const isToday = dateKey(date) === today;
    return `
    <button type="button" class="day ${day.type}" data-day="${index}" aria-controls="day-detail" aria-pressed="${dayDetailsOpen && index === selectedDay}" aria-expanded="${dayDetailsOpen && index === selectedDay}"${isToday ? ' aria-current="date"' : ''}>
      <span class="day-top"><time datetime="${dateKey(date)}">${days[index]} ${date.getDate()}</time>${isToday
        ? '<span class="today-label">Today</span>' : ''}</span>
      <strong>${day.title}</strong>
      ${day.type === 'extra' ? '<span class="day-type">Solo training</span>' : ''}
      ${events.some(event => event.start <= dateKey(date) && event.end >= dateKey(date))
        ? '<span class="club-event-tag">Competition listed</span>' : ''}
      <span class="day-time">${day.time}${day.type === 'practice' && practiceLabels[practice[index]] ? ` · ${practiceLabels[practice[index]]}` : ''}</span>
    </button>`;
  }).join('');
  if (focusDay) {
    for (const button of week.querySelectorAll('[data-day]')) {
      const expanded = dayDetailsOpen && Number(button.dataset.day) === selectedDay;
      button.setAttribute('aria-pressed', String(expanded));
      button.setAttribute('aria-expanded', String(expanded));
    }
  } else {
    week.innerHTML = dayMarkup;
  }
  dayDetail.hidden = !dayDetailsOpen;
  placeDayDetail();
  const day = plan[selectedDay];
  const content = Array.isArray(day.content)
    ? `<ol>${day.content.map(item => `<li>${item}</li>`).join('')}</ol>`
    : `<p>${day.content}</p>`;
  byId('detail-date').textContent = longFormatter.format(addDays(weekStart, selectedDay));
  byId('detail-title').textContent = day.title;
  byId('detail-time').textContent = day.time;
  byId('details').innerHTML = content;
  const agenda = byId('day-commitments');
  const booked = commitments.filter(block => block.day === selectedDay);
  const fixed = team.filter(block => block.day === selectedDay);
  agenda.replaceChildren();
  if (booked.length || fixed.length) {
    const title = document.createElement('h4');
    title.textContent = 'Classes, commitments & team practice';
    const list = document.createElement('ul');
    for (const block of [...booked, ...fixed].sort((a, b) => a.start - b.start)) {
      const item = document.createElement('li');
      const isTeam = fixed.includes(block);
      const time = block.approximate ? block.label : `${displayTime(block.start)}–${displayTime(block.end)}`;
      item.textContent = `${time} · ${isTeam ? 'Team practice' : block.label || 'Busy'}`;
      if (isTeam && !block.approximate && booked.some(other => block.start < other.end && block.end > other.start)) {
        item.textContent += ' · overlaps a commitment';
      }
      list.append(item);
    }
    agenda.append(title, list);
  }
  const selectedDate = dateKey(addDays(weekStart, selectedDay));
  const attending = selectedTournaments(settings).filter(event => event.start <= selectedDate && event.end >= selectedDate);
  for (const event of attending) {
    const row = document.createElement('p');
    row.className = 'club-event-detail';
    row.textContent = `Planned attendance · ${event.title}${event.location ? ' · ' + event.location : ''}`;
    if (booked.length || fixed.length) row.append(' · overlaps classes or team practice');
    agenda.append(row);
  }
  const listed = events.filter(event => event.start <= selectedDate && event.end >= selectedDate);
  for (const event of listed) {
    const row = document.createElement('p');
    row.className = 'club-event-detail';
    const link = document.createElement('a');
    link.href = event.source;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = event.title;
    row.append('Published competition · ', link);
    if (event.location) row.append(` · ${event.location}`);
    agenda.append(row);
  }
  byId('practice-log').hidden = day.type !== 'practice';
  byId('practice-load').value = practice[selectedDay] || '';
  const practiceUpdates = {
    1: 'Tuesday’s effort informs the midweek bike session.',
    3: practice[3] === 'hard' ? 'Friday’s recovery note has been updated.' : 'Friday is open for coursework and recovery when free.',
    5: practice[5] === 'hard' ? 'Next week’s lift will be shortened if it’s scheduled.' : 'Next week’s lift follows your coursework and tournament settings.'
  };
  byId('practice-feedback').textContent = practiceUpdates[selectedDay] || 'Practice effort is saved with this week.';
  if (focusDay || focusedDay !== undefined) {
    week.querySelector(`[data-day="${focusDay ? selectedDay : focusedDay}"]`).focus({ preventScroll: !focusDay });
  } else if (detailWasFocused && active.isConnected && document.activeElement !== active) {
    active.focus({ preventScroll: true });
  }
}

function setWeekOption(field, value) {
  const key = dateKey(weekStart);
  settings.weeks[key] = { ...settings.weeks[key], [field]: value };
  saveSettings();
  render();
}

function goToWeek(date) {
  weekStart = monday(date);
  selectedDay = dayDistance(weekStart, date);
  dayDetailsOpen = true;
  render();
}

function placeDayDetail() {
  const detail = byId('day-detail');
  const week = byId('week');
  const selected = week.querySelector(`[data-day="${selectedDay}"]`);
  if (compactWeek.matches && selected) {
    if (selected.nextElementSibling !== detail) selected.after(detail);
  } else if (week.contains(detail)) {
    week.after(detail);
  }
}

byId('course').addEventListener('change', event => setWeekOption('course', event.target.value));
const compactWeek = window.matchMedia('(max-width: 720px)');
compactWeek.addEventListener('change', () => {
  const active = document.activeElement;
  const hadFocus = byId('day-detail').contains(active);
  placeDayDetail();
  if (hadFocus && active !== document.activeElement) active.focus({ preventScroll: true });
});

const setup = byId('schedule-setup');
const editSchedule = byId('edit-schedule');
const addClasses = byId('add-classes');
let setupTrigger = editSchedule;

function toggleSetup(open, trigger = setupTrigger) {
  setup.hidden = !open;
  editSchedule.setAttribute('aria-expanded', String(open));
  addClasses.setAttribute('aria-expanded', String(open));
  editSchedule.toggleAttribute('data-resting', !open);
  addClasses.toggleAttribute('data-resting', !open);
  if (open) {
    setupTrigger = trigger;
    (trigger === addClasses ? byId('schedule-file') : byId('club')).focus();
  } else {
    (trigger.hidden ? editSchedule : trigger).focus();
  }
}

editSchedule.addEventListener('click', () => toggleSetup(setup.hidden, editSchedule));
addClasses.addEventListener('click', () => toggleSetup(setup.hidden, addClasses));
byId('close-setup').addEventListener('click', () => toggleSetup(false));
byId('practice-load').addEventListener('change', event => {
  const week = settings.weeks[dateKey(weekStart)] || {};
  const practice = week.practiceByClub?.[settings.club] || (settings.club === 'berkeley' ? week.practice : {});
  setWeekOption('practiceByClub', { ...week.practiceByClub, [settings.club]: { ...practice, [selectedDay]: event.target.value } });
});
byId('previous').addEventListener('click', () => goToWeek(addDays(weekStart, -7)));
byId('next').addEventListener('click', () => goToWeek(addDays(weekStart, 7)));
byId('today').addEventListener('click', () => goToWeek(new Date()));
byId('week').addEventListener('click', event => {
  const button = event.target.closest('[data-day]');
  if (!button) return;
  const clickedDay = Number(button.dataset.day);
  dayDetailsOpen = clickedDay === selectedDay ? !dayDetailsOpen : true;
  selectedDay = clickedDay;
  render(true);
  if (dayDetailsOpen && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const detail = byId('day-detail');
    for (const animation of detail.getAnimations()) animation.cancel();
    detail.animate(
      [{ opacity: 0.65, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 200, easing: 'ease-out' }
    );
  }
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  Object.assign(settings, readSettings());
  render();
  refreshScheduleEditor();
});
if (window.location.hash === '#sources') byId('sources').open = true;
render();
