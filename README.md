# FATI UNIVERS

> « Toute la gestion de votre établissement, sur une seule plateforme. »
> Une solution **FATIGLOBAL**.

Projet initial (phase 1 du cahier des charges V3) :

- **base de données multi-écoles** (44 tables) avec isolation des écoles par
  Row-Level Security, garde-fous sur les paiements, journal d'audit en ajout seul ;
- **règles métier testées** : montants GNF, moyennes, rangs, mentions,
  échéanciers, SMS, numéros guinéens, permissions par rôle ;
- **API NestJS** : connexion, choix de l'école, permissions, module élèves ;
- **site web Next.js installable (PWA)** : connexion, choix de l'école, tableau de bord.

## Structure

```
fati-univers/
├── apps/
│   ├── api/                 API NestJS — projet Vercel n° 1 (Root Directory : apps/api)
│   │   ├── src/domain/      règles métier pures et testées
│   │   ├── src/database/    accès à la base limité à une école
│   │   └── prisma/          schéma, scripts de sécurité SQL, données de démonstration
│   ├── web/                 Next.js — projet Vercel n° 2 (Root Directory : apps/web)
│   └── mobile/              React Native + Expo (phase 7)
├── base-de-donnees/
│   └── installation.sql     installation complète de la base, en un seul fichier
├── docs/                    modèle de données, sécurité
└── scripts/                 vérification du schéma, tests de la base, génération d'installation.sql
```

## Mise en ligne avec Vercel et Neon (sans ligne de commande)

1. **Base de données.** Dans Vercel : Storage → Create Database → Neon (région Europe).
2. **Installer la base.** Ouvrez la base dans Neon → SQL Editor. Collez tout le
   fichier `base-de-donnees/installation.sql` après avoir remplacé ses deux mots de
   passe (lettres et chiffres uniquement, 20 caractères ou plus), puis Run.
3. **Projet API.** Vercel → Add New → Project → ce dépôt.
   Root Directory : `apps/api`. Connectez la base Neon au projet (onglet Storage) :
   `DATABASE_URL` est ajoutée automatiquement. Ajoutez les variables :
   `FATI_APP_PASSWORD`, `FATI_PLATFORM_PASSWORD` (les mots de passe de l'étape 2)
   et `JWT_ACCESS_SECRET` (48 caractères aléatoires ou plus). Déployez.
   Vérification : `https://<adresse-api>/api/v1/health` affiche `"status":"ok"`.
4. **Projet web.** Vercel → Add New → Project → le même dépôt.
   Root Directory : `apps/web`. Variable : `API_URL` = l'adresse du projet API
   (sans `/api/v1`). Déployez.
5. Ouvrez le site : téléphone `620 00 00 01`, mot de passe `Demo-Fati-2027`.

## Développement local

Prérequis : Node.js 22, Docker Desktop, Python 3.

```bash
cp .env.example apps/api/.env
docker compose up -d                      # PostgreSQL 16 + Redis + MinIO
npm run install:all
cd apps/api && npx prisma db push && npm run db:secure && npm run db:seed && cd ../..
npm run dev:api                           # API sur http://localhost:4000/api/v1
npm run dev:web                           # site sur http://localhost:3000
```

## Commandes utiles

| Commande (à la racine) | Effet |
|------------------------|-------|
| `npm run check:schema` | Vérifie le schéma Prisma et les règles multi-écoles (sans Internet) |
| `npm run test:db` | 19 tests de sécurité sur PostgreSQL (variables `PGHOST`, `PGUSER`…) |
| `npm test` | Tests unitaires : règles métier, mots de passe, adresses de connexion |
| `npm run test:e2e` | Tests d'isolation à travers l'API (base requise) |
| `npm run build:install-sql` | Régénère `base-de-donnees/installation.sql` après une modification du schéma |

## Faire évoluer la base

La base de production a été créée par `installation.sql`, pas par Prisma Migrate.
Le jour où l'équipe passe aux migrations, elle déclare l'état actuel comme point
de départ (procédure Prisma « baselining ») :

```bash
cd apps/api
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
npx prisma migrate resolve --applied 0_init
```

Ensuite, chaque évolution passe par `npx prisma migrate dev`, suivie de
`npm run db:secure` (la Row-Level Security s'applique automatiquement aux
nouvelles tables qui ont une colonne `tenantId` ; le test T1 échoue sinon).

## Ajouter un module

1. Modèles dans `apps/api/prisma/schema.prisma`, avec `tenantId` et des relations
   composites `(tenantId, xxxId) → (tenantId, id)` ; `npm run check:schema`.
2. Calculs dans `apps/api/src/domain`, avec leurs tests.
3. Dans les contrôleurs : `@TenantDb()` (jamais le client nu) et
   `@RequirePermission(...)` sur chaque route, sinon elle est refusée.
4. Un test d'isolation dans `apps/api/test/`.

## Documentation

- [Modèle de données](docs/MODELE_DE_DONNEES.md)
- [Sécurité et isolation des écoles](docs/SECURITE.md)
