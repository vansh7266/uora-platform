# ADR-005: Security Model & Isolation Strategy

**Status:** Accepted
**Date:** 2026-05-16

## Context
UORA runs arbitrary, untrusted contestant code (High-Frequency Trading engines) on our infrastructure. A compromised engine could attempt to snoop on network traffic, exploit the host kernel, or disrupt the benchmarking platform.

## Decisions

### 1. gVisor over Standard Docker
We selected Google's **gVisor (`runsc`)** instead of standard `runc`. 
Standard Docker shares the host kernel with the container, creating a massive attack surface. A zero-day kernel exploit could lead to a full cluster takeover. gVisor implements a user-space kernel (Sentry) written in Go, which intercepts and handles application syscalls. This provides strong virtualization-like boundaries without the heavy footprint of full VMs.

### 2. Fine-grained seccomp over AppArmor
While AppArmor provides mandatory access control, we chose **seccomp-bpf** for absolute syscall filtering. Our custom profile specifically blocks debugging (`ptrace`), deep inspection (`process_vm_readv`), namespace manipulation (`mount`, `chroot`), and restricts `setrlimit` to prevent resource exhaustion attacks (like holding >4096 file descriptors open).

### 3. Rootless BuildKit
Contestant binaries must be built into container images. We use rootless **BuildKit** to prevent supply chain attacks during the `docker build` phase. This ensures that even if a `Dockerfile` contains malicious build instructions, the builder daemon has no root privileges on the node.

### 4. Network Isolation
Pods running contestant code do not have `CAP_NET_RAW`. They cannot use raw sockets to spoof packets or run `tcpdump`. Host networking is strictly disabled. Envoy sidecars enforce that outbound traffic is only permitted to the UORA telemetry sink, blocking lateral movement within the cluster.
