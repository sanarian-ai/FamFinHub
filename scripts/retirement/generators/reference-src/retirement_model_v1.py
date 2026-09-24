"""Step 8: deterministic funded check + Monte Carlo on top of retirement_model_v0 expense schedule."""
import numpy as np
from retirement_model_v0 import run
L=1e5; CR=1e7
REAL_G=1.08/1.06-1
def real_components():
    _,_,rows=run(cpi=0.0,med=REAL_G,edu=REAL_G)   # real (today's-money) components by year
    return {Y:c for Y,c in rows}
RC=real_components()
RS={Y:sum(c.values()) for Y,c in RC.items()}
def spend_split(Y,flex_cut=0.0):
    c=RC[Y]
    infl=sum(v for k,v in c.items() if k not in ('Insurance','EMI'))-flex_cut*c.get('Flexible',0.0)
    flat=c.get('Insurance',0.0)+c.get('EMI',0.0)   # nominal-flat items
    return infl,flat
def spend(Y,flex_cut=0.0,idx=1.0):
    a,b=spend_split(Y,flex_cut); return a*idx+b
YEARS=sorted(RS)
def assets_flows(esop_year=2028, esop_h=0.0, ria_stop=2042, sang_net=0.0, sang_from=2028, sang_to=2040):
    """nominal non-portfolio flows by year (excl. expenses)"""
    f={Y:0.0 for Y in YEARS}
    for Y in YEARS:
        if Y>=2027:
            if Y<=ria_stop: f[Y]+=37.3*L*(1.05)**(Y-2026)
            f[Y]+=3.4*L*(1.06)**(Y-2026)          # rent on retained 0.5 Cr real estate
    if sang_net:
        for Y in YEARS:
            if sang_from<=Y<=sang_to: f[Y]+=sang_net*(1.05)**(Y-2026)
    f[2026]+=37.3*L*0.25+3.4*L*0.25          # Ria net salary + rent for Oct-Dec 2026
    f[2026]+=1.5*CR                                # net sale proceeds
    f[2042]+=0.69*CR*(1.07)**16                    # EPF+NPS accrues, accessible at 58
    if esop_year: f[esop_year]+=12.6*CR*(1-esop_h)
    return f
def deterministic(r=0.08,cpi=0.06,flex_cut=0.0,**kw):
    f=assets_flows(**kw); P=7.55*CR; out=[]
    idx=1.0
    for Y in YEARS:
        mid=2026.875 if Y==2026 else Y+0.5
        idx=(1+cpi)**(mid-2026.2)
        flow=f[Y]-spend(Y,flex_cut,idx)
        P=P*((1+r)**(0.25 if Y==2026 else 1))+flow*(1+r)**(0.125 if Y==2026 else 0.5)
        out.append((Y,P))
        if P<0: return Y,out
    return None,out
def mc(n=10000,sigma=0.12,mean=0.0875,flex_cut=0.0,cpi_mu=0.06,cpi_sd=0.015,seed=7,flex_guard=None,shock=None,**kw):
    rng=np.random.default_rng(seed); f=assets_flows(**kw)
    P=np.full(n,7.55*CR); alive=np.ones(n,bool); dep_year=np.full(n,9999)
    idx=np.ones(n); prev_mid=2026.2; peak_real=None
    for i,Y in enumerate(YEARS):
        yrs=0.25 if Y==2026 else 1.0
        mid=2026.875 if Y==2026 else Y+0.5
        pi=np.clip(rng.normal(cpi_mu,cpi_sd,n),0.0,0.15)
        idx=idx*(1+pi)**(mid-prev_mid) if i==0 else idx*(1+pi)
        prev_mid=mid
        exp=spend(Y,flex_cut,idx)
        if flex_guard:   # cut 30% of spend when portfolio < guard * annual expense
            cut=(P<flex_guard*exp)
            exp=np.where(cut,exp*0.85,exp)   # 30% of flexible ~ 15% of total
        z=rng.normal(np.log(1+mean)-sigma**2/2,sigma,n)
        if shock and Y in shock: z=np.full(n,np.log(1+shock[Y]))
        R=np.exp(z*yrs)-1
        flow=f[Y]-exp
        P=P*(1+R)+flow*(1+R)**0.5
        newly=(P<0)&alive
        dep_year[newly]=Y; alive&=~newly
        P=np.where(alive,P,0.0)
    return alive.mean(),dep_year,P/idx
if __name__=="__main__":
    print(deterministic()[0])
