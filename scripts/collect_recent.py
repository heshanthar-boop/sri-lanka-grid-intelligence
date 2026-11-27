#!/usr/bin/env python3
"""Collect recent days and gradually repair gaps over the past year."""
import datetime as dt,json,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];tz=dt.timezone(dt.timedelta(hours=5,minutes=30));today=dt.datetime.now(tz).date()
recent=[today-dt.timedelta(days=n) for n in range(1,8) if not (root/'data/days'/f'{(today-dt.timedelta(days=n)).isoformat()}.json').exists()]
result=0
if recent:
 cmd=[sys.executable,str(root/'scripts/portal.py'),'--stop-on-source-error']
 for day in recent:cmd+=['--date',day.isoformat()]
 print('Checking recent:',', '.join(d.isoformat() for d in recent),flush=True)
 result=subprocess.call(cmd,cwd=root)
 try:errors=json.loads((root/'archive/api-last-run.json').read_text(encoding='utf-8'))['errors']
 except (OSError,ValueError,KeyError):sys.exit(1)
 if any(any(word in e.get('reason','').lower() for word in ('http error','timed out','urlopen error','metadata fetch failed','connection')) for e in errors):
  print('Source unavailable; postponing historical requests until the next run.',flush=True);sys.exit(1)
else:print('Recent seven dates are archived.',flush=True)
# Work backwards from eight days ago. At most three 7-day batches per run.
start=today-dt.timedelta(days=365);end=today-dt.timedelta(days=8)
print('Checking older gaps in the past year.',flush=True)
rc=subprocess.call([sys.executable,str(root/'scripts/backfill.py'),'--start',start.isoformat(),'--end',end.isoformat(),'--workers','1','--max-batches','3','--stop-on-network-error','--rotate-by-day'],cwd=root)
sys.exit(1 if result or rc else 0)
