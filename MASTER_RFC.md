# SPÉCIFICATION TECHNIQUE & FONCTIONNELLE (MASTER RFC V1.1 - COMPLÈTE)
# PROJET « BUZZ! WEB WORLD »

> **Objectif du document :** Référentiel d'ingénierie exhaustif destiné aux développeurs et agents de génération de code. Ce document verrouille l'ensemble des règles métier, de la stack technique, du modèle de données et des contrats WebSockets pour éliminer toute ambiguïté d'implémentation.

---

## 1. Vision Globale & Architecture Système

Application web multijoueur locale (« Canapé / Salon ») pour **2 à 8 joueurs**, reproduisant fidèlement le rythme, les règles et la mise en scène de *Buzz! Quiz World* (PS3). L'écran maître (PC relié à la TV du salon) diffuse l'intégralité du spectacle visuel et sonore : plateau 2.5D, présentateur IA vocalisé, avatars animés, questions, chronomètres et écran de remise des titres. Les smartphones des joueurs servent exclusivement de manettes physiques virtuelles après scan d'un QR Code.

| Brique Système | Technologie Imposée | Rôle & Justification Technique |
| :--- | :--- | :--- |
| **Monorepo & Build** | `pnpm` + `Turborepo` (TypeScript) | Partage strict des schémas Zod, des états et des contrats WebSockets entre `apps/web`, `apps/server` et `packages/shared`. |
| **Frontend Web & Mobile** | Vue 3 (Vite, Pinia, Vue Router, Tailwind CSS) | Routes distinctes : `/host` (Plateau TV 1080p/4K), `/controller` (Buzzer mobile tactile) et `/hub` (Profil, Amis, Éditeur de Packs, Workshop). |
| **Backend Temps Réel** | Node.js + Fastify + Socket.io | Autorité serveur sur les chronos, gestion des rooms et chaînage de flux `ReadableStream` (LLM vers TTS). |
| **Persistance & Cache** | PostgreSQL 16 + Redis 7 + MinIO (S3) | PostgreSQL pour les comptes/packs/stats ; Redis pour l'état éphémère des rooms et les locks atomiques de buzz ; MinIO pour images/audios. |
| **Moteur 2.5D & Audio** | Rive (`@rive-app/canvas`) + Howler.js | Machines à états 2.5D (avatars et présentateur) + Web Audio API (`AnalyserNode`) pour la synchronisation labiale temps réel. |
| **Pipeline Présentateur IA** | LLM Streaming + TTS WebSocket (PCM 24kHz) | Génération de commentaires contextuels sarcastiques et synthèse vocale basse latence (`< 800 ms`) diffusée sur l'écran TV. |

---

## 2. Spécification du Contrôleur Mobile & des Avatars 2.5D

### 2.1 Le Buzzer Virtuel (Vue Mobile `/controller`)
L'interface smartphone est verrouillée en mode portrait plein écran (`100dvh`, `touch-action: manipulation`, sélection de texte et zoom désactivés). **Aucun texte de question ni de proposition n'est affiché sur le smartphone** afin de concentrer l'attention des joueurs sur le téléviseur.

* **Moitié supérieure (40 % de la hauteur) :** Gros Bouton Rouge circulaire (Buzzer) avec retour haptique (`navigator.vibrate(50)`) et anneau LED virtuel piloté par le serveur (`OFF`, `PULSE_READY`, `SOLID_LOCKED`, `AIM_TRIGGER`).
* **Moitié inférieure (60 % de la hauteur) :** Empilement vertical des 4 boutons rectangulaires colorés dans l'ordre strict :
  * `0 = BLEU (#0066FF)`
  * `1 = ORANGE (#FF6600)`
  * `2 = VERT (#00CC33)`
  * `3 = JAUNE (#FFCC00)`
* **Mode Hors-Question (Lobby, Inter-manche, Podium) :** Le bouton Rouge déclenche le *Son de Buzzer personnalisé* du joueur sur la TV ainsi qu'une animation de provocation (*Taunt*). Les 4 boutons colorés déclenchent 4 mimiques d'avatar (Saluer, Moquer, Pleurer, Danser).
* **Maintien de l'écran allumé (`Screen Wake Lock API`) :** Dès la connexion au salon sur `/controller`, le client mobile appelle `navigator.wakeLock.request('screen')` et ré-acquiert le verrou sur l'événement `visibilitychange` pour empêcher la mise en veille du téléphone pendant que le joueur regarde la TV.

### 2.2 Système de Rig Universel 2.5D (Rive)
Tous les avatars joueurs partagent un unique squelette maître (`avatar_master.riv`) utilisant des *Skins/Solos* interchangeables : **12 costumes** (`rocker`, `astronaut`, `granny`, `geek`, `wrestler`, `detective`, `pirate`, `cheerleader`, `mad_scientist`, `knight`, `tourist`, `dandy`) et **12 sons de buzzers**.
* **Inputs Avatar (`avatar_master.riv`) :**
  * Input numérique `state` : `0: Idle`, `1: Thinking`, `2: Answered_Waiting`, `3: Buzz_Slam`, `4: Celebrate`, `5: Angry_Lose`, `6: Taunt`
  * Triggers d'effets : `Hit_Pie`, `Bomb_Hold`, `Bomb_Explode`, `Slime_Drop`
* **Inputs Présentateur (`host_presenter.riv`) :**
  * `isSpeaking` (booléen)
  * `mouthOpen` (flottant de `0.0` à `1.0` calculé à 60 FPS via l'amplitude RMS/fréquentielle du flux TTS dans l'`AnalyserNode`)
  * `mood` : `0: Neutral`, `1: Sarcastic_Laugh`, `2: Shocked`, `3: Disappointed`, `4: Hype_Announce`

---

## 3. Écosystème des Packs, Médias & Workshop

* **Distinction Création Officielle vs Création Joueurs :** Les packs officiels sont générés et maintenus en interne par les administrateurs via un pipeline IA dédié. Les joueurs créent leurs packs personnels **manuellement** via l'éditeur web (sans génération IA exposée aux joueurs).
* **Calibrage d'un Pack :** Minimum obligatoire de **12 questions** pour autoriser l'enregistrement et la publication. Chaque question définit obligatoirement un `sub_theme` court (affiché lors de la manche *La Mise*), une difficulté (`1` à `3`), un énoncé (`prompt`), **exactement 4 propositions** associées aux 4 couleurs du contrôleur et un seul `correct_index` (`0..3`).
* **Les 4 Formats de Questions :**
  * `TEXT_CLASSIC` (texte pur)
  * `IMAGE_STANDARD` (image fixe)
  * `IMAGE_REVEAL` (image initialement pixelisée/zoomée se dévoilant progressivement sur 8 secondes)
  * `AUDIO_CLIP` (extrait MP3/OGG de 5 à 15 secondes)
* **Agrégation Dynamique de la Banque du Salon :** Dès qu'un joueur authentifié rejoint le salon, le serveur calcule automatiquement l'union ensembliste :
  $$\text{Banque Salon} = \text{Packs Officiels} \cup \bigcup_{j \in \text{Joueurs}} (\text{Packs Créés par } j \cup \text{Packs Téléchargés par } j \text{ sur le Workshop})$$

---

## 4. Formats de Partie & Règles Mathématiques des 10 Manches

L'hôte sélectionne l'un des 4 formats : **Partie Courte** (3 manches + Finale, ~12 min), **Partie Normale** (5 manches + Finale, ~20 min), **Partie Longue** (8 manches + Finale, ~35 min) ou **Partie Personnalisée** (2 à 12 manches).
Entre chaque manche, la mécanique du **« Choix du Perdant »** donne la main au joueur ayant le score le plus bas : la TV affiche 4 combinaisons `[Manche + Pack du Salon]` associées aux 4 couleurs, et seul son smartphone s'active pendant 10 secondes pour trancher.

| Manche | Volume | Mécanique Temps Réel & Formule de Calcul des Points |
| :--- | :--- | :--- |
| **1. Accumulation** *(Point Builder)* | 6 questions | Accès direct aux 4 couleurs (10 s). Premier appui verrouillé. Bonne réponse : **+250 pts**. Mauvaise réponse ou hors délai : **0 pt**. |
| **2. Doigt sur la gâchette** *(Fastest Finger)* | 6 questions | Accès direct aux 4 couleurs (10 s). La valeur décroît linéairement de 400 à 100 pts (−30 pts/s). Formule : $\text{Points} = \max(100, \lfloor 400 - 30 \times t_{\text{réponse}} \rfloor)$. Erreur : **0 pt**. |
| **3. Stop ou Encore** *(Point Stealer)* | 6 questions | Prise de main au **Buzzer Rouge** (lock atomique Redis) puis 3 s pour choisir la couleur. Juste : **+300 pts** (ou vol de 300 pts à une cible choisie en 5 s). Faux/hors délai : **−150 pts** et réouverture aux autres joueurs (max 2 essais/question). |
| **4. L'Entartage** *(Pie Fight)* | Max 8 questions | 2 vies par joueur. Le 1er à buzzer au Rouge et répondre juste active la visée : un réticule change d'avatar survivant toutes les **450 ms**. Appui sur Rouge pour tirer (+100 pts/tarte). 2 tartes reçues = éliminé. Dernier survivant : **+500 pts** (2e : +250 pts). |
| **5. La Bombe** *(Pass the Bomb)* | Flux continu | Remise au leader initial avec mèche secrète aléatoire (**28 à 42 s**). Seul le porteur répond : juste = passe la bombe au voisin de droite (**+100 pts**) ; faux = garde la bombe et **−3 s** sur la mèche. Explosion à 0 s : **−400 pts** (plancher à 0). |
| **6. La Mise** *(High Stakes)* | 5 questions | Phase 1 (6 s) : affichage du `sub_theme` seul ; mise via les 4 couleurs (Bleu = 50, Orange = 100, Vert = 250, Jaune = 500 pts). Phase 2 (8 s) : révélation de la question. Juste : **+Mise** ; Faux : **−Mise** (plancher à 0). |
| **7. En Ébullition** *(Boiling Point)* | Max 10 questions | Thermomètre à 6 graduations par joueur. Juste : **+1 cran** (+50 pts) ; Faux : **−1 cran** (min 0). Le premier joueur atteignant le 6e cran interrompt la manche et remporte le jackpot de **+750 pts**. |
| **8. Sur la Sellette** *(On the Spot)* | 1 tour/joueur (max 4) | Un joueur $J_{\text{cible}}$ est isolé. Les autres votent en 6 s (Bleu = il réussit, Orange = il échoue). Si $J_{\text{cible}}$ répond juste : **+400 pts** pour lui et **+200 pts** aux votants Bleu. S'il échoue : **0 pt** pour lui et **+200 pts** aux votants Orange. |
| **9. Finale : Compte à Rebours** | Jusqu'à 1 survivant | Scores convertis en hauteur de socle de **6,0 s** (dernier) à **14,0 s** (1er) selon $T_i = 6.0 + 8.0 \times \frac{S_i - S_{\min}}{\max(1, S_{\max} - S_{\min})}$. Les socles descendent à −1,0 s/s tant que le joueur n'a pas verrouillé sa couleur. Juste : hauteur conservée (+0,5 s au plus rapide). Faux : chute immédiate de **−1,5 s**. À 0,0 s : élimination dans la trappe. |
| **10. Finale Égalité : Éclair** | Mort subite | Déclenchée uniquement si les 2 derniers finalistes chutent à 0,0 s à la même milliseconde. Buzzer Rouge + réponse : juste = victoire ; faux = victoire immédiate de l'adversaire. |

---

## 5. Cérémonie des Titres (« Buzz! Awards ») & Statistiques entre Amis

Avant le podium final, le serveur analyse la télémétrie de la partie pour attribuer un titre humoristique à chaque participant, annoncé par le présentateur IA :

* **Gâchette Folle (`TRIGGER_HAPPY`) :** Temps de réaction moyen le plus bas (< 1,8 s) mais taux d'erreur > 50 %.
* **Le Sniper (`SNIPER`) :** Précision ≥ 85 % avec un temps de réaction moyen dans le top 2 du salon.
* **La Tortue Géniale (`TORTUE_GENIALE`) :** Temps moyen le plus lent (> 5,5 s) mais précision ≥ 70 %.
* **Aimant à Tartes (`AIMANT_A_TARTES`) :** Joueur ayant subi le plus d'entartages et de vols de points cumulés.
* **L'Ennemi Public n°1 (`BOURREAU`) :** Joueur ayant ciblé le plus grand nombre de fois un même adversaire (son souffre-douleur).
* **Le Kamikaze (`KAMIKAZE`) :** Plus grosse perte de points cumulée dans *La Bombe* et *La Mise*.
* **Le Miraculé (`COMEBACK_KING`) :** Classé dans les 2 derniers avant la Finale, mais termine 1er ou 2e.
* **Mental en Chips (`CHOKER`) :** Leader avec plus de 1000 pts d'avance avant la Finale, mais perd la couronne.
* **Spammer Compulsif (`BOUTTON_ROUGE_ADDICT`) :** Plus de 40 pressions de Taunt pendant les phases hors-question.

**Suivi des Rivalités entre Amis :** À la clôture de chaque partie, pour toute paire d'amis $(A, B)$ présente dans le salon, le serveur met à jour la table `friend_rivalries` (nombre de fois où $A$ a terminé devant $B$, tartes envoyées à $B$, points dérobés à $B$). Ces compteurs sont consultables dans le Hub Web et injectés dans le prompt du Présentateur IA lors des soirées suivantes.
