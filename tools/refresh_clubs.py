"""Refresh the public club calendar. Usage: python3 tools/refresh_clubs.py."""
import argparse
from datetime import date, datetime
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
FEED = ROOT / "club-calendar.json"
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
SOURCES = {
    "fresno": "https://engage.fresnostate.edu/organization/fresno-state-taekwondo",
    "menlo": "https://menloathletics.com/sports/taekwondo/schedule",
    "usc": "https://sites.google.com/usc.edu/usctkd/home?pli=1&authuser=0",
    "ucsd": "https://ucsdtkd3.wixsite.com/ucsdtkd/blank-page",
    "ucla": "https://uclaclubsports.com/sports/taekwondo/schedule",
    "ucd": "https://sites.google.com/view/ucdavistaekwondo/home",
    "uci": "https://campusrec.uci.edu/club/taekwondo.html",
}
PRACTICE_SOURCES = {
    "usc": SOURCES["usc"], "ucsd": SOURCES["ucsd"], "uci": SOURCES["uci"],
    "ucla": "https://uclaclubsports.com/sports/2015/1/5/TAEKWONDO_0105151140.aspx",
    "ucd": "https://sites.google.com/view/ucdavistaekwondo/membership",
}
FIXTURES = {"ucla": "uclaAbout", "ucd": "davisMembership"}


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.lines = []
        self.games = []
        self.hidden = 0
        self.game = None
        self.stack = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1
        classes = set(dict(attrs).get("class", "").split())
        if tag == "li" and "sidearm-schedule-game" in classes:
            self.game = {}
            self.stack = []
        if self.game is None or tag in {"area", "br", "hr", "img", "input", "link", "meta", "source", "wbr"}:
            return
        field = next((name for name in ("opponent-date", "opponent-name", "location")
                      if "sidearm-schedule-game-" + name in classes), None)
        self.stack.append((tag, field))

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)
        if self.game is not None and self.stack and tag == self.stack[-1][0]:
            self.stack.pop()
            if not self.stack:
                self.games.append(self.game)
                self.game = None

    def handle_data(self, data):
        value = " ".join(data.split())
        if self.hidden or not value:
            return
        self.lines.append(value)
        for _, field in reversed(self.stack):
            if field:
                self.game.setdefault(field, []).append(value)
                break


def minute(value, period):
    match = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", value.strip(), re.I)
    hour, mins, suffix = match.groups()
    hour, mins = int(hour), int(mins or 0)
    if not 1 <= hour <= 12 or not 0 <= mins < 60:
        raise ValueError("Invalid clock time")
    return (hour % 12 + (12 if (suffix or period).lower() == "pm" else 0)) * 60 + mins


def source_date(month_day, year):
    month, day = map(int, month_day.split("/"))
    return date(int(year), month, day).isoformat()


def practices(page, club):
    heading = {"uci": "Practice Schedule", "usc": "Practice Times", "ucsd": "come join us",
               "ucla": "John Wooden Center Blue Room", "ucd": "When:"}[club]
    start = next(i for i, line in enumerate(page.lines) if line.startswith(heading))
    excerpt = " ".join(page.lines[start:start + 14])
    pattern = re.compile(
        r"\b((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?"
        r"(?:\s*&\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?)?)"
        r"\s*:?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–—]\s*"
        r"(\d{1,2}(?::\d{2})?\s*(am|pm))\b", re.I
    )
    slots = []
    for days, first, last, period in pattern.findall(excerpt):
        begin, end = minute(first, period), minute(last, period)
        if end <= begin:
            raise ValueError("Practice must end after it starts")
        for day in re.split(r"\s*&\s*", days):
            index = WEEKDAYS.index(day.capitalize().removesuffix("s"))
            slots.append({"day": index, "start": begin, "end": end, "label": ""})
    if not slots or len(slots) > 7 or len({slot["day"] for slot in slots}) != len(slots):
        raise ValueError("Unrecognized practice schedule")
    result = {"practices": slots, "practiceSource": PRACTICE_SOURCES[club]}
    if club == "uci":
        term = re.search(r"Practice Schedule\s*[-–]\s*\w+\s+(\d{4})\s*\((\d+/\d+)\s*[-–]\s*(\d+/\d+)\)", excerpt)
        if not term:
            raise ValueError("Missing UCI term dates")
        year, first, last = term.groups()
        first_date = source_date(first, year)
        last_year = int(year) + (int(last.split("/")[0]) < int(first.split("/")[0]))
        result.update(validFrom=first_date, validTo=source_date(last, last_year))
        cancellations = re.search(r"No practice:\s*(.*?)(?:Club List|$)", excerpt)
        result["cancellations"] = [source_date(value, last_year if int(value.split("/")[0]) < int(first.split("/")[0]) else year) for value in
                                   re.findall(r"\d{1,2}/\d{1,2}", cancellations[1] if cancellations else "")]
    return result


def competitions(page):
    season = re.search(r"(20\d\d)\s*[-–]\s*(\d{2}|20\d\d)\b", page.lines[0])
    if not season or not page.games:
        raise ValueError("No dated competition rows found")
    first_year = int(season[1])
    last_year = int(season[2]) + (2000 if len(season[2]) == 2 else 0)
    if last_year != first_year + 1:
        raise ValueError("Unexpected season")
    year = first_year
    previous_month = 0

    def event_date(raw):
        nonlocal year, previous_month
        match = re.fullmatch(r"([A-Z][a-z]{2}\s+\d{1,2})\s*\(([A-Z][a-z]{2})\)", raw)
        if not match:
            raise ValueError("Unrecognized competition date")
        parsed = datetime.strptime(f"{match[1]} 2000", "%b %d %Y")
        if parsed.month < previous_month:
            year += 1
        previous_month = parsed.month
        result = date(year, parsed.month, parsed.day)
        if year > last_year or result.strftime("%a") != match[2]:
            raise ValueError(f"Competition date does not match the published weekday: {raw}")
        return result.isoformat()

    rows = []
    for game in page.games:
        title = " ".join(game.get("opponent-name", []))
        listed_dates = [value for value in game.get("opponent-date", []) if re.match(r"^[A-Z][a-z]{2} \d", value)]
        if not title or not listed_dates:
            raise ValueError("Competition is missing its title or date")
        start = event_date(listed_dates[0])
        end = event_date(listed_dates[-1]) if len(listed_dates) > 1 else start
        location = ", ".join(dict.fromkeys(game.get("location", [])))
        rows.append({"title": title, "start": start, "end": end, "location": location})
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures", type=Path, help="Read saved public pages for a repeatable demo")
    parser.add_argument("--output", type=Path, default=FEED)
    args = parser.parse_args()
    previous = json.loads(args.output.read_text()) if args.output.exists() else {}
    clubs = previous.get("clubs", {})
    checked = datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()

    def page(club, url, fixture=None):
        if args.fixtures:
            return Page((args.fixtures / f"{fixture or club}.html").read_text())
        contents = subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location",
                                   "--max-time", "20", "--max-filesize", "8000000", url],
                                  check=True, capture_output=True)
        return Page(contents.stdout.decode("utf8", errors="replace"))

    for club, source in SOURCES.items():
        entry = clubs.setdefault(club, {})
        entry["source"] = source
        if club in PRACTICE_SOURCES:
            try:
                updates = practices(page(club, PRACTICE_SOURCES[club], FIXTURES.get(club)), club)
                entry.update(updates, practiceChecked=checked)
                print(f"{club}: {len(updates['practices'])} practice blocks")
            except (OSError, ValueError, StopIteration, subprocess.CalledProcessError) as error:
                print(f"{club}: kept prior practice data ({error})")
        if club in {"menlo", "ucla"}:
            try:
                entry.update(events=competitions(page(club, source)), eventsChecked=checked)
                print(f"{club}: {len(entry['events'])} dated competitions")
            except (OSError, ValueError, subprocess.CalledProcessError) as error:
                print(f"{club}: kept prior competition data ({error})")

    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps({"clubs": clubs}, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(args.output)


if __name__ == "__main__":
    main()
