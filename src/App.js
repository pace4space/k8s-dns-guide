import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';

const tabs = [
  { id: 'chain', label: 'DNS Chain' },
  { id: 'coredns', label: 'CoreDNS Internals' },
  { id: 'headless', label: 'Headless Services' },
  { id: 'ndots', label: 'NDOTS & Search Domains' },
  { id: 'debug', label: 'Debug Toolkit' },
  { id: 'mesh', label: 'Service Mesh Boundary' },
  { id: 'wars', label: 'War Stories' },
];

const fade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2 },
};

function CodeBlock({ children }) {
  return (
    <div className="code-block">
      <pre>{children}</pre>
    </div>
  );
}

function Alert({ type = 'info', children }) {
  return <div className={`alert alert-${type}`}>{children}</div>;
}

function ChainSection() {
  const steps = [
    { color: '#4f8ef7', label: 'App calls a name', desc: <>Your app calls <code>mongodb</code> or the full FQDN. The kernel inside the pod's network namespace reads <code>/etc/resolv.conf</code> to find the resolver. One kernel per node — pods are isolated network namespaces, not separate kernels.</> },
    { color: '#9b7ff4', label: 'CoreDNS resolves', desc: <>Every pod's <code>/etc/resolv.conf</code> points to CoreDNS (e.g. <code>10.96.0.10</code>). CoreDNS checks its in-memory cache — synced from the Kubernetes API via an informer — and returns the Service's ClusterIP.</> },
    { color: '#2dd4bf', label: 'The ClusterIP is virtual', desc: <>The ClusterIP (e.g. <code>10.96.0.2</code>) doesn't exist on any real network interface. It's a target for iptables rules only. The app sends traffic to this virtual IP.</> },
    { color: '#f59e0b', label: 'kube-proxy intercepts via iptables', desc: <>kube-proxy watches EndpointSlices. It writes iptables DNAT rules: traffic to <code>10.96.0.2:27017</code> gets rewritten to a real backend pod IP. This rewrite happens in the kernel before the packet leaves the node — invisible to the pod.</> },
    { color: '#4ade80', label: 'CNI delivers to the pod', desc: <>The rewritten packet is routed by the CNI plugin to the actual pod on whatever node it lives on. The connection is established.</> },
  ];
  return (
    <motion.div {...fade}>
      <div className="section-title">DNS resolution chain</div>
      <div className="section-sub">How a service name becomes a real network connection — step by step.</div>
      <div className="card">
        <div className="chain">
          {steps.map((s, i) => (
            <div className="chain-step" key={i}>
              <div className="chain-num" style={{ background: s.color }}>{i + 1}</div>
              <div className="chain-body">
                <strong>{s.label}</strong>
                <span>{s.desc}</span>
              </div>
            </div>
          ))}
        </div>
        <CodeBlock>{`App → /etc/resolv.conf → CoreDNS (10.96.0.10)
   → ClusterIP (10.96.0.2) [virtual, iptables target only]
   → kube-proxy DNAT rewrite → real pod IP (10.0.1.5)
   → CNI plugin → Pod B`}</CodeBlock>
      </div>
      <div className="grid-2">
        <div className="card">
          <h2>One kernel per node</h2>
          <p>Pods are isolated network namespaces inside a single Linux kernel. The kernel enforces isolation. kube-proxy's iptables rules live in the host namespace but apply to all pod namespaces — the ClusterIP rewrite is transparent to the pod.</p>
        </div>
        <div className="card">
          <h2>Service → Endpoints → kube-proxy</h2>
          <p>When you create a Service with a selector, Kubernetes auto-creates an <strong>EndpointSlice</strong> listing healthy pod IPs. kube-proxy watches EndpointSlices — not pods directly. Pod dies → removed from EndpointSlice → kube-proxy updates iptables within seconds.</p>
        </div>
      </div>
      <div className="card">
        <h2>Why you use names, not IPs</h2>
        <p>Every pod restart gives a new IP. If you hardcode <code>10.0.1.5</code> in your config and that pod reschedules, your app breaks silently. The Service name is the stable contract. The DNS chain above is what makes that contract work at runtime.</p>
        <Alert type="warn">The #1 production mistake: hardcoding pod IPs. Always use Service DNS names.</Alert>
      </div>
    </motion.div>
  );
}

function CoreDNSSection() {
  const plugins = [
    { color: '#5a5a78', name: 'errors', desc: 'Logs errors. Runs first. Always present.', tag: null },
    { color: '#5a5a78', name: 'health', desc: 'Liveness endpoint. Goes down if can\'t reach kube API → scheduler reschedules. This is the OpenAI failure mode — health check fails under API load, CoreDNS restarts, but needs API to restart. Deadlock.', tag: 'critical' },
    { color: '#5a5a78', name: 'prometheus', desc: 'Exposes metrics on :9153. Not optional in production. Monitor query rates, cache hit ratio, upstream errors.', tag: null },
    { color: '#9b7ff4', name: 'kubernetes', desc: 'Authoritative for .cluster.local. Watches the API via informer, maintains in-memory cache of all Services and EndpointSlices. Has sub-options: pods, fallthrough, ttl, endpoint_pod_names.', tag: 'key' },
    { color: '#2dd4bf', name: 'cache', desc: 'Caches responses. Default 30s TTL. Critical for reducing upstream load. Autopath bypasses this — that\'s the Datadog trap.', tag: null },
    { color: '#f59e0b', name: 'loadbalance', desc: 'Shuffles returned IPs on each headless service query. DNS-level round-robin — no proxy involved. Client picks the first IP, so rotating order distributes load.', tag: null },
    { color: '#f59e0b', name: 'autopath', desc: 'Resolves search domain suffixes server-side (1 query instead of 5). Requires pods verified mode. Does NOT cache. Dangerous at scale — caused Datadog\'s upstream rate limit failure.', tag: 'danger' },
    { color: '#5a5a78', name: 'loop', desc: 'Detects infinite forwarding loops and stops them. Without it, a misconfigured upstream can crash CoreDNS.', tag: null },
    { color: '#fb923c', name: 'forward', desc: 'Forwards unresolved queries upstream. Uses /etc/resolv.conf (node\'s DNS). Handles google.com, internal corp domains, anything outside the cluster.', tag: null },
    { color: '#5a5a78', name: 'reload', desc: 'Watches Corefile ConfigMap. Reloads without pod restart when changed. This is how you push CoreDNS config changes safely.', tag: null },
  ];
  const tagStyle = (t) => {
    if (t === 'key') return { background: 'var(--purple-bg)', color: 'var(--purple)' };
    if (t === 'danger') return { background: 'var(--red-bg)', color: 'var(--red)' };
    if (t === 'critical') return { background: 'var(--amber-bg)', color: 'var(--amber)' };
    return {};
  };
  return (
    <motion.div {...fade}>
      <div className="section-title">CoreDNS internals</div>
      <div className="section-sub">Architecture, plugin chain, configuration options, and what deploys to your cluster.</div>
      <div className="card">
        <h2>What CoreDNS deploys</h2>
        <ul>
          <li><strong>ServiceAccount</strong> — CoreDNS's cluster identity</li>
          <li><strong>ClusterRole + ClusterRoleBinding</strong> — read access to Services, Endpoints, Pods across all namespaces</li>
          <li><strong>ConfigMap coredns</strong> — the Corefile. Every change is automatically pushed to all CoreDNS pods via the reload plugin</li>
          <li><strong>Deployment</strong> — minimum 2 replicas. Single replica = single point of failure for the entire cluster</li>
          <li><strong>Service named kube-dns</strong> — still called kube-dns for backward compatibility even though CoreDNS replaced it since 1.13</li>
        </ul>
      </div>
      <div className="card">
        <h2>Plugin chain — order is everything</h2>
        <p style={{ marginBottom: 12, fontSize: 13 }}>Plugins execute top-to-bottom in the Corefile. Put <code>forward</code> before <code>kubernetes</code> and upstream DNS answers first — breaking cluster resolution entirely.</p>
        <div className="plugin-list">
          {plugins.map((p, i) => (
            <div className="plugin-row" key={i}>
              <div className="plugin-dot" style={{ background: p.color }} />
              <div className="plugin-name">
                {p.name}
                {p.tag && <span className="plugin-tag" style={tagStyle(p.tag)}>{p.tag}</span>}
              </div>
              <div className="plugin-desc">{p.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid-2">
        <div className="card">
          <h2>pods option — three modes</h2>
          <p><strong>disabled</strong> (default) — pod DNS records off.<br /><strong>insecure</strong> — reply with IP as given, no verification.<br /><strong>verified</strong> — verify IP is a real running pod. Watches all pods. Costly in memory and API load. Required for autopath.</p>
          <Alert type="warn">pods verified + autopath at 1000+ nodes = Datadog's upstream rate limit failure.</Alert>
        </div>
        <div className="card">
          <h2>dnsPolicy — per pod</h2>
          <p><strong>ClusterFirst</strong> (default) — use CoreDNS.<br /><strong>ClusterFirstWithHostNet</strong> — same for hostNetwork pods.<br /><strong>Default</strong> — use node's DNS directly, bypasses CoreDNS.<br /><strong>None</strong> — fully custom dnsConfig. Best way to set ndots:2 + single-request.</p>
        </div>
      </div>
      <div className="card">
        <h2>kubernetes plugin options</h2>
        <div className="grid-2">
          <div><p><strong>fallthrough [ZONES]</strong> — second chance: if kubernetes can't answer (e.g. reverse DNS for in-addr.arpa), pass to next plugin. Without this, reverse DNS silently returns NXDOMAIN.</p></div>
          <div><p><strong>ttl</strong> — override TTL of Kubernetes DNS records. Default 5s. Lower = faster propagation, more queries. Higher = less load, slower updates.</p></div>
        </div>
      </div>
      <div className="card">
        <h2>External plugins (require custom build)</h2>
        <p>Plugins are compiled into the CoreDNS binary — you can't add them at runtime.</p>
        <div className="plugin-list" style={{ marginTop: 10 }}>
          <div className="plugin-row"><div className="plugin-dot" style={{ background: '#9b7ff4' }} /><div className="plugin-name">kubernetai</div><div className="plugin-desc">Single CoreDNS for multiple clusters. ClusterIPs aren't routable, so mostly useful for headless services with routable pod IPs.</div></div>
          <div className="plugin-row"><div className="plugin-dot" style={{ background: '#9b7ff4' }} /><div className="plugin-name">rewrite</div><div className="plugin-desc">Rewrite queries so legacy apps using old service names keep working across migrations.</div></div>
          <div className="plugin-row"><div className="plugin-dot" style={{ background: '#9b7ff4' }} /><div className="plugin-name">static records</div><div className="plugin-desc">Add override or fallback records. Useful for service migration — old name resolves to same place as new name during transition.</div></div>
        </div>
      </div>
    </motion.div>
  );
}

function HeadlessSection() {
  return (
    <motion.div {...fade}>
      <div className="section-title">Headless services</div>
      <div className="section-sub">When stable pod identity matters more than load balancing.</div>
      <div className="compare">
        <div className="compare-col" style={{ borderColor: 'rgba(79,142,247,0.3)' }}>
          <h4>Regular service</h4>
          <div className="sub" style={{ color: 'var(--blue)' }}>clusterIP: 10.96.0.2</div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>CoreDNS returns a single virtual ClusterIP. kube-proxy load-balances to any healthy pod. The client has no control over which pod it reaches.</p>
          <CodeBlock>{`mongodb → 10.96.0.2 (virtual)
kube-proxy → Pod A or B or C
             (random, any healthy)`}</CodeBlock>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}><strong>Use case:</strong> stateless apps — web servers, APIs, anything where every pod is interchangeable.</p>
        </div>
        <div className="compare-col" style={{ borderColor: 'rgba(45,212,191,0.3)' }}>
          <h4>Headless service</h4>
          <div className="sub" style={{ color: 'var(--teal)' }}>clusterIP: None</div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>CoreDNS returns direct pod IPs. Each pod in the StatefulSet gets a stable, predictable DNS name based on its ordinal.</p>
          <CodeBlock>{`mongo-0.mongodb → 10.0.1.5
mongo-1.mongodb → 10.0.1.6
mongo-2.mongodb → 10.0.1.7
(direct, no virtual IP)`}</CodeBlock>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}><strong>Use case:</strong> StatefulSets — MongoDB, Cassandra, etcd — where identity matters and pods must find each other by stable name.</p>
        </div>
      </div>
      <div className="card">
        <h2>Why StatefulSets need headless</h2>
        <p>MongoDB replication requires stable identities. <code>mongo-0</code> must reliably reach <code>mongo-1</code> and <code>mongo-2</code> by name. When <code>mongo-0</code> crashes and reschedules to a different node with a different IP, <code>mongo-0.mongodb.default.svc.cluster.local</code> still resolves to it. The replica set reforms without manual reconfiguration.</p>
        <Alert type="danger">Using a regular Service for a StatefulSet is a common production mistake. Pods can't find each other by stable name, replication breaks, and error messages are confusing.</Alert>
      </div>
      <div className="card">
        <h2>loadbalance plugin + headless</h2>
        <p>For headless services returning multiple pod IPs, the <code>loadbalance</code> CoreDNS plugin shuffles the order of returned IPs on each query. The client typically picks the first IP — rotating the order distributes load across pods without any proxy layer. Pure DNS-level round-robin.</p>
      </div>
      <div className="card">
        <h2>Headless YAML</h2>
        <CodeBlock>{`apiVersion: v1
kind: Service
metadata:
  name: mongodb
spec:
  clusterIP: None        # ← this makes it headless
  selector:
    app: mongodb
  ports:
  - port: 27017
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongodb
spec:
  serviceName: mongodb   # ← links to the headless service
  replicas: 3`}</CodeBlock>
      </div>
    </motion.div>
  );
}

function NdotsSection() {
  const [ndots, setNdots] = useState(5);
  const queries = [
    { q: 'mongodb.default.svc.cluster.local', result: ndots <= 5 ? 'slow' : 'ok', label: ndots <= 5 ? 'tried first — may timeout' : 'queried directly ✓' },
    { q: 'mongodb.svc.cluster.local', result: 'fail', label: 'miss' },
    { q: 'mongodb.cluster.local', result: 'fail', label: 'miss' },
    { q: 'mongodb (bare)', result: 'fail', label: 'miss' },
  ];
  return (
    <motion.div {...fade}>
      <div className="section-title">NDOTS & search domains</div>
      <div className="section-sub">The 5-second latency bug, the autopath trap, conntrack races, and NodeLocal DNSCache.</div>
      <div className="card">
        <h2>What is NDOTS?</h2>
        <p>NDOTS (number of dots) is a <code>/etc/resolv.conf</code> option. If a hostname has fewer dots than the NDOTS value, the resolver tries all search domain suffixes first before querying the name as-is.</p>
        <CodeBlock>{`nameserver 10.96.0.10
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5`}</CodeBlock>
        <p style={{ marginTop: 8, fontSize: 13 }}>Kubernetes defaults to <strong>ndots:5</strong> because the full FQDN <code>mongodb.default.svc.cluster.local</code> has 4 dots — NDOTS=5 ensures it's queried directly. Sound design, unexpected production consequences at scale.</p>
      </div>
      <div className="card">
        <h2>Interactive: what "mongodb" triggers with ndots:{ndots}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0 14px' }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>ndots:</span>
          <input type="range" min={1} max={5} value={ndots} step={1} onChange={e => setNdots(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: 14, fontWeight: 600, minWidth: 20 }}>{ndots}</span>
        </div>
        <div className="ndots-list">
          {"mongodb".split('').filter(c => c === '.').length < ndots
            ? queries.map((q, i) => (
              <div className="ndots-row" key={i}>
                <div className="ndots-query">{q.q}</div>
                <div className={`ndots-result r-${q.result}`}>{q.label}</div>
              </div>
            ))
            : <div className="ndots-row">
                <div className="ndots-query">mongodb.default.svc.cluster.local</div>
                <div className="ndots-result r-ok">queried directly ✓ (has ≥ ndots dots)</div>
              </div>
          }
        </div>
        <Alert type="warn">With ndots:5, a single short-name query becomes 4+ sequential UDP queries. Each failed attempt waits for a timeout or NXDOMAIN response.</Alert>
      </div>
      <div className="card">
        <h2>The conntrack race condition</h2>
        <p>When multiple DNS queries fire on the same UDP socket (same source port), Linux's conntrack table — which tracks UDP "connections" by source port — gets confused about which response belongs to which query. One stalls for 5 seconds. This is the Datadog war story at the kernel level.</p>
        <h3 style={{ marginTop: 14 }}>Three netfilter race scenarios</h3>
        <ul style={{ marginTop: 6 }}>
          <li><strong>kube-proxy replaces iptables chains</strong> while packets traverse them — brief window of rule mismatch, packets dropped or misrouted</li>
          <li><strong>Stale conntrack entries after pod deletion</strong> — pod dies, Endpoints updates, kube-proxy updates iptables, but conntrack still routes to the dead IP. This is the Preply war story in exact technical detail.</li>
          <li><strong>iptables vs IPVS mode switching</strong> — changing kube-proxy mode while running leaves a window of partially populated tables</li>
        </ul>
      </div>
      <div className="card">
        <h2>The fix: ndots + single-request</h2>
        <CodeBlock>{`dnsConfig:
  options:
  - name: ndots
    value: "2"         # try only 2 suffixes
  - name: single-request
    value: ""          # one socket per query = no conntrack collision`}</CodeBlock>
        <Alert type="success">ndots:2 reduces unnecessary queries by ~80%. single-request eliminates the conntrack race condition entirely.</Alert>
      </div>
      <div className="card">
        <h2>NodeLocal DNSCache — the production-grade fix</h2>
        <p>Runs a DNS caching agent on every node as a DaemonSet. Pods resolve to the local cache first via a link-local IP (<code>169.254.20.10</code>) instead of CoreDNS over the network.</p>
        <ul style={{ marginTop: 8 }}>
          <li>Handles all non-Kubernetes queries locally — no round trip to CoreDNS for external domains</li>
          <li>Uses TCP to talk to CoreDNS upstream — bypasses conntrack/netfilter for UDP entirely</li>
          <li>Eliminates the conntrack race condition for DNS at the architectural level</li>
          <li>Reduces CoreDNS load dramatically in large clusters</li>
        </ul>
        <Alert type="info">Autopath alternative: instead of autopath (which requires pods verified, no caching, memory-hungry), use NodeLocal DNSCache. It solves the query count problem without the side effects.</Alert>
      </div>
      <div className="card">
        <h2>Cross-namespace resolution</h2>
        <p>Search domains only include the pod's own namespace. From the <code>payments</code> namespace, <code>mongodb</code> looks for <code>mongodb.payments.svc.cluster.local</code> — not found.</p>
        <div className="grid-2" style={{ marginTop: 10 }}>
          <div>
            <span className="hero-badge badge-green">From default namespace</span>
            <CodeBlock>{`mongodb          ✓ works
mongodb.default  ✓ works
FQDN             ✓ works`}</CodeBlock>
          </div>
          <div>
            <span className="hero-badge badge-red">From payments namespace</span>
            <CodeBlock>{`mongodb          ✗ NXDOMAIN
mongodb.default  ✓ works
FQDN             ✓ works`}</CodeBlock>
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>Best practice: always use the full FQDN in multi-namespace deployments. It costs nothing and is never ambiguous.</p>
      </div>
      <div className="card">
        <h2>NXDOMAIN explained</h2>
        <p>NXDOMAIN stands for "Non-Existent Domain." It's the DNS response code CoreDNS returns when a queried name doesn't exist in its records. If you see NXDOMAIN in your nslookup output, the service either doesn't exist, is in a different namespace, or you're using the wrong search domain.</p>
      </div>
    </motion.div>
  );
}

function DebugSection() {
  const steps = [
    { title: 'Spin up a debug pod', cmd: `kubectl run debug -it --rm \\
  --image=nicolaka/netshoot \\
  -- /bin/bash`, note: 'Full networking toolkit: nslookup, dig, tcpdump, curl, netstat.' },
    { title: 'Test DNS resolution', cmd: `nslookup mongodb
nslookup mongodb.default
nslookup mongodb.default.svc.cluster.local
time nslookup mongodb    # measure latency`, note: 'FQDN works but short name fails → cross-namespace. 5s latency → NDOTS + conntrack problem.' },
    { title: 'Check service and endpoints', cmd: `kubectl get svc mongodb -n default
kubectl get endpoints mongodb -n default
kubectl describe svc mongodb -n default`, note: 'Empty endpoints = selector mismatch. Fix labels or selector, not DNS.' },
    { title: 'Check CoreDNS health', cmd: `kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns -f
kubectl describe configmap coredns -n kube-system`, note: 'Look for NXDOMAIN spikes, upstream timeouts, or regular IOPS spikes (CronJob indicator).' },
    { title: 'Check resolv.conf inside the pod', cmd: `kubectl exec -it <pod-name> -- cat /etc/resolv.conf`, note: 'Verify nameserver is CoreDNS, check search domains, confirm ndots value.' },
  ];
  return (
    <motion.div {...fade}>
      <div className="section-title">Debugging toolkit</div>
      <div className="section-sub">5-step playbook for diagnosing DNS failures in production.</div>
      {steps.map((s, i) => (
        <div className="debug-step" key={i}>
          <div className="ds-header">
            <div className="ds-num">{i + 1}</div>
            <div className="ds-title">{s.title}</div>
          </div>
          <CodeBlock>{s.cmd}</CodeBlock>
          <p>{s.note}</p>
        </div>
      ))}
      <div className="card" style={{ marginTop: 6 }}>
        <h2>Decision tree</h2>
        <div className="plugin-list">
          <div className="plugin-row"><div className="plugin-dot" style={{ background: 'var(--red)' }} /><div className="plugin-name">NXDOMAIN?</div><div className="plugin-desc">Service doesn't exist, wrong namespace, or using short name cross-namespace. Check kubectl get svc and namespace.</div></div>
          <div className="plugin-row"><div className="plugin-dot" style={{ background: 'var(--amber)' }} /><div className="plugin-name">Service exists, connection fails?</div><div className="plugin-desc">Empty endpoints = selector mismatch. Check pod labels match Service selector. Also check NetworkPolicies.</div></div>
          <div className="plugin-row"><div className="plugin-dot" style={{ background: 'var(--amber)' }} /><div className="plugin-name">5s latency spikes?</div><div className="plugin-desc">NDOTS + conntrack race. Add ndots:2 and single-request to pod's dnsConfig. Or deploy NodeLocal DNSCache.</div></div>
          <div className="plugin-row"><div className="plugin-dot" style={{ background: 'var(--red)' }} /><div className="plugin-name">All DNS failing cluster-wide?</div><div className="plugin-desc">Check CoreDNS pod health. Check if CoreDNS can reach kube API. Check for CPU throttling (default 100m is too low at scale).</div></div>
          <div className="plugin-row"><div className="plugin-dot" style={{ background: 'var(--purple)' }} /><div className="plugin-name">Regular IOPS spike in CoreDNS logs?</div><div className="plugin-desc">Look for a CronJob hitting the API every N seconds. Stuck kubelet termination can cause this. The fix isn't DNS config.</div></div>
        </div>
      </div>
      <div className="card">
        <h2>Production hardening checklist</h2>
        <ul className="checklist">
          <li>Set ndots: 2 — immediate ~80% reduction in unnecessary queries</li>
          <li>Set single-request — eliminates conntrack race condition</li>
          <li>CPU: minimum 200m request, 500m limit per CoreDNS pod</li>
          <li>Use Cluster Proportional Autoscaler, not HPA</li>
          <li>Run CoreDNS on worker nodes, not control plane nodes</li>
          <li>Deploy NodeLocal DNSCache for clusters with 50+ pods</li>
          <li>Monitor with Prometheus: query rate, cache hit ratio, upstream error rate</li>
          <li>Never use autopath at scale without understanding the caching implication</li>
          <li>Always use FQDN for cross-namespace service references</li>
          <li>Set JVM networkaddress.cache.ttl=30 for Java apps</li>
        </ul>
      </div>
    </motion.div>
  );
}

function MeshSection() {
  return (
    <motion.div {...fade}>
      <div className="section-title">Service mesh boundary</div>
      <div className="section-sub">Where DNS stops being enough — and what fills the gap.</div>
      <div className="card">
        <h2>What DNS solves vs. what it doesn't</h2>
        <div className="grid-2">
          <div>
            <span className="hero-badge badge-green">DNS solves</span>
            <ul style={{ marginTop: 8 }}>
              <li>Where is the service? (name → IP)</li>
              <li>Load balancing to healthy pods (via kube-proxy)</li>
              <li>Stable endpoint across pod reschedules</li>
              <li>StatefulSet stable identity</li>
            </ul>
          </div>
          <div>
            <span className="hero-badge badge-red">DNS does NOT solve</span>
            <ul style={{ marginTop: 8 }}>
              <li>Encryption between services (mTLS)</li>
              <li>Traffic splitting (canary deployments)</li>
              <li>Retries, timeouts, circuit breaking</li>
              <li>Request-level observability and tracing</li>
              <li>Latency-aware load balancing</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="card">
        <h2>The three pillars of a service mesh</h2>
        <div className="mesh-grid">
          <div className="mesh-pillar" style={{ borderColor: 'rgba(79,142,247,0.3)' }}>
            <h4 style={{ color: 'var(--blue)' }}>Connect</h4>
            <ul>
              <li>Latency-aware load balancing — routes to the fastest available pod, not random</li>
              <li>Traffic shifting — 10% to v2, 90% to v1 without code changes</li>
              <li>Retries — failed request automatically retried on another pod</li>
              <li>Circuit breaking — stop sending to overloaded/failing services before cascade</li>
            </ul>
          </div>
          <div className="mesh-pillar" style={{ borderColor: 'rgba(155,127,244,0.3)' }}>
            <h4 style={{ color: 'var(--purple)' }}>Secure</h4>
            <ul>
              <li>mTLS — every service-to-service connection mutually authenticated and encrypted</li>
              <li>Zero-trust networking — neither side can be impersonated</li>
              <li>Policy enforcement — which services are allowed to talk to which</li>
              <li>Certificate rotation — automated, no manual cert management</li>
            </ul>
          </div>
          <div className="mesh-pillar" style={{ borderColor: 'rgba(45,212,191,0.3)' }}>
            <h4 style={{ color: 'var(--teal)' }}>Monitor</h4>
            <ul>
              <li>Full request tracing — which service called which, latency at every hop</li>
              <li>Error rates per route — not just "the cluster is slow"</li>
              <li>Fault injection — deliberately inject errors to test resilience</li>
              <li>Traffic topology — live map of service-to-service communication</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="card">
        <h2>When should you actually use one?</h2>
        <div className="plugin-list">
          <div className="plugin-row"><div className="plugin-dot" style={{ background: 'var(--red)' }} /><div className="plugin-name">Startup / small team</div><div className="plugin-desc">No. Operational complexity is brutal. You'll spend more time managing the mesh than shipping features.</div></div>
          <div className="plugin-row"><div className="plugin-dot" style={{ background: 'var(--green)' }} /><div className="plugin-name">Regulated industry (PCI, HIPAA, SOC2)</div><div className="plugin-desc">Yes. mTLS is often non-negotiable for compliance. The mesh gives you cryptographic proof of service identity.</div></div>
          <div className="plugin-row"><div className="plugin-dot" style={{ background: 'var(--amber)' }} /><div className="plugin-name">Microservices at scale with complex routing</div><div className="plugin-desc">Probably yes. When you have 50+ services and need canary deployments, circuit breaking, and distributed tracing.</div></div>
          <div className="plugin-row"><div className="plugin-dot" style={{ background: 'var(--red)' }} /><div className="plugin-name">"Add it for observability"</div><div className="plugin-desc">No. Use Prometheus + distributed tracing (Jaeger, Tempo) first. Way simpler, solves the same observability problem.</div></div>
        </div>
        <Alert type="info">A service mesh is like a database — don't reach for it as your default solution. DNS is boring. Boring is good. A mesh is interesting and complex. Only use it when boring isn't enough.</Alert>
      </div>
      <div className="card">
        <h2>How a mesh relates to DNS</h2>
        <p>A service mesh doesn't replace CoreDNS — it sits on top of it. Your app still calls <code>mongodb.default.svc.cluster.local</code>. DNS still resolves it. But the sidecar proxy (Envoy) intercepts the connection before it leaves the pod and applies its policies: mTLS, retries, circuit breaking, telemetry. DNS remains the discovery mechanism. The mesh adds the L7 policy layer.</p>
      </div>
    </motion.div>
  );
}

function WarSection() {
  const wars = [
    {
      cls: 'war-datadog',
      company: 'Datadog · KubeCon Barcelona 2019',
      title: '"It\'s ~~never~~ always DNS"',
      body: [
        '1000+ node cluster. Team enabled autopath to reduce DNS queries from 5 to 1 per lookup. In testing: great. In production: autopath has no caching and requires pods verified mode, which makes CoreDNS watch all pods.',
        'At Datadog\'s scale, this generated so many upstream DNS queries that the upstream rate limit was reached. DNS timeouts cluster-wide.',
        'Second war story from the same talk: CoreDNS showed IOPS spikes every 60 seconds. Traced to a CronJob calling AWS API → kubectl to update IPs → stuck kubelet termination that couldn\'t complete because the CronJob kept retrying. The IOPS spike was a symptom of a stuck process, not a DNS problem.',
      ],
      lesson: 'Autopath is dangerous at scale. A periodic IOPS pattern in CoreDNS logs means look for a CronJob. The fix often isn\'t DNS config.',
      link: { href: 'https://www.youtube.com/watch?v=QKI-JRs2RIE', label: 'Watch the talk (YouTube)' },
    },
    {
      cls: 'war-preply',
      company: 'Preply · Post-mortem 2020',
      title: 'CoreDNS autoscaler + stale conntrack = routing to dead pods',
      body: [
        'CoreDNS autoscaler scaled down from 3 to 2 replicas during low traffic. kube-proxy failed to delete the old conntrack entry for the removed CoreDNS pod. Traffic was still routed to a pod that no longer existed.',
        '5xx errors started within 5 minutes. The accidental fix: a routine deploy triggered new node creation, which rewrote the conntrack table and cleared the stale entries.',
      ],
      lesson: 'Don\'t let an autoscaler treat CoreDNS like a normal workload. Use Cluster Proportional Autoscaler or manual sizing. Monitor conntrack table entries.',
      link: { href: 'https://medium.com/preply-engineering/dns-postmortem-e169efd45afd', label: 'Read the post-mortem' },
    },
    {
      cls: 'war-openai',
      company: 'OpenAI · December 11 2024 · Official post-mortem',
      title: 'Telemetry overwhelms control plane → DNS dies → everything breaks',
      metrics: [{ val: '4hr', lbl: 'outage duration' }, { val: '100%', lbl: 'services affected' }, { val: 'DNS', lbl: 'root cause propagation' }],
      body: [
        'A new telemetry service deployed to all clusters simultaneously. Its config caused every node to execute resource-intensive Kubernetes API operations — cost scaled with cluster size. Thousands of nodes doing this overwhelmed the API servers.',
        'DNS caching masked the problem initially — cached records kept services working while the rollout continued fleet-wide. Once caches expired, DNS resolution failed. Services couldn\'t find each other. ChatGPT, API, and Sora all went down.',
        'Root architectural problem: CoreDNS was running on control plane nodes. When the control plane came under load, CoreDNS restarted — but needed the API server to initialize, which was also overwhelmed. DNS couldn\'t recover until the API server recovered. A circular dependency.',
      ],
      lesson: 'Run CoreDNS on worker nodes, not control plane nodes. DNS caching is a double-edged sword — it masks problems until they cascade. DNS is the nervous system of the cluster.',
      link: { href: 'https://status.openai.com/incidents/ctrsv3lwd797', label: 'Official OpenAI post-mortem' },
    },
    {
      cls: 'war-anon',
      company: 'Anonymous large cluster · ~2024',
      title: 'Default 100m CPU limit throttles CoreDNS to 97% — payment service unreachable',
      metrics: [{ val: '312', lbl: 'pods' }, { val: '97%', lbl: 'CPU throttled' }, { val: '5s', lbl: 'DNS latency' }, { val: '2ms', lbl: 'after fix' }],
      body: [
        'CoreDNS running at default settings for 18 months. Default CPU limit: 100m. At 312-pod scale, CoreDNS was CPU-throttled 97% of the time. Queries queued and timed out. Payment service appeared unreachable even though all pods showed Running.',
        'Fix: remove the CPU throttle (200m request, 500m limit), set ndots:2, deploy Cluster Proportional Autoscaler, add NodeLocal DNSCache. DNS latency dropped from 5s to 2ms.',
      ],
      lesson: 'CoreDNS\'s default 100m CPU limit was sized for tiny clusters. Monitor it. Right-size it. Use Cluster Proportional Autoscaler — it scales with node count, not CPU metrics.',
    },
  ];
  return (
    <motion.div {...fade}>
      <div className="section-title">War stories</div>
      <div className="section-sub">Real companies, real post-mortems. DNS is always involved.</div>
      {wars.map((w, i) => (
        <div className={`war-card ${w.cls}`} key={i}>
          <div className="war-company">{w.company}</div>
          <div className="war-title">{w.title}</div>
          {w.metrics && (
            <div className="war-metrics">
              {w.metrics.map((m, j) => (
                <div className="war-metric" key={j}>
                  <span className="val">{m.val}</span>
                  <span className="lbl">{m.lbl}</span>
                </div>
              ))}
            </div>
          )}
          {w.body.map((b, j) => <p className="war-body" key={j}>{b}</p>)}
          <div className="war-lesson">{w.lesson}</div>
          {w.link && <a className="war-link" href={w.link.href} target="_blank" rel="noreferrer">→ {w.link.label}</a>}
        </div>
      ))}
    </motion.div>
  );
}

const sections = {
  chain: <ChainSection />,
  coredns: <CoreDNSSection />,
  headless: <HeadlessSection />,
  ndots: <NdotsSection />,
  debug: <DebugSection />,
  mesh: <MeshSection />,
  wars: <WarSection />,
};

export default function App() {
  const [active, setActive] = useState('chain');
  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-inner">
          <div className="nav-logo">k8s <span>DNS</span> guide</div>
          <div className="nav-tabs">
            {tabs.map(t => (
              <button key={t.id} className={`nav-tab${active === t.id ? ' active' : ''}`} onClick={() => setActive(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>
      </nav>
      <div className="hero">
        <div className="hero-eyebrow">Kubernetes Service Discovery & DNS</div>
        <h1>When Kubernetes breaks,<br /><em>it's always DNS.</em></h1>
        <p>A practitioner's guide to service discovery, CoreDNS internals, production war stories, and the debugging toolkit you'll actually need.</p>
        <div>
          <span className="hero-badge badge-blue">DNS Chain</span>
          <span className="hero-badge badge-purple">CoreDNS</span>
          <span className="hero-badge badge-teal">Headless Services</span>
          <span className="hero-badge badge-amber">NDOTS Bug</span>
          <span className="hero-badge badge-red">War Stories</span>
          <span className="hero-badge badge-coral">Service Mesh</span>
        </div>
      </div>
      <main className="main">
        <AnimatePresence mode="wait">
          {sections[active]}
        </AnimatePresence>
      </main>
      <footer className="footer">
        Built for the Advanced Study Session · Source material: <a href="https://www.youtube.com/watch?v=QKI-JRs2RIE" target="_blank" rel="noreferrer">Datadog KubeCon 2019</a> · <a href="https://status.openai.com/incidents/ctrsv3lwd797" target="_blank" rel="noreferrer">OpenAI Post-mortem 2024</a> · <a href="https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/" target="_blank" rel="noreferrer">Kubernetes Docs</a>
      </footer>
    </div>
  );
}
