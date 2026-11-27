import datetime as dt, importlib.util, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('backfill',ROOT/'scripts/backfill.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class BackfillTests(unittest.TestCase):
 def test_local_midnight_belongs_to_previous_reporting_day(self):
  rows=[{'reportTimestamp':'2026-10-31T18:45:00.000Z'},{'reportTimestamp':'2026-11-01T18:30:00.000Z'},{'reportTimestamp':'2026-11-01T18:45:00.000Z'}]
  groups=m.split_records(rows,dt.date(2026,11,1),dt.date(2026,11,2));self.assertEqual(len(groups[dt.date(2026,11,1)]),2);self.assertEqual(len(groups[dt.date(2026,11,2)]),1)
 def test_out_of_batch_timestamp_is_rejected(self):
  with self.assertRaisesRegex(ValueError,'outside'):m.split_records([{'reportTimestamp':'2026-10-30T00:00:00.000Z'}],dt.date(2026,11,1),dt.date(2026,11,2))
 def test_request_uses_sri_lankan_day_boundaries(self):
  self.assertIn('2026-10-31T18%3A45%3A00.000Z',m.batch_url(dt.date(2026,11,1),dt.date(2026,11,7)))
if __name__=='__main__':unittest.main()
class CircuitBreakerTests(unittest.TestCase):
 def test_stops_after_network_failure_and_preserves_report(self):
  import tempfile,urllib.error
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);(root/'archive').mkdir();(root/'data'/'days').mkdir(parents=True)
   calls=[]
   def fake_get(url):
    calls.append(url)
    if len(calls)==1:return b'{}',[]
    raise urllib.error.URLError('offline')
   with patch.object(m,'ROOT',root),patch.object(m.portal,'get',side_effect=fake_get),patch.object(m.portal,'store',return_value=('meta.gz','hash')),patch.object(m.time,'sleep',return_value=None):
    n=m.run(dt.date(2026,1,1),dt.date(2026,1,21),1,3,True)
   self.assertEqual(n,7);self.assertEqual(len(calls),3)
   report=__import__('json').loads((root/'archive'/'backfill-last-run.json').read_text());self.assertEqual(report['batches_completed'],1);self.assertEqual(report['batches_total'],3)
