const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// Exercise the production scheduling and proposal functions without a browser.
const source = fs.readFileSync(path.join(root, 'schedule.js'), 'utf8') + fs.readFileSync(path.join(root, 'planner-state.js'), 'utf8') + fs.readFileSync(path.join(root, 'planner-core.js'), 'utf8') + fs.readFileSync(path.join(root, 'planner.js'), 'utf8').split("byId('course').addEventListener")[0]
  + fs.readFileSync(path.join(root, 'chat.js'), 'utf8').split("const chatMessage =")[0];
const calendarFeed = JSON.parse(fs.readFileSync(path.join(root, 'club-calendar.json'), 'utf8'));
const context = vm.createContext({ calendarFeed, Intl, Date, structuredClone, document: {}, window: { location: { search: '' } }, URLSearchParams, localStorage: { getItem: () => null }, assert });
vm.runInContext(source + `
const start = parsePlanDate('2026-11-09');
const initial = { club: 'berkeley', tournament: '', weeks: { '2026-11-09': { practice: { 1: 'moderate' } } } };
const snapshot = JSON.stringify(initial);
const change = (operation, date, value) => proposeSchedule([{ operation, date, value }], initial);
const hardTuesday = change('log_practice', '2026-11-10', 'hard');
assert.equal(planForWeek(start, hardTuesday.next).plan[2].title, 'Easy bike');
const hardSaturday = change('log_practice', '2026-11-14', 'hard');
assert.equal(planForWeek(addDays(start, 7), hardSaturday.next).plan[0].title, 'Short strength');
assert.ok(hardSaturday.notes.some(note => note.includes('November 16') && note.includes('Short strength')));
const exams = change('set_course_load', '2026-11-09', 'high');
assert.equal(planForWeek(start, exams.next).plan[2].title, 'Study & recover');
assert.equal(planForWeek(start, exams.next).plan[0].title, 'Short strength');
for (const day of [1, 3, 5]) assert.equal(planForWeek(start, exams.next).plan[day].type, 'practice');
const tournament = change('set_tournament_date', '2026-11-14', 'set');
assert.equal(planForWeek(start, tournament.next).plan[5].title, 'Tournament');
const skip = change('set_bike', '2026-11-11', 'skip');
assert.equal(planForWeek(start, skip.next).plan[2].title, 'Rest & recover');
assert.notEqual(planForWeek(addDays(start, 7), skip.next).plan[2].title, 'Rest & recover');
const unclear = interpretLocally('Saturday was rough', start, parsePlanDate('2026-11-12'));
assert.ok(unclear.question);
assert.equal(unclear.changes.length, 0);
assert.equal(interpretLocally('This Saturday was hard', start).changes.length, 1);
assert.equal(interpretLocally('Tuesday was hard, and I have two midterms this week.', start, parsePlanDate('2026-11-12')).changes.length, 2);
assert.throws(() => change('log_practice', '2026-11-11', 'hard'));
assert.throws(() => proposeSchedule([{operation:'set_course_load', date:'2026-11-09', value:'high'}, {operation:'move_practice', date:'2026-11-10', value:'skip'}], initial));
assert.equal(JSON.stringify(initial), snapshot);
const imported = parseSchedule('MWF 8:00 AM–9:15 AM Chemistry\\n2026-11-11,09:30,11:30,Lab\\nThis week', start);
assert.equal(imported.rows.length, 4);
assert.equal(imported.ignored.length, 1);
assert.equal(imported.rows[3].day, 2);
assert.equal(parseSchedule('Tue 12:00–24:00', start).rows[0].end, 1440);
assert.equal(parseSchedule('2026-11-11 09:00–12:00', start, false).rows.length, 0);
assert.equal(parseSchedule('2026-11-31 09:00–12:00', start).rows.length, 0);
assert.equal(findWorkoutSlot([{start: 480, end: 600}], 40), 615);
const otherClub = { ...initial, club:'uci', teams:{uci:[{day:0,start:600,end:720}]}, commitments: imported.rows };
assert.equal(planForWeek(start, otherClub).plan[0].type, 'practice');
assert.equal(planForWeek(start, otherClub).plan[1].title, 'Strength & power');
assert.match(planForWeek(start, otherClub).plan[2].time, /11:45 AM/);
const weekOverride = structuredClone(otherClub);
weekOverride.weeks['2026-11-09'].commitments = [{day:2,start:0,end:1440}];
assert.equal(planForWeek(start, weekOverride).plan[2].type, 'rest');
assert.equal(planForWeek(start, weekOverride).plan[3].title, 'Easy bike');
assert.equal(planForWeek(start, {...initial, club:'usc'}).plan.filter(day => day.type === 'practice').length, 0);
publishedClubs = calendarFeed.clubs;
assert.deepEqual(JSON.stringify(planForWeek(start, {...initial, club:'usc'}).team.map(block => block.day)), '[0,2,4]');
const thanksgiving = parsePlanDate('2026-11-23');
assert.deepEqual(JSON.stringify(planForWeek(thanksgiving, {...initial, club:'uci'}).team.map(block => block.day)), '[1]');
assert.equal(planForWeek(parsePlanDate('2026-12-07'), {...initial, club:'uci'}).team.length, 0);
assert.equal(planForWeek(start, {...initial, club:'menlo'}).events[0].title, 'UC Davis Fall Open');
assert.equal(planForWeek(start, {...initial, club:'ucd'}).events[0].start, '2026-11-15');
assert.equal(planForWeek(start, {...initial, club:'menlo'}).tournament, null);
assert.equal(planForWeek(start, {...initial, club:'usc', teams:{usc:[{day:3,start:600,end:720}]}}).team[0].day, 3);

const multi = { ...initial, tournaments: [
  { id:'a', title:'First', start:'2026-11-14', end:'2026-11-17' },
  { id:'b', title:'Second', start:'2026-11-19', end:'2026-11-19' }
] };
assert.equal(planForWeek(start, multi).plan[5].type, 'event');
assert.equal(planForWeek(start, multi).plan[6].type, 'event');
const nextPlan = planForWeek(addDays(start, 7), multi);
for (const index of [0, 1, 3]) assert.equal(nextPlan.plan[index].type, 'event');
assert.equal(nextPlan.plan[2].type, 'rest');
assert.equal(planForWeek(start, {...multi, tournaments:[]}).plan[5].type, 'practice');
assert.equal(selectedTournaments({...multi, tournament:'2026-12-01'}).length, 3);
assert.equal(validTournament({id:'bad',title:'Bad',start:'2026-02-30',end:'2026-03-01'}), false);
`, context);
console.log('Scheduling, clarification, cross-week preview, and failed-proposal isolation checks passed.');
