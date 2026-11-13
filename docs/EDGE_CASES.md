# 🛡️ Registre des Cas Limites & Invariants — Buzz! Web World

Ce document recense l'ensemble des **invariants métier, mathématiques, concurrentiels et de sécurité** définis par la [`MASTER_RFC.md`](../MASTER_RFC.md) (v1.1), ainsi que leur état de couverture par des tests automatisés.

> **Règle de synchronisation (Rituel d'Issue)** :
> - Tout nouveau cas limite ou correctif de bug doit ajouter ou mettre à jour son entrée ici avec le test unitaire correspondant.
> - Légende de couverture :
>   - ✅ **Couvert et prouvé par un test automatisé**
>   - 🛡️ **Implémenté dans le code, mais test automatisé manquant**
>   - ⚠️ **Non implémenté ou vulnérable (suivi dans [`docs/KNOWN_ISSUES.md`](KNOWN_ISSUES.md))**

---

## 1. 🧮 Moteur Mathématique des 10 Manches (`packages/shared/src/scoring.ts`)

| ID | Fonction / Manche | Scénario aux Frontières | Comportement Attendu (Invariant RFC §4) | Couverture |
| :--- | :--- | :--- | :--- | :--- |
| **SCORE-01** | `pointBuilder` (Manche 1) | Bonne réponse vs mauvaise réponse ou hors délai. | Exactement `+250` pts si juste, `0` pt sinon. | ✅ `scoring.test.ts` ([#2](https://github.com/HextazDev/Buzz-web-world/issues/2)) |
| **SCORE-02** | `fastestFinger` (Manche 2) | Temps de réaction $t \le 0\text{ s}$, $t \ge 10\text{ s}$ ou mauvaise réponse. | Clamp de $t \in [0, 10]$, formule $\max(100, \lfloor 400 - 30t \rfloor)$ si juste (plancher à `100` pts même à $t=10\text{ s}$), `0` pt si faux. | ✅ `scoring.test.ts` ([#2](https://github.com/HextazDev/Buzz-web-world/issues/2)) |
| **SCORE-03** | `pointStealer` (Manche 3) | Mauvaise réponse avec score $< 150$ pts ; ou vol sur une cible ayant $< 300$ pts. | Pénalité plafonnée au score actuel du joueur (`-Math.min(currentScore, 150)`) : **le score ne devient jamais négatif**. En cas de vol, cohérence stricte entre points dérobés et points crédités (`stolenAmount`). | ✅ `scoring.test.ts`, `rounds-orchestrator.test.ts` ([#3](https://github.com/HextazDev/Buzz-web-world/issues/3)) |
| **SCORE-04** | `passTheBombExplosionDelta` (Manche 5) | Explosion de la bombe sur un joueur ayant $< 400$ pts (ex: `250` pts). | Perte de `-Math.min(currentScore, 400)` $\rightarrow$ le score tombe au plancher `0` pt, jamais négatif. | ✅ `scoring.test.ts` ([#2](https://github.com/HextazDev/Buzz-web-world/issues/2)) |
| **BOMB-01** | `handleBombHolderAnswer` (Manche 5) | La mèche restante tombe à $\le 0\text{ ms}$ à la suite de la pénalité de $-3000\text{ ms}$ sur mauvaise réponse. | Explosion immédiate sans attendre le prochain tick et application de `passTheBombExplosionDelta` avec plancher à `0` pt. | ✅ `rounds-orchestrator.test.ts` ([#3](https://github.com/HextazDev/Buzz-web-world/issues/3)) |
| **SCORE-05** | `highStakes` (Manche 6) | Joueur misant `500` pts alors que son score est de `200` pts et répondant faux. | Déduction de `-Math.min(currentScore, bet)` (`-200` pts) $\rightarrow$ plancher strict à `0` pt. | ✅ `scoring.test.ts` ([#2](https://github.com/HextazDev/Buzz-web-world/issues/2)) |
| **SCORE-06** | `boilingPointStep` (Manche 7) | Mauvaise réponse à `0` cran vs bonne réponse au `5e` cran. | À `0` cran + erreur : reste à `0` cran (`0` pt). Au `5e` cran + juste : passe à `6` crans, déclenche `triggeredJackpot: true` et attribue `50 + 750 = 800` pts. | ✅ `scoring.test.ts` ([#2](https://github.com/HextazDev/Buzz-web-world/issues/2)) |
| **SCORE-07** | `onTheSpot` (Manche 8) | Vote des spectateurs (`0 = Bleu` réussit, `1 = Orange` échoue) selon la réussite de la cible. | Cible juste : `+400` pts cible et `+200` pts aux votants `0`. Cible échoue : `0` pt cible et `+200` pts aux votants `1`. | ✅ `scoring.test.ts` ([#2](https://github.com/HextazDev/Buzz-web-world/issues/2)) |
| **SCORE-08** | `finalCountdownInitialHeights` (Manche 9) | Tous les joueurs abordent la Finale avec exactement le même score ($S_{\max} = S_{\min}$). | Aucune division par zéro (`denominator = Math.max(1, sMax - sMin)`). Tous les joueurs démarrent à `6.0` s. | ✅ `scoring.test.ts` ([#2](https://github.com/HextazDev/Buzz-web-world/issues/2)) |
| **FIN-01** | Finale Éclair (`FINAL_FLASHPOINT`, Manche 10) | Les 2 derniers finalistes de `FINAL_COUNTDOWN` chutent à `0.0` s à la même milliseconde. | Transition immédiate vers la manche 10 (`FINAL_FLASHPOINT`, mort subite au Buzzer Rouge) au lieu d'un vainqueur arbitraire. | ✅ `rounds-orchestrator.test.ts` ([#3](https://github.com/HextazDev/Buzz-web-world/issues/3)) |

---

## 2. ⚡ Concurrence Temps Réel, Verrous & Connexions (`apps/server`)

| ID | Composant | Scénario aux Frontières | Comportement Attendu | Couverture |
| :--- | :--- | :--- | :--- | :--- |
| **LOCK-01** | `RoomManager.handleRedBuzz` & `tryAcquireBuzzLock` | Deux smartphones pressent le Buzzer Rouge à moins de 5 ms d'intervalle en `POINT_STEALER`, `PIE_FIGHT` ou `FINAL_FLASHPOINT`. | Acquisition atomique via Redis `SET room:{code}:buzz_lock {slotIndex} NX PX 4000` (ou fallback mémoire) : un seul joueur obtient `SOLID_LOCKED`, les autres restent à `OFF`. | ✅ `room-machine.test.ts`, `rounds-orchestrator.test.ts` ([#3](https://github.com/HextazDev/Buzz-web-world/issues/3)) |
| **LOCK-02** | `controller:press_color` | Un joueur tapote frénétiquement 4 boutons de couleur pendant `QUESTION_ACTIVE`. | Seul le **premier appui** est enregistré (`if (room.answers.has(slotIndex)) return;`), les 4 couleurs sont désactivées immédiatement sur son smartphone. | ✅ `room-machine.test.ts` ([#2](https://github.com/HextazDev/Buzz-web-world/issues/2)) |
| **CONN-01** | `RoomManager.joinOrReconnectPlayer` & `disconnect` | Un joueur perd le Wi-Fi en pleine question, ou rafraîchit son navigateur mobile avec son `reconnectToken`. | À la déconnexion : `isConnected = false`, et si tous les autres joueurs connectés ont répondu, révélation immédiate. À la reconnexion avec `reconnectToken` valide : récupération du même `slotIndex` et du score même si les 8 pupitres sont occupés. | ✅ `room-machine-disconnect.test.ts` ([#1](https://github.com/HextazDev/Buzz-web-world/issues/1)) |
| **CONN-02** | `RoomManager.joinOrReconnectPlayer` | Un 9e joueur tente de rejoindre un salon complet (8 pupitres `0..7` occupés) sans `reconnectToken` existant. | Rejet propre (`return null`), aucune corruption des 8 pupitres existants. | ✅ `room-machine.test.ts` ([#2](https://github.com/HextazDev/Buzz-web-world/issues/2)) |
| **TIME-01** | `RoomManager.markReadyForTimer` & `host:ready_for_timer` | Le présentateur IA lit une introduction ou une question longue avant l'ouverture des buzzers. | Le chronomètre serveur et `questionOpenedAtMs` ne démarrent qu'à réception de `host:ready_for_timer` (ou d'un watchdog de sécurité si la TV ne répond pas). | ✅ `rounds-orchestrator.test.ts` ([#3](https://github.com/HextazDev/Buzz-web-world/issues/3)) |
| **MEM-01** | `RoomManager` | Fermeture d'un salon ou déconnexion prolongée de l'hôte. | Arrêt de `activeWatchdogTimer` (`clearTimeout`) et purge des structures en mémoire (`rooms`, `localLocks`, réponses). | ✅ `room-machine-disconnect.test.ts` ([#1](https://github.com/HextazDev/Buzz-web-world/issues/1)) |

---

## 3. 🔒 Sécurité Applicative, Validation Zod & Intégrité SQL

| ID | Composant | Scénario aux Frontières | Comportement Attendu | Couverture |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Handlers Socket.io (`apps/server/src/index.ts`) | Réception d'un payload WebSocket malformé (`null`, type invalide, `color: 99`, `roomCode` de longueur $\ne 4$). | Validation systématique via `.safeParse()` des schémas Zod de `@buzz/shared`. Rejet sans exception non gérée ni mutation d'état. | ✅ `socket-schemas.test.ts` ([#1](https://github.com/HextazDev/Buzz-web-world/issues/1)) |
| **ANTI-CHEAT-01** | `host:question_show` | Un joueur inspecte les trames WebSocket sur le réseau local pendant `QUESTION_ACTIVE`. | `correctIndex` est **strictement omis** de `host:question_show` et n'est transmis au client que lors de `host:question_reveal`. | 🛡️ `index.ts:127-136` |
| **PACK-01** | `QuizPackCreateSchema`, `POST /api/packs` & `001_init_schema.sql` | Sauvegarde d'un pack contenant $< 12$ questions, ou d'une question `IMAGE_*` / `AUDIO_CLIP` sans `mediaKey` (ou `TEXT_CLASSIC` avec `mediaKey`). | Rejet HTTP 400 par `QuizPackCreateSchema` (`.min(12)`) et `QuestionCreateSchema` (`.refine(...)`), doublé par la contrainte PostgreSQL `CONSTRAINT media_required_for_non_text`. | ✅ `schemas.test.ts`, `repositories-and-packs.test.ts` ([#2](https://github.com/HextazDev/Buzz-web-world/issues/2), [#4](https://github.com/HextazDev/Buzz-web-world/issues/4)) |
| **POOL-01** | `PacksRepository.buildRoomQuestionPool` | Deux joueurs ayant téléchargé ou créé le même pack Workshop rejoignent un salon. | Calcul de l'union ensembliste $\text{Packs Officiels} \cup \bigcup_{j} (\text{Créés}_j \cup \text{Téléchargés}_j)$ avec déduplication stricte par `pack.id` et `question.id`. | ✅ `repositories-and-packs.test.ts` ([#4](https://github.com/HextazDev/Buzz-web-world/issues/4)) |
| **CLOUD-01** | `createInMemoryRepositories` | Démarrage du serveur ou exécution des tests sans conteneur Docker local (`DATABASE_URL` absent). | Initialisation immédiate en mémoire pré-peuplée par `OFFICIAL_SEED_PACKS` ($\ge 2$ packs officiels de $\ge 12$ questions chacun). | ✅ `repositories-and-packs.test.ts` ([#4](https://github.com/HextazDev/Buzz-web-world/issues/4)) |
| **RIV-01** | Table `friend_rivalries` (`001_init_schema.sql`) | Enregistrement d'une rivalité entre deux amis $A$ et $B$. | Contrainte SQL `CHECK (user_a_id < user_b_id)` garantissant l'unicité du couple bidirectionnel sans doublon inverse $(B, A)$. | 🛡️ `001_init_schema.sql:34` (Suivi service : [#7](https://github.com/HextazDev/Buzz-web-world/issues/7)) |

