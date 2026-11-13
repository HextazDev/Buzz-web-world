# ☁️ Guide de Déploiement Cloud-First HTTPS — Buzz! Web World

Ce guide détaille le déploiement en **5 minutes** de **Buzz! Web World** sur une infrastructure Cloud HTTPS (à la manière de *Jackbox Party Games*), permettant à la TV (`/host`) et à 2 à 8 smartphones (`/controller`) de communiquer avec une latence WebSocket $< 30\text{ ms}$ en **4G/5G** comme en **Wi-Fi**, sans aucun blocage de pare-feu ni d'isolation Wi-Fi (AP Isolation).

---

## 🎯 Pourquoi l'Architecture Cloud-First HTTPS est Indispensable en Salon

1. **Zéro Friction 4G/5G & Wi-Fi Invité** : Les joueurs scannent le QR Code affiché sur la TV (`https://<votre-domaine>/controller?room=XXXX`) et rejoignent instantanément la partie, même si leur téléphone reste en 4G/5G ou sur un sous-réseau Wi-Fi isolé.
2. **Déblocage de l'API `navigator.wakeLock` sur Mobile** : Les navigateurs iOS Safari et Chrome Android exigent un **contexte sécurisé HTTPS** pour autoriser `navigator.wakeLock.request('screen')` afin que l'écran du smartphone ne s'éteigne pas entre deux questions.
3. **Autonomie « Zero-Docker-Required »** : L'image de production démarre immédiatement même sans base de données externe configurée (mode `zero-docker-autonomous` pré-peuplé avec 24 questions officielles), et bascule automatiquement en mode `managed-cloud` dès que `DATABASE_URL` (Neon / Supabase PostgreSQL 16) et `REDIS_URL` (Upstash Redis) sont renseignés.

---

## 🚀 Option 1 : Déploiement Mono-Conteneur Docker (Fly.io / Railway / Render / VPS)

Le [`Dockerfile`](../Dockerfile) multi-stage compile `@buzz/shared`, `@buzz/server` et `@buzz/web`, puis sert à la fois l'API REST, le serveur temps réel Socket.io et l'application Vue 3 SPA (`/host`, `/controller`, `/hub`) sur un seul port sous l'utilisateur non-privilégié `node` (`SEC-ENV-01`).

```bash
# 1. Construire l'image de production
docker build -t buzz-web-world:latest .

# 2. Lancer en mode autonome immédiat (InMemory + 24 questions officielles)
docker run -p 3456:3456 \
  -e PUBLIC_WEB_URL="https://buzz.votredomaine.com" \
  -e WEB_ORIGIN="https://buzz.votredomaine.com" \
  -e AUTH_SECRET="remplacer-par-un-secret-32-octets-minimum" \
  buzz-web-world:latest
```

---

## 🔑 Variables d'Environnement de Production

| Variable | Obligatoire ? | Description |
| :--- | :---: | :--- |
| `PORT` | Non (`3456`) | Port HTTP/WebSocket d'écoute du serveur Fastify. |
| `PUBLIC_WEB_URL` | Recommandé | URL publique HTTPS complète (ex: `https://buzz.votredomaine.com`) utilisée pour générer le QR Code des smartphones (`/controller?room=XXXX`). |
| `WEB_ORIGIN` | Recommandé | Liste d'origines CORS autorisées séparées par des virgules. |
| `SERVE_STATIC_WEB` | Non (`true` en Docker) | Si `true`, Fastify sert directement le bundle `@buzz/web/dist` en mono-instance. |
| `AUTH_SECRET` | Recommandé | Clé secrète HMAC-SHA256 pour signer les jetons d'authentification du Hub (`/hub`). |
| `DATABASE_URL` | Optionnel | URL PostgreSQL 16 managé (ex: Neon.tech, Supabase). Si absent, bascule sur `InMemoryRepositories` pré-peuplé. |
| `REDIS_URL` | Optionnel | URL Redis managé (ex: Upstash). Si absent, bascule sur les verrous atomiques en mémoire locale. |
| `S3_PUBLIC_BASE_URL` | Optionnel | URL publique du bucket S3 / Cloudflare R2 / MinIO pour les médias des packs. |

---

## 🩺 Vérification & Observabilité (`GET /health`)

Une fois déployé, interrogez `https://<votre-domaine>/health` :

```json
{
  "status": "ok",
  "service": "buzz-web-world-server",
  "dbBackend": "postgres",
  "lockBackend": "redis",
  "cloudFirstMode": "managed-cloud",
  "activeRoomsCount": 0
}
```
