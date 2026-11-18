/* Conservative templates; belt and competition count never determine intensity. */
const athleteTemplates = {
  sparring: {
    title: 'Sparring technique & conditioning',
    discipline: 'sparring',
    purpose: 'Footwork and technical consistency',
    effort: 'moderate',
    duration: 30,
    competitionAlternative: 'Light footwork rehearsal',
    content:
      'Warm up gently. Practice familiar footwork and shadow combinations with controlled technique, taking generous rests. Finish at a conversational pace. Follow your coach’s technical cues.'
  },
  poomsae: {
    title: 'Recognized poomsae practice',
    discipline: 'poomsae',
    purpose: 'Accuracy, balance and control',
    effort: 'moderate',
    duration: 30,
    competitionAlternative: 'Light form rehearsal',
    content:
      'Warm up gently. Rehearse only forms assigned by your coach. Work slowly on transitions, posture and controlled balance, with generous rests. Finish with comfortable mobility. Do not force range or add unfamiliar forms.'
  },
  strength: {
    title: 'General strength & mobility',
    discipline: 'both',
    purpose: 'Strength and consistency',
    effort: 'moderate',
    duration: 30,
    competitionAlternative: 'Gentle mobility',
    content:
      'Warm up gently. Use familiar bodyweight squats, controlled calf raises and comfortable single-leg balance near a support. Keep several repetitions in reserve, rest freely and finish with gentle mobility.'
  }
};
function personalizeWeek(plan, start, state, team, commitments, practice, phase, tournamentIndex) {
  const p = state.profile;
  if (!p?.onboardingComplete) return plan;
  const output = plan.map((day) =>
    day.type === 'extra'
      ? trainingDay(
          'Rest & coursework',
          'rest',
          'Open day',
          'Optional training is limited to your profile availability.'
        )
      : day
  );
  const count = Math.max(0, Math.min(4, Number(p.sessions ?? 2)));
  const duration = [20, 30, 45, 60].includes(Number(p.duration)) ? Number(p.duration) : 30;
  const available = Array.isArray(p.days) ? p.days : weekdayNames;
  const high = state.weeks?.[dateKey(start)]?.course === 'high';
  const cap = high ? Math.min(1, count) : count;
  const sequence =
    p.priority === 'Sparring priority'
      ? ['sparring', 'sparring', 'poomsae']
      : p.priority === 'Poomsae priority'
        ? ['poomsae', 'poomsae', 'sparring']
        : ['sparring', 'poomsae'];
  // A fixed Monday makes mixed-discipline rotation deterministic across weeks.
  const anchor = new Date('2020-01-06T12:00:00');
  const week = Math.floor(dayDistance(anchor, start) / 7);
  let placed = 0;
  // Practice, commitments, recovery and event dates take priority over solo work.
  for (let day = 0; day < 7 && placed < cap; day++) {
    if (
      !available.includes(weekdayNames[day]) ||
      team.some((b) => b.day === day) ||
      output[day].type === 'event'
    )
      continue;
    if (
      (day === 0 &&
        state.weeks?.[dateKey(addDays(start, -7))]?.practiceByClub?.[state.club]?.[5] === 'hard') ||
      (day === 2 && state.weeks?.[dateKey(start)]?.bike === 'skip') ||
      practice[(day + 6) % 7] === 'hard' ||
      (phase === 'event' && day >= tournamentIndex - 1)
    )
      continue;
    const slot = findWorkoutSlot(
      (commitments || []).filter((b) => b.day === day),
      Math.min(duration, high ? 20 : 30)
    );
    if (slot === null) continue;
    const discipline =
      p.discipline === 'Both'
        ? sequence[
            (((week * Math.max(1, cap) + placed) % sequence.length) + sequence.length) %
              sequence.length
          ]
        : p.discipline === 'Recognized poomsae'
          ? 'poomsae'
          : 'sparring';
    const template =
      placed > 0 && (p.goals || []).includes('Strength')
        ? athleteTemplates.strength
        : athleteTemplates[discipline];
    const minutes = Math.min(duration, high ? 20 : template.duration);
    const light = phase === 'event';
    output[day] = {
      ...trainingDay(
        light ? template.competitionAlternative : template.title,
        'extra',
        `${displayTime(slot)} · ${minutes} min`,
        template.content +
          (light ? ' Keep this session light before competition.' : '') +
          (high ? ' Shortened for high coursework.' : ''),
        [minutes, minutes]
      ),
      discipline: template.discipline
    };
    placed++;
  }
  if (placed < cap) {
    const day = output.find((d) => d.type === 'rest');
    if (day)
      day.content =
        'Some optional sessions were omitted because of availability, recovery, or competition. Keep this time for rest.';
  }
  return output;
}
