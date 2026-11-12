# 🐞 Problèmes Connus — Buzz! Web World

Bugs et limitations techniques **constatés et non encore corrigés** dans le code actuel, avec leur impact visible pour l'hôte (`/host`) ou le joueur (`/controller`), un contournement éventuel et l'issue GitHub de suivi.

- **Ce document ≠ [`docs/EDGE_CASES.md`](EDGE_CASES.md)** : le registre des cas limites décrit les invariants techniques/mathématiques et leur statut de couverture de tests (`SCORE-*`, `LOCK-*`, `CONN-*`, `SEC-*`…). Ici, on consigne l'**impact visible en soirée** et la marche à suivre en attendant le correctif.
- **Entrée** : tout bug découvert lors d'un audit ou hors périmètre d'un ticket $\rightarrow$ création d'une issue GitHub (`/create-issue`) + ajout d'une ligne `KI-xx` ici.
- **Sortie** : dès que l'issue est corrigée et mergée, **retirer la ligne `KI-xx`** (l'historique Git fait foi) et promouvoir l'invariant correspondant en `✅` dans [`docs/EDGE_CASES.md`](EDGE_CASES.md).

---

## 📋 Registre Actif

| ID | Domaine | Symptôme visible | Contournement | Edge cases liés | Suivi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **KI-01** | `Socket.io` / Sécurité | Un payload `controller:join` malformé (`roomCode` absent ou non-chaîne) provoque un crash non géré du serveur (`TypeError: Cannot read properties of null (reading 'toUpperCase')`). De même, `color` hors `0..3` n'est pas filtré à l'entrée. | Utiliser uniquement l'interface officielle `/controller` en attendant la validation Zod serveur. | `SEC-01` | [#1](https://github.com/HextazDev/Buzz-web-world/issues/1) |
| **KI-02** | `Connexions` / Temps Réel | Si un joueur perd le Wi-Fi en pleine question, son pupitre reste affiché comme connecté (`isConnected: true`) et la révélation anticipée attend systématiquement la fin des 10 secondes du watchdog. | Attendre l'expiration du chronomètre de 10 s ou rafraîchir l'écran smartphone (reconnexion via `reconnectToken`). | `CONN-01`, `MEM-01` | [#1](https://github.com/HextazDev/Buzz-web-world/issues/1) |
| **KI-03** | `Build` / Production | L'exécution directe du serveur compilé (`node apps/server/dist/index.js`) échoue car `@buzz/shared` exporte ses fichiers `.ts` bruts sans étape de build JS ni extensions ESM `.js`. | Lancer le serveur via `npm run dev` (`tsx`) en attendant le build JS de `@buzz/shared`. | `ARCH-02` | [#1](https://github.com/HextazDev/Buzz-web-world/issues/1) |
| **KI-04** | `Gameplay` / Buzzer Rouge | L'appui sur le **Gros Bouton Rouge** pendant une question active (`QUESTION_ACTIVE`) est ignoré par le serveur et le verrou atomique `tryAcquireBuzzLock` n'est jamais déclenché. | Seules les manches à réponse directe par couleur (`POINT_BUILDER`, `FASTEST_FINGER`) sont jouables actuellement. | `LOCK-01`, `GAME-03` | [#3](https://github.com/HextazDev/Buzz-web-world/issues/3) |
| **KI-05** | `Gameplay` / Chronomètre | Le chronomètre serveur de 10 s et le calcul du temps de réaction (`questionOpenedAtMs`) démarrent dès l'envoi de la question sans attendre la fin du speech du présentateur (`host:ready_for_timer`). | Répondre dès l'apparition visuelle de la question sur `/host`. | `TIME-01`, `GAME-05` | [#3](https://github.com/HextazDev/Buzz-web-world/issues/3) |
| **KI-06** | `Scoring` / Manche 3 | Dans `ScoringMath.pointStealer`, un vol réussi contre une cible possédant moins de 300 pts (ex: 100 pts) retire 100 pts à la cible mais crédite quand même +300 pts au voleur. | Aucun contournement côté client (la manche 3 n'est pas encore activée). | `SCORE-03` | [#3](https://github.com/HextazDev/Buzz-web-world/issues/3) |
| **KI-07** | `Persistance` / Base de Données | Le serveur n'utilise que les 3 questions de démonstration en mémoire (`DEMO_QUESTIONS`) et ne se connecte pas encore à PostgreSQL 16, Redis 7 et MinIO. | Mode démo uniquement jusqu'au branchement du pool SQL et du seed officiel. | `PACK-01`, `POOL-01` | [#4](https://github.com/HextazDev/Buzz-web-world/issues/4) |
