# ADR-001: Sandbox Isolation Strategy

## Status
Accepted

## Context
UORA must execute arbitrary contestant code (C++/Rust/Go) safely. Standard Docker shares the host kernel -- insufficient for untrusted binaries.

## Decision
Use gVisor (runsc) as the container runtime with Kubernetes RuntimeClass.

## Rationale

| Approach | Security | Startup | Complexity |
| :--- | :--- | :--- | :--- |
| Docker + seccomp | Low | Fast | Low |
| gVisor (runsc) | High | Medium | Medium |
| Kata Containers | High | Slow (2s+) | High |

HFT benchmarks require <100ms container startup. gVisor intercepts syscalls in userspace without VM overhead.

## Implementation

### Install gVisor on K3s nodes:
```bash
curl -fsSL https://gvisor.dev/install.sh | sh
sudo runsc install
sudo systemctl restart k3s
```

### Create RuntimeClass:
```yaml
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc
```

Contestant pods use `runtimeClassName: gvisor`.

### Resource limits:
- CPU: 2 cores (pinned)
- Memory: 2GB hard limit (cgroup v2)
- Disk: 1GB ephemeral
- Network: isolated bridge, no external egress

### seccomp profile blocks:
`ptrace`, `process_vm_readv`, `mount`, `raw_socket`, `capset`.

## Build Security
- BuildKit container: no network, read-only rootfs, tmpfs for `/tmp`
- Compile timeout: 60s
- Memory cap: 512MB
- Output: static binary only (no shared libs)
- Pre-scan: `clang-tidy` rejects dangerous `#include` patterns

## Consequences
- Slightly higher syscall latency (~10-50us) vs native Docker
- Acceptable: we measure relative performance between contestants, not absolute bare-metal speed
- Future: eBPF telemetry (ADR-002) when running on bare-metal K8s

## References
- gVisor: [https://gvisor.dev](https://gvisor.dev)
- K3s RuntimeClass: [https://docs.k3s.io/advanced#gvisor](https://docs.k3s.io/advanced#gvisor)
