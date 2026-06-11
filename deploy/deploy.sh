#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# UORA — one-shot production deploy for a fresh Ubuntu 22.04 / 24.04 server.
#
# Run as a sudo-capable user from the repo root:
#     bash deploy/deploy.sh
#
# It will: install Docker + the gVisor (runsc) runtime, verify .env exists,
# build all images, and bring the full stack up. Idempotent — safe to re-run.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
say() { echo -e "\n\033[36m[deploy]\033[0m $*"; }

# ── 1. .env present? ─────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  say "No .env found. Copy the template and fill it in first:"
  echo "    cp .env.production.template .env && nano .env"
  exit 1
fi

# ── 2. Docker ────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker Engine + compose plugin…"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi
say "Docker: $(docker --version)"

# ── 3. gVisor (runsc) — the sandbox runtime for contestant code ──────────────
if ! command -v runsc >/dev/null 2>&1; then
  say "Installing gVisor (runsc) runtime…"
  (
    set -e
    ARCH=$(uname -m)
    URL="https://storage.googleapis.com/gvisor/releases/release/latest/${ARCH}"
    wget -q "${URL}/runsc" "${URL}/runsc.sha512" \
         "${URL}/containerd-shim-runsc-v1" "${URL}/containerd-shim-runsc-v1.sha512"
    sha512sum -c runsc.sha512 -c containerd-shim-runsc-v1.sha512
    sudo mv runsc containerd-shim-runsc-v1 /usr/local/bin
    sudo chmod a+rx /usr/local/bin/runsc /usr/local/bin/containerd-shim-runsc-v1
    rm -f runsc.sha512 containerd-shim-runsc-v1.sha512
  )
  say "Registering runsc with the Docker daemon…"
  sudo runsc install
  sudo systemctl reload docker || sudo systemctl restart docker
fi
say "gVisor: $(runsc --version 2>/dev/null | head -1 || echo 'installed')"

# ── 4. Build + launch the full stack ─────────────────────────────────────────
say "Building images (first run takes a few minutes)…"
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

say "Starting the stack…"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# ── 5. Health summary ────────────────────────────────────────────────────────
sleep 8
say "Service status:"
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

IP=$(curl -s ifconfig.me 2>/dev/null || echo "<server-ip>")
cat <<EOF

\033[32m✓ UORA is up.\033[0m

  Frontend  → http://${IP}:3000
  API       → http://${IP}:8000/health
  Ref engine→ http://${IP}:8081/health
  MinIO UI  → http://${IP}:9001

Open the firewall for ports 3000, 8000, 8081, 9001 (and 443 if you add TLS).
Logs:   docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
Stop:   docker compose -f docker-compose.yml -f docker-compose.prod.yml down
EOF
