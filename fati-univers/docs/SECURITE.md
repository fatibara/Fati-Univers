# Sécurité et isolation des établissements

> Exigence non négociable (cahier des charges, section 11) : un établissement ne
> doit jamais pouvoir consulter ou modifier les données d'un autre, y compris en
> modifiant une URL, un identifiant ou une requête API.

## Quatre verrous indépendants

| Verrou | Où | Ce qu'il bloque |
|--------|----|-----------------|
| 1. Garde d'école (`TenantGuard`) | API | L'école active vient de l'en-tête `X-Tenant-Id` ; le compte doit y avoir un rôle actif. Sinon : 403 |
| 2. Permissions (`PermissionsGuard`) | API | Chaque route déclare sa permission. Une route **sans** permission déclarée est refusée par défaut |
| 3. Row-Level Security | PostgreSQL | La base ne montre et n'accepte que les lignes de l'école active, même si le code oublie un filtre |
| 4. Clés étrangères composites | PostgreSQL | Une ligne de l'école A ne peut pas référencer une ligne de l'école B |

Les verrous 3 et 4 tiennent même en cas de bug dans l'API.

## Rôles PostgreSQL

| Rôle | Utilisé par | RLS |
|------|-------------|-----|
| `fati_owner` | Migrations uniquement | Forcée (ne voit aucune donnée scolaire) |
| `fati_app` | API | **Appliquée** ; ne peut ni créer ni supprimer d'école |
| `fati_platform` | Super-administration, tâches plateforme | Politique dédiée `platform_all` : voit toutes les écoles, sans privilège `BYPASSRLS` (fonctionne chez Neon ou Supabase) |

## Comment l'API fixe l'école active

Chaque requête Prisma passe par `forTenant()` (`apps/api/src/database/index.ts`) :

```sql
BEGIN;
SELECT set_config('app.tenant_id', '<école>', true);  -- local à la transaction
SELECT set_config('app.user_id',   '<compte>', true);
-- ... la requête ...
COMMIT;
```

Le réglage disparaît à la fin de la transaction : aucune fuite possible entre deux
requêtes qui réutilisent la même connexion du pool (test T17).

## Garde-fous financiers dans la base

- Un paiement ne peut pas être supprimé, seulement annulé avec motif, auteur et date.
- Un paiement confirmé est figé (montant, élève, mode, numéro de reçu).
- Les numéros de reçu sont attribués par `fati_next_receipt_number()`, de façon
  atomique : pas de trou, pas de doublon, même avec plusieurs caisses.
- Le journal d'audit (`AuditLog`) est en ajout seul.

## Tests

`scripts/test-db.sh` monte la base sur un PostgreSQL réel et exécute 19 tests :

| Test | Vérifie |
|------|---------|
| T1 | Toutes les tables d'école ont la RLS activée **et forcée** |
| T2 | Sans école active : 0 ligne visible |
| T3 | L'école A ne voit que ses élèves, même en ciblant l'identifiant d'un élève de B |
| T4 | Modifier ou supprimer un élève de B depuis A : 0 ligne touchée |
| T5 | Créer un élève au nom de B depuis A : refusé |
| T6 | Déplacer un élève vers B en changeant son `tenantId` : refusé |
| T7 | Une note de A qui pointe vers un élève de B : refusée (FK composite) |
| T8 | Une note légitime est acceptée |
| T9 | Journal d'audit non modifiable |
| T10 | Numérotation des reçus continue |
| T11 à T14 | Paiement confirmé figé, non supprimable, annulation motivée obligatoire |
| T15 | Un parent présent dans deux écoles voit ses deux écoles, aucune donnée sans école active |
| T16 | Le directeur de A ne voit ni les comptes ni la fiche de B |
| T17 | L'école active ne survit pas à la transaction |
| T18 | Le rôle plateforme voit toutes les écoles et peut en créer une |
| T19 | Le rôle de l'API ne peut pas créer d'école |

`apps/api/test/tenant-isolation.e2e-spec.ts` refait ces vérifications à travers
l'API HTTP (en-tête modifié, identifiant d'une autre école, `tenantId` glissé dans
le corps, rôle insuffisant, blocage après 5 mots de passe erronés).

## Authentification

- Mots de passe hachés avec scrypt (N = 2^17, recommandation OWASP) ; temps de réponse identique que le numéro existe ou non.
- Blocage 15 minutes après 5 échecs ; limitation à 10 tentatives de connexion par minute et par adresse IP.
- Jeton d'accès court (15 min) + jeton de renouvellement haché en base, révocable, renouvelé à chaque usage.
- À faire en phase 2 : connexion par code SMS, double authentification pour
  promoteur, directeur et comptable, cookies httpOnly côté web, accès support
  temporaire (`SupportAccessGrant`).

## Avant la mise en production

- [ ] Remplacer tous les mots de passe `CHANGER_MOI_*` et `JWT_ACCESS_SECRET`.
- [ ] Supprimer les comptes de démonstration (+224620000001 à 04).
- [ ] Vérifier avec un juriste guinéen la loi L/2016/037/AN et le décret D/2025/053 (hébergement, mineurs).
- [ ] Sauvegardes chiffrées quotidiennes et test de restauration mensuel.
- [ ] Test d'intrusion externe.
