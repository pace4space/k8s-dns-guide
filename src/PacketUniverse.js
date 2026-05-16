import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Node info cards ──────────────────────────────────────────────────────────
// Keyed by node id — shown in the popup when a node is clicked.

const NODE_INFO = {
  // ── resolv.conf ──
  resolv: {
    title: '/etc/resolv.conf',
    subtitle: 'DNS resolver configuration — injected by kubelet',
    color: '#9b7ff4',
    sections: [
      {
        label: 'Example file contents',
        code: `nameserver 10.96.0.10      # CoreDNS ClusterIP
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5`,
      },
      {
        label: 'What each line does',
        bullets: [
          'nameserver — the IP the kernel sends DNS queries to (CoreDNS)',
          'search — suffixes tried automatically for short names',
          'ndots:5 — if hostname has <5 dots, try search domains first',
        ],
      },
      {
        label: 'Production tip',
        warn: 'Set ndots:2 and single-request in pod dnsConfig to avoid the 5-second conntrack race condition.',
      },
    ],
  },

  // ── CoreDNS ──
  coredns: {
    title: 'CoreDNS',
    subtitle: 'Cluster DNS server — runs as Deployment in kube-system',
    color: '#2dd4bf',
    sections: [
      {
        label: 'Default Corefile',
        code: `.:53 {
  errors
  health { lameduck 5s }
  kubernetes cluster.local {
    pods insecure
    fallthrough in-addr.arpa ip6.arpa
    ttl 30
  }
  prometheus :9153
  forward . /etc/resolv.conf
  cache 30
  loop
  reload
}`,
      },
      {
        label: 'Responsibilities',
        bullets: [
          'Resolves .cluster.local names → Service ClusterIPs',
          'Watches Kubernetes API via informer (in-memory cache)',
          'Forwards unknown domains upstream (forward plugin)',
          'Headless services → returns direct pod IPs',
          'Caches responses (default 30s TTL)',
        ],
      },
      {
        label: 'Key fact',
        info: 'CoreDNS is the Service named "kube-dns" for backward compatibility — even though kube-dns was replaced in Kubernetes 1.13.',
      },
    ],
  },

  // ── EndpointSlice ──
  endpointslice: {
    title: 'EndpointSlice',
    subtitle: 'Runtime list of healthy pod IPs backing a Service',
    color: '#9b7ff4',
    sections: [
      {
        label: 'Example EndpointSlice',
        code: `apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
  name: mongodb-abc12
  labels:
    kubernetes.io/service-name: mongodb
endpoints:
- addresses: ["10.0.1.5"]   # mongo-0
  conditions: {ready: true}
- addresses: ["10.0.1.6"]   # mongo-1
  conditions: {ready: true}
- addresses: ["10.0.1.7"]   # mongo-2
  conditions: {ready: false} # excluded`,
      },
      {
        label: 'Responsibilities',
        bullets: [
          'Maps a Service to actual running pod IPs',
          'kube-proxy watches this — not pods directly',
          'Updated within seconds when a pod dies',
          'Replaced Endpoints object since Kubernetes 1.21',
          'Slices of max 100 endpoints for scalability',
        ],
      },
    ],
  },

  // ── kube-proxy ──
  'kube-proxy': {
    title: 'kube-proxy',
    subtitle: 'Runs on every node — writes iptables DNAT rules',
    color: '#f59e0b',
    sections: [
      {
        label: 'iptables rule chain',
        code: `# Packet to ClusterIP 10.96.0.2:27017
PREROUTING → KUBE-SERVICES
  → KUBE-SVC-MONGODB
    → 33% KUBE-SEP-POD1  DNAT → 10.0.1.5:27017
    → 33% KUBE-SEP-POD2  DNAT → 10.0.1.6:27017
    → 33% KUBE-SEP-POD3  DNAT → 10.0.1.7:27017`,
      },
      {
        label: 'Responsibilities',
        bullets: [
          'Watches EndpointSlices via Kubernetes API',
          'Writes iptables DNAT rules per Service',
          'Rewrites ClusterIP → real pod IP in kernel',
          'Load-balances using probabilistic iptables rules',
          'Updates rules within seconds of pod changes',
        ],
      },
      {
        label: 'Key fact',
        info: 'The ClusterIP does not exist on any network interface. It only exists as a target for kube-proxy iptables rules.',
      },
    ],
  },

  // ── CNI ──
  cni: {
    title: 'CNI Plugin',
    subtitle: 'Container Network Interface — routes packets between pods',
    color: '#fb923c',
    sections: [
      {
        label: 'What CNI does',
        bullets: [
          'Assigns IP addresses to pods (IPAM)',
          'Creates veth pairs connecting pod namespace to host',
          'Sets up routing so packets reach pods on other nodes',
          'Implements NetworkPolicies (firewall rules)',
          'Common plugins: Calico, Flannel, Cilium, Weave',
        ],
      },
      {
        label: 'Overlay vs BGP',
        code: `# Flannel (overlay): packets wrapped in VXLAN tunnel
Pod A → encapsulate → tunnel → decapsulate → Pod B

# Calico (BGP): native routing, no encapsulation
Pod A → BGP route → Pod B  (faster, no overhead)`,
      },
    ],
  },

  // ── App pod ──
  app: {
    title: 'app-service pod',
    subtitle: 'Source pod — initiates the DNS query',
    color: '#4f8ef7',
    sections: [
      {
        label: 'Network namespace isolation',
        bullets: [
          'Has its own network namespace (isolated view)',
          'Shares the node kernel — NOT a separate kernel',
          'Gets its own IP, routing table, /etc/resolv.conf',
          'Containers in the same pod share the namespace',
          'veth pair connects it to the host network namespace',
        ],
      },
      {
        label: 'How DNS is configured',
        code: `# kubelet injects this automatically
cat /etc/resolv.conf
nameserver 10.96.0.10
search default.svc.cluster.local ...
options ndots:5`,
      },
    ],
  },

  // ── mongo-0 ──
  mongo0: {
    title: 'mongo-0 pod',
    subtitle: 'StatefulSet pod — stable identity, direct DNS name',
    color: '#4ade80',
    sections: [
      {
        label: 'DNS name',
        code: `# Stable FQDN via headless service:
mongo-0.mongodb.default.svc.cluster.local

# Always resolves to this pod's IP
# Even after reschedule to a different node`,
      },
      {
        label: 'Why StatefulSets need this',
        bullets: [
          'mongo-0 is the primary replica',
          'mongo-1 and mongo-2 need to address it by name',
          'If mongo-0 reschedules, its IP changes but FQDN is stable',
          'Regular Service would load-balance to any pod — wrong',
          'Headless Service returns direct pod IPs — correct',
        ],
      },
    ],
  },

  // ── payments pod ──
  'payments-pod': {
    title: 'payments pod',
    subtitle: 'In namespace: payments — different search domains',
    color: '#f59e0b',
    sections: [
      {
        label: 'Its /etc/resolv.conf',
        code: `nameserver 10.96.0.10
search payments.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
# Note: default namespace NOT in search list`,
      },
      {
        label: 'Why short names fail cross-namespace',
        bullets: [
          '"mongodb" → tries mongodb.payments.svc.cluster.local',
          'mongodb is in default namespace, not payments',
          'CoreDNS returns NXDOMAIN',
          'Fix: use mongodb.default.svc.cluster.local (FQDN)',
          'Or: mongodb.default (partial — also works)',
        ],
      },
    ],
  },

  // ── NXDOMAIN ──
  nxdomain: {
    title: 'NXDOMAIN',
    subtitle: 'Non-Existent Domain — DNS error response',
    color: '#f87171',
    sections: [
      {
        label: 'What it means',
        bullets: [
          'CoreDNS found no record matching the query',
          'Most common cause: wrong namespace in short name',
          'Also: Service not created yet, typo in name',
          'Negative TTL caches it — even after fix, pods may still see it briefly',
        ],
      },
      {
        label: 'Debug it',
        code: `# From inside a debug pod:
nslookup mongodb
# Server: 10.96.0.10
# ** server can't find mongodb: NXDOMAIN

# Use FQDN instead:
nslookup mongodb.default.svc.cluster.local
# → 10.96.0.2 ✓`,
      },
    ],
  },

  // ── ClusterIP ──
  clusterip: {
    title: 'ClusterIP',
    subtitle: 'Virtual IP — exists only as iptables target',
    color: '#9b7ff4',
    sections: [
      {
        label: 'Key properties',
        bullets: [
          'Not assigned to any network interface',
          'Does not respond to ping',
          'Only exists as a DNAT target in kube-proxy iptables',
          'Stable for the lifetime of the Service',
          'Range typically 10.96.0.0/12 (configurable)',
        ],
      },
      {
        label: 'What happens to a packet',
        code: `# Packet dest: 10.96.0.5:8080 (ClusterIP)
# iptables PREROUTING intercepts it
# DNAT rewrites destination:
# 10.96.0.5:8080 → 10.0.1.8:8080 (real pod)
# Packet delivered to real pod
# App never knows about the rewrite`,
      },
    ],
  },

  // ── Empty endpoints ──
  empty: {
    title: 'Empty Endpoints',
    subtitle: 'No healthy pods behind the Service',
    color: '#f87171',
    sections: [
      {
        label: 'Why this happens',
        bullets: [
          'All pods are CrashLoopBackOff or Pending',
          'Pod selector in Service does not match pod labels',
          'All pods failed readiness probes',
          'Rolling deployment left a gap in availability',
        ],
      },
      {
        label: 'How to diagnose',
        code: `kubectl get endpoints backend -n default
# NAME      ENDPOINTS   AGE
# backend   <none>      5m  ← empty!

kubectl get pods -l app=backend
# NAME           READY   STATUS
# backend-abc    0/1     CrashLoopBackOff`,
      },
      {
        label: 'Key insight',
        warn: 'DNS resolves correctly. kube-proxy has rules. But there are no pod IPs to route to. The failure is NOT a DNS problem — it is a deployment problem.',
      },
    ],
  },

  // ── Linkerd proxy source ──
  'proxy-src': {
    title: 'Linkerd proxy (source)',
    subtitle: 'Sidecar injected into checkout pod',
    color: '#9b7ff4',
    sections: [
      {
        label: 'How it gets there',
        code: `# Annotation on namespace or pod:
linkerd.io/inject: enabled

# Linkerd injects a proxy container automatically
# iptables rules redirect ALL outbound traffic:
# port 4140 (proxy outbound)
# App never knows it exists`,
      },
      {
        label: 'What the proxy does',
        bullets: [
          'Intercepts all outbound TCP connections',
          'Initiates mTLS to destination proxy',
          'Retries failed requests automatically',
          'Records latency, success rate, request count',
          'Applies traffic policies (circuit breaking etc)',
        ],
      },
    ],
  },

  // ── mTLS ──
  mtls: {
    title: 'mTLS handshake',
    subtitle: 'Mutual TLS — both sides prove identity',
    color: '#f59e0b',
    sections: [
      {
        label: 'How it works',
        bullets: [
          'Source proxy presents cert signed by Linkerd CA',
          'Destination proxy verifies the cert',
          'Destination proxy presents its own cert',
          'Source proxy verifies destination identity',
          'Encrypted tunnel established — app sees nothing',
        ],
      },
      {
        label: 'Certificate lifecycle',
        code: `# Linkerd identity CA issues certs automatically
# Each cert: valid for 24 hours, auto-rotated
# No manual certificate management needed
# Trust anchor rotated separately (longer lived)`,
      },
      {
        label: 'Key fact',
        info: 'Zero-trust: even if an attacker intercepts traffic inside the cluster, they cannot decrypt it or impersonate a service without a valid certificate.',
      },
    ],
  },

  // ── Forward plugin / node DNS ──
  'node-dns': {
    title: 'Node DNS resolver',
    subtitle: 'Cloud provider DNS — handles external domains',
    color: '#9b7ff4',
    sections: [
      {
        label: 'Where it comes from',
        code: `# CoreDNS reads the node's /etc/resolv.conf:
forward . /etc/resolv.conf

# On AWS:    169.254.169.253 (VPC DNS)
# On GCP:    169.254.169.254
# On Azure:  168.63.129.16
# On-prem:   whatever your DHCP says`,
      },
      {
        label: 'The forwarding chain',
        bullets: [
          'Query arrives at CoreDNS for google.com',
          'kubernetes plugin: not .cluster.local → skip',
          'forward plugin: send to node resolver',
          'Node resolver queries cloud DNS infrastructure',
          'Response cached by CoreDNS (TTL from DNS record)',
        ],
      },
    ],
  },

  // ── api-gateway ──
  'api-gw': {
    title: 'api-gateway pod',
    subtitle: 'Pod making an external DNS query',
    color: '#4f8ef7',
    sections: [
      {
        label: 'NDOTS gotcha for external domains',
        code: `# "api.stripe.com" has 2 dots
# With ndots:5 → 2 < 5 → search domains tried first:
# api.stripe.com.default.svc.cluster.local → NXDOMAIN
# api.stripe.com.svc.cluster.local         → NXDOMAIN
# api.stripe.com.cluster.local             → NXDOMAIN
# api.stripe.com                           → ✓ found

# With ndots:2 → 2 >= 2 → queried directly ✓`,
      },
      {
        label: 'Fix',
        bullets: [
          'Set ndots:2 in pod dnsConfig',
          'Or use a trailing dot: "api.stripe.com." (FQDN)',
          'NodeLocal DNSCache also helps by caching upstream results locally',
        ],
      },
    ],
  },

  // ── Stripe (external) ──
  stripe: {
    title: 'api.stripe.com',
    subtitle: 'External service — outside the cluster',
    color: '#4ade80',
    sections: [
      {
        label: 'How traffic leaves the cluster',
        bullets: [
          'No ClusterIP — this is a real internet IP',
          'kube-proxy has no rules for it',
          'Packet routes via node default gateway',
          'NAT applied at the VPC boundary (SNAT)',
          'No mesh proxy unless egress gateway is configured',
        ],
      },
      {
        label: 'Egress control options',
        code: `# Option 1: Istio egress gateway
# Route external traffic through a dedicated proxy

# Option 2: NetworkPolicy (block by default)
# Allow only specific external CIDRs

# Option 3: DNS-based egress (Cilium)
# Allow/deny by domain name, not just IP`,
      },
    ],
  },

  // ── Linkerd proxy destination ──
  'proxy-dst': {
    title: 'Linkerd proxy (destination)',
    subtitle: 'Sidecar on the receiving end',
    color: '#9b7ff4',
    sections: [
      {
        label: 'What it does on arrival',
        bullets: [
          'Accepts the mTLS connection from source proxy',
          'Verifies source certificate (zero-trust)',
          'Decrypts the traffic',
          'Forwards to app container on localhost',
          'Records inbound metrics (golden signals)',
        ],
      },
      {
        label: 'The app sees a normal request',
        code: `# payment-service app receives:
# Normal HTTP request on 127.0.0.1:8080
# No TLS visible to the app
# No awareness of the proxy at all
# Security is enforced transparently`,
      },
    ],
  },

  // ── payment-service ──
  payment: {
    title: 'payment-service pod',
    subtitle: 'Destination — receives decrypted request',
    color: '#4ade80',
    sections: [
      {
        label: 'What the mesh adds invisibly',
        bullets: [
          'Request arrived encrypted, decrypted by sidecar',
          'Source identity verified via mTLS certificate',
          'Retry happened transparently if first attempt failed',
          'Latency and status code recorded by both proxies',
          'App code is unchanged — no SDK, no middleware',
        ],
      },
    ],
  },

  // ── fqdn-fix ──
  'fqdn-fix': {
    title: 'FQDN retry',
    subtitle: 'Developer fixes the connection string',
    color: '#9b7ff4',
    sections: [
      {
        label: 'The fix',
        code: `# Wrong (short name, wrong namespace):
DB_HOST = "mongodb"

# Right (full FQDN):
DB_HOST = "mongodb.default.svc.cluster.local"

# Also works (partial with explicit namespace):
DB_HOST = "mongodb.default"`,
      },
      {
        label: 'Best practice',
        bullets: [
          'Always use FQDN for cross-namespace references',
          'Short names only safe within the same namespace',
          'FQDNs cost nothing extra at runtime',
          'Use environment variables or ConfigMaps — not hardcoded strings',
        ],
      },
    ],
  },

  // ── frontend pod ──
  frontend: {
    title: 'frontend pod',
    subtitle: 'Calling a service with no healthy backends',
    color: '#4f8ef7',
    sections: [
      {
        label: 'What this pod experiences',
        bullets: [
          'DNS resolves correctly → ClusterIP returned',
          'TCP connect to ClusterIP appears to work',
          'kube-proxy rewrites destination IP',
          'But no pod IP exists to route to',
          'Connection refused or timeout',
        ],
      },
      {
        label: 'How to check from this pod',
        code: `kubectl exec -it frontend-pod -- sh
nslookup backend.default.svc.cluster.local
# → 10.96.0.5 ✓ (DNS works)

curl -v http://backend:8080/health
# → connection refused ✗`,
      },
    ],
  },

  // ── dead pods ──
  dead: {
    title: 'CrashLoopBackOff pods',
    subtitle: 'Backend pods failing — excluded from endpoints',
    color: '#5a5a78',
    sections: [
      {
        label: 'Why pods are excluded',
        bullets: [
          'Pod fails readiness probe → removed from EndpointSlice',
          'kube-proxy removes DNAT rule for that pod IP',
          'No traffic routed to crashing pod',
          'If ALL pods crash: EndpointSlice is empty',
          'Service exists but has no reachable backends',
        ],
      },
      {
        label: 'Diagnose',
        code: `kubectl get pods -l app=backend
# backend-abc  0/1  CrashLoopBackOff  5  2m

kubectl logs backend-abc --previous
# → application crash reason here

kubectl describe pod backend-abc
# → readiness probe failed`,
      },
    ],
  },

  // ── cloud-dns ──
  'cloud-dns': {
    title: 'Cloud DNS',
    subtitle: 'Authoritative resolver for external domains',
    color: '#fb923c',
    sections: [
      {
        label: 'The lookup chain',
        code: `# CoreDNS → node resolver → cloud DNS
# Cloud DNS queries:
# Root nameservers → .com TLD → stripe.com NS
# stripe.com NS → returns A record: 54.187.x.x
# Response cached at each layer (TTL)`,
      },
      {
        label: 'Performance note',
        bullets: [
          'NodeLocal DNSCache caches external results locally',
          'Avoids repeated round trips to cloud DNS',
          'TTL from DNS record controls cache duration',
          'Stripe.com TTL is typically 300s (5 minutes)',
        ],
      },
    ],
  },

  // ── checkout app ──
  checkout: {
    title: 'checkout app container',
    subtitle: 'Source — unaware of the mesh around it',
    color: '#4f8ef7',
    sections: [
      {
        label: 'What the app does',
        bullets: [
          'Calls connect("payment-service", 8080) as normal',
          'Has no TLS code, no retry logic, no circuit breaker',
          'iptables intercepts its outbound traffic silently',
          'The mesh provides all reliability features transparently',
          'App code is identical to a non-meshed cluster',
        ],
      },
    ],
  },

  // ── mongo (regular service) ──
  mongo: {
    title: 'mongodb Service',
    subtitle: 'Regular ClusterIP Service — load-balanced',
    color: '#4ade80',
    sections: [
      {
        label: 'Service YAML',
        code: `apiVersion: v1
kind: Service
metadata:
  name: mongodb
  namespace: default
spec:
  selector:
    app: mongodb
  clusterIP: 10.96.0.2   # virtual IP
  ports:
  - port: 27017`,
      },
      {
        label: 'How it was reached',
        bullets: [
          'CoreDNS returned ClusterIP 10.96.0.2',
          'kube-proxy DNAT rewrote to a real pod IP',
          'Packet arrived at a healthy mongodb pod',
          'Second attempt succeeded — FQDN was used this time',
        ],
      },
    ],
  },
};

// ─── Scenario definitions ─────────────────────────────────────────────────────

const SCENARIOS = {
  pablo: {
    label: '📦 Pablo — headless StatefulSet',
    color: '#2dd4bf',
    description: 'Direct pod IP via headless service. kube-proxy not involved.',
    zones: [
      { id: 'default-ns', label: 'namespace: default', color: '#2dd4bf', bounds: [-9, -4, -3, 9, 4, 3] },
    ],
    nodes: [
      { id: 'app', label: 'app-service\n10.0.1.10', color: '#4f8ef7', pos: [-7, 0, 0], r: 0.5 },
      { id: 'resolv', label: '/etc/resolv.conf', color: '#9b7ff4', pos: [-4, 2, 0], r: 0.35 },
      { id: 'coredns', label: 'CoreDNS\n10.96.0.10', color: '#2dd4bf', pos: [0, 3, 0], r: 0.55 },
      { id: 'endpointslice', label: 'EndpointSlice\nmongo headless', color: '#9b7ff4', pos: [0, 0.5, 0], r: 0.35 },
      { id: 'cni', label: 'CNI Plugin', color: '#fb923c', pos: [4, -1, 0], r: 0.4 },
      { id: 'mongo0', label: 'mongo-0\n10.0.1.5', color: '#4ade80', pos: [7, 0, 0], r: 0.55 },
    ],
    path: ['app', 'resolv', 'coredns', 'endpointslice', 'cni', 'mongo0'],
    outcome: 'success',
  },
  nadia: {
    label: '🌀 Nadia — cross-namespace NXDOMAIN',
    color: '#f59e0b',
    description: 'Short name from wrong namespace fails. FQDN succeeds.',
    zones: [
      { id: 'payments-ns', label: 'namespace: payments', color: '#f59e0b', bounds: [-9, -4, -3, 0, 4, 3] },
      { id: 'default-ns', label: 'namespace: default', color: '#4f8ef7', bounds: [0.5, -4, -3, 9, 4, 3] },
    ],
    nodes: [
      { id: 'payments-pod', label: 'payments pod\n10.0.2.20', color: '#f59e0b', pos: [-7, 0, 0], r: 0.5 },
      { id: 'coredns', label: 'CoreDNS', color: '#2dd4bf', pos: [-2, 3, 0], r: 0.55 },
      { id: 'nxdomain', label: 'NXDOMAIN\nmongodb.payments?', color: '#f87171', pos: [-2, 0, 0], r: 0.45 },
      { id: 'fqdn-fix', label: 'retry with FQDN\nmongodb.default...', color: '#9b7ff4', pos: [2, 3, 0], r: 0.4 },
      { id: 'mongo', label: 'mongodb\n10.96.0.2', color: '#4ade80', pos: [7, 0, 0], r: 0.55 },
    ],
    path: ['payments-pod', 'coredns', 'nxdomain', 'fqdn-fix', 'coredns', 'mongo'],
    outcome: 'retry',
  },
  carlos: {
    label: '🌍 Carlos — external DNS egress',
    color: '#fb923c',
    description: 'Leaves the cluster entirely. CoreDNS forwards upstream.',
    zones: [
      { id: 'cluster', label: 'Kubernetes cluster', color: '#4f8ef7', bounds: [-9, -4, -3, 2, 4, 3] },
      { id: 'internet', label: 'Internet', color: '#fb923c', bounds: [3, -4, -3, 9, 4, 3] },
    ],
    nodes: [
      { id: 'api-gw', label: 'api-gateway\n10.0.1.30', color: '#4f8ef7', pos: [-7, 0, 0], r: 0.5 },
      { id: 'coredns', label: 'CoreDNS\nforward plugin', color: '#2dd4bf', pos: [-3, 2, 0], r: 0.55 },
      { id: 'node-dns', label: 'Node DNS\n169.254.169.253', color: '#9b7ff4', pos: [0, 0, 0], r: 0.4 },
      { id: 'cloud-dns', label: 'Cloud DNS\n(AWS/GCP)', color: '#fb923c', pos: [4, 2, 0], r: 0.45 },
      { id: 'stripe', label: 'api.stripe.com\n54.187.x.x', color: '#4ade80', pos: [7, 0, 0], r: 0.55 },
    ],
    path: ['api-gw', 'coredns', 'node-dns', 'cloud-dns', 'stripe'],
    outcome: 'success',
  },
  reina: {
    label: '⏳ Reina — empty endpoints',
    color: '#f87171',
    description: 'DNS and kube-proxy work. No backend pods. Connection refused.',
    zones: [
      { id: 'default-ns', label: 'namespace: default', color: '#f87171', bounds: [-9, -4, -3, 9, 4, 3] },
    ],
    nodes: [
      { id: 'frontend', label: 'frontend pod', color: '#4f8ef7', pos: [-7, 0, 0], r: 0.5 },
      { id: 'coredns', label: 'CoreDNS', color: '#2dd4bf', pos: [-3, 3, 0], r: 0.55 },
      { id: 'clusterip', label: 'ClusterIP\n10.96.0.5', color: '#9b7ff4', pos: [0, 1, 0], r: 0.45 },
      { id: 'kube-proxy', label: 'kube-proxy\niptables', color: '#f59e0b', pos: [3, 0, 0], r: 0.45 },
      { id: 'empty', label: 'Endpoints\n<empty>', color: '#f87171', pos: [6, -2, 0], r: 0.45 },
      { id: 'dead', label: 'backend pods\nCrashLoopBackOff', color: '#5a5a78', pos: [7, 1, 0], r: 0.4 },
    ],
    path: ['frontend', 'coredns', 'clusterip', 'kube-proxy', 'empty'],
    outcome: 'failure',
  },
  maya: {
    label: '🔒 Maya — Linkerd mesh mTLS',
    color: '#9b7ff4',
    description: 'Sidecar intercepts. mTLS handshake. Encrypted transit.',
    zones: [
      { id: 'default-ns', label: 'namespace: default (meshed)', color: '#9b7ff4', bounds: [-9, -4, -3, 9, 4, 3] },
    ],
    nodes: [
      { id: 'checkout', label: 'checkout app\ncontainer', color: '#4f8ef7', pos: [-7, 1, 0], r: 0.45 },
      { id: 'proxy-src', label: 'Linkerd proxy\n(source sidecar)', color: '#9b7ff4', pos: [-4, 0, 0], r: 0.5 },
      { id: 'coredns', label: 'CoreDNS\n→ ClusterIP', color: '#2dd4bf', pos: [-1, 3, 0], r: 0.45 },
      { id: 'mtls', label: 'mTLS\nhandshake', color: '#f59e0b', pos: [1, 0, 0], r: 0.45 },
      { id: 'proxy-dst', label: 'Linkerd proxy\n(dest sidecar)', color: '#9b7ff4', pos: [4, 0, 0], r: 0.5 },
      { id: 'payment', label: 'payment-service\ncontainer', color: '#4ade80', pos: [7, 1, 0], r: 0.45 },
    ],
    path: ['checkout', 'proxy-src', 'coredns', 'mtls', 'proxy-dst', 'payment'],
    outcome: 'success',
  },
};

// ─── Three.js helpers ─────────────────────────────────────────────────────────

function buildScene(THREE, scenario, canvas) {
  const W = canvas.clientWidth || 800;
  const H = canvas.clientHeight || 480;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0a0a0f, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
  camera.position.set(0, 2, 14);
  camera.lookAt(0, 0, 0);
  scene.fog = new THREE.FogExp2(0x0a0a0f, 0.04);
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(5, 10, 5);
  scene.add(dir);
  const grid = new THREE.GridHelper(30, 30, 0x1a1a2e, 0x1a1a2e);
  grid.position.y = -4.5;
  scene.add(grid);

  scenario.zones.forEach(zone => {
    const [x1, y1, z1, x2, y2, z2] = zone.bounds;
    const geo = new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(zone.color), wireframe: true, transparent: true, opacity: 0.08 });
    const box = new THREE.Mesh(geo, mat);
    box.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    scene.add(box);
    const sp = makeTextSprite(zone.label, zone.color, 0.6);
    sp.position.set((x1 + x2) / 2, y2 + 0.4, (z1 + z2) / 2);
    scene.add(sp);
  });

  const nodeMeshes = {};
  scenario.nodes.forEach(node => {
    const col = new THREE.Color(node.color);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(node.r, 32, 32),
      new THREE.MeshPhongMaterial({ color: col, emissive: col, emissiveIntensity: 0.3, transparent: true, opacity: 0.9 })
    );
    mesh.position.set(...node.pos);
    mesh.userData.nodeId = node.id;
    scene.add(mesh);
    nodeMeshes[node.id] = mesh;
    const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(node.r + 0.05, node.r + 0.25, 32), ringMat);
    ring.position.set(...node.pos);
    scene.add(ring);
    mesh.userData.ring = ring;
    const sp = makeTextSprite(node.label, node.color, 0.5);
    sp.position.set(node.pos[0], node.pos[1] - node.r - 0.55, node.pos[2]);
    scene.add(sp);
  });

  const pathIds = scenario.path;
  for (let i = 0; i < pathIds.length - 1; i++) {
    const a = scenario.nodes.find(n => n.id === pathIds[i]);
    const b = scenario.nodes.find(n => n.id === pathIds[i + 1]);
    if (!a || !b) continue;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a.pos), new THREE.Vector3(...b.pos)]);
    scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x333355, transparent: true, opacity: 0.4 })));
  }
  return { renderer, scene, camera, nodeMeshes };
}

function createPacket(THREE, scene, color) {
  const col = new THREE.Color(color);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), new THREE.MeshBasicMaterial({ color: col }));
  scene.add(mesh);
  const tailGeos = Array.from({ length: 12 }, (_, i) => {
    const t = new THREE.Mesh(
      new THREE.SphereGeometry(0.08 * (1 - i / 12), 8, 8),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: (1 - i / 12) * 0.6 })
    );
    scene.add(t);
    return t;
  });
  return { mesh, tailGeos };
}

function makeTextSprite(text, color, scale = 0.5) {
  const THREE = window.THREE;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 80;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = color || '#fff';
  ctx.textAlign = 'center';
  text.split('\n').forEach((line, i) => ctx.fillText(line, 128, 24 + i * 22));
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(scale * 3, scale, 1);
  return sp;
}

function lerpVec3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ─── Node info popup ──────────────────────────────────────────────────────────

const POPUP_W = 340;
const POPUP_MAX_H = 400;

function NodePopup({ nodeId, screenPos, containerRef, onClose }) {
  const info = NODE_INFO[nodeId];
  if (!info) return null;

  // Smart positioning — keep popup inside the container bounds
  const container = containerRef?.current;
  const cw = container ? container.clientWidth : window.innerWidth;
  const ch = container ? container.clientHeight : window.innerHeight;
  const cx = screenPos.x; // click x relative to container
  const cy = screenPos.y; // click y relative to container

  // Horizontal: prefer right of click, flip left if not enough room
  const spaceRight = cw - cx;
  const left = spaceRight >= POPUP_W + 12 ? cx + 12 : Math.max(4, cx - POPUP_W - 12);

  // Vertical: prefer above click (drop-up), flip below if not enough room
  const spaceAbove = cy;
  const bottom = spaceAbove >= POPUP_MAX_H + 12 ? ch - cy + 12 : undefined;
  const top = spaceAbove >= POPUP_MAX_H + 12 ? undefined : Math.min(cy + 12, ch - POPUP_MAX_H - 4);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: bottom !== undefined ? 10 : -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18 }}
        style={{
          position: 'absolute',
          left,
          ...(bottom !== undefined ? { bottom } : { top }),
          width: POPUP_W,
          background: 'var(--bg2)',
          border: `1px solid ${info.color}55`,
          borderRadius: 14,
          boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px ${info.color}22`,
          zIndex: 100,
          overflow: 'hidden',
          maxHeight: POPUP_MAX_H,
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ background: info.color + '18', padding: '12px 14px', borderBottom: `1px solid ${info.color}33`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{info.title}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{info.subtitle}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Sections */}
        <div style={{ padding: '10px 14px' }}>
          {info.sections.map((s, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: info.color, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{s.label}</div>
              {s.code && (
                <div style={{ background: '#0a0a0f', borderRadius: 8, padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: '#a8b4d8', lineHeight: 1.7, whiteSpace: 'pre', overflowX: 'auto' }}>
                  {s.code}
                </div>
              )}
              {s.bullets && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {s.bullets.map((b, j) => (
                    <li key={j} style={{ fontSize: 12, color: 'var(--text2)', padding: '3px 0', borderBottom: '1px solid var(--border)', lineHeight: 1.5, display: 'flex', gap: 6 }}>
                      <span style={{ color: info.color, minWidth: 10 }}>›</span>{b}
                    </li>
                  ))}
                </ul>
              )}
              {s.warn && (
                <div style={{ background: 'var(--amber-bg)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: 'var(--amber)', lineHeight: 1.5 }}>
                  ⚠ {s.warn}
                </div>
              )}
              {s.info && (
                <div style={{ background: 'var(--blue-bg)', border: '1px solid rgba(79,142,247,0.3)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: 'var(--blue)', lineHeight: 1.5 }}>
                  ℹ {s.info}
                </div>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

let packetT = 0, packetSeg = 0, tailHistory = [];
const TAIL_LEN = 12, SPEED = 0.009; // slowed from 0.018

export default function PacketUniverse({ scenarioKey = 'pablo', stepIndex = -1, playing = false, invertY = false, followPacket = false, resetSignal = 0, onNodeInfo }) {
  const canvasRef = useRef();
  const containerRef = useRef();
  const stateRef = useRef({});
  const [threeLoaded, setThreeLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // No popup state here — info is surfaced to parent via onNodeInfo

  useEffect(() => {
    if (window.THREE) { setThreeLoaded(true); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = () => setThreeLoaded(true);
    s.onerror = () => setLoadError(true);
    document.head.appendChild(s);
    return () => { try { document.head.removeChild(s); } catch {} };
  }, []);

  const handleNodeClick = useCallback((nodeId, _screenX, _screenY) => {
    const info = NODE_INFO[nodeId];
    if (!info) return;
    if (onNodeInfo) onNodeInfo(prev => prev?.nodeId === nodeId ? null : { nodeId, info });
  }, [onNodeInfo]);

  useEffect(() => {
    if (!threeLoaded || !canvasRef.current) return;
    const THREE = window.THREE;
    const canvas = canvasRef.current;
    const scenario = SCENARIOS[scenarioKey];
    if (stateRef.current.renderer) {
      stateRef.current.renderer.dispose();
      cancelAnimationFrame(stateRef.current.animFrame);
    }
    packetT = 0; packetSeg = 0; tailHistory = [];

    const { renderer, scene, camera, nodeMeshes } = buildScene(THREE, scenario, canvas);
    const packet = createPacket(THREE, scene, scenario.color);
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const panTarget = new THREE.Vector3(0, 0, 0);

    let isDragging = false, hasMoved = false;
    let prevMouse = { x: 0, y: 0 };
    let spherical = { theta: 0, phi: Math.PI / 3, r: 14 };

    const getCanvasPos = e => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    stateRef.current.invertY = invertY;

    const onMouseDown = e => {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.button === 1) e.preventDefault();
      isDragging = true; hasMoved = false;
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = e => {
      if (e.button === 1) { isDragging = false; return; }
      if (!hasMoved) {
        const pos = getCanvasPos(e);
        const rect = canvas.getBoundingClientRect();
        mouse.x = (pos.x / rect.width) * 2 - 1;
        mouse.y = -(pos.y / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(Object.values(nodeMeshes));
        if (hits.length > 0) {
          const nodeId = hits[0].object.userData.nodeId;
          const rect2 = containerRef.current ? containerRef.current.getBoundingClientRect() : { left: 0, top: 0 };
          handleNodeClick(nodeId, e.clientX - rect2.left, e.clientY - rect2.top);
        } else {
          if (onNodeInfo) onNodeInfo(null);
        }
      }
      isDragging = false;
    };
    const onMouseMove = e => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) hasMoved = true;

      if (e.buttons === 4) {
        // Middle mouse held — pan in screen space
        const panSpeed = spherical.r * 0.002;
        const camPos = new THREE.Vector3(
          panTarget.x + spherical.r * Math.sin(spherical.phi) * Math.sin(spherical.theta),
          panTarget.y + spherical.r * Math.cos(spherical.phi) + 1,
          panTarget.z + spherical.r * Math.sin(spherical.phi) * Math.cos(spherical.theta)
        );
        const forward = new THREE.Vector3().subVectors(panTarget, camPos).normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
        panTarget.addScaledVector(right, -dx * panSpeed);
        panTarget.addScaledVector(up, dy * panSpeed);
      } else {
        // Left mouse — orbit
        const iy = stateRef.current.invertY ? -1 : 1;
        spherical.theta -= dx * 0.005;
        spherical.phi = Math.max(0.2, Math.min(Math.PI - 0.2, spherical.phi + dy * 0.005 * iy));
      }
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onWheel = e => {
      e.preventDefault();
      spherical.r = Math.max(6, Math.min(24, spherical.r + e.deltaY * 0.02));
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let prevTouch = null;
    canvas.addEventListener('touchstart', e => { prevTouch = e.touches[0]; }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!prevTouch) return;
      const dx = e.touches[0].clientX - prevTouch.clientX;
      const dy = e.touches[0].clientY - prevTouch.clientY;
      spherical.theta -= dx * 0.008;
      spherical.phi = Math.max(0.2, Math.min(Math.PI - 0.2, spherical.phi + dy * 0.008));
      prevTouch = e.touches[0];
    }, { passive: false });

    const onResize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    stateRef.current = { renderer, scene, camera, nodeMeshes, packet, spherical, panTarget };

    let frame = 0;
    const animate = () => {
      stateRef.current.animFrame = requestAnimationFrame(animate);
      frame++;
      const s = stateRef.current.spherical;
      const pt = stateRef.current.panTarget;

      // Follow packet mode — smoothly move panTarget toward packet position
      if (stateRef.current.followPacket && stateRef.current.packet?.mesh?.visible) {
        const pm = stateRef.current.packet.mesh.position;
        pt.x += (pm.x - pt.x) * 0.05;
        pt.y += (pm.y - pt.y) * 0.05;
        pt.z += (pm.z - pt.z) * 0.05;
      }

      camera.position.set(
        pt.x + s.r * Math.sin(s.phi) * Math.sin(s.theta),
        pt.y + s.r * Math.cos(s.phi) + 1,
        pt.z + s.r * Math.sin(s.phi) * Math.cos(s.theta)
      );
      camera.lookAt(pt);
      Object.values(nodeMeshes).forEach((mesh, i) => {
        mesh.scale.setScalar(1 + Math.sin(frame * 0.04 + i) * 0.04);
        if (mesh.userData.ring) mesh.userData.ring.lookAt(camera.position);
      });
      updatePacket(stateRef.current, scenario);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(stateRef.current.animFrame);
      renderer.dispose();
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    };
  }, [threeLoaded, scenarioKey, handleNodeClick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (stateRef.current) stateRef.current.targetStep = stepIndex; }, [stepIndex]);
  useEffect(() => { if (stateRef.current) stateRef.current.autoPlay = playing; }, [playing]);
  useEffect(() => { if (stateRef.current) stateRef.current.invertY = invertY; }, [invertY]);
  // Reset camera to default position + clear pan
  useEffect(() => {
    if (!stateRef.current?.panTarget) return;
    const THREE = window.THREE;
    if (!THREE) return;
    stateRef.current.panTarget.set(0, 0, 0);
    stateRef.current.spherical.theta = 0;
    stateRef.current.spherical.phi = Math.PI / 3;
    stateRef.current.spherical.r = 14;
  }, [resetSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  // Follow packet: let animate loop read stateRef.current.followPacket
  useEffect(() => { if (stateRef.current) stateRef.current.followPacket = followPacket; }, [followPacket]);

  if (loadError) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 13 }}>3D engine failed to load.</div>;
  if (!threeLoaded) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 13 }}>Loading 3D engine…</div>;

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }} />
    </div>
  );
}

function updatePacket(state, scenario) {
  const { packet, nodeMeshes } = state;
  if (!packet) return;
  const path = scenario.path;
  const nodes = scenario.nodes;
  const targetStep = state.targetStep ?? -1;
  const autoPlay = state.autoPlay ?? false;
  let activeSeg = packetSeg;

  if (targetStep >= 0 && targetStep < path.length) {
    activeSeg = Math.min(targetStep, path.length - 2);
    packetT += SPEED;
    if (packetT >= 1) packetT = 1;
  } else if (autoPlay) {
    packetT += SPEED;
    if (packetT >= 1) { packetT = 0; packetSeg = (packetSeg + 1) % (path.length - 1); }
    activeSeg = packetSeg;
  } else {
    packetT += SPEED * 0.5;
    if (packetT >= 1) { packetT = 0; packetSeg = (packetSeg + 1) % (path.length - 1); }
    activeSeg = packetSeg;
  }

  const fromNode = nodes.find(n => n.id === path[activeSeg]);
  const toNode = nodes.find(n => n.id === path[Math.min(activeSeg + 1, path.length - 1)]);
  if (!fromNode || !toNode) return;

  const t = packetT;
  const mid = lerpVec3(fromNode.pos, toNode.pos, 0.5);
  mid[1] += 0.8;
  const inv = 1 - t;
  const px = inv * inv * fromNode.pos[0] + 2 * inv * t * mid[0] + t * t * toNode.pos[0];
  const py = inv * inv * fromNode.pos[1] + 2 * inv * t * mid[1] + t * t * toNode.pos[1];
  const pz = inv * inv * fromNode.pos[2] + 2 * inv * t * mid[2] + t * t * toNode.pos[2];

  packet.mesh.position.set(px, py, pz);
  packet.mesh.visible = true;
  tailHistory.unshift([px, py, pz]);
  if (tailHistory.length > TAIL_LEN) tailHistory.pop();
  packet.tailGeos.forEach((tail, i) => {
    if (tailHistory[i + 1]) { tail.position.set(...tailHistory[i + 1]); tail.visible = true; }
    else tail.visible = false;
  });
  Object.entries(nodeMeshes).forEach(([id, mesh]) => {
    const isActive = id === path[activeSeg] || id === path[Math.min(activeSeg + 1, path.length - 1)];
    mesh.material.emissiveIntensity = isActive ? 0.8 : 0.2;
  });
}
