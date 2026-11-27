#!/usr/bin/env python3
"""Download and conservatively parse PUCSL monthly dispatch workbooks."""
import argparse, datetime as dt, hashlib, json, re, sys, urllib.parse, urllib.request
from pathlib import Path
from html.parser import HTMLParser
import openpyxl
ROOT=Path(__file__).resolve().parents[1]
INDEX='https://www.pucsl.gov.lk/daily-generation-reports-2/'
SEED='https://www.pucsl.gov.lk/wp-content/uploads/2025/03/15-Minutes-Report-Mar-2025-_web-upload-2.xlsx'
GROUPS={'coal':'Coal','oil- ceb owned':'Oil (CEB)','oil-ipp owned':'Oil (IPP)','major hydro':'Major hydro','wind':'Wind','solar':'Solar','biomass':'Biomass','mini hydro':'Mini hydro'}
def digest(data): return hashlib.sha256(data).hexdigest()
def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'SLGI research archive/1.0 (public PUCSL data)'})
    with urllib.request.urlopen(req,timeout=60) as r:
        data=r.read(30_000_001)
        if len(data)>30_000_000: raise ValueError('File exceeds 30 MB limit')
        return data
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.urls=[]
    def handle_starttag(self,tag,attrs):
        if tag=='a':
            href=dict(attrs).get('href',''); url=urllib.parse.urljoin(INDEX,href); p=urllib.parse.urlparse(url)
            if p.scheme=='https' and p.hostname in ('www.pucsl.gov.lk','pucsl.gov.lk') and p.path.lower().endswith('.xlsx') and re.search(r'15.?min',p.path,re.I): self.urls.append(url)
def date_text(v):
    if isinstance(v,(dt.datetime,dt.date)): return v.strftime('%Y-%m-%d')
    if isinstance(v,str):
        try: return dt.datetime.strptime(v.strip(),'%d-%m-%Y').date().isoformat()
        except ValueError: pass
    return None
def time_minutes(v):
    if isinstance(v,(dt.datetime,dt.time)): return v.hour*60+v.minute
    if isinstance(v,str):
        m=re.fullmatch(r'\s*(\d{1,2}):(\d{2})\s*',v)
        if m:return int(m[1])*60+int(m[2])
    return None
def parse(path,url):
    raw=path.read_bytes(); sha=digest(raw); w=openpyxl.load_workbook(path,read_only=True,data_only=True)
    days=[]; issues=[]
    for s in w:
        date=date_text(s.title)
        if not date: continue
        header=date_text(s.cell(1,9).value)
        if header!=date:
            issues.append({'sheet':s.title,'reason':f'sheet date {date} differs from or lacks printed date {header}'}); continue
        rows=list(s.iter_rows(values_only=True))
        if len(rows)<3 or str(rows[1][0]).strip().lower()!='time':
            issues.append({'sheet':s.title,'reason':'unrecognized layout'}); continue
        times=[time_minutes(x) for x in rows[1][1:97]]
        if times!=list(range(15,1440,15))+[0]:
            issues.append({'sheet':s.title,'reason':'expected 96 quarter-hour labels ending at 00:00'});continue
        group_index=next((i for i,r in enumerate(rows[2:],2) if str(r[0]).strip().lower()=='time'),None)
        if group_index is None: issues.append({'sheet':s.title,'reason':'source mix section missing'});continue
        plants={}; groups={}; invalid=[]
        def series(row):
            values=list(row[1:97])
            if len(values)!=96 or any(isinstance(x,bool) or not isinstance(x,(int,float)) for x in values): return None
            if any(not (-50<=x<=10000) for x in values): return None
            return values
        for r in rows[2:group_index]:
            name=str(r[0] or '').strip()
            if not name or name.lower().startswith('total'):continue
            v=series(r)
            if v is None: invalid.append(name)
            elif name in plants: invalid.append('duplicate '+name)
            else: plants[name]=v
        for r in rows[group_index+1:]:
            name=str(r[0] or '').strip().lower()
            if name in GROUPS:
                v=series(r)
                if v is None: invalid.append(name)
                elif GROUPS[name] in groups: invalid.append('duplicate '+name)
                else:groups[GROUPS[name]]=v
        if set(groups)!=set(GROUPS.values()) or invalid:
            issues.append({'sheet':s.title,'reason':'missing/invalid series: '+', '.join(sorted((set(GROUPS.values())-set(groups))|set(invalid)))});continue
        totalrow=next((r for r in rows[2:group_index] if str(r[0] or '').strip().lower().startswith('total mw')),None)
        reported=series(totalrow) if totalrow else None
        if not reported or any(abs(sum(g[i] for g in groups.values())-reported[i])>5 for i in range(96)):
            issues.append({'sheet':s.title,'reason':'source totals missing or do not reconcile within 5 MW'}); continue
        days.append({'date':date,'source_url':url,'raw_file':path.name,'sha256':sha,'sheet':s.title,'time_basis':'Reported labels 00:15–00:00; treated as interval endings for analysis; averaging semantics unverified.', 'groups':groups,'plants':plants,'total':reported})
    return days,issues
def main():
    p=argparse.ArgumentParser();p.add_argument('--discover',action='store_true',help='fetch workbook links from PUCSL index');p.add_argument('--url',action='append',default=[]);p.add_argument('--local',help='parse a local workbook');p.add_argument('--source-url',default=SEED);args=p.parse_args()
    urls=list(args.url)
    if args.discover:
        h=Links();h.feed(fetch(INDEX).decode('utf-8','replace'));urls+=h.urls
    inputs=[]
    if args.local: inputs.append((Path(args.local),args.source_url))
    errors=[]
    for url in dict.fromkeys(urls):
        try:
            u=urllib.parse.urlparse(url)
            if u.scheme!='https' or u.hostname not in ('www.pucsl.gov.lk','pucsl.gov.lk') or not u.path.lower().endswith('.xlsx'): raise ValueError('Only official PUCSL HTTPS xlsx files are allowed')
            data=fetch(url); name=Path(urllib.parse.unquote(u.path)).name; dest=ROOT/'archive/raw'/name
            if dest.exists() and dest.read_bytes()!=data: raise ValueError('Raw filename exists with different content; refusing overwrite: '+name)
            dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);inputs.append((dest,url))
        except Exception as e: errors.append({'source':url,'reason':str(e)})
    if not inputs and not errors: p.error('Use --discover, --url, or --local')
    reports=[]; count=0
    for path,url in inputs:
        try:
            days,issues=parse(path,url);reports.append({'source':url,'sha256':digest(path.read_bytes()),'accepted_dates':[d['date'] for d in days],'issues':issues})
            for d in days:
                out=ROOT/'data/days'/f"{d['date']}.json"; out.parent.mkdir(parents=True,exist_ok=True)
                if out.exists() and json.loads(out.read_text(encoding='utf-8'))!=d: raise ValueError('Date already exists with different content: '+d['date'])
                out.write_text(json.dumps(d,separators=(',',':')),encoding='utf-8');count+=1
        except Exception as e: errors.append({'source':url,'reason':str(e)})
    dates=sorted(x.stem for x in (ROOT/'data/days').glob('????-??-??.json'))
    (ROOT/'data/index.json').write_text(json.dumps({'dates':dates},indent=2),encoding='utf-8')
    report={'checked_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'reports':reports,'errors':errors}
    (ROOT/'archive/last-run.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'accepted':count,'total_dates':len(dates),'errors':errors,'quarantined_sheets':sum(len(x['issues']) for x in reports)},indent=2))
    if errors:sys.exit(1)
if __name__=='__main__': main()
