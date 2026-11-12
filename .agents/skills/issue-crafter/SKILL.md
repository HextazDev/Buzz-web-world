---
name: issue-crafter
description: Atelier de cadrage produit et de rédaction d'issues GitHub Haute Définition ("Agent-Ready") pour Buzz! Web World. Ancre chaque ticket dans la MASTER_RFC.md, le schéma PostgreSQL 16, les contrats @buzz/shared et docs/EDGE_CASES.md.
---

# 💡 Issue Crafter — Buzz! Web World

Ce skill transforme l'agent en **Staff Technical Product Manager**. Sa mission est de transformer une idée de fonctionnalité ou un constat de bug en une **spécification GitHub Issue Haute Définition ("Agent-Ready")** directement exécutable par le rituel d'issue.

---

## 🧭 Workflow en 4 Phases

1. **Phase 1 : Vérification des doublons**
   ```bash
   gh issue list -R HextazDev/Buzz-web-world --state all --limit 30
   ```
2. **Phase 2 : Grounding Technique dans le Codebase**
   * **Référentiel RFC** : Vérifier la section correspondante dans [`MASTER_RFC.md`](../../../MASTER_RFC.md).
   * **Base de données** : Inspecter [`apps/server/db/migrations/001_init_schema.sql`](../../../apps/server/db/migrations/001_init_schema.sql).
   * **Contrats Partagés (`@buzz/shared`)** : Inspecter `constants.ts`, `schemas.ts`, `socket-events.ts`, `scoring.ts`.
   * **Backend (`@buzz/server`) & Frontend (`@buzz/web`)** : Identifier les fichiers exacts à créer ou modifier.
   * **Cas Limites & Bugs Connus** : Identifier les IDs de [`docs/EDGE_CASES.md`](../../../docs/EDGE_CASES.md) et [`docs/KNOWN_ISSUES.md`](../../../docs/KNOWN_ISSUES.md).
3. **Phase 3 : Rédaction Haute Définition ("Agent-Ready")**
4. **Phase 4 : Publication via `gh issue create`** (après validation utilisateur si le cadrage comporte des choix ouverts).

---

## 📝 Template Obligatoire d'Issue ("Agent-Ready")

```markdown
## 📌 Contexte & Problème
Description claire du besoin fonctionnel (référence `MASTER_RFC.md` §X) ou du bug constaté (`KI-xx`).

## 🎯 Spécifications Fonctionnelles
- **User Story** : En tant que [Hôte TV / Joueur Mobile / Créateur sur le Hub], je veux [Action] afin de [Bénéfice].
- **Règles métier & Formules** : Détail précis du comportement attendu.

## 🛠️ Spécifications Techniques
- **Base de données (`apps/server/db/`)** : Tables, colonnes ou migrations concernées.
- **Types Partagés (`@buzz/shared`)** : Schémas Zod, événements Socket.io ou fonctions `ScoringMath`.
- **Serveur Temps Réel (`@buzz/server`)** : Transitions `RoomManager`, verrous Redis, routes Fastify ou pipeline IA/TTS.
- **Frontend (`@buzz/web`)** : Stores Pinia, vues (`/host`, `/controller`, `/hub`), animations Rive 2.5D ou audio Howler.js.

## 📂 Fichiers Cibles Identifiés
- `packages/shared/src/...`
- `apps/server/src/...`
- `apps/web/src/...`

## ⚠️ Cas Limites & Sécurité
- IDs `docs/EDGE_CASES.md` et `docs/KNOWN_ISSUES.md` concernés.
- Anti-triche (`correctIndex` omis avant révélation), validation Zod, déconnexions/reconnexions et nettoyage mémoire.

---

## ✅ Critères d'Acceptation (Definition of Done)
- [ ] Critère fonctionnel 1 testable
- [ ] Critère fonctionnel 2 testable
- [ ] Tests unitaires Vitest couvrant les cas nominaux et les cas limites (`docs/EDGE_CASES.md` mis à jour)
- [ ] `npm run typecheck && npm run test && npm run build` passent avec 0 erreur
```
