"""Bounded, cached discovery from official college competition calendars."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from threading import Lock
from time import monotonic
from urllib.request import Request, urlopen
import json

from tools.refresh_clubs import FEED, SOURCES, Page, competitions

_lock = Lock()
_cached = None
_expires = 0


def normalize(clubs):
    events = {}
    for club in clubs.values():
        for row in club.get('events', []):
            try:
                start, end = date.fromisoformat(row['start']), date.fromisoformat(row['end'])
                title = row['title'].strip()
                if end < start or not title or not club['source'].startswith('https://'):
                    continue
                key = start.isoformat() + ':' + ' '.join(title.lower().split())
                events.setdefault(key, dict(row, id=key, source=club['source'], checked=club.get('eventsChecked')))
            except (KeyError, TypeError, ValueError, AttributeError):
                continue
    return sorted(events.values(), key=lambda row: (row['start'], row['title']))


def fetch_source(name):
    with urlopen(Request(SOURCES[name], headers={'User-Agent': 'KyorugiPlanner/1.0'}), timeout=8) as response:
        body = response.read(8_000_001)
    if len(body) > 8_000_000:
        raise ValueError('Source too large')
    return competitions(Page(body.decode('utf-8', errors='replace')))


def discover(today=None):
    global _cached, _expires
    with _lock:
        if _cached is None or monotonic() >= _expires:
            clubs = json.loads(FEED.read_text())['clubs']
            failures = []
            checked = datetime.now(timezone.utc).isoformat()
            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = {name: executor.submit(fetch_source, name) for name in ('menlo', 'ucla')}
                for name, future in futures.items():
                    try:
                        clubs[name] = dict(source=SOURCES[name], events=future.result(), eventsChecked=checked[:10])
                    except Exception:
                        failures.append(name)
                        # Preserve the last successful live fetch during temporary outages.
                        if _cached:
                            prior = [e for e in _cached['events'] if e['source'] == SOURCES[name]]
                            if prior:
                                clubs[name] = dict(source=SOURCES[name], events=prior, eventsChecked=prior[0].get('checked'))
            _cached = dict(events=normalize(clubs), checkedAt=checked, stale=bool(failures), unavailableSources=failures)
            _expires = monotonic() + 1800
        first = (today or date.today()).isoformat()
        return dict(_cached, events=[e for e in _cached['events'] if e['end'] >= first])
