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
