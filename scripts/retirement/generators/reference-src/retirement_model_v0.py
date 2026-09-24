import sys
def run(r=0.08, cpi=0.06, med=0.08, edu=0.08, end_year=2082, emi_months=3, ramp=True, marriages=False, stepdown=0.0, verbose=False):
    L=1e5
    # core/flex revised 2026-09-22 to the ledger-derived totals (sum of retirement_model_v2.SUBS):
    # core 0.4913+0.2243+0.4877+0.1558+0.0527=1.4118, flex 0.5417+0.1212+0.0711+0.2142+0.1461+1.0206+0.1069=2.2218
    core=1.4118*L*12; flex=2.2218*L*12; health=0.23*L*12; ins=0.04*L*12; school=0.99*L*12
    ug=50*L; pg=100*L
    B_LIV=2026.2; B_GOAL=2026.72; VAL=2026.75
    rows=[]; pv=0; pvb={}
    def add(b,y,v,t):
        nonlocal pv
        d=v/((1+r)**t); pvb[b]=pvb.get(b,0)+d; pv+=d
    for Y in range(2026,end_year+1):
        frac=0.25 if Y==2026 else 1.0
        mid=2026.875 if Y==2026 else Y+0.5
        t=mid-VAL
        iL=(1+cpi)**(mid-B_LIV); iM=(1+med)**(mid-B_LIV); iE=(1+edu)**(mid-B_GOAL)
        sd=(1-stepdown) if Y>=2042 else 1.0
        c={}
        c['Essential core']=core*iL*frac*sd
        c['Flexible']=flex*iL*frac
        rampf=1.0
        if ramp and Y>=2044: rampf=(1.03)**min(Y-2043,15)
        c['Health']=health*iM*rampf*frac
        c['Insurance']=ins*frac if Y<=2039 else 0
        # school: full to 2030, half 2031-2035, zero after; base already incl. both kids
        sf=1.0 if Y<=2030 else (0.5 if Y<=2035 else 0.0)
        c['School & activities']=school*iE*sf*frac
        c['EMI']=2.13*L*emi_months if Y==2026 else 0
        g=0
        if 2031<=Y<=2034: g+=ug*iE
        if 2035<=Y<=2036: g+=pg*iE
        if 2036<=Y<=2039: g+=ug*iE
        if 2040<=Y<=2041: g+=pg*iE
        c['UG/PG']=g
        if marriages:
            m=0
            if Y==2039: m+=50*L*(1.05)**(Y-2026)
            if Y==2044: m+=100*L*(1.05)**(Y-2026)
            c['Marriages']=m
        for b,v in c.items():
            if v: add(b,Y,v,t)
        rows.append((Y,c))
    return pv,pvb,rows
if __name__=="__main__":
    pv,pvb,rows=run()
    print(round(pv/1e7,2)); print({k:round(v/1e7,2) for k,v in pvb.items()})
