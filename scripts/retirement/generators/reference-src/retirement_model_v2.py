"""v2: v1 + life-stage multipliers on core/flex sub-buckets. Base sub-bucket run-rates (Rs L/mo, LTM Sep25-Aug26).
Revised 2026-09-22 to match the ledger-derived 12-bucket structure in src/lib/retirement/defaults.ts
(home split into homeMaint/houseStaff; shopping+care merged into lifestyle; other dissolved into
houseStaff (gym) and finSvc (advisory/service fees))."""
import numpy as np, retirement_model_v1 as m
SUBS=[ # key, bucket, Rs L/mo, multipliers by stage A..E
 ("food","core",.4913,[1,.8,.7,.7,.65]),("homeMaint","core",.2243,[1,1,1,1.1,1.25]),
 ("houseStaff","core",.4877,[1,1,1,1.2,1.5]),
 ("transport","core",.1558,[1,1,.9,.7,.5]),("utilities","core",.0527,[1,1,1,1,1]),
 ("lifestyle","flex",.5417,[1,.82,.73,.57,.47]),("dining","flex",.1212,[1,1.1,1.1,.8,.5]),
 ("learning","flex",.0711,[1,.5,.3,.2,.2]),("giving","flex",.2142,[1,1.2,1,1,1]),
 ("subs","flex",.1461,[1,1.1,1,1,.9]),
 ("travel","flex",1.0206,[1,.8,1.3,.7,.2]),("finSvc","flex",.1069,[1,1,1,1,1])]
STARTS=[2031,2042,2052,2062]
def stage(Y,starts=STARTS): return sum(Y>=s for s in starts)
def factors(Y,starts=STARTS,subs=SUBS):
    i=stage(Y,starts); r={}
    for b in ("core","flex"):
        base=sum(x[2] for x in subs if x[1]==b); r[b]=sum(x[2]*x[3][i] for x in subs if x[1]==b)/base
    return r
def install(on=True,starts=STARTS,subs=SUBS):
    def spend_split(Y,flex_cut=0.0):
        c=m.RC[Y]; f=factors(Y,starts,subs) if on else {"core":1,"flex":1}
        infl=sum(v for k,v in c.items() if k not in ('Insurance','EMI','Essential core','Flexible'))
        infl+=c['Essential core']*f['core']+c['Flexible']*f['flex']*(1-flex_cut)
        return infl,c.get('Insurance',0.0)+c.get('EMI',0.0)
    m.spend_split=spend_split
if __name__=="__main__":
    out={}
    for n,kw in [('A',dict(esop_year=2028,esop_h=0)),('B',dict(esop_year=2028,esop_h=.25)),('C',dict(esop_year=2030,esop_h=.25))]:
        for on in (False,True):
            install(on)
            d,p=m.deterministic(0.08,0.06,0,**kw)
            ok,dep,P=m.mc(n=20000,**kw)
            med=int(np.median(dep[dep<9999])) if (dep<9999).any() else None
            p10=int(np.percentile(dep,10)) if (dep<9999).mean()>.1 else None
            print(n,'shift' if on else 'flat',round(ok*100,1),'det',d,'medfail',med,'p10',p10,'P2082',None if d else round(p[-1][1]/1e7,1),flush=True)
