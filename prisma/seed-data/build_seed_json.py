"""
One-time ETL: reads the real 'Expense Tracking' Google Sheet export (expense.xlsx)
and produces clean JSON files for the Node/Prisma seed script.
Source tabs: Mapping (taxonomy), Transactions (ledger).
See project doc "expense-tracker-plan.md" Phase 2 (schema) and Phase 5b (migration).
"""
import json, re, hashlib, warnings, sys
from collections import defaultdict
import openpyxl

warnings.filterwarnings("ignore")

SRC = "/tmp/expense.xlsx"
OUT_DIR = "/home/claude/expense-tracker/prisma/seed-data"

# ---- Known case-mismatch categories in the raw sheet -> canonical Mapping category (Phase 1 finding) ----
CASE_FIXES = {
    "groceries": "Groceries",
    "food outside": "Food Outside",
    "Food outside": "Food Outside",
}
# Genuinely new categories found in Transactions but absent from Mapping (Phase 1 finding).
# We do NOT invent taxonomy on our own authority -- these stay flagged for the user's
# Review Queue / Mapping Admin decision, with a plausible suggestion only.
NEW_UNMAPPED_SUGGESTIONS = {
    "local commute": "Suggest new Category 'Local Commute' under Expense Type 'Vehicle & Local Travel' (Household Fixed)",
    "Mobile Phone Bill": "Suggest new Category 'Mobile Phone Bill' under Expense Type 'Utilities' (Household Fixed)",
    "Dishtv": "Suggest new Category 'Dishtv' under Expense Type 'Utilities' (Household Fixed)",
    "milk": "Suggest new Category 'Milk' under Expense Type 'Household Shopping' (Household Fixed)",
    "medicines": "Suggest new Category 'Medicines' under Expense Type 'Medical' (Medical)",
    "dry cleaning": "Suggest new Category 'Dry Cleaning' under Expense Type 'House Maintenance' (Household Fixed)",
    "maid salary": "Suggest new Category 'Maid Salary' under Expense Type 'House Staff' (Household Fixed)",
    "broadband Bill": "Suggest new Category 'Broadband Bill' under Expense Type 'Utilities' (Household Fixed)",
    "indonesia 2025": "Looks like a one-off trip tag, not a category -- suggest mapping to Category 'Vacation' or 'Travel' and using notes/description for the trip name instead",
}

# ---- Active accounts (confirmed 2026-09-02) vs everything else (historical/migration-only) ----
ACCOUNT_META = {
    "iciciSavings":     dict(holder="Sangeeth", institution="ICICI", kind="bank_debit",  active=True),
    "iciciRiaSavings":  dict(holder="Ria",      institution="ICICI", kind="bank_debit",  active=True),
    "iciciCredit":      dict(holder="Sangeeth", institution="ICICI", kind="credit_card", active=True),
    "iciciRiaCredit":   dict(holder="Ria",      institution="ICICI", kind="credit_card", active=True),
    "SBIRiaCredit":     dict(holder="Ria",      institution="SBI",   kind="credit_card", active=True),
    # everything below: historical / migration-only, per Sangeeth's confirmed active-account list
    "hdfcdiners":       dict(holder="Sangeeth", institution="HDFC",  kind="credit_card", active=False),
    "axisFKCredit":     dict(holder="Sangeeth", institution="Axis",  kind="credit_card", active=False),
    "amexPlatinum":     dict(holder="Sangeeth", institution="Amex",  kind="credit_card", active=False),
    "axisMagnusCredit": dict(holder="Sangeeth", institution="Axis",  kind="credit_card", active=False),
    "SBIODAccount":     dict(holder="Sangeeth", institution="SBI",   kind="bank_debit",  active=False),
    "amazonCredit":     dict(holder="Sangeeth", institution="ICICI", kind="credit_card", active=False),
    "SBISanCredit":     dict(holder="Sangeeth", institution="SBI",   kind="credit_card", active=False),
    "Cash":             dict(holder="Sangeeth", institution=None,   kind="cash",        active=False),
    "hdfcsavings":      dict(holder="Sangeeth", institution="HDFC",  kind="bank_debit",  active=False),
    "Ria Cash":         dict(holder="Ria",      institution=None,   kind="cash",        active=False),
    "paytm":            dict(holder="Sangeeth", institution=None,   kind="wallet",      active=False),
    "Paytm":            dict(holder="Sangeeth", institution=None,   kind="wallet",      active=False),  # normalized -> same as paytm
    "iciciRiaCredit ":  None,
    "Ria SBi Current":  dict(holder="Ria",      institution="SBI",   kind="bank_debit",  active=False),
    "SBISanSavings":    dict(holder="Sangeeth", institution="SBI",   kind="bank_debit",  active=False),
    "PhonePe":          dict(holder="Sangeeth", institution=None,   kind="wallet",      active=False),
    "NiyoGlobal":       dict(holder="Sangeeth", institution="Niyo",  kind="bank_debit",  active=False),
    "Option 1":         None,  # data-entry error in the sheet -- treat as unassigned, flag for review
}
# normalize case-duplicates to one canonical account name
ACCOUNT_NAME_NORMALIZE = {"Paytm": "paytm"}

def norm_account(raw):
    if not raw:
        return None
    raw = ACCOUNT_NAME_NORMALIZE.get(raw, raw)
    return raw

def parse_amount(val):
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        cleaned = val.strip().replace(",", "")
        if cleaned in ("", "-"):
            return None
        return float(cleaned)
    return None

def dedupe_hash(date_iso, amount, account, desc):
    # amount MUST be formatted identically to src/lib/dedupe.ts's `amount.toFixed(2)`
    # so a future Gmail-imported transaction can dedupe against a migrated historical one.
    norm_desc = re.sub(r"\s+", " ", desc.strip().lower())
    key = f"{date_iso}|{amount:.2f}|{account or ''}|{norm_desc}"
    return hashlib.sha256(key.encode()).hexdigest()

def main():
    wb = openpyxl.load_workbook(SRC, data_only=True, read_only=True)

    # ---------- Mapping tab -> nature / type / category tree ----------
    ws = wb["Mapping"]
    natures = {}   # name -> {accountType}
    types = {}     # (name, natureName) -> True
    categories = {}  # name -> {expenseType, expenseNature}
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r or not r[0] or len(r) < 4:
            continue
        cat, etype, enature, atype = r[0], r[1], r[2], r[3]
        if not (cat and etype and enature and atype):
            continue
        natures.setdefault(enature, atype)
        types[(etype, enature)] = True
        categories[cat] = {"expenseType": etype, "expenseNature": enature}

    mapping_out = {
        "natures": [{"name": n, "accountType": a} for n, a in natures.items()],
        "types": [{"name": t, "natureName": n} for (t, n) in types.keys()],
        "categories": [
            {"name": c, "expenseType": v["expenseType"], "expenseNature": v["expenseNature"]}
            for c, v in categories.items()
        ],
    }

    # ---------- Transactions tab ----------
    ws = wb["Transactions"]
    rows_out = []
    seen_hashes = defaultdict(int)
    stats = defaultdict(int)
    total_amount = 0.0

    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0] is None and r[2] is None:
            continue
        date = r[0]
        desc = r[1]
        desc = "" if desc is None else str(desc)
        amount = parse_amount(r[2])
        raw_cat = r[3]
        cal_year = r[5] if len(r) > 5 else None
        fy_year = r[6] if len(r) > 6 else None
        account_raw = r[10] if len(r) > 10 else None

        if date is None or amount is None:
            stats["skipped_no_date_or_amount"] += 1
            continue
        if not hasattr(date, "isoformat"):
            stats["skipped_bad_date"] += 1
            continue

        date_iso_full = date.isoformat()
        date_only = date_iso_full[:10]  # dedupe key uses date-only, matching src/lib/dedupe.ts
        total_amount += float(amount)
        stats["total_rows"] += 1

        # resolve category, applying known case fixes
        cat_name = raw_cat
        status = "categorized"
        suggestion_reason = None
        if cat_name in CASE_FIXES:
            stats["case_fixed"] += 1
            cat_name = CASE_FIXES[cat_name]
        if cat_name not in categories:
            status = "needs_review"
            suggestion_reason = NEW_UNMAPPED_SUGGESTIONS.get(
                raw_cat, f"Category '{raw_cat}' not found in the original Mapping tab."
            )
            stats["needs_review"] += 1
            cat_name = None

        account_name = norm_account(account_raw)
        if account_name == "Option 1":
            account_name = None
            stats["flagged_bad_account"] += 1

        h = dedupe_hash(date_only, amount, account_name, desc)
        seen_hashes[h] += 1
        if seen_hashes[h] > 1:
            h = f"{h}-dup{seen_hashes[h]}"

        rows_out.append({
            "txnDate": date_iso_full,
            "rawDescription": desc,
            "amount": amount,
            "categoryName": cat_name,
            "rawCategoryFromSheet": raw_cat,
            "accountName": account_name,
            "status": status,
            "suggestionReason": suggestion_reason,
            "legacyCalYear": int(cal_year) if isinstance(cal_year, (int, float)) else None,
            "legacyFyYear": str(fy_year) if fy_year else None,
            "dedupeHash": h,
        })

    accounts_out = []
    written = set()
    for name, meta in ACCOUNT_META.items():
        if meta is None:
            continue
        canon = ACCOUNT_NAME_NORMALIZE.get(name, name)
        if canon in written:
            continue
        written.add(canon)
        accounts_out.append({"name": canon, **meta})

    with open(f"{OUT_DIR}/mapping.json", "w") as f:
        json.dump(mapping_out, f, indent=2)
    with open(f"{OUT_DIR}/accounts.json", "w") as f:
        json.dump(accounts_out, f, indent=2)
    with open(f"{OUT_DIR}/transactions.json", "w") as f:
        json.dump(rows_out, f)

    print("natures:", len(mapping_out["natures"]))
    print("types:", len(mapping_out["types"]))
    print("categories:", len(mapping_out["categories"]))
    print("accounts:", len(accounts_out))
    print("transactions:", len(rows_out))
    print("total amount (sheet, all rows summed):", round(total_amount, 2))
    print("stats:", dict(stats))

if __name__ == "__main__":
    main()
