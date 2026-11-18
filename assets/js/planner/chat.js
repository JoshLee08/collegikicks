// Set this to the HTTPS origin of your Python API to enable model interpretation.
const planApiOrigin = '';

const practiceDays = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6
};
const planOperations = {
  log_practice: ['light', 'moderate', 'hard'],
  set_course_load: ['normal', 'high'],
  set_tournament_date: ['set'],
  set_bike: ['skip', 'easy']
};

function parsePlanDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && dateKey(date) === value ? date : null;
}

function interpretLocally(message, start, today = new Date()) {
  const clauses = message
    .toLowerCase()
    .split(/\s*(?:[;.!\n]+|,\s*and\b|\band\b)\s*/)
    .filter(Boolean);
  const changes = [];
  for (const clause of clauses) {
    let match =
      /^(?:this )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:['’]s practice| practice)? (?:was|felt) (light|moderate|hard|rough|easy)$/.exec(
        clause
      );
    if (match) {
      const target = addDays(start, practiceDays[match[1]]);
      if (!clause.startsWith('this ') && dateKey(target) > dateKey(today)) {
        return {
          question: `Do you mean ${dateKey(target)} in the displayed week, or an earlier ${match[1]}? To choose the displayed week, say “This ${match[1]} was ${match[2]}.”`,
          changes: []
        };
      }
      const effort = { rough: 'hard', easy: 'light' }[match[2]] || match[2];
      changes.push({
        operation: 'log_practice',
        date: dateKey(addDays(start, practiceDays[match[1]])),
        value: effort
      });
      continue;
    }
    if (
      /^(?:i have (?:two |three |\d+ )?(?:midterms?|finals?|exams?)|high coursework|heavy course ?load) this week$/.test(
        clause
      )
    ) {
      changes.push({ operation: 'set_course_load', date: dateKey(start), value: 'high' });
      continue;
    }
    if (/^(?:normal course ?load|regular week)(?: this week)?$/.test(clause)) {
      changes.push({ operation: 'set_course_load', date: dateKey(start), value: 'normal' });
      continue;
    }
    match = /^(?:my |the )?tournament(?: date)? (?:is )?(?:on |to )?(\d{4}-\d{2}-\d{2})$/.exec(
      clause
    );
    if (match && parsePlanDate(match[1])) {
      changes.push({ operation: 'set_tournament_date', date: match[1], value: 'set' });
      continue;
    }
    match = /^(skip|make) (?:this )?wednesday(?:['’]s)?(?: bike(?: ride)?| ride)( easy)?$/.exec(
      clause
    );
    if (match && (match[1] === 'make') === Boolean(match[2])) {
      changes.push({
        operation: 'set_bike',
        date: dateKey(addDays(start, 2)),
        value: match[1] === 'skip' ? 'skip' : 'easy'
      });
      continue;
    }
    return {
      question:
        'Which practice or solo workout should change? Use the displayed week, for example “Tuesday was hard” or “Skip this Wednesday’s bike.” For a tournament, enter “Tournament is on YYYY-MM-DD.”',
      changes: []
    };
  }
  return {
    question: changes.length ? null : 'Enter a note about your practice or schedule.',
    changes
  };
}

function proposeSchedule(changes, current) {
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 8)
    throw new Error('No valid schedule changes were returned.');
  const next = structuredClone(current);
  const touched = new Set();
  const targets = new Set();
  const notes = [];
  for (const { operation, date, value } of changes) {
    const day = parsePlanDate(date);
    if (
      !day ||
      !Object.hasOwn(planOperations, operation) ||
      !planOperations[operation].includes(value)
    ) {
      throw new Error('The proposed change is outside the supported schedule options.');
    }
    const start = monday(day);
    const key = dateKey(start);
    const index = dayDistance(start, day);
    const target = operation === 'set_tournament_date' ? operation : `${operation}:${date}`;
    if (targets.has(target)) throw new Error('Please give one update per date and setting.');
    targets.add(target);
    touched.add(key);
    if (operation === 'set_tournament_date') {
      next.tournament = date;
      notes.push(`Tournament date → ${longFormatter.format(day)}, ${day.getFullYear()}`);
      continue;
    }
    const week = (next.weeks[key] ??= {});
    if (
      operation === 'log_practice' &&
      teamBlocks(next, start).some((block) => block.day === index)
    ) {
      const logs = (week.practiceByClub ??= {});
      (logs[next.club] ??= next.club === 'berkeley' ? { ...week.practice } : {})[index] = value;
      if (index === 5) touched.add(dateKey(addDays(start, 7)));
      notes.push(`${longFormatter.format(day)} team practice → ${practiceLabels[value]}`);
    } else if (operation === 'set_course_load' && index === 0) {
      week.course = value;
      notes.push(
        `Week of ${dateFormatter.format(start)} → ${value === 'high' ? 'High coursework' : 'Regular coursework'}`
      );
    } else if (operation === 'set_bike' && index === 2) {
      week.bike = value;
      notes.push(
        `${longFormatter.format(day)} bike preference → ${value === 'skip' ? 'Skip' : 'Easy'}`
      );
    } else {
      throw new Error('That date does not match the practice or workout you want to update.');
    }
  }
  if (next.tournament !== current.tournament) {
    // Preview every week whose competition phase can change.
    for (const date of [current.tournament, next.tournament].filter(Boolean)) {
      const start = monday(parsePlanDate(date));
      for (let offset = -28; offset <= 0; offset += 7) touched.add(dateKey(addDays(start, offset)));
    }
  }
  for (const key of [...touched].sort()) {
    const start = parsePlanDate(key);
    const before = planForWeek(start, current).plan;
    const after = planForWeek(start, next).plan;
    after.forEach((day, index) => {
      if (day.title !== before[index].title || day.time !== before[index].time) {
        notes.push(`${longFormatter.format(addDays(start, index))} → ${day.title} · ${day.time}`);
      }
    });
  }
  return { next, notes };
}

const chatMessage = byId('chat-message');
const chatResult = byId('chat-result');
const chatApply = byId('chat-apply');
const chatPreview = byId('chat-preview');
const chatToken = byId('chat-token');
byId('chat-access').hidden = !planApiOrigin;
byId('chat-mode').textContent = planApiOrigin
  ? 'Your note is sent to the schedule assistant for interpretation.'
  : 'Quick updates work in your browser. Try “Saturday was hard,” “Skip this Wednesday’s bike,” or “Tournament is on YYYY-MM-DD.”';
let pending = null;

function showChatResult(message, notes = []) {
  const intro = document.createElement('p');
  intro.textContent = message;
  chatResult.replaceChildren(intro);
  if (notes.length) {
    const list = document.createElement('ul');
    for (const note of notes) {
      const item = document.createElement('li');
      item.textContent = note;
      list.append(item);
    }
    chatResult.append(list);
  }
}

async function interpretNote(message, start) {
  if (!planApiOrigin) return interpretLocally(message, start);
  const token = chatToken.value.trim();
  if (!token) throw new Error('Enter your assistant access token.');
  const response = await fetch(new URL('/plan/suggest', planApiOrigin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      message,
      week_start: dateKey(start),
      practice_days: [...new Set(teamBlocks(settings, start).map((block) => block.day))],
      club: settings.club,
      timezone: settings.profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok)
    throw new Error(
      'The schedule assistant is unavailable. Try again or use the calendar controls.'
    );
  return response.json();
}

byId('chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  pending = null;
  chatApply.hidden = true;
  const message = chatMessage.value.trim();
  const start = weekStart;
  const snapshot = JSON.stringify(settings);
  chatPreview.disabled = true;
  showChatResult('Preparing your preview…');
  try {
    const result = await interpretNote(message, start);
    if (
      message !== chatMessage.value.trim() ||
      start !== weekStart ||
      snapshot !== JSON.stringify(settings)
    ) {
      showChatResult('Your note or calendar changed. Preview again.');
      return;
    }
    if (result.question) {
      showChatResult(result.question);
      return;
    }
    pending = { ...proposeSchedule(result.changes, settings), snapshot, start };
    showChatResult('Proposed updates', pending.notes);
    chatApply.hidden = false;
  } catch (error) {
    showChatResult(error.message || 'Unable to preview your note.');
  } finally {
    chatPreview.disabled = false;
  }
});

chatMessage.addEventListener('input', () => {
  pending = null;
  chatApply.hidden = true;
  chatResult.replaceChildren();
});

chatApply.addEventListener('click', () => {
  if (!pending) return;
  if (pending.start !== weekStart || pending.snapshot !== JSON.stringify(settings)) {
    showChatResult('The calendar changed. Preview again before applying.');
  } else {
    Object.assign(settings, pending.next);
    saveSettings();
    render();
    showChatResult('Schedule updated.', pending.notes);
  }
  pending = null;
  chatApply.hidden = true;
});
