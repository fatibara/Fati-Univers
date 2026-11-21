#!/usr/bin/env python3
"""
Génère base-de-donnees/installation.sql : UN seul fichier à coller dans
l'éditeur SQL de Neon (ou de tout PostgreSQL hébergé) pour installer
FATI UNIVERS sans aucune commande.

Ordre : rôles -> tables -> données de démonstration -> sécurité (RLS, audit,
garde-fous, droits). Les données de démonstration sont insérées AVANT
l'activation de la Row-Level Security, par le propriétaire des tables.

Usage : python3 scripts/build_install_sql.py
"""
import base64
import hashlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQL = ROOT / "apps/api/prisma/sql"
OUT = ROOT / "base-de-donnees/installation.sql"
AUTO = ROOT / "apps/api/prisma/install.sql"
DEMO_PASSWORD = "Demo-Fati-2027"


def scrypt_hash(password: str, salt: bytes) -> str:
    """Même format que apps/api/src/auth/password.ts."""
    key = hashlib.scrypt(password.encode(), salt=salt, n=2**17, r=8, p=1, maxmem=256 * 1024 * 1024, dklen=32)
    return f"scrypt$17$8$1${base64.b64encode(salt).decode()}${base64.b64encode(key).decode()}"


def ddl() -> str:
    tmp = ROOT / ".ddl.tmp.sql"
    subprocess.run([sys.executable, str(ROOT / "scripts/check_schema.py"), "--ddl", str(tmp)], check=True,
                   stdout=subprocess.DEVNULL)
    text = tmp.read_text(encoding="utf-8")
    tmp.unlink()
    return text


ROLES = """
-- 1. RÔLES ------------------------------------------------------------------
-- fati_app      : l'API. Soumis à la Row-Level Security (ne voit qu'une école à la fois).
-- fati_platform : super-administration. Voit toutes les écoles via une politique dédiée.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fati_app') THEN
    CREATE ROLE fati_app LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fati_platform') THEN
    CREATE ROLE fati_platform LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
ALTER ROLE fati_app      WITH LOGIN PASSWORD 'REMPLACER_MOT_DE_PASSE_APP';
ALTER ROLE fati_platform WITH LOGIN PASSWORD 'REMPLACER_MOT_DE_PASSE_PLATEFORME';
"""


def demo(hashes: dict) -> str:
    T = "d0000000-0000-4000-8000-000000000001"
    Y = "d0000000-0000-4000-8000-000000000010"
    C = "d0000000-0000-4000-8000-000000000020"
    STAFF = "d0000000-0000-4000-8000-000000000030"
    CASHIER = "d0000000-0000-4000-8000-000000000031"
    G = "d0000000-0000-4000-8000-000000000040"
    users = [
        ("d0000000-0000-4000-8000-000000000101", "+224620000001", "Mariama", "Bah", "DIRECTEUR"),
        ("d0000000-0000-4000-8000-000000000102", "+224620000002", "Ibrahima", "Sow", "ENSEIGNANT"),
        ("d0000000-0000-4000-8000-000000000103", "+224620000003", "Kadiatou", "Condé", "CAISSIER"),
        ("d0000000-0000-4000-8000-000000000104", "+224620000004", "Alpha", "Diallo", "PARENT"),
    ]
    out = ["\n-- 3. ÉCOLE DE DÉMONSTRATION (fictive) ---------------------------------------",
           f"-- Comptes : +224620000001 (directrice) à +224620000004 (parent), mot de passe {DEMO_PASSWORD}",
           "-- À supprimer ou désactiver avant l'arrivée des vraies écoles."]
    out.append("""INSERT INTO "Plan"(id, code, name, "maxStudents", "monthlyPriceGnf", "yearlyPriceGnf", "monthlySmsCredit", features) VALUES
 ('d0000000-0000-4000-8000-0000000000a1', 'ETABLISSEMENT', 'Établissement', 300, 0, 0, 500, '{}'),
 ('d0000000-0000-4000-8000-0000000000a2', 'PROFESSIONNELLE', 'Professionnelle', 1500, 0, 0, 2000, '{DISCIPLINE,EXAMENS,MESSAGERIE,WHATSAPP,MULTI_CAISSES}'),
 ('d0000000-0000-4000-8000-0000000000a3', 'PREMIUM', 'Premium', NULL, 0, 0, 6000, '{DISCIPLINE,EXAMENS,MESSAGERIE,WHATSAPP,MULTI_CAISSES,LMD,MULTI_CAMPUS}');""")
    out.append(f"""INSERT INTO "Tenant"(id, slug, name, "shortName", status, city, address, phone, cycles, "updatedAt") VALUES
 ('{T}', 'demo-kaloum', 'Groupe Scolaire Démo FATI', 'GS DEMO', 'ACTIF', 'Conakry', 'Kaloum', '+224620000000', '{{PRIMAIRE,COLLEGE,LYCEE}}', now());
INSERT INTO "Subscription"("tenantId", "planId", status, "startsAt", "endsAt", "updatedAt") VALUES
 ('{T}', 'd0000000-0000-4000-8000-0000000000a2', 'ESSAI', '2027-09-01', '2028-08-31', now());""")
    rows = ",\n ".join(f"('{u}', '{ph}', '{fn}', '{ln}', '{hashes[ph]}', now())" for u, ph, fn, ln, _ in users)
    out.append(f'INSERT INTO "User"(id, phone, "firstName", "lastName", "passwordHash", "updatedAt") VALUES\n {rows};')
    rows = ",\n ".join(f"('{T}', '{u}', '{{{role}}}', now())" for u, _, _, _, role in users)
    out.append(f'INSERT INTO "Membership"("tenantId", "userId", roles, "updatedAt") VALUES\n {rows};')
    out.append(f"""INSERT INTO "AcademicYear"(id, "tenantId", label, "startsOn", "endsOn", "isCurrent") VALUES
 ('{Y}', '{T}', '2027-2028', '2027-10-01', '2028-06-30', true);
INSERT INTO "Term"("tenantId", "academicYearId", name, position, "startsOn", "endsOn") VALUES
 ('{T}', '{Y}', '1er trimestre', 1, '2027-10-01', '2027-12-20'),
 ('{T}', '{Y}', '2e trimestre', 2, '2028-01-05', '2028-03-31'),
 ('{T}', '{Y}', '3e trimestre', 3, '2028-04-10', '2028-06-30');""")
    levels = [("PRIMAIRE", "CP1", 1, 10), ("PRIMAIRE", "CP2", 2, 10), ("PRIMAIRE", "CE1", 3, 10), ("PRIMAIRE", "CE2", 4, 10),
              ("PRIMAIRE", "CM1", 5, 10), ("PRIMAIRE", "CM2", 6, 10), ("COLLEGE", "7e année", 7, 20), ("COLLEGE", "8e année", 8, 20),
              ("COLLEGE", "9e année", 9, 20), ("COLLEGE", "10e année", 10, 20), ("LYCEE", "11e année", 11, 20),
              ("LYCEE", "12e année", 12, 20), ("LYCEE", "Terminale", 13, 20)]
    L10 = "d0000000-0000-4000-8000-000000000210"
    rows = []
    for cyc, name, pos, scale in levels:
        lid = L10 if name == "10e année" else f"d0000000-0000-4000-8000-0000000002{pos:02d}"
        rows.append(f"('{lid}', '{T}', '{cyc}', '{name}', {pos}, {scale})")
    # éviter la collision d'identifiant entre « 10e année » (position 10) et le format générique
    out.append('INSERT INTO "Level"(id, "tenantId", cycle, name, position, "gradeScale") VALUES\n ' + ",\n ".join(rows) + ";")
    out.append(f"""INSERT INTO "Track"("tenantId", code, name) VALUES
 ('{T}', 'SS', 'Sciences sociales'), ('{T}', 'SE', 'Sciences expérimentales'), ('{T}', 'SM', 'Sciences mathématiques');""")
    subjects = [("FR", "Français", 4), ("MATH", "Mathématiques", 4), ("PC", "Physique-Chimie", 3),
                ("SVT", "Sciences de la vie et de la Terre", 3), ("HG", "Histoire-Géographie", 2), ("ANG", "Anglais", 2),
                ("ECM", "Éducation civique et morale", 1), ("EPS", "Éducation physique", 1)]
    sid = {code: f"d0000000-0000-4000-8000-0000000003{i:02d}" for i, (code, _, _) in enumerate(subjects, 1)}
    out.append('INSERT INTO "Subject"(id, "tenantId", code, name) VALUES\n ' +
               ",\n ".join(f"('{sid[c]}', '{T}', '{c}', '{n}')" for c, n, _ in subjects) + ";")
    out.append('INSERT INTO "SubjectCoefficient"("tenantId", "levelId", "subjectId", coefficient) VALUES\n ' +
               ",\n ".join(f"('{T}', '{L10}', '{sid[c]}', {k})" for c, _, k in subjects) + ";")
    out.append(f"""INSERT INTO "GradingPolicy"("tenantId", mentions) VALUES
 ('{T}', '[{{"min":16,"label":"Très bien"}},{{"min":14,"label":"Bien"}},{{"min":12,"label":"Assez bien"}},{{"min":10,"label":"Passable"}},{{"min":0,"label":"Insuffisant"}}]');
INSERT INTO "StaffMember"(id, "tenantId", "userId", "firstName", "lastName", phone, position) VALUES
 ('{STAFF}', '{T}', 'd0000000-0000-4000-8000-000000000102', 'Ibrahima', 'Sow', '+224620000002', 'Professeur de mathématiques'),
 ('{CASHIER}', '{T}', 'd0000000-0000-4000-8000-000000000103', 'Kadiatou', 'Condé', '+224620000003', 'Caissière');
INSERT INTO "Classroom"(id, "tenantId", "academicYearId", "levelId", name, capacity, "mainTeacherId") VALUES
 ('{C}', '{T}', '{Y}', '{L10}', '10e A', 60, '{STAFF}');
INSERT INTO "TeachingAssignment"("tenantId", "classroomId", "subjectId", "staffId") VALUES
 ('{T}', '{C}', '{sid["MATH"]}', '{STAFF}');
INSERT INTO "Guardian"(id, "tenantId", "userId", "firstName", "lastName", phone, profession) VALUES
 ('{G}', '{T}', 'd0000000-0000-4000-8000-000000000104', 'Alpha', 'Diallo', '+224620000004', 'Commerçant');""")
    students = [("Aïssatou", "Diallo", "F"), ("Mamadou", "Diallo", "M"), ("Fatoumata", "Camara", "F"),
                ("Ousmane", "Barry", "M"), ("Hawa", "Keïta", "F"), ("Sékou", "Touré", "M")]
    srows, erows, grows = [], [], []
    for i, (fn, ln, g) in enumerate(students, 1):
        st = f"d0000000-0000-4000-8000-0000000004{i:02d}"
        srows.append(f"('{st}', '{T}', '2027-{i:04d}', '{fn}', '{ln}', '{g}', now())")
        erows.append(f"('{T}', '{st}', '{C}', '{Y}', 'INSCRIT')")
        if ln == "Diallo":
            grows.append(f"('{T}', '{st}', '{G}', 'PERE', true)")
    out.append('INSERT INTO "Student"(id, "tenantId", matricule, "firstName", "lastName", gender, "updatedAt") VALUES\n ' + ",\n ".join(srows) + ";")
    out.append('INSERT INTO "Enrollment"("tenantId", "studentId", "classroomId", "academicYearId", status) VALUES\n ' + ",\n ".join(erows) + ";")
    out.append('INSERT INTO "StudentGuardian"("tenantId", "studentId", "guardianId", relationship, "isPrimary") VALUES\n ' + ",\n ".join(grows) + ";")
    out.append(f"""INSERT INTO "FeeType"(id, "tenantId", category, name) VALUES
 ('d0000000-0000-4000-8000-000000000501', '{T}', 'SCOLARITE', 'Scolarité annuelle'),
 ('d0000000-0000-4000-8000-000000000502', '{T}', 'INSCRIPTION', 'Inscription');
INSERT INTO "FeeRate"("tenantId", "feeTypeId", "levelId", "academicYearId", "amountGnf", installments) VALUES
 ('{T}', 'd0000000-0000-4000-8000-000000000501', '{L10}', '{Y}', 3600000, 3),
 ('{T}', 'd0000000-0000-4000-8000-000000000502', '{L10}', '{Y}', 250000, 1);""")
    return "\n".join(out) + "\n"


def strip_comments(sql: str) -> str:
    return "\n".join(l for l in sql.splitlines() if not l.strip().startswith("--")).strip()


def main():
    phones = ["+224620000001", "+224620000002", "+224620000003", "+224620000004"]
    hashes = {ph: scrypt_hash(DEMO_PASSWORD, hashlib.sha256(("fati-demo-" + ph).encode()).digest()[:16]) for ph in phones}
    ddl_text = ddl()
    demo_text = demo(hashes)
    parts = [
        "-- =============================================================================",
        "-- FATI UNIVERS — INSTALLATION COMPLÈTE DE LA BASE (fichier généré, ne pas modifier à la main)",
        "-- =============================================================================",
        "-- AVANT D'EXÉCUTER : remplacez les deux mots de passe ci-dessous",
        "--   REMPLACER_MOT_DE_PASSE_APP        (rôle de l'API)",
        "--   REMPLACER_MOT_DE_PASSE_PLATEFORME (rôle de super-administration)",
        "-- par deux mots de passe longs (20 caractères ou plus), LETTRES ET CHIFFRES",
        "-- UNIQUEMENT (pas de symboles : ils cassent les adresses de connexion).",
        "-- Puis copiez TOUT le fichier dans l'éditeur SQL de Neon et cliquez sur Run.",
        "-- À exécuter UNE SEULE FOIS, sur une base vide. Tout s'annule en cas d'erreur.",
        "-- =============================================================================",
        "BEGIN;",
        ROLES,
        "-- 2. TABLES -----------------------------------------------------------------",
        ddl_text,
        demo_text,
        "-- 4. SÉCURITÉ ---------------------------------------------------------------",
    ]
    for f in ["001_rls.sql", "002_audit_append_only.sql", "003_finance_guards.sql", "004_grants.sql"]:
        parts.append(f"-- >>> {f}")
        parts.append((SQL / f).read_text(encoding="utf-8"))
    parts.append("COMMIT;")
    parts.append("-- Installation terminée. Vérification : SELECT count(*) FROM pg_tables WHERE schemaname = 'public'; doit renvoyer 44.")
    parts.append("-- Les données des écoles sont masquées au propriétaire des tables : c'est la sécurité qui fonctionne.")
    # Version automatique (exécutée à chaque déploiement Vercel par prisma/auto-install.mjs) :
    # une seule commande, idempotente, mots de passe injectés depuis les variables d'environnement.
    tables_and_demo = strip_comments(ddl_text + "\n" + demo_text)
    security = strip_comments("\n".join((SQL / f).read_text(encoding="utf-8") for f in
                                         ["001_rls.sql", "002_audit_append_only.sql", "003_finance_guards.sql", "004_grants.sql"]))
    for tag in ("$fati_tables$", "$fati_security$", "$fati_install$"):
        assert tag not in tables_and_demo and tag not in security
    auto = f"""-- FATI UNIVERS - installation automatique (fichier généré par scripts/build_install_sql.py)
-- Exécuté à chaque déploiement : crée la base si elle est vide, sinon ne touche pas aux données,
-- puis réapplique la sécurité (couvre automatiquement les nouvelles tables).
DO $fati_install$
BEGIN
  -- Garde-fou : ne jamais toucher une base qui appartient à une autre application.
  IF to_regclass('public."Tenant"') IS NULL
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public') THEN
    RAISE EXCEPTION 'FATI UNIVERS : cette base contient deja des tables d''une autre application. Installation refusee. Branchez une base Neon vide dediee a FATI UNIVERS.';
  END IF;
  IF to_regclass('public."Tenant"') IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'Tenant' AND column_name = 'shortName') THEN
    RAISE EXCEPTION 'FATI UNIVERS : la table Tenant existante ne correspond pas a FATI UNIVERS. Installation refusee. Branchez une base Neon dediee.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fati_app') THEN
    CREATE ROLE fati_app LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fati_platform') THEN
    CREATE ROLE fati_platform LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  EXECUTE format('ALTER ROLE fati_app WITH LOGIN PASSWORD %L', '__FATI_APP_PASSWORD__');
  EXECUTE format('ALTER ROLE fati_platform WITH LOGIN PASSWORD %L', '__FATI_PLATFORM_PASSWORD__');
  IF to_regclass('public."Tenant"') IS NULL THEN
    RAISE NOTICE 'FATI UNIVERS : base vide, création des tables et de l''école de démonstration';
    EXECUTE $fati_tables$
{tables_and_demo}
$fati_tables$;
  ELSE
    RAISE NOTICE 'FATI UNIVERS : base déjà installée, données conservées';
  END IF;
  EXECUTE $fati_security$
{security}
$fati_security$;
END
$fati_install$;
"""
    AUTO.write_text(auto, encoding="utf-8")
    print(f"Écrit : {AUTO.relative_to(ROOT)} ({AUTO.stat().st_size // 1024} Ko)")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(parts), encoding="utf-8")
    print(f"Écrit : {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} Ko)")
    print("Exemple d'empreinte :", hashes[phones[0]])


if __name__ == "__main__":
    main()
