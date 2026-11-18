function blocksForScope() {
  const recurring = document.querySelector('[name="schedule-scope"]:checked').value === 'recurring';
  return recurring ? settings : (settings.weeks[dateKey(weekStart)] ?? {});
}

function refreshScheduleEditor() {
  const owner = blocksForScope();
  byId('import-target').textContent =
    owner === settings
      ? 'Repeats weekly unless that week has its own schedule.'
      : `Week of ${dateFormatter.format(weekStart)}. A week-specific schedule takes priority.`;
  byId('commitments').value = scheduleLines(owner.commitments || []);
  byId('import-text').hidden = true;
  byId('import-raw').textContent = '';
}

byId('club').value = settings.club;
byId('team-times').value = scheduleLines(settings.teams[settings.club] || []);
byId('club').addEventListener('change', (event) => {
  settings.club = event.target.value;
  byId('team-times').value = scheduleLines(settings.teams[settings.club] || []);
  byId('team-status').textContent = '';
  saveSettings();
  render();
});

byId('save-team').addEventListener('click', () => {
  const { rows, ignored } = parseSchedule(byId('team-times').value, weekStart, false);
  if (ignored.length) {
    byId('team-status').textContent =
      'Check the practice times. Enter one weekday and time range per line.';
    return;
  }
  if (rows.length) settings.teams[settings.club] = rows;
  else delete settings.teams[settings.club];
  saveSettings();
  render();
  byId('team-status').textContent = rows.length
    ? 'Practice times saved.'
    : 'Custom practice times cleared.';
});

for (const radio of document.querySelectorAll('[name="schedule-scope"]')) {
  radio.addEventListener('change', () => {
    refreshScheduleEditor();
    byId('import-status').textContent = '';
  });
}

byId('save-commitments').addEventListener('click', () => {
  const owner = blocksForScope();
  const { rows, ignored } = parseSchedule(byId('commitments').value, weekStart, owner !== settings);
  if (ignored.length || !rows.length) {
    byId('import-status').textContent =
      'Check the time blocks. Enter one weekday and time range per line, then apply.';
    return;
  }
  owner.commitments = rows;
  if (owner !== settings) settings.weeks[dateKey(weekStart)] = owner;
  saveSettings();
  render();
  byId('import-status').textContent =
    `Applied ${rows.length} time blocks. Check the weekly calendar for available workout times.`;
});

byId('clear-commitments').addEventListener('click', () => {
  delete blocksForScope().commitments;
  refreshScheduleEditor();
  saveSettings();
  render();
  byId('import-status').textContent = 'Schedule cleared for this scope.';
});

async function readPdf(file) {
  const origin = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/legacy/build/';
  const pdf = await import(origin + 'pdf.mjs');
  pdf.GlobalWorkerOptions.workerSrc = origin + 'pdf.worker.mjs';
  const task = pdf.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useWasm: false });
  try {
    const document = await task.promise;
    if (document.numPages > 25) throw new Error('Use a PDF with 25 pages or fewer.');
    const lines = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const rows = [];
      for (const item of content.items) {
        if (!item.str?.trim()) continue;
        const x = item.transform[4];
        const y = item.transform[5];
        const row = rows.find((row) => Math.abs(row.y - y) < 3);
        if (row) row.items.push({ x, text: item.str });
        else rows.push({ y, items: [{ x, text: item.str }] });
      }
      for (const row of rows.sort((a, b) => b.y - a.y)) {
        lines.push(
          row.items
            .sort((a, b) => a.x - b.x)
            .map((item) => item.text)
            .join(' ')
        );
      }
    }
    if (!lines.length)
      throw new Error(
        'This PDF has no selectable text. Import a calendar export or enter the times below.'
      );
    return lines.join('\n');
  } finally {
    await task.destroy();
  }
}

async function readCalendar(text, week) {
  const { default: ICAL } = await import('https://cdn.jsdelivr.net/npm/ical.js@2.2.1/dist/ical.js');
  const calendar = new ICAL.Component(ICAL.parse(text));
  for (const zone of calendar.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(zone);
  const events = calendar
    .getAllSubcomponents('vevent')
    .map((component) => new ICAL.Event(component));
  const last = addDays(week, 7);
  last.setHours(0, 0, 0, 0);
  const rows = [];
  const addOccurrence = ({ item, startDate, endDate }) => {
    if (
      item.component.getFirstPropertyValue('status') === 'CANCELLED' ||
      item.component.getFirstPropertyValue('transp') === 'TRANSPARENT'
    )
      return;
    if (
      ['dtstart', 'dtend'].some((name) => {
        const tz = item.component.getFirstProperty(name)?.getParameter('tzid');
        return tz && !ICAL.TimezoneService.has(tz);
      })
    )
      throw new Error(
        'Calendar time zone definitions are missing. Export with time zones or enter those times manually.'
      );
    const start = startDate.toJSDate();
    const end = endDate.toJSDate();
    if (end <= start) return;
    for (let day = 0; day < 7; day++) {
      const midnight = addDays(week, day);
      midnight.setHours(0, 0, 0, 0);
      const boundary = addDays(week, day + 1);
      boundary.setHours(0, 0, 0, 0);
      if (start >= boundary || end <= midnight) continue;
      rows.push({
        day,
        start: start <= midnight ? 0 : start.getHours() * 60 + start.getMinutes(),
        end: end >= boundary ? 1440 : end.getHours() * 60 + end.getMinutes(),
        label: (item.summary || '').replace(/\s+/g, ' ').slice(0, 100)
      });
    }
  };
  for (const event of events.filter((event) => !event.isRecurrenceException())) {
    if (!event.isRecurring()) {
      addOccurrence({ item: event, startDate: event.startDate, endDate: event.endDate });
      continue;
    }
    events
      .filter((other) => other.isRecurrenceException() && other.uid === event.uid)
      .forEach((exception) => event.relateException(exception));
    const iterator = event.iterator();
    for (let count = 0; count <= 10000; count++) {
      const occurrence = iterator.next();
      if (!occurrence || occurrence.toJSDate() >= last) break;
      if (count === 10000)
        throw new Error('This calendar has too many recurrences. Export a shorter date range.');
      addOccurrence(event.getOccurrenceDetails(occurrence));
    }
  }
  return scheduleLines(rows);
}

byId('schedule-file').addEventListener('change', async (event) => {
  const input = event.target;
  const week = weekStart;
  const owner = blocksForScope();
  const editor = byId('commitments');
  const initialText = editor.value;
  const files = [...input.files];
  input.disabled = true;
  byId('import-status').textContent = 'Reading your schedule…';
  const raw = [];
  const messages = [];
  const merged = [];
  try {
    for (const file of files) {
      try {
        if (file.size > 12 * 1024 * 1024) throw new Error('Use a file under 12 MB.');
        const extension = file.name.split('.').at(-1).toLowerCase();
        let text;
        if (extension === 'pdf') text = await readPdf(file);
        else if (extension === 'ics') {
          if (owner === settings)
            throw new Error('Choose Displayed week for a dated calendar export.');
          text = await readCalendar(await file.text(), week);
        } else if (extension === 'csv' || extension === 'txt') text = await file.text();
        else throw new Error('Use a PDF, ICS, CSV, or TXT file.');
        const { rows, ignored } = parseSchedule(text, week, owner !== settings);
        merged.push(...rows);
        if (text) raw.push(text);
        if (!rows.length) messages.push(`${file.name}: no time blocks recognized for this scope.`);
        else if (ignored.length)
          messages.push(`${file.name}: review extracted text for unmatched entries.`);
      } catch (error) {
        messages.push(`${file.name}: ${error.message}`);
      }
    }
    if (
      week !== weekStart ||
      editor.value !== initialText ||
      (owner === settings) !== (blocksForScope() === settings)
    ) {
      byId('import-status').textContent =
        'The week, scope, or review text changed. Select the files again.';
      return;
    }
    const unique = [...new Map(merged.map((block) => [JSON.stringify(block), block])).values()];
    const proposed = scheduleLines(unique.sort((a, b) => a.day - b.day || a.start - b.start));
    if (proposed) editor.value = [initialText, proposed].filter(Boolean).join('\n');
    byId('import-raw').textContent = raw.join('\n\n');
    byId('import-text').hidden = !raw.length;
    byId('schedule-review').open = true;
    byId('import-status').textContent = [
      unique.length
        ? `Found ${unique.length} time blocks. Review them, then apply.`
        : 'Enter or correct the time blocks below.',
      ...messages
    ].join(' ');
  } finally {
    input.value = '';
    input.disabled = false;
  }
});

for (const id of ['previous', 'next', 'today']) {
  byId(id).addEventListener('click', () => {
    refreshScheduleEditor();
    byId('import-status').textContent = '';
  });
}
refreshScheduleEditor();

async function loadClubCalendar() {
  const status = byId('club-refresh-status');
  const button = byId('refresh-clubs');
  button.disabled = true;
  try {
    const response = await fetch('club-calendar.json', { cache: 'no-cache' }).catch(() => null);
    const feed = response?.ok
      ? response
      : await fetch(
          'https://raw.githubusercontent.com/JoshLee08/kyorugi-weekly-planner/main/club-calendar.json',
          { cache: 'no-cache' }
        );
    if (!feed.ok) throw new Error('Calendar feed unavailable');
    publishedClubs = (await feed.json()).clubs;
    render();
    status.textContent = 'Published club calendar loaded.';
  } catch {
    status.textContent =
      'Could not load published club schedules. Coach-entered schedules are available.';
  } finally {
    button.disabled = false;
  }
}

byId('refresh-clubs').addEventListener('click', loadClubCalendar);
loadClubCalendar();
