# 🤖 Guide des Agents IA — Buzz! Web World

Ce document définit les règles d'ingénierie, d'architecture et de collaboration obligatoires pour tout agent IA (Antigravity, Claude Code, Cursor, Copilot) intervenant sur le monorepo **Buzz! Web World**.

> **Référentiel absolu** : Toute implémentation doit respecter scrupuleusement la [**MASTER_RFC.md**](MASTER_RFC.md) (v1.1) ainsi que les invariants consignés dans [`docs/EDGE_CASES.md`](docs/EDGE_CASES.md) et [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md).

---

## 🏗️ Architecture & Vérité Technique du Monorepo

| Workspace | Chemin | Stack & Rôle |
| :--- | :--- | :--- |
| **`@buzz/shared`** | `packages/shared/` | Source unique de vérité pour les constantes (`constants.ts`), les schémas **Zod** (`schemas.ts`), les contrats **Socket.io** (`socket-events.ts`) et le moteur mathématique pur (`scoring.ts`). **Zéro dépendance vers `apps/server` ou `apps/web`.** |
| **`@buzz/server`** | `apps/server/` | Backend temps réel **Fastify 5 + Socket.io**, machine à états des salons (`RoomManager`), verrous atomiques Redis (`SET NX PX`), persistance **PostgreSQL 16** (`db/migrations/001_init_schema.sql`), stockage **MinIO (S3)** et pipeline IA (LLM Streaming $\rightarrow$ TTS PCM 24 kHz). |
| **`@buzz/web`** | `apps/web/` | Frontend **Vue 3 (Vite, Pinia, Vue Router, Tailwind CSS 4)** avec 3 routes strictes : `/host` (Plateau TV 1080p/4K, Rive 2.5D, Howler.js, Lip-Sync 60 FPS), `/controller` (Buzzer mobile portrait `100dvh`, Wake Lock, Haptics, **zéro texte de question**) et `/hub` (Profil, Rivalités, Éditeur de Packs $\ge 12$ questions, Workshop). |

---

## 🥋 Rituel Obligatoire pour Résoudre une Issue

> [!IMPORTANT]
> **Avant de modifier le moindre fichier de code pour résoudre une issue, appliquer OBLIGATOIREMENT le Skill :**
> * **Skill complet** : [`.agents/skills/issue-ritual/SKILL.md`](.agents/skills/issue-ritual/SKILL.md)

### Le Cycle en 5 Phases Systématiques :
1. **Phase 1 : Cadrage & Contexte Git (`gh issue view <NUMERO>`)** :
   * Vérifier la branche active (`git branch --show-current`), les commits existants (`git log main..HEAD --oneline`) et l'état local (`git status --short`). Alerter si sur `main` et proposer `git checkout -b feat/issue-<NUMERO>` (ou `fix/issue-<NUMERO>`).
   * Inspecter `MASTER_RFC.md`, `packages/shared/src/`, `apps/server/db/migrations/001_init_schema.sql`, [`docs/EDGE_CASES.md`](docs/EDGE_CASES.md) et [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md).
2. **Phase 2 : 🛑 RÉCAPITULATIF & PLAN D'IMPLÉMENTATION (Point d'arrêt obligatoire)** :
   * Présenter : Contexte Git, Objectif, Fichiers impactés, Impact DB/ Contrats `@buzz/shared`, Cas limites (`docs/EDGE_CASES.md`), Sécurité/Anti-Triche et Stratégie TDD.
   * **STOP** : Attendre le feu vert explicite de l'utilisateur avant d'écrire du code.
3. **Phase 3 : Implémentation Rigoureuse & Discipline d'Ingénierie** :
   * Ordre d'implémentation : `1. DB SQL (apps/server/db/migrations/)` $\rightarrow$ `2. @buzz/shared (Zod, contrats Socket, ScoringMath)` $\rightarrow$ `3. @buzz/server (RoomManager, services, handlers Socket/REST)` $\rightarrow$ `4. @buzz/web (Pinia stores, composants Vue/Rive)` $\rightarrow$ `5. Tests Vitest & Synchronisation docs/EDGE_CASES.md + docs/KNOWN_ISSUES.md`.
   * 🔴 **TDD strict avec Verify RED** : Écrire le test unitaire d'abord pour toute règle de score ou transition d'état, constater l'échec, puis implémenter.
   * 🛡️ **Loi d'airain Anti-Band-Aids** : Interdiction des `?.` sauvages pour masquer un bug d'état, des `try/catch` vides et des `as any`.
4. **Phase 4 : 🧪 Porte de Vérification (« Evidence Before Claims »)** :
   * Exécuter obligatoirement `npm run typecheck && npm run test && npm run build` et prouver que tout passe avec 0 erreur.
5. **Phase 5 : Clôture, Commit & Push** :
   * Synchroniser [`docs/EDGE_CASES.md`](docs/EDGE_CASES.md) (promotion en `✅`) et retirer les entrées corrigées de [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md).
   * **Environnement Cloud / Remote Agent** : Commiter proprement (Conventional Commits) et pousser (`git push`) directement sur le dépôt distant. En local desktop uniquement, demander confirmation avant `git commit`.

---

## 🛠️ Catalogue des Skills IA du Projet

| Skill | Fichier | Mission Principale |
| :--- | :--- | :--- |
| **🧐 Code Reviewer** | [`.agents/skills/code-reviewer/SKILL.md`](.agents/skills/code-reviewer/SKILL.md) | Audit Staff Engineer sur 6 piliers (Architecture Monorepo, Conformité RFC 10 Manches, Sécurité/Anti-Triche, Performance Temps Réel, Typage TypeScript/Zod, Testabilité) avec Scorecard `/100`. |
| **🔒 Security Auditor** | [`.agents/skills/security-auditor/SKILL.md`](.agents/skills/security-auditor/SKILL.md) | Audit AppSec & Anti-Triche (validation Zod sur 100 % des événements Socket.io/HTTP, omission stricte de `correctIndex` avant révélation, verrous atomiques Redis, protection DoS/flood Buzzer, sanitization prompts IA). |
| **🧪 Test Auditor** | [`.agents/skills/test-auditor/SKILL.md`](.agents/skills/test-auditor/SKILL.md) | Audit QA des tests unitaires et d'intégration (`ScoringMath`, `RoomManager`, fake timers sur les chronos/locks, chasse aux tests creux, alignement avec `docs/EDGE_CASES.md`). |
| **💡 Issue Crafter** | [`.agents/skills/issue-crafter/SKILL.md`](.agents/skills/issue-crafter/SKILL.md) | Cadrage produit et rédaction de tickets GitHub Haute Définition ("Agent-Ready") ancrés dans le code et la `MASTER_RFC.md`. |
| **🥋 Issue Ritual** | [`.agents/skills/issue-ritual/SKILL.md`](.agents/skills/issue-ritual/SKILL.md) | Workflow en 5 phases avec Gate d'approbation, TDD strict, synchronisation documentaire et zéro auto-commit. |

---

## 🐙 Conventions de Commits & PR

* Appliquer la convention **Conventional Commits** :
  * `feat(scope): description (#N)`
  * `fix(scope): description (#N)`
  * `refactor(scope): description (#N)`
  * `test(scope): description (#N)`
  * `docs(scope): description (#N)`
* Scopes recommandés : `shared`, `server`, `web`, `db`, `rive`, `audio`, `ai-presenter`, `hub`.
