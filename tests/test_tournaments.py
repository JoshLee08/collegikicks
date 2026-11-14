import unittest
from datetime import date
from unittest.mock import patch
from backend import tournaments as service


class TournamentsTest(unittest.TestCase):
    def setUp(self):
        service._cached = None
        service._expires = 0

    def test_normalize_deduplicates_and_rejects_invalid_dates(self):
        event = dict(title='Open', start='2026-11-14', end='2026-11-15')
        clubs = {'a': dict(source='https://example.com', events=[event, dict(event, start='bad')]),
                 'b': dict(source='https://example.org', events=[event])}
        self.assertEqual(len(service.normalize(clubs)), 1)

    def test_outage_falls_back_and_cache_avoids_refetch(self):
        with patch.object(service, 'fetch_source', side_effect=OSError('offline')) as fetch:
            result = service.discover(date(2026, 11, 14))
            self.assertTrue(result['stale'])
            self.assertTrue(result['events'])
            self.assertTrue(all(e['end'] >= '2026-11-14' for e in result['events']))
            service.discover(date(2026, 11, 14))
            self.assertEqual(fetch.call_count, 2)

    def test_live_data_survives_later_outage(self):
        event = dict(title='Live Open', start='2027-01-01', end='2027-01-03')
        with patch.object(service, 'fetch_source', return_value=[event]):
            result = service.discover(date(2027, 1, 2))
            self.assertFalse(result['stale'])
            self.assertEqual(len(result['events']), 1)
        service._expires = 0
        with patch.object(service, 'fetch_source', side_effect=OSError('offline')):
            self.assertEqual(service.discover(date(2027, 1, 2))['events'][0]['title'], 'Live Open')
            self.assertEqual(service.discover(date(2027, 1, 4))['events'], [])


if __name__ == '__main__':
    unittest.main()
