# 🐞 Problèmes Connus — Buzz! Web World

Bugs et limitations techniques **constatés et non encore corrigés** dans le code actuel, avec leur impact visible pour l'hôte (`/host`) ou le joueur (`/controller`), un contournement éventuel et l'issue GitHub de suivi.

- **Ce document ≠ [`docs/EDGE_CASES.md`](EDGE_CASES.md)** : le registre des cas limites décrit les invariants techniques/mathématiques et leur statut de couverture de tests (`SCORE-*`, `LOCK-*`, `CONN-*`, `SEC-*`…). Ici, on consigne l'**impact visible en soirée** et la marche à suivre en attendant le correctif.
- **Entrée** : tout bug découvert lors d'un audit ou hors périmètre d'un ticket $\rightarrow$ création d'une issue GitHub (`/create-issue`) + ajout d'une ligne `KI-xx` ici.
- **Sortie** : dès que l'issue est corrigée et mergée, **retirer la ligne `KI-xx`** (l'historique Git fait foi) et promouvoir l'invariant correspondant en `✅` dans [`docs/EDGE_CASES.md`](EDGE_CASES.md).

---

## 📋 Registre Actif

| ID | Domaine | Symptôme visible | Contournement | Edge cases liés | Suivi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **KI-07** | `Persistance` / Base de Données | Le serveur n'utilise que les questions de démonstration en mémoire (`DEMO_QUESTIONS`) et ne se connecte pas encore à PostgreSQL 16 et MinIO. | Mode démo uniquement jusqu'au branchement des repositories Cloud-First (`InMemory` seedé + `Postgres`). | `PACK-01`, `POOL-01` | [#4](https://github.com/HextazDev/Buzz-web-world/issues/4) |
