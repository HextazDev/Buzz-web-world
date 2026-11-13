# 🚨 Buzz! Web World

[![Node.js](https://img.shields.io/badge/Node.js-22%2B%20%7C%2024-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%20strict-blue.svg)](tsconfig.base.json)
[![Vue 3](https://img.shields.io/badge/Vue-3.5%20%2B%20Vite-4FC08D.svg)](https://vuejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.x%20%2B%20Socket.io-000000.svg)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20%2B%20Redis%207-336791.svg)](docker-compose.yml)

Application web multijoueur locale (« Canapé / Salon ») pour **2 à 8 joueurs**, reproduisant fidèlement le rythme, les règles et la mise en scène de *Buzz! Quiz World* (PS3).

L'écran maître (PC relié à la TV du salon sur `/host`) diffuse l'intégralité du spectacle visuel et sonore : plateau 2.5D animé sous **Rive**, **présentateur IA vocalisé** en temps réel (lip-sync 60 FPS), avatars expressifs, questions multimédias, chronomètres et cérémonie des titres. Les smartphones des joueurs (`/controller`) servent exclusivement de **buzzers physiques virtuels** à retour haptique après scan d'un QR Code.

---

## 🌟 Fonctionnalités Clés

- 📺 **Spectacle TV 1080p/4K (`/host`)** : Plateau maître conçu pour le salon, animations 2.5D, pupitres des 8 joueurs en temps réel et anti-triche strict (`correct_index` jamais exposé avant la révélation).
- 📱 **Buzzer Virtuel Tactile (`/controller`)** : Interface mobile verrouillée en portrait plein écran (`100dvh`), gros bouton rouge avec anneau LED piloté par le serveur (`OFF`, `PULSE_READY`, `SOLID_LOCKED`, `AIM_TRIGGER`), 4 boutons colorés (`Bleu`, `Orange`, `Vert`, `Jaune`), retour haptique (`navigator.vibrate`) et maintien de l'écran allumé (`Screen Wake Lock API`).
- 🎭 **Mode Taunt & Avatars Rive 2.5D** : Squelette universel (`avatar_master.riv`) avec **12 costumes**, **12 sons de buzzers** et mimiques temps réel hors-question (Saluer, Moquer, Pleurer, Danser, Provocation).
- 🎙️ **Présentateur IA & Lip-Sync 60 FPS** : Commentaires contextuels sarcastiques générés en streaming LLM vers TTS WebSocket (PCM 24 kHz, latence `< 800 ms`) avec ouverture de bouche pilotée par `AnalyserNode`.
- 🎡 **10 Manches Officielles & « Choix du Perdant »** : Moteur mathématique déterministe fidèle au jeu original, avec sélection inter-manche par le joueur ayant le score le plus bas.
- 🏆 **Cérémonie des « Buzz! Awards » & Rivalités** : Attribution de 9 titres humoristiques en fin de partie selon la télémétrie et suivi persistant des rivalités entre amis (`friend_rivalries`) injecté dans les répliques du présentateur IA.
- 🛠️ **Hub & Workshop Communautaire (`/hub`)** : Éditeur de packs de quiz (calibrage minimum de **12 questions**, 4 formats : `TEXT_CLASSIC`, `IMAGE_STANDARD`, `IMAGE_REVEAL`, `AUDIO_CLIP`) et agrégation dynamique de la banque du salon à la connexion des joueurs.

---

## 🏗️ Architecture du Monorepo

| Brique Système | Stack Technique | Rôle & Responsabilités |
| :--- | :--- | :--- |
| **`packages/shared`** (`@buzz/shared`) | TypeScript + Zod | Constantes métier, schémas de validation Zod, contrats d'événements Socket.io typés et moteur mathématique pur (`ScoringMath`). |
| **`apps/server`** (`@buzz/server`) | Node.js + Fastify 5 + Socket.io | Autorité serveur sur les chronos, machine à états des salons (`RoomManager`), verrous atomiques de buzz (Redis `SET NX PX`), persistance PostgreSQL 16 et pipeline IA/TTS. |
| **`apps/web`** (`@buzz/web`) | Vue 3 + Vite + Pinia + Vue Router + Tailwind CSS 4 | Trois expériences dédiées : `/host` (Plateau TV), `/controller` (Buzzer Smartphone) et `/hub` (Profil, Rivalités, Éditeur & Workshop). |
| **Infrastructure** (`docker-compose.yml`) | PostgreSQL 16 + Redis 7 + MinIO (S3) | Base relationnelle (`users`, `friend_rivalries`, `quiz_packs`, `questions`), états éphémères/locks temps réel et stockage objet des médias (images/extraits audio). |

```text
Buzz-web-world/
├── MASTER_RFC.md                 # Spécification technique et fonctionnelle de référence (v1.1)
├── docker-compose.yml            # Stack locale : PostgreSQL 16, Redis 7, MinIO (S3)
├── packages/
│   └── shared/                   # @buzz/shared : Constantes, Zod, Socket Events, ScoringMath
├── apps/
│   ├── server/                   # @buzz/server : API Fastify, WebSockets Socket.io, Migrations SQL
│   └── web/                      # @buzz/web    : Application Vue 3 (/host, /controller, /hub)
└── turbo.json                    # Orchestration du monorepo Turborepo
```

---

## 🎲 Les 10 Manches du Jeu

| # | Manche | Code | Mécanique & Calcul des Points |
| :-: | :--- | :--- | :--- |
| **1** | **Accumulation** | `POINT_BUILDER` | 6 questions. Accès direct aux 4 couleurs (10 s), premier appui verrouillé. Juste : **+250 pts**, Faux : **0 pt**. |
| **2** | **Doigt sur la gâchette** | `FASTEST_FINGER` | 6 questions. Décroissance linéaire de 400 à 100 pts ($-30\text{ pts/s}$) : $\max(100, \lfloor 400 - 30 \times t \rfloor)$. |
| **3** | **Stop ou Encore** | `POINT_STEALER` | 6 questions. Prise de main au **Buzzer Rouge** (lock atomique) puis 3 s pour répondre. Juste : **+300 pts** (ou vol à une cible). Faux : **−150 pts** (max 2 essais). |
| **4** | **L'Entartage** | `PIE_FIGHT` | Max 8 questions, 2 vies/joueur. Bonne réponse au Buzzer Rouge = visée cyclique (450 ms) pour entarter un adversaire (**+100 pts/tarte**, survivant : **+500 pts**). |
| **5** | **La Bombe** | `PASS_THE_BOMB` | Flux continu, mèche secrète (28 à 42 s). Juste = passe la bombe au voisin de droite (**+100 pts**) ; Faux = garde la bombe et **−3 s** sur la mèche. Explosion : **−400 pts**. |
| **6** | **La Mise** | `HIGH_STAKES` | 5 questions. Phase 1 (6 s) : annonce du `sub_theme` et mise (`50`, `100`, `250` ou `500` pts). Phase 2 (8 s) : question. Juste : **+Mise**, Faux : **−Mise** (plancher à 0). |
| **7** | **En Ébullition** | `BOILING_POINT` | Max 10 questions. Thermomètre à 6 graduations. Juste : **+1 cran** (**+50 pts**), Faux : **−1 cran**. Le 1er au 6e cran remporte le jackpot de **+750 pts**. |
| **8** | **Sur la Sellette** | `ON_THE_SPOT` | Un joueur cible est isolé ; les autres votent en 6 s (`Bleu` = réussit, `Orange` = échoue). Cible juste : **+400 pts** (votants Bleu : **+200 pts**) ; sinon votants Orange : **+200 pts**. |
| **9** | **Finale : Compte à Rebours** | `FINAL_COUNTDOWN` | Scores convertis en hauteur de socle de **6,0 s** à **14,0 s**. Descente à $-1,0\text{ s/s}$ tant que non verrouillé. Juste : maintien (**+0,5 s** au plus rapide). Faux : **−1,5 s**. Élimination à $0,0\text{ s}$. |
| **10** | **Finale Égalité : Éclair** | `FINAL_FLASHPOINT` | Mort subite si les 2 derniers finalistes tombent à $0,0\text{ s}$ à la même milliseconde. Buzzer Rouge + réponse : juste = victoire, faux = victoire de l'adversaire. |

---

## ⚡ Démarrage Rapide (En 3 Étapes)

### Prérequis
- **Node.js** 22+ (ou 24 LTS)
- **Docker & Docker Compose** *(Optionnel en dev/test grâce au mode **Cloud-First In-Memory**, utilisé uniquement pour tester PostgreSQL 16, Redis 7 et MinIO localement)*

### 1. Installer les dépendances
```bash
npm install
```

### 2. Lancer directement le serveur et l'application web (Mode Cloud-First Autonome)
```bash
npm run dev
```
> 💡 **Zero-Docker-Required** : Si PostgreSQL ou Redis ne sont pas lancés, `@buzz/server` bascule automatiquement sur ses adaptateurs et verrous atomiques en mémoire (`InMemory`). Pour démarrer la stack Docker complète en local : `npm run db:up`.
- 📺 **Plateau TV (`/host`)** : `http://localhost:5173/host`
- 📱 **Contrôleur Smartphone (`/controller`)** : `http://localhost:5173/controller?room=XXXX`
- 🛠️ **Hub & Workshop (`/hub`)** : `http://localhost:5173/hub`
- 🩺 **Healthcheck Serveur** : `http://localhost:3456/health`

---

## 🧪 Commandes Utiles & Qualité

| Commande | Description |
| :--- | :--- |
| `npm run dev` | Lance en parallèle le serveur Fastify/Socket.io (`:3456`) et le frontend Vite (`:5173`). |
| `npm run typecheck` | Vérifie le typage TypeScript strict (`tsc --noEmit` et `vue-tsc --noEmit`) sur tout le monorepo. |
| `npm run build` | Compile le serveur et le bundle de production Vite via Turborepo. |
| `npm run test` | Exécute la suite de tests unitaires et d'intégration à travers les workspaces. |
| `npm run db:up` | Démarre les conteneurs PostgreSQL 16, Redis 7 et MinIO en arrière-plan. |

---

## 📚 Documentation & Référentiel

- 📄 [**MASTER_RFC.md**](MASTER_RFC.md) : Spécification technique et fonctionnelle exhaustive (v1.1) — architecture, contrats WebSockets, formules de score des 10 manches, Buzz! Awards et modèle de données.
- 🤖 [**AGENTS.md**](AGENTS.md) : Guide d'ingénierie, catalogue des skills IA (`.agents/skills/`) et rituel de résolution d'issues en 5 phases.
- 🛡️ [**Registre des Cas Limites (`docs/EDGE_CASES.md`)**](docs/EDGE_CASES.md) : Invariants mathématiques, verrous atomiques de buzz, anti-triche et état de couverture des tests.
- 🐞 [**Problèmes Connus (`docs/KNOWN_ISSUES.md`)**](docs/KNOWN_ISSUES.md) : Bugs actifs identifiés, symptômes visibles en partie, contournements et issues GitHub de suivi.
- 🗄️ [**Schéma SQL PostgreSQL 16**](apps/server/db/migrations/001_init_schema.sql) : Tables `users`, `friend_rivalries`, `quiz_packs`, `questions` et `user_downloaded_packs`.
- 🧮 [**Moteur de Score (`ScoringMath`)**](packages/shared/src/scoring.ts) : Fonctions pures et déterministes de calcul des points.
- 🔌 [**Contrats Socket.io**](packages/shared/src/socket-events.ts) : Typage bidirectionnel strict `Host <-> Server` et `Controller <-> Server`.

---

## 🤝 Standards d'Ingénierie & Contribution

Ce projet applique les standards de qualité et d'architecture des projets [TournamentHub](https://github.com/HextazDev/TournamentHub) et [enigme-bot](https://github.com/HextazDev/enigme-bot) :
1. **Validation Stricte aux Frontières** : Tout payload WebSocket ou HTTP entrant doit être validé par un schéma **Zod** de `@buzz/shared` avant d'atteindre la machine à états.
2. **Anti-Triche Serveur** : Le serveur fait autorité sur les chronomètres et les verrous atomiques (`tryAcquireBuzzLock`). L'indice de bonne réponse (`correctIndex`) n'est jamais transmis au client avant la phase `QUESTION_REVEAL`.
3. **Zéro Band-Aid & Typage Strict** : `strict: true` et `noUncheckedIndexedAccess: true` activés globalement, zéro `any`, et nettoyage systématique des timers/listeners à la déconnexion.
4. **Conventional Commits & Issues** : Branches dédiées (`feat/...`, `fix/...`, `test/...`), commits normalisés référençant l'issue GitHub associée (`#N`), et validation complète (`npm run typecheck && npm run build && npm run test`) avant toute Pull Request.
