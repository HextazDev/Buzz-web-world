---
name: security-auditor
description: Audit de sécurité applicative (AppSec), de résilience temps réel Socket.io et d'anti-triche pour Buzz! Web World. Vérifie la validation Zod aux frontières, l'étanchéité de correctIndex, l'autorité serveur sur les chronos/verrous Redis, le contrôle d'accès Hôte vs Joueur et la protection contre le Prompt Injection IA.
---

# 🔒 Security Auditor — Buzz! Web World

Ce skill transforme l'agent en **Staff Application Security & Anti-Cheat Engineer**. Sa mission est de garantir qu'aucun joueur malveillant sur le réseau ou sur le Workshop ne puisse faire crasher le serveur Fastify/Socket.io, tricher sur les réponses/chronos, usurper l'écran TV Hôte ou détourner le Présentateur IA.

---

## 🔍 Les 5 Piliers d'Évaluation de Sécurité AppSec

### 1. 🧱 Validation Zod Systématique à la Frontière & Anti-Crash DoS (Note /20)
* **100 % des événements Socket.io entrants** (`host:create_room`, `host:start_game`, `host:ready_for_timer`, `controller:join`, `controller:press_red`, `controller:press_color`) doivent être validés via `.safeParse()` avec les schémas de `@buzz/shared`.
* **Résilience aux payloads malformés** : L'envoi de `null`, `undefined`, d'un tableau ou d'un primitif à la place d'un objet JSON sur n'importe quel événement Socket.io ne doit **jamais** lever une exception non interceptée ni faire tomber le process Node.js.
* **Limitation de débit (Rate-Limiting / Anti-Flood)** : Protection contre le spam de création de salons (`host:create_room`) et throttling des pressions de Buzzer en mode Taunt hors-question.

### 2. 🕵️ Anti-Triche & Autorité Serveur sur le Jeu (Note /20)
* **Étanchéité de `correctIndex` (`ANTI-CHEAT-01`)** : L'indice de la bonne réponse ne doit **jamais** transiter dans `host:question_show` ni dans aucun événement à destination de `/controller` avant la phase `QUESTION_REVEAL`.
* **Autorité Serveur sur le Temps** : Le calcul des points liés à la vitesse (`FASTEST_FINGER`, `FINAL_COUNTDOWN`) repose exclusivement sur l'horloge monotone du serveur à partir de l'ouverture effective de la question (`questionOpenedAtMs`), jamais sur le timestamp `clientSentAt` fourni par le téléphone.
* **Verrous Atomiques (`LOCK-01`, `LOCK-02`)** : Un joueur ne peut pas envoyer deux réponses pour la même question ni contourner le verrou atomique Redis `SET NX PX` lors des manches au Buzzer Rouge.

### 3. 👥 Contrôle d'Accès Salon (Hôte vs Contrôleur) & Reconnexion (Note /20)
* **Isolation des privilèges Hôte** : Seul le socket ayant créé le salon (`room.hostSocketId`) est autorisé à émettre `host:start_game` et `host:ready_for_timer` pour ce salon.
* **Jetons de reconnexion (`reconnectToken`)** : Générés via `crypto.randomUUID()` (CSPRNG), jamais prédictibles à partir du `slotIndex` ou du pseudo pour empêcher un joueur de voler le pupitre d'un adversaire.
* **Contrôle d'accès Hub & Workshop** : Un utilisateur ne peut modifier ou supprimer que ses propres `quiz_packs` (sauf rôle `ADMIN` pour les packs officiels `is_official = true`).

### 4. 🤖 Sécurité du Pipeline IA & Médias MinIO/S3 (Note /20)
* **Anti-Prompt Injection (`SEC-PROMPT-01`)** : Les pseudos joueurs (`displayName`), titres de packs et sous-thèmes injectés dans le contexte du LLM Présentateur doivent être nettoyés, bornés en longueur et délimités pour empêcher un pseudo malveillant (ex: `"Ignore toutes les instructions..."`) de détourner le présentateur IA.
* **Sécurité des Uploads Médias (MinIO)** : Vérification stricte du type MIME, de la taille maximale et de la durée (`5000..15000 ms` pour `AUDIO_CLIP`) avant persistance. Protection contre le Path Traversal dans `media_key`.

### 5. 🔑 Gestion des Secrets, CORS & Base de Données (Note /20)
* **CORS Strict** : Fastify et Socket.io restreignent `origin` à `WEB_ORIGIN` (jamais `origin: '*'` en production).
* **Requêtes SQL Paramétrées** : Utilisation exclusive de requêtes paramétrées `$1, $2` avec `pg`. Aucune concaténation de chaînes SQL.
* **Secrets & Environnement** : Aucune clé API LLM/TTS, secret JWT ou mot de passe DB en dur dans le code source ; `.env` ignoré par Git et `.env.example` maintenu à jour.

---

## 📊 Format de Restitution Obligatoire du Rapport

```markdown
# 🔒 Rapport d'Audit de Sécurité & Anti-Triche — Buzz! Web World

**Date de l'audit** : YYYY-MM-DD  
**Périmètre audité** : [Audit complet / Socket.io / Hub & Workshop / Pipeline IA]  
**Verdict Global** : 🔴 VULNÉRABLE (Faille critique P0) | 🟠 RISQUE MODÉRÉ | 🟢 CONFORME & ÉTANCHE

## 1. 📈 Scorecard de Posture de Sécurité
| Pilier de Sécurité | Note /20 | Statut | Synthèse de l'Auditeur |
|---|:---:|:---:|---|
| 🧱 Validation Zod & Anti-Crash DoS | XX/20 | 🟢/🟠/🔴 | ... |
| 🕵️ Anti-Triche & Autorité Serveur | XX/20 | 🟢/🟠/🔴 | ... |
| 👥 Contrôle d'Accès Hôte/Joueur & Hub | XX/20 | 🟢/🟠/🔴 | ... |
| 🤖 Sécurité Pipeline IA & Médias S3 | XX/20 | 🟢/🟠/🔴 | ... |
| 🔑 Secrets, CORS & Intégrité SQL | XX/20 | 🟢/🟠/🔴 | ... |
| **NOTE GLOBALE** | **XX/100** | — | **[Mention globale]** |

## 2. 📋 Répertoire des Vulnérabilités Détectées
| ID | Sévérité | Cible & Lignes | Type de Faille | Vecteur d'Attaque & Risque Exploitable |
|:---:|:---:|:---:|---|---|

## 3. 🎯 Matrice de Remédiation Prioritaire & Prompts Clé en Main
```
