const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekdayTokens = [
  /^(?:m|mo|mon|monday)$/i, /^(?:t|tu|tue|tues|tuesday)$/i,
  /^(?:w|we|wed|wednesday)$/i, /^(?:th|r|thu|thur|thurs|thursday)$/i,
  /^(?:f|fr|fri|friday)$/i, /^(?:sa|sat|saturday)$/i, /^(?:su|sun|sunday)$/i
];
const berkeleyPractices = [
  { day: 1, start: 17 * 60, end: 24 * 60, label: 'Tuesday night', approximate: true },
  { day: 3, start: 17 * 60, end: 24 * 60, label: 'Thursday night', approximate: true },
  { day: 5, start: 0, end: 12 * 60, label: 'Saturday morning', approximate: true }
];

function teamBlocks(state) {
  return state.teams?.[state.club] ?? (state.club === 'berkeley' ? berkeleyPractices : []);
}

function clockMinutes(value, inheritedPeriod = '', allowEndOfDay = false) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = (match[3] || inheritedPeriod).toLowerCase();
  if (minute > 59 || (period && (hour < 1 || hour > 12))) return null;
  if (!period && hour > 23 && !(allowEndOfDay && hour === 24 && minute === 0)) return null;
  return period ? (hour % 12 + (period === 'pm' ? 12 : 0)) * 60 + minute : hour * 60 + minute;
}

function meetingDays(value) {
  const tokens = value.trim().split(/[\s,/]+/);
  const direct = tokens.map(token => weekdayTokens.findIndex(pattern => pattern.test(token)));
  if (direct.every(day => day >= 0)) return [...new Set(direct)];
  if (/^(?:Mo|Tu|We|Th|Fr|Sa|Su){2,}$/i.test(value)) {
    return [...new Set(value.match(/../g).map(token => weekdayTokens.findIndex(pattern => pattern.test(token))))];
  }
  if (/^[MTWRF]{2,}$/i.test(value)) {
    return [...new Set([...value.toUpperCase()].map(token => 'MTWRF'.indexOf(token)))];
  }
  if (/^TTh$/i.test(value)) return [1, 3];
  return [];
}

function parseSchedule(text, forWeek, allowDates = true) {
  const time = '\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM)?';
  const range = new RegExp(`(${time})\\s*(?:[-–—,]|\\bto\\b)\\s*(${time})`, 'i');
  const rows = [];
  const ignored = [];
  for (const line of text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
    if (/^(?:day|date)\s*[,\t]\s*start/i.test(line)) continue;
    const cleaned = line.replace(/"/g, '').replace(/\b([ap])\.m\./gi, '$1m');
    const datePrefix = /^\d{4}-\d{2}-\d{2}(?=[\s,])/.exec(cleaned)?.[0];
    const body = datePrefix ? cleaned.slice(datePrefix.length).replace(/^[\s,]+/, '') : cleaned;
    const match = range.exec(body);
    if (!match || (datePrefix && match.index !== 0)) { ignored.push(line); continue; }
    const prefix = datePrefix || body.slice(0, match.index).trim().replace(/[,\t]+$/, '');
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(prefix) ? new Date(`${prefix}T12:00:00`) : null;
    if (iso && (!allowDates || !Number.isFinite(iso.getTime()) || dateKey(iso) !== prefix)) { ignored.push(line); continue; }
    if (iso && Number.isFinite(iso.getTime()) && dateKey(iso) === prefix && monday(iso).getTime() !== forWeek.getTime()) {
      ignored.push(line);
      continue;
    }
    let daysFound = iso ? [(iso.getDay() + 6) % 7] : meetingDays(prefix);
    let leadingLabel = '';
    if (!iso && !daysFound.length) {
      const trailingDay = /\s+([a-z]+)$/i.exec(prefix);
      if (trailingDay) {
        daysFound = meetingDays(trailingDay[1]);
        leadingLabel = prefix.slice(0, trailingDay.index).trim();
      }
    }
    const endPeriod = /([ap]m)\s*$/i.exec(match[2])?.[1] || '';
    let start = clockMinutes(match[1], /[ap]m/i.test(match[1]) || Number.parseInt(match[1], 10) > 12 ? '' : endPeriod);
    const end = clockMinutes(match[2], '', true);
    if (endPeriod.toLowerCase() === 'pm' && start >= end && !/[ap]m/i.test(match[1]) && start >= 720) start -= 720;
    if (!daysFound.length || start === null || end === null || end <= start) { ignored.push(line); continue; }
    const label = (leadingLabel || body.slice(match.index + match[0].length).replace(/^[\s,]+/, '')).slice(0, 100);
    for (const day of daysFound) rows.push({ day, start, end, label });
  }
  return { rows, ignored };
}

function printClock(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function displayTime(minutes) {
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour % 24 < 12 ? 'AM' : 'PM'}`;
}

function scheduleLines(blocks) {
  return blocks.map(({ day, start, end, label }) =>
    `${weekdayNames[day]} ${printClock(start)}–${printClock(end)}${label ? ` ${label}` : ''}`).join('\n');
}

function findWorkoutSlot(blocks, duration) {
  const earliest = 8 * 60;
  const latest = 21 * 60;
  let candidate = earliest;
  for (const block of [...blocks].sort((left, right) => left.start - right.start)) {
    if (candidate + duration <= block.start - 15) break;
    if (candidate < block.end + 15) candidate = Math.ceil((block.end + 15) / 5) * 5;
  }
  return candidate + duration <= latest ? candidate : null;
}
