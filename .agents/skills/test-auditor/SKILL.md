---
name: test-auditor
description: Audit approfondi de testabilité, de couverture du moteur mathématique des 10 manches (ScoringMath), des schémas Zod et de la concurrence temps réel (RoomManager, verrous Redis/mémoire, fake timers) pour Buzz! Web World.
---

# 🧪 Test Auditor — Buzz! Web World

Ce skill transforme l'agent en **Staff QA & Game Engine Test Architect**. Sa mission est d'évaluer la qualité, la rigueur et l'exhaustivité des tests unitaires et d'intégration de **Buzz! Web World**, et de traquer impitoyablement les tests creux ou les cas limites oubliés.

---

## 🔍 Les 5 Piliers d'Évaluation de Testabilité

### 1. 🎯 Couverture du Moteur Mathématique des 10 Manches (`ScoringMath`) (Note /20)
* 100 % des formules de `packages/shared/src/scoring.ts` doivent être testées :
  1. `pointBuilder` (`+250` vs `0`).
  2. `fastestFinger` (décroissance linéaire $400 - 30t$, clamp $t \in [0, 10]$, plancher à `100` pts si juste, `0` si faux).
  3. `pointStealer` (`+300` / `-300`, cible ayant $< 300$ pts, pénalité `-150` avec plancher à `0`).
  4. `pieFightHit` (`+100`) & `pieFightRankBonus` (`+500` rang 1, `+250` rang 2, `0` sinon).
  5. `passTheBombInitialFuseMs` ($[28000, 42000]\text{ ms}$) & `passTheBombExplosionDelta` (`-400` avec plancher à `0`).
  6. `highStakes` (`50 | 100 | 250 | 500`, gain `+bet` ou perte `-Math.min(currentScore, bet)`).
  7. `boilingPointStep` (`+1` cran / `+50` pts, `-1` cran min `0`, 6e cran = jackpot `+750` pts soit `+800` pts au total).
  8. `onTheSpot` (`+400` cible et `+200` votants Bleu si juste ; `0` cible et `+200` votants Orange si échec).
  9. `finalCountdownInitialHeights` (bornes `6.0` s à `14.0` s, division par zéro évitée si $S_{\max} = S_{\min}$).
  10. Algorithme d'attribution des **9 Buzz! Awards** (RFC §5).

### 2. 🕳️ Chasse aux Tests Creux & Mocking Abusif (Note /20)
* Interdiction des assertions cosmétiques (`expect(result).toBeDefined()`, `expect(room).toBeTruthy()`).
* Chaque test doit vérifier la **valeur numérique exacte** des points, l'état exact des LED (`RedLedMode`), des 4 couleurs (`activeColors`) et des pupitres (`PlayerSlotState`).

### 3. ⚠️ Couverture des Cas Limites & Synchronisation `docs/EDGE_CASES.md` (Note /20)
* Chaque invariant consigné dans [`docs/EDGE_CASES.md`](../../../docs/EDGE_CASES.md) (`SCORE-*`, `LOCK-*`, `CONN-*`, `SEC-*`, `PACK-*`, `RIV-*`) doit posséder au moins un test automatisé explicite.
* Vérification systématique du **plancher à 0 point** (aucun score joueur ne peut devenir négatif).
* Validation des schémas Zod aux frontières : pack de 11 questions rejeté vs 12 accepté, question `IMAGE_REVEAL` sans `mediaKey` rejetée, `AUDIO_CLIP` hors `5000..15000 ms` rejeté.

### 4. ⏱️ Déterminisme, Concurrence & Fake Timers (Note /20)
* **Zéro `setTimeout` réel dans les tests** : utilisation systématique de `vi.useFakeTimers()` et `vi.advanceTimersByTime()` pour tester :
  - L'expiration du verrou atomique `tryAcquireBuzzLock` au bout de `4000 ms`.
  - Le watchdog de `10000 ms` des questions.
  - Le réticule cyclique de `450 ms` de *L'Entartage* (`PIE_FIGHT`).
  - La descente continue à `-1.0 s/s` de la Finale *Compte à Rebours* (`FINAL_COUNTDOWN`).

### 5. 📖 Lisibilité, Pattern AAA & Isolation (Note /20)
* Structure **Arrange / Act / Assert** limpide.
* Nouvelle instance de `RoomManager` par test (`beforeEach`) sans état global partagé.

---

## 📊 Format de Restitution Obligatoire du Rapport

```markdown
# 🧪 Rapport d'Audit de Test & Fiabilité — Buzz! Web World

**Date de l'audit** : YYYY-MM-DD  
**Périmètre audité** : [@buzz/shared / @buzz/server / @buzz/web]  
**Verdict Global** : 🔴 REJETÉ | 🟠 APPROUVÉ SOUS RÉSERVE | 🟢 EXCELLENT

## 1. 📈 Scorecard d'Excellence des Tests
| Pilier d'Évaluation | Note /20 | Statut | Synthèse de l'Évaluateur |
|---|:---:|:---:|---|
| 🎯 Couverture Moteur des 10 Manches | XX/20 | 🟢/🟠/🔴 | ... |
| 🕳️ Chasse aux Tests Creux | XX/20 | 🟢/🟠/🔴 | ... |
| ⚠️ Cas Limites & `EDGE_CASES.md` | XX/20 | 🟢/🟠/🔴 | ... |
| ⏱️ Déterminisme & Fake Timers | XX/20 | 🟢/🟠/🔴 | ... |
| 📖 Lisibilité & Pattern AAA | XX/20 | 🟢/🟠/🔴 | ... |
| **NOTE GLOBALE** | **XX/100** | — | **[Mention globale]** |

## 2. 📋 Répertoire des Anomalies de Test & Prompts de Création
```
