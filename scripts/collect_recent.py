#!/usr/bin/env python3
"""Collect missing recent Sri Lanka dates; failures remain visible."""
import datetime as dt,json,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];tz=dt.timezone(dt.timedelta(hours=5,minutes=30));today=dt.datetime.now(tz).date()
# Recent window tolerates publication delays. Never silently overwrite a saved day.
dates=[(today-dt.timedelta(days=n)).isoformat() for n in range(1,8)]
missing=[d for d in dates if not (root/'data/days'/f'{d}.json').exists()]
if not missing:
 print('Recent seven dates are already archived.');sys.exit(0)
cmd=[sys.executable,str(root/'scripts/portal.py')]
for d in missing:cmd+=['--date',d]
sys.exit(subprocess.call(cmd,cwd=root))
