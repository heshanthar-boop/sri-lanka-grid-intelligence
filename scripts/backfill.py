#!/usr/bin/env python3
"""Backfill public PUCSL dispatch in small batches, preserving raw data and gaps."""
import argparse, concurrent.futures, datetime as dt, json, sys, time, urllib.parse
from collections import defaultdict
from pathlib import Path
import portal
ROOT=portal.ROOT

def fmt(value):
    return value.astimezone(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')

def batches(start,end):
    result=[]
    while end>=start:
        first=max(start,end-dt.timedelta(days=6))
        missing=[first+dt.timedelta(days=i) for i in range((end-first).days+1) if not (ROOT/'data/days'/f'{first+dt.timedelta(days=i)}.json').exists()]
        if missing:result.append((first,end,missing))
        end=first-dt.timedelta(days=1)
    return result

def batch_url(first,last):
    begin=dt.datetime.combine(first,dt.time(),portal.TZ)+dt.timedelta(minutes=15)
    end=dt.datetime.combine(last+dt.timedelta(days=1),dt.time(),portal.TZ)
    return portal.BASE+'/api/actual-system-dispatch?'+urllib.parse.urlencode({'dateAggregation':'15min','from':fmt(begin),'to':fmt(end)})

def download(job):
    first,last,_=job;url=batch_url(first,last)
    for attempt in range(2):
        try:
            raw,records=portal.get(url);return url,raw,records
        except Exception:
            if attempt:raise
            time.sleep(5)

def split_records(records,first,last):
    by_day=defaultdict(list)
    for row in records:
        stamp=dt.datetime.fromisoformat(row['reportTimestamp'].replace('Z','+00:00'))
        if stamp.tzinfo is None:raise ValueError('Timestamp lacks timezone')
        day=(stamp.astimezone(portal.TZ)-dt.timedelta(microseconds=1)).date()
        if day<first or day>last:raise ValueError('Timestamp outside requested batch')
        by_day[day].append(row)
    return by_day

def write_index():
    dates=sorted(x.stem for x in (ROOT/'data/days').glob('????-??-??.json'))
    (ROOT/'data/index.json').write_text(json.dumps({'dates':dates},indent=2),encoding='utf-8')

def run(start,end,workers,max_batches=None,stop_on_network_error=False,rotate_by_day=False):
    metadata,meta=portal.get(portal.BASE+'/api/metadata/power-plants');mr=portal.store(metadata,'metadata')
    jobs=batches(start,end)
    if rotate_by_day and jobs:
        offset=dt.datetime.now(portal.TZ).date().toordinal()%len(jobs);jobs=jobs[offset:]+jobs[:offset]
    jobs=jobs[:max_batches] if max_batches else jobs;accepted=[];errors=[];completed=0
    print(f'Checking {len(jobs)} batches from {start} to {end} using up to {workers} requests.',flush=True)
    def save_report():
        report={'checked_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'requested_start':start.isoformat(),'requested_end':end.isoformat(),'batches_completed':completed,'batches_total':len(jobs),'accepted':accepted,'errors':errors}
        path=ROOT/'archive/backfill-last-run.json';temp=path.with_suffix('.tmp');temp.write_text(json.dumps(report,indent=2),encoding='utf-8');temp.replace(path);write_index()
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        pending={};queue=iter(jobs);stopped=False
        def submit_next():
            try:job=next(queue)
            except StopIteration:return
            pending[pool.submit(download,job)]=job
        for _ in range(workers):submit_next()
        while pending:
            done,_=concurrent.futures.wait(pending,return_when=concurrent.futures.FIRST_COMPLETED)
            for future in done:
                first,last,missing=pending.pop(future)
                try:
                    url,raw,records=future.result();rr=portal.store(raw,f'batch-{first}-{last}');grouped=split_records(records,first,last)
                    for day in missing:
                        date=day.isoformat();out=ROOT/'data/days'/f'{date}.json'
                        try:
                            data=portal.parse(date,grouped.get(day,[]),meta,url,rr,mr)
                            if out.exists():continue
                            out.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8');accepted.append(date)
                        except Exception as exc:errors.append({'date':date,'reason':str(exc),'raw':rr[0]})
                except Exception as exc:
                    errors.extend({'date':day.isoformat(),'reason':'Batch request: '+str(exc)} for day in missing)
                    if stop_on_network_error:stopped=True
                completed+=1;save_report();print(f'{completed}/{len(jobs)} batches; {len(accepted)} accepted; {len(errors)} rejected/unavailable.',flush=True)
                if not stopped:submit_next()
        if stopped:print('Stopped requesting older batches after a source error; future runs can retry.',flush=True)
    if not jobs:save_report()
    return len(errors)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--start',required=True);ap.add_argument('--end',required=True);ap.add_argument('--workers',type=int,default=1,choices=(1,2,3));ap.add_argument('--max-batches',type=int);ap.add_argument('--stop-on-network-error',action='store_true');ap.add_argument('--rotate-by-day',action='store_true');args=ap.parse_args()
    start=dt.date.fromisoformat(args.start);end=dt.date.fromisoformat(args.end)
    if start>end:ap.error('start must not be after end')
    if args.max_batches is not None and args.max_batches<1:ap.error('max-batches must be positive')
    try:errors=run(start,end,args.workers,args.max_batches,args.stop_on_network_error,args.rotate_by_day)
    except Exception as exc:print('Backfill failed:',exc,file=sys.stderr);return 1
    return 1 if errors else 0
if __name__=='__main__':sys.exit(main())
