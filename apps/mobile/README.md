# Application mobile (React Native + Expo)

Prévue en **phase 7** (espaces enseignant et parent, mode hors-ligne) puis
**phase 8** (publication Android et iOS), selon le calendrier du cahier des
charges V3.

En attendant, enseignants et parents utilisent le **web installable (PWA)** de
`apps/web`, qui s'ajoute à l'écran d'accueil du téléphone.

Choix déjà arrêtés pour cette application :

- Expo (React Native), TypeScript, mêmes règles métier que l API (`apps/api/src/domain`, à extraire en paquet partagé quand le mobile démarrera) ;
- base locale SQLite pour l'appel et la saisie des notes hors-ligne ;
- chaque saisie hors-ligne porte un UUID créé sur le téléphone : renvoyée deux
  fois, elle n'est enregistrée qu'une fois (voir `docs/MODELE_DE_DONNEES.md`) ;
- appareil cible : Android 8, 2 Go de RAM, application de moins de 30 Mo.
