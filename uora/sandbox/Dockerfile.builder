# ── UORA Sandbox Builder Worker ────────────────────────────────────────────
# Runs the async build consumer that compiles contestant submissions
# inside sandboxed Docker builds and deploys them to Kubernetes.
# ────────────────────────────────────────────────────────────────────────────

FROM moby/buildkit:latest AS buildkit

FROM python:3.11-slim AS base

# Install Docker CLI (for buildx) and kubectl
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        lsb-release && \
    # Docker CLI
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends docker-ce-cli && \
    # kubectl
    ARCH="$(dpkg --print-architecture)" && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/${ARCH}/kubectl" && \
    install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl && \
    rm kubectl && \
    # Clean up
    apt-get remove -y gnupg lsb-release && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=buildkit /usr/bin/buildctl /usr/local/bin/buildctl

# Create non-root user
RUN groupadd --gid 1000 uora && \
    useradd --uid 1000 --gid uora --create-home uora

WORKDIR /app

# Install Python dependencies
COPY uora/sandbox/requirements-builder.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy only the necessary source files
COPY uora/__init__.py ./uora/__init__.py
COPY uora/sandbox/__init__.py ./uora/sandbox/__init__.py
COPY uora/sandbox/builder.py ./uora/sandbox/builder.py

# Run as non-root
USER uora

CMD ["python", "-m", "uora.sandbox.builder"]
