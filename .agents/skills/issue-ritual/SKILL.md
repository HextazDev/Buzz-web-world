---
name: issue-ritual
description: Rituel d'ingénierie en 5 phases pour résoudre une issue GitHub sur Buzz! Web World. Impose un point d'arrêt de validation du plan (Gate), le TDD strict (Verify RED), la loi Anti-Band-Aids, la synchronisation de docs/EDGE_CASES.md et docs/KNOWN_ISSUES.md, et interdit tout commit automatique.
---

# 🥋 Rituel de Résolution d'Issue — Buzz! Web World

Ce rituel structure le travail de l'agent en **5 phases rigoureuses**. Il impose un **point d'arrêt obligatoire (Gate d'approbation)** après la récolte d'informations pour valider le plan avec l'utilisateur, applique une **discipline TDD stricte**, et **interdit formellement tout commit automatique**.

---

## 🧭 Vue d'ensemble du Déroulement

```text
┌─────────────────────────────────────────────┐
│ PHASE 1 : Cadrage & Récolte d'Infos        │ ➜ Git status, gh issue view, MASTER_RFC, EDGE_CASES, KNOWN_ISSUES
└──────────────────────┬──────────────────────┘
                       ▼
┌─────────────────────────────────────────────┐
│ PHASE 2 : 🛑 RÉCAPITULATIF & PLAN (STOP)   │ ➜ Présenter le plan complet et attendre le feu vert explicite !
└──────────────────────┬──────────────────────┘
                       ▼ (Validation utilisateur)
┌─────────────────────────────────────────────┐
│ PHASE 3 : Implémentation & TDD Strict       │ ➜ TDD Verify RED ➜ DB ➜ @buzz/shared ➜ @buzz/server ➜ @buzz/web
└──────────────────────┬──────────────────────┘
                       ▼
┌─────────────────────────────────────────────┐
│ PHASE 4 : 🧪 Porte de Vérification          │ ➜ npm run typecheck && npm run test && npm run build
└──────────────────────┬──────────────────────┘
                       ▼
┌─────────────────────────────────────────────┐
│ PHASE 5 : Bilan Final (Zéro Auto-Commit)    │ ➜ Sync EDGE_CASES / KNOWN_ISSUES, résumé 5 lignes, commande commit
└─────────────────────────────────────────────┘
```

---

## 📍 PHASE 1 : Cadrage & Collecte d'Informations

1. **Contexte Git & Branche** :
   ```bash
   git branch --show-current
   git status --short
   ```
   * Si la branche courante est `main`, recommander la création d'une branche dédiée (`git checkout -b feat/issue-<N>` ou `fix/issue-<N>`).
2. **Lecture de l'Issue GitHub** :
   ```bash
   gh issue view <NUMERO> -R HextazDev/Buzz-web-world --json number,title,body,labels
   ```
3. **Inspection du Référentiel & du Code** :
   * Vérifier les règles correspondantes dans [`MASTER_RFC.md`](../../../MASTER_RFC.md).
   * Consulter [`docs/EDGE_CASES.md`](../../../docs/EDGE_CASES.md) et [`docs/KNOWN_ISSUES.md`](../../../docs/KNOWN_ISSUES.md).
   * Inspecter les types et schémas dans `packages/shared/src/`.

---

## 🛑 PHASE 2 : Récapitulatif & Validation du Plan (POINT D'ARRÊT OBLIGATOIRE)

> [!IMPORTANT]
> **Ne modifier AUCUN fichier de code avant d'avoir présenté ce récapitulatif et obtenu la confirmation explicite de l'utilisateur.**

Présenter de manière concise :
1. **🌿 Contexte Git** : Branche active et état du working tree.
2. **🎯 Objectif & Périmètre** : Résumé en 2-3 phrases fidèle à la `MASTER_RFC.md`.
3. **📂 Fichiers impactés** : Liste ordonnée des fichiers à créer ou modifier (`@buzz/shared` $\rightarrow$ `@buzz/server` $\rightarrow$ `@buzz/web`).
4. **⚠️ Cas limites & Sécurité** : IDs `docs/EDGE_CASES.md` et `docs/KNOWN_ISSUES.md` impactés, validation Zod, anti-triche `correctIndex`, gestion des déconnexions et des timers.
5. **🧪 Stratégie TDD** : Tests Vitest prévus (1 test par cas limite).
6. **Demande explicite** : *"Ce plan te convient-il ? Dois-je lancer l'implémentation ?"*

---

## 💻 PHASE 3 : Implémentation Rigoureuse & Discipline d'Ingénierie

Respecter l'ordre strict des dépendances du monorepo :
1. `apps/server/db/migrations/` (si évolution du schéma SQL)
2. `packages/shared/src/` (Constantes, Schémas Zod, Contrats Socket.io, `ScoringMath` + Tests unitaires `@buzz/shared`)
3. `apps/server/src/` (`RoomManager`, services, handlers Fastify/Socket.io + Tests unitaires `@buzz/server`)
4. `apps/web/src/` (Stores Pinia, composants Vue/Rive/Audio)
5. `docs/EDGE_CASES.md` (promotion des invariants en `✅`) et `docs/KNOWN_ISSUES.md` (retrait des `KI-xx` corrigés)

---

## 🧪 PHASE 4 : Porte de Vérification (« Evidence Before Claims »)

Exécuter systématiquement et vérifier un code de sortie `0` sur :
```bash
npm run typecheck
npm run test
npm run build
```

---

## 🏁 PHASE 5 : Clôture, Commit & Push

* Vérifier `git status` et `git diff --stat` (aucun `console.log` de debug ni fichier parasite).
* **En environnement Cloud / Remote Agent** : Exécuter directement `git add`, `git commit -m "feat(scope): description claire (#<NUMERO>)"` et `git push` (ou ouverture de PR si sur branche de feature).
* Fournir un résumé clair en **5 lignes maximum** avec la référence du commit / branche poussée.
