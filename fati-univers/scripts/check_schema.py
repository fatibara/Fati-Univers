#!/usr/bin/env python3
"""
Vérification hors-ligne du schéma Prisma de FATI UNIVERS.

Ce script n'a besoin ni d'Internet ni de Prisma. Il :
  1. analyse apps/api/prisma/schema.prisma ;
  2. vérifie les règles de relation que Prisma impose (côté opposé présent,
     relations nommées quand il y en a plusieurs, types identiques,
     références uniques, optionnalité cohérente) ;
  3. vérifie les règles propres au projet (tenantId partout, FK composites
     pour les relations obligatoires entre tables d'école, montants en Int) ;
  4. génère un DDL PostgreSQL équivalent (--ddl fichier.sql) pour tester la
     base et la Row-Level Security sur un vrai PostgreSQL.

Usage : python3 scripts/check_schema.py [--ddl out.sql]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "apps/api/prisma/schema.prisma"

SCALARS = {"String", "Int", "Boolean", "DateTime", "Json", "Decimal", "BigInt", "Float", "Bytes"}
GLOBAL_MODELS = {"User", "UserSession", "OtpCode", "Plan", "Tenant"}


def strip_comment(line):
    out, in_str = [], False
    i = 0
    while i < len(line):
        c = line[i]
        if c == '"' and (i == 0 or line[i - 1] != "\\"):
            in_str = not in_str
        if not in_str and line.startswith("//", i):
            break
        out.append(c)
        i += 1
    return "".join(out).strip()


def parse(text):
    enums, models = {}, {}
    cur, kind = None, None
    for raw in text.splitlines():
        line = strip_comment(raw)
        if not line:
            continue
        m = re.match(r"^(model|enum)\s+(\w+)\s*\{$", line)
        if m:
            kind, cur = m.group(1), m.group(2)
            if kind == "enum":
                enums[cur] = []
            else:
                models[cur] = {"fields": [], "block": []}
            continue
        if line == "}":
            cur, kind = None, None
            continue
        if cur is None:
            continue
        if kind == "enum":
            enums[cur].append(line.split()[0])
        elif line.startswith("@@"):
            models[cur]["block"].append(line)
        else:
            m = re.match(r"^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$", line)
            if not m:
                raise SystemExit(f"Ligne illisible dans {cur}: {raw!r}")
            name, typ, is_list, opt, attrs = m.groups()
            models[cur]["fields"].append(
                {"name": name, "type": typ, "list": bool(is_list), "optional": bool(opt), "attrs": attrs}
            )
    return enums, models


def list_arg(s, key):
    m = re.search(key + r"\s*:\s*\[([^\]]*)\]", s)
    return [x.strip() for x in m.group(1).split(",")] if m else None


def relation_info(f):
    m = re.search(r"@relation\(([^)]*)\)", f["attrs"])
    if not m:
        return {"name": None, "fields": None, "references": None, "onDelete": None}
    body = m.group(1)
    nm = re.match(r'\s*"([^"]+)"', body)
    od = re.search(r"onDelete\s*:\s*(\w+)", body)
    return {
        "name": nm.group(1) if nm else None,
        "fields": list_arg(body, "fields"),
        "references": list_arg(body, "references"),
        "onDelete": od.group(1) if od else None,
    }


def native(f):
    m = re.search(r"@db\.(\w+)(\([^)]*\))?", f["attrs"])
    return (m.group(1) + (m.group(2) or "")) if m else None


def unique_sets(model):
    sets = []
    for f in model["fields"]:
        if re.search(r"@id\b", f["attrs"]) or re.search(r"@unique\b", f["attrs"]):
            sets.append([f["name"]])
    for b in model["block"]:
        m = re.match(r"@@(unique|id)\(\[([^\]]*)\]", b)
        if m:
            sets.append([x.strip() for x in m.group(2).split(",")])
    return sets


def check(enums, models):
    errors = []
    field = lambda mdl, n: next((x for x in models[mdl]["fields"] if x["name"] == n), None)

    for mname, model in models.items():
        names = [f["name"] for f in model["fields"]]
        if len(names) != len(set(names)):
            errors.append(f"{mname}: champ en double")
        ids = [f for f in model["fields"] if re.search(r"@id\b", f["attrs"])]
        if not ids and not any(b.startswith("@@id") for b in model["block"]):
            errors.append(f"{mname}: pas de clé primaire")

        # Règles projet
        tf = field(mname, "tenantId")
        if mname not in GLOBAL_MODELS and tf is None:
            errors.append(f"{mname}: table métier sans tenantId")
        for f in model["fields"]:
            if f["name"].endswith("Gnf") and f["type"] != "Int":
                errors.append(f"{mname}.{f['name']}: un montant GNF doit être Int")
            if f["type"] == "Float":
                errors.append(f"{mname}.{f['name']}: Float interdit (utiliser Int ou Decimal)")
            if "@updatedAt" in f["attrs"] and f["type"] != "DateTime":
                errors.append(f"{mname}.{f['name']}: @updatedAt sur un non-DateTime")
            if f["type"] in enums:
                d = re.search(r"@default\((\w+)\)", f["attrs"])
                if d and d.group(1) not in enums[f["type"]]:
                    errors.append(f"{mname}.{f['name']}: défaut {d.group(1)} absent de l'enum {f['type']}")
            if f["type"] not in SCALARS and f["type"] not in enums and f["type"] not in models:
                errors.append(f"{mname}.{f['name']}: type inconnu {f['type']}")

        # Champs des index et uniques
        for b in model["block"]:
            m = re.match(r"@@(unique|index|id)\(\[([^\]]*)\]", b)
            if m:
                for n in [x.strip() for x in m.group(2).split(",")]:
                    if field(mname, n) is None:
                        errors.append(f"{mname}: {b} référence un champ inconnu {n}")

        # Relations
        for f in model["fields"]:
            if f["type"] not in models:
                continue
            target = f["type"]
            rel = relation_info(f)
            # côté opposé
            opposite = [
                g for g in models[target]["fields"]
                if g["type"] == mname and relation_info(g)["name"] == rel["name"]
                and not (target == mname and g["name"] == f["name"])
            ]
            if len(opposite) != 1:
                errors.append(f"{mname}.{f['name']} -> {target}: {len(opposite)} champ(s) opposé(s) trouvés (attendu 1)")
            pair = [g for g in model["fields"] if g["type"] == target]
            if len(pair) > 1 and rel["name"] is None:
                errors.append(f"{mname}.{f['name']}: plusieurs relations vers {target}, nom de relation obligatoire")
            if rel["fields"] is None:
                if not (f["list"] or f["optional"]):
                    errors.append(f"{mname}.{f['name']}: côté sans clé étrangère doit être liste ou optionnel")
                if opposite and opposite[0]["name"] and relation_info(opposite[0])["fields"] is None:
                    errors.append(f"{mname}.{f['name']}: aucun des deux côtés ne porte fields/references")
                if not f["list"] and opposite:
                    # 1-1 : la FK de l'autre côté doit être unique
                    o = relation_info(opposite[0])
                    if o["fields"] and sorted(o["fields"]) not in [sorted(s) for s in unique_sets(models[target])]:
                        errors.append(f"{target}.{opposite[0]['name']}: relation 1-1, FK {o['fields']} non unique")
                continue
            if len(rel["fields"]) != len(rel["references"]):
                errors.append(f"{mname}.{f['name']}: fields/references de tailles différentes")
                continue
            if rel["references"] not in unique_sets(models[target]):
                errors.append(f"{mname}.{f['name']}: references {rel['references']} n'est pas une clé unique de {target}")
            scal_opt = []
            for a, b in zip(rel["fields"], rel["references"]):
                fa, fb = field(mname, a), field(target, b)
                if fa is None or fb is None:
                    errors.append(f"{mname}.{f['name']}: champ {a} ou {target}.{b} inexistant")
                    continue
                if fa["type"] != fb["type"] or native(fa) != native(fb):
                    errors.append(f"{mname}.{a} ({fa['type']} {native(fa)}) ≠ {target}.{b} ({fb['type']} {native(fb)})")
                scal_opt.append(fa["optional"])
            if f["optional"] and scal_opt and not all(scal_opt):
                errors.append(f"{mname}.{f['name']}: relation optionnelle mais champ(s) obligatoire(s) {rel['fields']} (refusé par Prisma)")
            if not f["optional"] and any(scal_opt):
                errors.append(f"{mname}.{f['name']}: relation obligatoire mais champ(s) optionnel(s)")
            if f["optional"] and rel["onDelete"] is None and len(rel["fields"]) > 1:
                errors.append(f"{mname}.{f['name']}: FK composite optionnelle -> SetNull mettrait tenantId à NULL")
            # Règle projet : relation obligatoire entre deux tables d'école -> FK composite
            if (
                mname not in GLOBAL_MODELS and target not in GLOBAL_MODELS
                and not f["optional"] and "tenantId" not in rel["fields"]
            ):
                errors.append(f"{mname}.{f['name']}: relation obligatoire vers {target} sans tenantId dans la FK composite")
    return errors


# ---------------------------------------------------------------- DDL ------
def sql_type(f, enums):
    nt = native(f)
    t = f["type"]
    if t in enums:
        base = f'"{t}"'
    elif nt == "Uuid":
        base = "UUID"
    elif nt == "Date":
        base = "DATE"
    elif nt and nt.startswith("Decimal"):
        base = "DECIMAL" + nt[len("Decimal"):]
    else:
        base = {"String": "TEXT", "Int": "INTEGER", "Boolean": "BOOLEAN", "DateTime": "TIMESTAMP(3)",
                "Json": "JSONB", "Decimal": "DECIMAL(65,30)", "BigInt": "BIGINT"}[t]
    return base + ("[]" if f["list"] else "")


def sql_default(f, enums):
    start = f["attrs"].find("@default(")
    if start < 0:
        return None
    i, depth, in_str = start + len("@default("), 1, False
    buf = []
    while i < len(f["attrs"]):
        c = f["attrs"][i]
        if c == '"' and f["attrs"][i - 1] != "\\":
            in_str = not in_str
        elif not in_str and c == "(":
            depth += 1
        elif not in_str and c == ")":
            depth -= 1
            if depth == 0:
                break
        buf.append(c)
        i += 1
    v = "".join(buf).strip()
    if v == "uuid()":
        return "gen_random_uuid()"
    if v == "now()":
        return "CURRENT_TIMESTAMP"
    if v in ("true", "false") or re.fullmatch(r"-?\d+(\.\d+)?", v):
        return v
    if f["type"] in enums:
        return f"'{v}'"
    if v.startswith('"'):
        s = bytes(v[1:-1], "utf-8").decode("unicode_escape")
        return "'" + s.replace("'", "''") + "'" + ("::jsonb" if f["type"] == "Json" else "")
    return v


def ddl(enums, models):
    out = ["-- DDL généré par scripts/check_schema.py (équivalent du schéma Prisma, pour les tests)"]
    for e, vals in enums.items():
        out.append(f'CREATE TYPE "{e}" AS ENUM (' + ", ".join(f"'{v}'" for v in vals) + ");")
    fks = []
    for mname, model in models.items():
        cols = []
        for f in model["fields"]:
            if f["type"] in models:
                rel = relation_info(f)
                if rel["fields"]:
                    od = rel["onDelete"] or ("SetNull" if f["optional"] else "Restrict")
                    od_sql = {"Cascade": "CASCADE", "Restrict": "RESTRICT", "SetNull": "SET NULL",
                              "NoAction": "NO ACTION"}[od]
                    fks.append(
                        f'ALTER TABLE "{mname}" ADD CONSTRAINT "{mname}_{f["name"]}_fkey" FOREIGN KEY ('
                        + ", ".join(f'"{x}"' for x in rel["fields"]) + f') REFERENCES "{f["type"]}"('
                        + ", ".join(f'"{x}"' for x in rel["references"]) + f") ON DELETE {od_sql} ON UPDATE CASCADE;"
                    )
                continue
            col = f'  "{f["name"]}" {sql_type(f, enums)}'
            if not f["optional"] and not f["list"]:
                col += " NOT NULL"
            d = sql_default(f, enums)
            if d is not None:
                col += f" DEFAULT {d}"
            if "@updatedAt" in f["attrs"]:
                col += " DEFAULT CURRENT_TIMESTAMP"
            if re.search(r"@id\b", f["attrs"]):
                col += " PRIMARY KEY"
            cols.append(col)
        out.append(f'CREATE TABLE "{mname}" (\n' + ",\n".join(cols) + "\n);")
        for f in model["fields"]:
            if re.search(r"@unique\b", f["attrs"]):
                out.append(f'CREATE UNIQUE INDEX "{mname}_{f["name"]}_key" ON "{mname}"("{f["name"]}");')
        for b in model["block"]:
            m = re.match(r"@@(unique|index)\(\[([^\]]*)\]", b)
            if m:
                cs = [x.strip() for x in m.group(2).split(",")]
                kind = "UNIQUE INDEX" if m.group(1) == "unique" else "INDEX"
                suffix = "key" if m.group(1) == "unique" else "idx"
                out.append(f'CREATE {kind} "{mname}_{"_".join(cs)}_{suffix}" ON "{mname}"(' + ", ".join(f'"{c}"' for c in cs) + ");")
    out.extend(fks)
    return "\n".join(out) + "\n"


def main():
    enums, models = parse(SCHEMA.read_text(encoding="utf-8"))
    errors = check(enums, models)
    nrel = sum(1 for m in models.values() for f in m["fields"] if f["type"] in models and relation_info(f)["fields"])
    print(f"{len(models)} modèles, {len(enums)} énumérations, {nrel} clés étrangères analysées.")
    if errors:
        print(f"\n{len(errors)} ERREUR(S) :")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    print("Aucune erreur : relations, types et règles multi-écoles conformes.")
    if "--ddl" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--ddl") + 1])
        out.write_text(ddl(enums, models), encoding="utf-8")
        print(f"DDL écrit dans {out}")


if __name__ == "__main__":
    main()
