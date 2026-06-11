# Deploying UORA

UORA's sandbox builder compiles and runs **untrusted contestant code** inside a
gVisor sandbox. That requires **Docker + a Linux host** — it cannot run on macOS
or on container-only PaaS products (Railway/Render/Fly) that forbid the nested,
privileged container runtime gVisor needs. So the full platform deploys to a
plain **Linux VM where you have root**.

## Recommended platform

| Platform | Cost | Why |
|---|---|---|
| **DigitalOcean Droplet** (Ubuntu 24.04, 2 vCPU / 4 GB) | ~$24/mo or hourly | Easiest; root access; one-click Ubuntu; great docs. **Recommended.** |
| **Hetzner Cloud** (CX22, 2 vCPU / 4 GB) | ~€4/mo | Cheapest with full root + nested-container support. |
| **AWS EC2** (t3.medium) | pay-as-you-go | Use the Terraform in `infra/terraform/` if you want IaC. |

Pick **2 vCPU / 4 GB minimum** (the bot fleet + builder are memory-hungry).

---

## One-command deploy (≈ 10 minutes)

On your **local machine**, nothing changes. On a **fresh Ubuntu VM**:

```bash
# 1. SSH in
ssh root@<SERVER_IP>

# 2. Clone the repo
git clone https://github.com/vansh7266/uora-platform.git
cd uora-platform

# 3. Create the production .env from the template, fill in secrets
cp .env.production.template .env
nano .env          # replace every CHANGE_ME_… (use: openssl rand -hex 32)
#                    set PUBLIC_API_URL / NEXT_PUBLIC_API_URL / FRONTEND_URL
#                    to http://<SERVER_IP>:8000 and :3000

# 4. Deploy — installs Docker + gVisor, builds images, starts everything
bash deploy/deploy.sh
```

When it finishes you get:

```
Frontend   → http://<SERVER_IP>:3000
API        → http://<SERVER_IP>:8000/health
Ref engine → http://<SERVER_IP>:8081/health
MinIO UI   → http://<SERVER_IP>:9001
```

Open the firewall for those ports (DigitalOcean: *Networking → Firewalls*;
Ubuntu ufw: `sudo ufw allow 3000,8000,8081,9001/tcp`).

---

## What the deploy script does

1. Installs **Docker Engine** + compose plugin (`get.docker.com`).
2. Installs **gVisor** (`runsc`) and registers it as a Docker runtime — this is
   the sandbox that isolates contestant engines.
3. `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
   brings up all services: MinIO, TimescaleDB, Redis, the submission API,
   BuildKit, the sandbox builder, the benchmark worker, Envoy, the telemetry
   ingester, **and the Next.js leaderboard** (added by the prod overlay).

---

## Adding HTTPS + a domain (optional, recommended for the real submission)

1. Point an A record (e.g. `uora.yourdomain.com`) at `<SERVER_IP>`.
2. Put **Caddy** in front (auto-TLS):

   ```bash
   # /etc/caddy/Caddyfile
   uora.yourdomain.com {
       reverse_proxy localhost:3000
   }
   api.uora.yourdomain.com {
       reverse_proxy localhost:8000
   }
   ```
3. In `.env` set the public URLs to the `https://` domains and
   `COOKIE_SECURE=true`, then re-run `bash deploy/deploy.sh`.
4. If you use Google OAuth, add the `https://api.…/auth/google/callback`
   redirect URI in the Google Cloud console.

---

## Operating it

```bash
# logs (all services)
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# restart one service after a code change
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build submission

# stop everything
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# wipe all data (fresh leaderboard)
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
```

---

## Frontend-only quick demo (no backend)

If you just want a public URL of the **landing + demo dashboard** for judges to
click (uploads won't run, but the whole UI works in demo mode):

```bash
cd uora/leaderboard
npm i -g vercel
vercel            # accept defaults; it builds and gives you a *.vercel.app URL
```

The dashboard's "Explore the Demo" path is fully client-side, so this works with
zero backend. Use it as a fallback if the VM isn't ready by the deadline.
