"""Independent cross-check: Python v2 model (numpy) on the configuration it shares with the TS engine."""
import json, sys
sys.path.insert(0, "/home/claude")
import numpy as np
import retirement_model_v1 as m, retirement_model_v2 as v2
# Known, deliberate difference: Python v0 indexes school fees from 2026.72 (like UG/PG); the TS/JS engine indexes them
# from 2026.2 (school fees are already current-year). Align Python to the engine so the rest can be compared exactly.
F = ((1.08 / 1.06)) ** (2026.72 - 2026.2)
for Y, c in m.RC.items():
    if "School & activities" in c: c["School & activities"] *= F
out = {}
for n, kw in [("A", dict(esop_year=2028, esop_h=0)), ("B", dict(esop_year=2028, esop_h=.25)), ("C", dict(esop_year=2030, esop_h=.25))]:
    for on in (False, True):
        v2.install(on)
        d, p = m.deterministic(0.08, 0.06, 0, **kw)
        ok, dep, P = m.mc(n=40000, **kw)
        out[f"{n}_{'shift' if on else 'flat'}"] = {"depl": d, "path": [[y, v / 1e5] for y, v in p], "mc": ok * 100}
json.dump(out, open("fixtures/python-v2.json", "w"))
for k, v in out.items(): print(k, v["depl"], round(v["mc"], 2), round(v["path"][-1][1], 1))
