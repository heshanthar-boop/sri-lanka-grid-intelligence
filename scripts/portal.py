#!/usr/bin/env python3
"""Archive PUCSL portal observations with their metadata, failing closed on gaps."""
import argparse,datetime as dt,gzip,hashlib,json,math,sys,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; BASE='https://gendata.pucsl.gov.lk'; TZ=dt.timezone(dt.timedelta(hours=5,minutes=30))
def sha(b):return hashlib.sha256(b).hexdigest()
def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'SLGI research archive/1.0'})
    with urllib.request.urlopen(req,timeout=120) as r:
        data=r.read(30_000_001)
        if len(data)>30_000_000: raise ValueError('Response too large')
        obj=json.loads(data)
        if not isinstance(obj.get('data'),list):raise ValueError('Unexpected API response')
        return data,obj['data']
def group(name):
    n=name.lower()
    if 'bess' in n or 'storage' in n:return 'Storage (net)'
    if 'mini hydro' in n:return 'Mini hydro'
    if 'hydro' in n:return 'Major hydro'
    if 'coal' in n:return 'Coal'
    if 'oil' in n and 'ipp' in n:return 'Oil (IPP)'
    if 'oil' in n and 'ceb' in n:return 'Oil (CEB)'
    if 'wind' in n:return 'Wind'
    if 'solar' in n:return 'Solar'
    if 'biomass' in n or 'waste' in n:return 'Biomass'
    return None
def store(raw,prefix):
    folder=ROOT/'archive/api';folder.mkdir(parents=True,exist_ok=True);key=sha(raw);path=folder/(prefix+'-'+key+'.json.gz')
    if not path.exists():path.write_bytes(gzip.compress(raw,mtime=0))
    return path.name,key
def parse(date,records,meta,source,rawref,metaref):
    day=dt.date.fromisoformat(date);start=dt.datetime.combine(day,dt.time(),TZ)
    expected=[(start+dt.timedelta(minutes=15*i)).astimezone(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z') for i in range(1,97)]
    plant_meta={x['id']:x for x in meta}; data={};seen=set()
    for row in records:
        stamp=row.get('reportTimestamp');pid=row.get('powerPlantId');value=row.get('dispatchValueInMW')
        if stamp not in expected:raise ValueError('Unexpected timestamp '+str(stamp))
        if (stamp,pid) in seen:raise ValueError('Duplicate timestamp/plant')
        seen.add((stamp,pid))
        if pid not in plant_meta:raise ValueError('Unknown plant ID '+str(pid))
        if isinstance(value,bool) or not isinstance(value,(float,int)) or not math.isfinite(value) or not -10000<=value<=10000:raise ValueError('Invalid dispatch value')
        data.setdefault(pid,{})[stamp]=value
    if not data:raise ValueError('Empty API data')
    plants={};groups={}; mapping={}
    for pid,vals in data.items():
        if set(vals)!=set(expected):raise ValueError('Incomplete plant '+str(pid)+': '+str(len(vals))+'/96')
        p=plant_meta[pid];name=p['name']; et=p.get('powerPlantComplex',{}).get('energyType',{}).get('name','');g=group(et)
        if not g:raise ValueError('Unmapped energy type '+str(et))
        label=name+' [ID '+str(pid)+']';plants[label]=[vals[t] for t in expected];mapping[label]=et
        groups.setdefault(g,[0]*96)
        groups[g]=[round(a+b,4) for a,b in zip(groups[g],plants[label])]
    if not {'Major hydro','Coal','Oil (CEB)','Solar','Wind'}.issubset(groups):raise ValueError('Expected source types missing')
    return {'date':date,'source_url':source,'raw_file':rawref[0],'sha256':rawref[1],'metadata_file':metaref[0],'metadata_sha256':metaref[1], 'sheet':'PUCSL API', 'time_basis':'UTC API timestamps converted to Sri Lanka time; labels 00:15–00:00 treated as interval endings. 15-minute average semantics are unverified.', 'groups':groups,'plants':plants,'plant_categories':mapping,'total':[round(sum(g[i] for g in groups.values()),4) for i in range(96)]}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--date',action='append',required=True);args=ap.parse_args(); errors=[]; report=[]
    try:meta_raw,meta=get(BASE+'/api/metadata/power-plants');mr=store(meta_raw,'metadata')
    except Exception as e:print('Metadata fetch failed:',e);sys.exit(1)
    for date in dict.fromkeys(args.date):
        try:
            day=dt.date.fromisoformat(date);start=dt.datetime.combine(day,dt.time(),TZ)
            fmt=lambda v:v.astimezone(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
            params=urllib.parse.urlencode({'dateAggregation':'15min','from':fmt(start+dt.timedelta(minutes=15)),'to':fmt(start+dt.timedelta(days=1))})
            url=BASE+'/api/actual-system-dispatch?'+params
            raw,records=get(url);rr=store(raw,date);d=parse(date,records,meta,url,rr,mr)
            out=ROOT/'data/days'/f'{date}.json'
            if out.exists():
                old=json.loads(out.read_text(encoding='utf-8'))
                if old!=d:raise ValueError('Date already archived with different content; raw revision preserved for review')
            else:out.write_text(json.dumps(d,separators=(',',':')),encoding='utf-8')
            report.append({'date':date,'observations':len(records),'plants':len(d['plants']),'raw':rr[0]})
        except Exception as e:errors.append({'date':date,'reason':str(e)})
    dates=sorted(x.stem for x in (ROOT/'data/days').glob('????-??-??.json'))
    (ROOT/'data/index.json').write_text(json.dumps({'dates':dates},indent=2),encoding='utf-8')
    (ROOT/'archive/api-last-run.json').write_text(json.dumps({'checked_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'accepted':report,'errors':errors},indent=2),encoding='utf-8')
    print(json.dumps({'accepted':report,'errors':errors},indent=2))
    if errors:sys.exit(1)
if __name__=='__main__':main()
