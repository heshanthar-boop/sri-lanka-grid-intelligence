import datetime as dt, gzip, importlib.util, json, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/f'{name}.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
ingest=load('ingest');portal=load('portal')
class Tests(unittest.TestCase):
 def test_real_workbook_rejects_date_conflicts(self):
  path=next((ROOT/'archive/raw').glob('*.xlsx'));days,issues=ingest.parse(path,ingest.SEED)
  self.assertEqual([x['date'] for x in days],['2025-03-18']);self.assertEqual(len(issues),17)
  self.assertEqual(len(days[0]['total']),96);self.assertEqual(days[0]['plants']['Nlax'][0],39)
 def test_real_api_raw_and_timezone(self):
  d=json.loads((ROOT/'data/days/2026-11-25.json').read_text())
  raw=json.loads(gzip.decompress((ROOT/'archive/api'/d['raw_file']).read_bytes()))['data']
  meta=json.loads(gzip.decompress((ROOT/'archive/api'/d['metadata_file']).read_bytes()))['data']
  regenerated=portal.parse(d['date'],raw,meta,d['source_url'],(d['raw_file'],d['sha256']),(d['metadata_file'],d['metadata_sha256']))
  self.assertEqual(d,regenerated);self.assertEqual(len(d['total']),96);self.assertIn('Storage (net)',d['groups'])
  self.assertLess(min(d['groups']['Storage (net)']),0)
 def test_missing_observation_rejected(self):
  d=json.loads((ROOT/'data/days/2026-11-25.json').read_text());raw=json.loads(gzip.decompress((ROOT/'archive/api'/d['raw_file']).read_bytes()))['data'];meta=json.loads(gzip.decompress((ROOT/'archive/api'/d['metadata_file']).read_bytes()))['data']
  with self.assertRaisesRegex(ValueError,'Incomplete plant'):portal.parse(d['date'],raw[1:],meta,'x',('x','x'),('y','y'))
 def test_duplicate_rejected(self):
  d=json.loads((ROOT/'data/days/2026-11-25.json').read_text());raw=json.loads(gzip.decompress((ROOT/'archive/api'/d['raw_file']).read_bytes()))['data'];meta=json.loads(gzip.decompress((ROOT/'archive/api'/d['metadata_file']).read_bytes()))['data']
  with self.assertRaisesRegex(ValueError,'Duplicate'):portal.parse(d['date'],raw+[raw[0]],meta,'x',('x','x'),('y','y'))
if __name__=='__main__':unittest.main()
