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
  return { plan: typeof personalizeWeek === 'function' ? personalizeWeek(plan,start,state,team,commitments,practice,phase,tournamentIndex) : plan, practice, tournament, phase, tournamentIndex, team, commitments: commitments || [], events: clubEvents(state, start) };
}

