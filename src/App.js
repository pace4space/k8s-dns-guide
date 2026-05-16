import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Accordion } from './Accordion';
import PacketTrace from './PacketTrace';
import Presentation from './Presentation';
import './App.css';

const tabs = [
  { id: 'trace', label: '▶ Packet Trace' },
  { id: 'chain', label: 'DNS Chain' },
  { id: 'coredns', label: 'CoreDNS Internals' },
  { id: 'headless', label: 'Headless Services' },
  { id: 'ndots', label: 'NDOTS & Search Domains' },
  { id: 'debug', label: 'Debug Toolkit' },
  { id: 'mesh', label: 'Service Mesh' },
  { id: 'wars', label: 'War Stories' },
  { id: 'present', label: '🎤 Present' },
];

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.18 },
};

function Code({ children }) {
  return <div className="code-block"><pre>{children}</pre></div>;
}

function Alert({ type = 'info', children }) {
  return <div className={`alert alert-${type}`}>{children}</div>;
}

function Tag({ color, children }) {
  return <span className={`hero-badge badge-${color}`}>{children}</span>;
}

/* ── Expandable plugin row — actually clickable ── */
function PluginRow({ color, name, desc, tag }) {
  const [open, setOpen] = useState(false);
  const tagStyle = t =>
    t === 'key' ? { background: 'var(--purple-bg)', color: 'var(--purple)' } :
    t === 'danger' ? { background: 'var(--red-bg)', color: 'var(--red)' } :
    t === 'critical' ? { background: 'var(--amber-bg)', color: 'var(--amber)' } : {};

  return (
    <div
      className="plugin-row"
      onClick={() => setOpen(o => !o)}
      style={{ flexDirection: 'column', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        <div className="plugin-dot" style={{ background: color }} />
        <div className="plugin-name">
          {name}
          {tag && <span className="plugin-tag" style={tagStyle(tag)}>{tag}</span>}
        </div>
        <div className="plugin-desc" style={{ flex: 1 }}>
          {!open && desc.slice(0, 60)}{!open && desc.length > 60 && '…'}
        </div>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          style={{ fontSize: 11, color: 'var(--text3)', minWidth: 12 }}
        >▶</motion.span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden', width: '100%' }}
          >
            <div style={{
              paddingTop: 10, paddingLeft: 20, fontSize: 13,
              color: 'var(--text2)', lineHeight: 1.7,
              borderTop: '1px solid var(--border)', marginTop: 8
            }}>
              {desc}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── CHAIN ── */
function ChainSection() {
  return (
    <motion.div {...fade}>
      <div className="section-title">DNS resolution chain</div>
      <div className="section-sub">How a service name becomes a real network connection — every hop explained.</div>

      <Accordion title="The core problem — why you need DNS" defaultOpen accent="#4f8ef7">
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>
          Pods are ephemeral. Every restart gives a new IP. Hardcoding IPs breaks silently when pods reschedule.
          You need a stable <strong style={{ color: 'var(--text)' }}>name</strong> — the DNS chain is what makes that name work at runtime.
        </p>
        <Alert type="warn">The #1 production mistake: hardcoding pod IPs instead of Service DNS names.</Alert>
      </Accordion>

      <Accordion title="Step-by-step: App → CoreDNS → kube-proxy → Pod" defaultOpen accent="#4ade80">
        <div className="chain">
          {[
            { n: 1, c: '#4f8ef7', t: 'App calls a name', d: <>Your app calls <code>mongodb</code> or the full FQDN. The kernel inside the pod's network namespace reads <code>/etc/resolv.conf</code> to find the resolver.</> },
            { n: 2, c: '#9b7ff4', t: 'CoreDNS resolves', d: <>Every pod's <code>/etc/resolv.conf</code> points to CoreDNS (e.g. <code>10.96.0.10</code>). CoreDNS checks its in-memory cache synced from the Kubernetes API and returns the Service's ClusterIP.</> },
            { n: 3, c: '#2dd4bf', t: 'The ClusterIP is virtual', d: <>The ClusterIP (e.g. <code>10.96.0.2</code>) doesn't exist on any real network interface. It's a target for iptables rules only.</> },
            { n: 4, c: '#f59e0b', t: 'kube-proxy intercepts via iptables', d: <>kube-proxy watches EndpointSlices and writes DNAT rules. Traffic to <code>10.96.0.2:27017</code> gets rewritten to a real pod IP. This happens in the kernel before the packet leaves the node.</> },
            { n: 5, c: '#4ade80', t: 'CNI delivers to the pod', d: 'The rewritten packet is routed by the CNI plugin to the actual pod on whatever node it lives on.' },
          ].map(s => (
            <div className="chain-step" key={s.n}>
              <div className="chain-num" style={{ background: s.c }}>{s.n}</div>
              <div className="chain-body"><strong>{s.t}</strong><span>{s.d}</span></div>
            </div>
          ))}
        </div>
        <Code>{`App → /etc/resolv.conf → CoreDNS (10.96.0.10)
   → ClusterIP (10.96.0.2) [virtual, iptables target]
   → kube-proxy DNAT rewrite → real pod IP (10.0.1.5)
   → CNI → Pod B`}</Code>
      </Accordion>

      <Accordion title="One kernel per node — not per pod" accent="#9b7ff4">
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          Pods are isolated network namespaces inside a single Linux kernel on each node.
          kube-proxy's iptables rules live in the host namespace but apply to all pod namespaces.
          The ClusterIP rewrite is completely transparent to the pod.
        </p>
      </Accordion>

      <Accordion title="Service → EndpointSlice → kube-proxy — the data flow" accent="#fb923c">
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>
          When you create a Service with a selector, Kubernetes auto-creates an <strong style={{ color: 'var(--text)' }}>EndpointSlice</strong> listing
          healthy pod IPs. kube-proxy watches EndpointSlices — not pods directly. Pod dies → removed from EndpointSlice
          → kube-proxy updates iptables within seconds.
        </p>
        <Code>{`Service (name, selector, ClusterIP)
  ↓ auto-generated
EndpointSlice (list of healthy pod IPs)
  ↓ watched by
kube-proxy (writes iptables DNAT rules)`}</Code>
        <Alert type="info">Use the Packet Trace tab to watch this entire flow animate step by step for different scenarios.</Alert>
      </Accordion>
    </motion.div>
  );
}

/* ── COREDNS ── */
function CoreDNSSection() {
  const plugins = [
    { color: '#5a5a78', name: 'errors', desc: 'Logs all DNS errors to stdout. Always runs first in the chain so nothing is missed. No config needed.', tag: null },
    { color: '#f59e0b', name: 'health', desc: 'Serves a /health HTTP liveness endpoint. Goes down if CoreDNS can\'t reach the kube API, causing the scheduler to reschedule it. Critical failure mode: under API overload, CoreDNS restarts but needs the API to restart — circular dependency. This is exactly what happened at OpenAI.', tag: 'critical' },
    { color: '#5a5a78', name: 'prometheus', desc: 'Exposes metrics on :9153. In production you MUST monitor: query rate, cache hit ratio, upstream error rate, CoreDNS latency. Without this you\'re flying blind.', tag: null },
    { color: '#9b7ff4', name: 'kubernetes', desc: 'Authoritative for .cluster.local. Watches the Kubernetes API via informer, maintains in-memory cache of all Services and EndpointSlices. Has sub-options: pods mode (disabled/insecure/verified), fallthrough, ttl, endpoint_pod_names.', tag: 'key' },
    { color: '#2dd4bf', name: 'cache', desc: 'Caches DNS responses. Default TTL: 30s for positive, 30s for negative. Critical for reducing upstream load. Autopath bypasses this completely — that\'s the Datadog trap at 1000+ nodes.', tag: null },
    { color: '#f59e0b', name: 'loadbalance', desc: 'Shuffles the order of returned IPs on each query for headless services. The client picks the first IP, so rotating order distributes load across pods. Pure DNS-level round-robin — no proxy involved.', tag: null },
    { color: '#f87171', name: 'autopath', desc: 'Resolves search domain suffixes server-side — 1 query instead of 5. Sounds great. Requires pods verified mode, which makes CoreDNS watch all pods (costly in memory and API load). Does NOT cache. At Datadog\'s 1000-node scale this caused upstream rate limit failures. Disable at scale.', tag: 'danger' },
    { color: '#5a5a78', name: 'loop', desc: 'Detects infinite forwarding loops (CoreDNS → upstream → CoreDNS) and terminates them. Without this, a misconfigured upstream can crash CoreDNS in a loop.', tag: null },
    { color: '#fb923c', name: 'forward', desc: 'Forwards unresolved queries upstream. Default target: /etc/resolv.conf (node\'s nameservers — your cloud provider\'s DNS). Handles google.com, internal corp domains, anything outside .cluster.local.', tag: null },
    { color: '#5a5a78', name: 'reload', desc: 'Watches the Corefile ConfigMap and reloads without pod restart when changed. This is how you safely push CoreDNS config changes in production — no downtime, no restart.', tag: null },
  ];

  return (
    <motion.div {...fade}>
      <div className="section-title">CoreDNS internals</div>
      <div className="section-sub">Architecture, plugin chain, configuration options, and what deploys to your cluster. Click any plugin to expand.</div>

      <Accordion title="What CoreDNS deploys to your cluster" accent="#4f8ef7">
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {[
            ['ServiceAccount', 'CoreDNS\'s cluster identity'],
            ['ClusterRole + ClusterRoleBinding', 'Read access to Services, Endpoints, Pods across all namespaces — required to answer DNS queries'],
            ['ConfigMap coredns', 'The Corefile. Every change is automatically pushed to all CoreDNS pods via the reload plugin. No pod restart needed.'],
            ['Deployment', 'Minimum 2 replicas. Single replica = single point of failure for the entire cluster\'s DNS'],
            ['Service named kube-dns', 'Still called kube-dns for backward compatibility even though CoreDNS replaced it since Kubernetes 1.13'],
          ].map(([k, v]) => (
            <li key={k} style={{ fontSize: 13, color: 'var(--text2)', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ color: 'var(--text)' }}>{k}</strong> — {v}
            </li>
          ))}
        </ul>
      </Accordion>

      <Accordion title="Plugin chain — click each plugin to expand its detail" defaultOpen accent="#9b7ff4">
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
          Plugins execute top-to-bottom. Order matters — click any row to read the full explanation.
        </p>
        <div className="plugin-list">
          {plugins.map((p, i) => (
            <PluginRow key={i} {...p} />
          ))}
        </div>
      </Accordion>

      <Accordion title="kubernetes plugin sub-options — pods, fallthrough, ttl" accent="#2dd4bf">
        <div className="grid-2">
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>pods [disabled|insecure|verified]</p>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text)' }}>disabled</strong> (default) — pod DNS records off.<br />
              <strong style={{ color: 'var(--text)' }}>insecure</strong> — reply with IP as-given, no check.<br />
              <strong style={{ color: 'var(--text)' }}>verified</strong> — verify IP is real pod. Watches all pods. Costly.
            </p>
            <Alert type="warn">pods verified + autopath at 1000+ nodes = Datadog's upstream rate limit failure.</Alert>
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>fallthrough [ZONES]</p>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              Second chance: if kubernetes plugin can't answer (e.g. reverse DNS for in-addr.arpa),
              pass to next plugin instead of NXDOMAIN. Without this, reverse DNS silently fails.
            </p>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '10px 0 6px' }}>ttl</p>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              Override TTL of Kubernetes DNS records. Default 5s. Lower = faster propagation, more queries. Higher = less load, slower updates.
            </p>
          </div>
        </div>
      </Accordion>

      <Accordion title="dnsPolicy — per-pod DNS configuration" accent="#fb923c">
        <div className="plugin-list">
          {[
            { c: '#9b7ff4', n: 'ClusterFirst', d: 'Default. Use CoreDNS. Short names via search domains, unknowns forwarded upstream.' },
            { c: '#2dd4bf', n: 'ClusterFirstWithHostNet', d: 'Same as ClusterFirst but for pods running with hostNetwork: true.' },
            { c: '#5a5a78', n: 'Default', d: 'Use node\'s DNS directly. Bypasses CoreDNS. Pod can\'t resolve cluster service names.' },
            { c: '#f87171', n: 'None', d: 'Fully custom via dnsConfig. The right way to set ndots:2 + single-request per pod class without touching cluster-wide CoreDNS config.' },
          ].map(p => <PluginRow key={p.n} color={p.c} name={p.n} desc={p.d} />)}
        </div>
      </Accordion>
    </motion.div>
  );
}

/* ── HEADLESS ── */
function HeadlessSection() {
  return (
    <motion.div {...fade}>
      <div className="section-title">Headless services</div>
      <div className="section-sub">When stable pod identity matters more than load balancing.</div>

      <Accordion title="Regular vs headless — the DNS difference" defaultOpen accent="#2dd4bf">
        <div className="compare">
          <div className="compare-col" style={{ borderColor: 'rgba(79,142,247,0.3)' }}>
            <h4>Regular service</h4>
            <div className="sub" style={{ color: 'var(--blue)' }}>clusterIP: 10.96.0.2</div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>CoreDNS returns a single virtual ClusterIP. kube-proxy load-balances to any healthy pod.</p>
            <Code>{`mongodb → 10.96.0.2\nkube-proxy → any pod`}</Code>
            <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}><strong>Use case:</strong> stateless apps — web servers, APIs.</p>
          </div>
          <div className="compare-col" style={{ borderColor: 'rgba(45,212,191,0.3)' }}>
            <h4>Headless service</h4>
            <div className="sub" style={{ color: 'var(--teal)' }}>clusterIP: None</div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>CoreDNS returns direct pod IPs. Each StatefulSet pod gets a stable DNS name by ordinal.</p>
            <Code>{`mongo-0.mongodb → 10.0.1.5\nmongo-1.mongodb → 10.0.1.6\nmongo-2.mongodb → 10.0.1.7`}</Code>
            <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}><strong>Use case:</strong> StatefulSets — MongoDB, Cassandra, etcd.</p>
          </div>
        </div>
      </Accordion>

      <Accordion title="Why StatefulSets need headless — MongoDB replication" accent="#fb923c">
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>
          MongoDB replication requires stable identities. <code>mongo-0</code> must reliably reach <code>mongo-1</code> and <code>mongo-2</code> by name.
          When <code>mongo-0</code> reschedules to a different node with a different IP,
          <code>mongo-0.mongodb.default.svc.cluster.local</code> still resolves to it.
          The replica set reforms without manual reconfiguration.
        </p>
        <Alert type="danger">Using a regular Service for a StatefulSet is a common production mistake. Replication breaks silently and error messages are confusing.</Alert>
      </Accordion>

      <Accordion title="Headless YAML — what to actually write" accent="#4f8ef7">
        <Code>{`apiVersion: v1
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
  replicas: 3`}</Code>
      </Accordion>
    </motion.div>
  );
}

/* ── NDOTS — fixed: slider and its output are always visible, not inside a collapsed accordion ── */
function NdotsSection() {
  const [ndots, setNdots] = useState(5);
  const [customDomain, setCustomDomain] = useState('mongodb');
  const dots = customDomain.split('').filter(c => c === '.').length;
  const expandsSearch = dots < ndots;

  const queries = expandsSearch
    ? [
        { q: `${customDomain}.default.svc.cluster.local`, r: 'slow', l: 'try 1 — search domain appended' },
        { q: `${customDomain}.svc.cluster.local`, r: 'fail', l: 'NXDOMAIN' },
        { q: `${customDomain}.cluster.local`, r: 'fail', l: 'NXDOMAIN' },
        { q: `${customDomain} (bare)`, r: 'fail', l: 'NXDOMAIN' },
      ]
    : [{ q: customDomain, r: 'ok', l: 'queried directly as FQDN ✓ — 1 query' }];

  return (
    <motion.div {...fade}>
      <div className="section-title">NDOTS & search domains</div>
      <div className="section-sub">The 5-second latency bug, the autopath trap, conntrack races, and how to fix them.</div>

      {/* LIVE SIMULATOR — always visible, not inside an accordion */}
      <div className="card" style={{ border: '1px solid rgba(245,158,11,0.4)', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
          🔬 Live NDOTS simulator
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          Type any hostname and drag the slider to see exactly how many DNS queries it generates.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Hostname to query:</label>
          <input
            type="text"
            value={customDomain}
            onChange={e => setCustomDomain(e.target.value)}
            placeholder="e.g. mongodb, api.payments, google.com"
            style={{
              width: '100%', padding: '8px 12px', background: 'var(--bg3)',
              border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)',
              fontSize: 13, fontFamily: 'monospace',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>ndots value:</label>
          <input
            type="range" min={1} max={5} value={ndots} step={1}
            onChange={e => setNdots(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber)', minWidth: 24 }}>{ndots}</span>
        </div>

        <div style={{
          fontSize: 13, padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: expandsSearch ? 'var(--amber-bg)' : 'var(--green-bg)',
          color: expandsSearch ? 'var(--amber)' : 'var(--green)',
          fontWeight: 500,
        }}>
          "{customDomain}" has {dots} dot{dots !== 1 ? 's' : ''}.&nbsp;
          {expandsSearch
            ? `${dots} < ${ndots} → search domain expansion: ${queries.length} sequential queries`
            : `${dots} ≥ ${ndots} → queried directly as FQDN — 1 query only ✓`}
        </div>

        <div className="ndots-list">
          {queries.map((q, i) => (
            <motion.div
              className="ndots-row" key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <div className="ndots-query">{q.q}</div>
              <div className={`ndots-result r-${q.r}`}>{q.l}</div>
            </motion.div>
          ))}
        </div>

        {expandsSearch && (
          <Alert type="warn">
            Each failed attempt = a UDP round trip to CoreDNS + wait for NXDOMAIN response.
            At scale with many pods firing simultaneously, this causes the conntrack race condition (5s timeouts).
          </Alert>
        )}
      </div>

      <Accordion title="What is NDOTS and why does Kubernetes default to 5?" accent="#f59e0b">
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>
          NDOTS is a <code>/etc/resolv.conf</code> option. If a hostname has fewer dots than the NDOTS value,
          the resolver tries all search domain suffixes first. Kubernetes defaults to ndots:5 because
          the full FQDN <code>mongodb.default.svc.cluster.local</code> has 4 dots — ndots:5 ensures it's
          queried directly. Sound design, unexpected production consequences at scale.
        </p>
        <Code>{`nameserver 10.96.0.10
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5`}</Code>
      </Accordion>

      <Accordion title="The conntrack race condition — kernel-level detail" accent="#f87171">
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>
          When multiple DNS queries fire on the same UDP socket (same source port), Linux's conntrack table
          gets confused about which response belongs to which query. One stalls for 5 seconds.
          Three netfilter race scenarios:
        </p>
        <ul style={{ paddingLeft: '1.2rem' }}>
          {[
            'kube-proxy replaces iptables chains while packets traverse them — brief rule mismatch window',
            'Stale conntrack entries after pod deletion — kube-proxy updates iptables, but conntrack still routes to dead IP (the Preply incident)',
            'iptables vs IPVS mode switching — changing kube-proxy mode leaves a window of partially populated tables',
          ].map((t, i) => <li key={i} style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 6 }}>{t}</li>)}
        </ul>
      </Accordion>

      <Accordion title="The fix — ndots:2 + single-request + NodeLocal DNSCache" accent="#4ade80">
        <Code>{`dnsConfig:
  options:
  - name: ndots
    value: "2"         # try only 2 suffixes — ~80% fewer queries
  - name: single-request
    value: ""          # one socket per query = no conntrack collision`}</Code>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, margin: '10px 0' }}>
          For production clusters with 50+ pods, also deploy <strong style={{ color: 'var(--text)' }}>NodeLocal DNSCache</strong> —
          a DaemonSet that runs a DNS cache on every node. Uses TCP upstream to CoreDNS,
          bypassing conntrack entirely. Eliminates the race condition at the architectural level.
        </p>
        <Alert type="success">NodeLocal DNSCache is the right solution. ndots:2 + single-request is the quick fix. Use both.</Alert>
      </Accordion>

      <Accordion title="Cross-namespace resolution — the gotcha that trips everyone" accent="#9b7ff4">
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
          Search domains only include the pod's own namespace. From the <code>payments</code> namespace,
          querying <code>mongodb</code> looks for <code>mongodb.payments.svc.cluster.local</code> — not found.
        </p>
        <div className="grid-2">
          <div><Tag color="green">From default namespace</Tag>
            <Code>{`mongodb          ✓\nmongodb.default  ✓\nFQDN             ✓`}</Code>
          </div>
          <div><Tag color="red">From payments namespace</Tag>
            <Code>{`mongodb          ✗ NXDOMAIN\nmongodb.default  ✓\nFQDN             ✓`}</Code>
          </div>
        </div>
        <Alert type="info">Best practice: always use the full FQDN in multi-namespace deployments.</Alert>
      </Accordion>

      <Accordion title="NXDOMAIN explained" accent="#5a5a78">
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          NXDOMAIN = "Non-Existent Domain." It's the DNS response code CoreDNS returns when a queried name
          doesn't exist. If you see it in nslookup output, the service either doesn't exist in that namespace,
          you're using the wrong short name cross-namespace, or the Service hasn't been created yet.
        </p>
      </Accordion>

      <Accordion title="Autopath — the optimization that backfired at Datadog" accent="#f87171">
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>
          Autopath resolves search domain suffixes server-side — 1 query instead of 5. Requires <code>pods verified</code> mode
          (CoreDNS watches all pods — costly in memory and API load). Does NOT cache.
          At Datadog's 1000+ node scale this caused so many upstream queries that the upstream rate limit was reached.
          DNS timeouts cluster-wide. The cure was worse than the disease.
        </p>
        <Alert type="danger">Disable autopath at scale. Use NodeLocal DNSCache instead.</Alert>
      </Accordion>
    </motion.div>
  );
}

/* ── DEBUG ── */
function DebugSection() {
  return (
    <motion.div {...fade}>
      <div className="section-title">Debugging toolkit</div>
      <div className="section-sub">5-step playbook for diagnosing DNS failures in production.</div>
      {[
        { title: 'Step 1 — spin up a debug pod', cmd: `kubectl run debug -it --rm \\\n  --image=nicolaka/netshoot \\\n  -- /bin/bash`, note: 'Full networking toolkit: nslookup, dig, tcpdump, curl, netstat.' },
        { title: 'Step 2 — test DNS resolution', cmd: `nslookup mongodb\nnslookup mongodb.default\nnslookup mongodb.default.svc.cluster.local\ntime nslookup mongodb    # 5s latency = NDOTS + conntrack`, note: 'FQDN works but short name fails → cross-namespace issue. 5s latency → NDOTS + conntrack problem.' },
        { title: 'Step 3 — check service and endpoints', cmd: `kubectl get svc mongodb -n default\nkubectl get endpoints mongodb -n default\nkubectl describe svc mongodb -n default`, note: 'Empty endpoints = selector mismatch. Fix pod labels or Service selector — not DNS.' },
        { title: 'Step 4 — check CoreDNS health', cmd: `kubectl get pods -n kube-system -l k8s-app=kube-dns\nkubectl logs -n kube-system -l k8s-app=kube-dns -f\nkubectl describe configmap coredns -n kube-system`, note: 'Look for NXDOMAIN spikes, upstream timeouts, or regular IOPS spikes every N seconds (CronJob indicator).' },
        { title: 'Step 5 — check resolv.conf inside the pod', cmd: `kubectl exec -it <pod-name> -- cat /etc/resolv.conf`, note: 'Verify nameserver is CoreDNS, check search domains, confirm ndots value.' },
      ].map((s, i) => (
        <Accordion key={i} title={s.title} defaultOpen={i === 0} accent="#4f8ef7">
          <Code>{s.cmd}</Code>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8, lineHeight: 1.6 }}>{s.note}</p>
        </Accordion>
      ))}

      <Accordion title="Decision tree — what to check when" accent="#9b7ff4">
        <div className="plugin-list">
          {[
            { c: 'var(--red)', n: 'NXDOMAIN?', d: 'Service doesn\'t exist, wrong namespace, or short name cross-namespace. Check kubectl get svc and current namespace.' },
            { c: 'var(--amber)', n: 'Service exists, connection fails?', d: 'Empty endpoints = selector mismatch. Check pod labels match Service selector. Also check NetworkPolicies.' },
            { c: 'var(--amber)', n: '5s latency spikes?', d: 'NDOTS + conntrack race. Add ndots:2 and single-request to pod dnsConfig. Deploy NodeLocal DNSCache.' },
            { c: 'var(--red)', n: 'All DNS failing cluster-wide?', d: 'Check CoreDNS pod health, CPU throttling (default 100m too low at scale), and whether CoreDNS can reach kube API.' },
            { c: 'var(--purple)', n: 'Regular IOPS spike in CoreDNS logs?', d: 'Look for a CronJob. Stuck kubelet termination causes this pattern. The fix isn\'t DNS config — it\'s the CronJob.' },
          ].map(p => <PluginRow key={p.n} color={p.c} name={p.n} desc={p.d} />)}
        </div>
      </Accordion>

      <Accordion title="Production hardening checklist" accent="#4ade80">
        <ul className="checklist">
          {[
            'Set ndots: 2 — immediate ~80% reduction in unnecessary queries',
            'Set single-request — eliminates conntrack race condition',
            'CPU: minimum 200m request, 500m limit per CoreDNS pod',
            'Use Cluster Proportional Autoscaler, not HPA',
            'Run CoreDNS on worker nodes, not control plane nodes',
            'Deploy NodeLocal DNSCache for clusters with 50+ pods',
            'Monitor with Prometheus: query rate, cache hit ratio, upstream error rate',
            'Never use autopath at scale without understanding the caching implication',
            'Always use FQDN for cross-namespace service references',
            'Set JVM networkaddress.cache.ttl=30 for Java apps',
          ].map(t => <li key={t}>{t}</li>)}
        </ul>
      </Accordion>
    </motion.div>
  );
}

/* ── MESH ── */
function MeshSection() {
  return (
    <motion.div {...fade}>
      <div className="section-title">Service mesh boundary</div>
      <div className="section-sub">Where DNS stops being enough — and what fills the gap.</div>

      <Accordion title="What DNS solves vs. what it doesn't" defaultOpen accent="#4f8ef7">
        <div className="grid-2">
          <div>
            <Tag color="green">DNS solves</Tag>
            <ul style={{ marginTop: 8, paddingLeft: '1.2rem' }}>
              {['Where is the service? (name → IP)', 'Load balancing to healthy pods (via kube-proxy)', 'Stable endpoint across pod reschedules', 'StatefulSet stable identity'].map(t => <li key={t} style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{t}</li>)}
            </ul>
          </div>
          <div>
            <Tag color="red">DNS does NOT solve</Tag>
            <ul style={{ marginTop: 8, paddingLeft: '1.2rem' }}>
              {['Encryption between services (mTLS)', 'Traffic splitting (canary deployments)', 'Retries, timeouts, circuit breaking', 'Request-level observability and tracing', 'Latency-aware load balancing'].map(t => <li key={t} style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{t}</li>)}
            </ul>
          </div>
        </div>
      </Accordion>

      {[
        {
          title: 'Connect — traffic management', accent: '#4f8ef7',
          items: [
            { c: 'var(--blue)', n: 'Latency-aware LB', d: 'Routes to the fastest available pod — not random. Actively measures response times and adjusts routing.' },
            { c: 'var(--blue)', n: 'Traffic shifting', d: '10% to v2, 90% to v1 without code changes. Canary deployments built into the mesh.' },
            { c: 'var(--blue)', n: 'Retries', d: 'Failed request automatically retried on another pod. Transparent to the app.' },
            { c: 'var(--blue)', n: 'Circuit breaking', d: 'Stop sending to overloaded/failing services before cascade. kube-proxy has no circuit breaking.' },
          ],
        },
        {
          title: 'Secure — mTLS and zero-trust', accent: '#9b7ff4',
          items: [
            { c: 'var(--purple)', n: 'mTLS', d: 'Every service-to-service connection mutually authenticated and encrypted. Neither side can be impersonated.' },
            { c: 'var(--purple)', n: 'Zero-trust networking', d: 'Cryptographic proof of service identity. Required for PCI-DSS, HIPAA, SOC2 compliance.' },
            { c: 'var(--purple)', n: 'Policy enforcement', d: 'Which services are allowed to talk to which. Enforced at the proxy level.' },
          ],
        },
        {
          title: 'Monitor — observability', accent: '#2dd4bf',
          items: [
            { c: 'var(--teal)', n: 'Full request tracing', d: 'Which service called which, latency at every hop. Not possible with DNS alone.' },
            { c: 'var(--teal)', n: 'Error rates per route', d: 'Not just "the cluster is slow" — which specific service→service call is failing.' },
            { c: 'var(--teal)', n: 'Fault injection', d: 'Deliberately inject latency or errors to test resilience. Validates retries and circuit breakers.' },
          ],
        },
      ].map(s => (
        <Accordion key={s.title} title={s.title} accent={s.accent}>
          <div className="plugin-list">
            {s.items.map(p => <PluginRow key={p.n} color={p.c} name={p.n} desc={p.d} />)}
          </div>
        </Accordion>
      ))}

      <Accordion title="When should you actually use a service mesh?" accent="#f59e0b">
        <div className="plugin-list">
          {[
            { c: 'var(--red)', n: 'Startup / small team', d: 'No. Operational complexity is brutal. You\'ll manage the mesh more than ship features.' },
            { c: 'var(--green)', n: 'Regulated industry (PCI, HIPAA, SOC2)', d: 'Yes. mTLS is often non-negotiable for compliance.' },
            { c: 'var(--amber)', n: 'Microservices at scale with complex routing', d: 'Probably yes. When you have 50+ services and need canary, circuit breaking, and distributed tracing.' },
            { c: 'var(--red)', n: '"Add it for observability"', d: 'No. Use Prometheus + distributed tracing first. Way simpler, solves the same problem.' },
          ].map(p => <PluginRow key={p.n} color={p.c} name={p.n} desc={p.d} />)}
        </div>
        <Alert type="info">DNS is boring. Boring is good. A service mesh is interesting and complex. Only reach for it when boring isn't enough.</Alert>
      </Accordion>

      <Accordion title="How a mesh relates to DNS — exact order of events" accent="#5a5a78">
        <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, marginBottom: 10 }}>
          A service mesh does not replace CoreDNS. It intercepts what happens <strong style={{color:"var(--text)"}}>after</strong> DNS resolves. Exact sequence:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {[
            { n: 1, c: "#4f8ef7", t: "App calls mongodb", d: "DNS resolves via CoreDNS to ClusterIP" },
            { n: 2, c: "#9b7ff4", t: "App attempts TCP connect to ClusterIP", d: "kube-proxy DNAT rewrites to real pod IP" },
            { n: 3, c: "#f59e0b", t: "Linkerd proxy intercepts TCP connection", d: "Sidecar intercepts before packet leaves pod" },
            { n: 4, c: "#2dd4bf", t: "Proxy applies policies", d: "mTLS, retries, circuit breaking, telemetry" },
            { n: 5, c: "#4ade80", t: "Packet leaves pod encrypted", d: "mTLS to destination sidecar. App never sees any of this." },
          ].map(s => (
            <div key={s.n} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", background: "var(--bg3)", borderRadius: 8 }}>
              <div style={{ width: 22, height: 22, minWidth: 22, borderRadius: "50%", background: s.c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{s.t}</div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
        <Alert type="info">Show <a href="https://youtu.be/cjhb7_uwzDk?t=263" target="_blank" rel="noreferrer" style={{color:"var(--blue)"}}>4:23-4:44 of this talk</a> at this point. Use the Presentation tab for full notes.</Alert>
      </Accordion>

      <Accordion title="NodeLocal DNSCache — corrected full chain" accent="#2dd4bf">
        <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, marginBottom: 12 }}>
          Confirmed by Claude Code running against a real cluster. NodeLocal DNSCache runs its own CoreDNS-format Corefile per node. The full chain:
        </p>
        <div style={{ background: "#0a0a0f", borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
          <pre style={{ fontSize: 12, color: "#a8b4d8", margin: 0 }}>{"pod → NodeLocal DNSCache (169.254.20.10)\n   → CoreDNS / kube-dns pods (on cache miss)\n   → upstream resolver (for external domains)"}</pre>
        </div>
        <ul style={{ paddingLeft: "1.2rem" }}>
          {[
            "169.254.20.10 is a link-local IP — only reachable on the local node",
            "NodeLocal DNSCache runs a full CoreDNS instance per node (not just a dumb cache)",
            "Uses TCP to talk upstream to CoreDNS — bypasses conntrack/netfilter entirely",
            "Cache hit = instant response, never leaves the node",
            "Cache miss = calls real CoreDNS pods via TCP, result cached for next time",
          ].map(t => <li key={t} style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, marginBottom: 4 }}>{t}</li>)}
        </ul>
      </Accordion>

      <Accordion title="Linkerd viz vs Istio/Kiali — honest comparison" accent="#9b7ff4">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--purple)", marginBottom: 8 }}>Linkerd viz</div>
            <ul style={{ paddingLeft: "1.2rem" }}>
              {["Topology graph with live success rates on edges","Golden metrics per service/namespace/route","tap: live request streaming, no sampling","linkerd viz edges shows proxy identities","Lightweight. Intentionally simple."].map(t => <li key={t} style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6, marginBottom: 3 }}>{t}</li>)}
            </ul>
          </div>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--blue)", marginBottom: 8 }}>Istio + Kiali</div>
            <ul style={{ paddingLeft: "1.2rem" }}>
              {["Richer interactive topology graph","Animated traffic flows in real time","Click services to drill into routes visually","Protocol-level filtering in UI","More operational complexity"].map(t => <li key={t} style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6, marginBottom: 3 }}>{t}</li>)}
            </ul>
          </div>
        </div>
        <Alert type="info">Linkerd's tap feature is its standout. Live request streaming without sampling — more useful than a pretty graph when actually debugging production.</Alert>
      </Accordion>
    </motion.div>
  );
}

/* ── WARS ── */
function WarSection() {
  const wars = [
    {
      cls: 'war-datadog', accent: '#9b7ff4',
      company: 'Datadog · KubeCon Barcelona 2019',
      title: '"It\'s ~~never~~ always DNS"',
      body: ['1000+ node cluster. Team enabled autopath to reduce DNS queries from 5 to 1 per lookup. In testing: great. In production at scale: autopath has no caching and requires pods verified mode, making CoreDNS watch all pods. This generated so many upstream queries that the upstream rate limit was reached. DNS timeouts cluster-wide.', 'Second war story from the same talk: CoreDNS showed IOPS spikes every 60 seconds. Traced to a CronJob calling AWS API → kubectl to update IPs → stuck kubelet termination that couldn\'t complete because the CronJob kept retrying. The IOPS spike was a symptom of a stuck process, not a DNS bug.'],
      lesson: 'Autopath is dangerous at scale. A periodic IOPS pattern in CoreDNS logs means look for a CronJob. The fix often isn\'t DNS config.',
      link: { href: 'https://www.youtube.com/watch?v=QKI-JRs2RIE', label: 'Watch the talk (YouTube)' },
    },
    {
      cls: 'war-preply', accent: '#f59e0b',
      company: 'Preply · Post-mortem 2020',
      title: 'CoreDNS autoscaler + stale conntrack = routing to dead pods',
      body: ['CoreDNS autoscaler scaled down from 3 to 2 replicas during low traffic. kube-proxy failed to delete the old conntrack entry for the removed pod. Traffic still routed to a pod that no longer existed. 5xx errors within 5 minutes.', 'Accidental fix: a routine deploy triggered new node creation which rewrote the conntrack table.'],
      lesson: 'Don\'t let an autoscaler treat CoreDNS like a normal workload. Use Cluster Proportional Autoscaler. Monitor conntrack entries.',
      link: { href: 'https://medium.com/preply-engineering/dns-postmortem-e169efd45afd', label: 'Read the post-mortem' },
    },
    {
      cls: 'war-openai', accent: '#f87171',
      company: 'OpenAI · December 11 2024 · Official post-mortem',
      title: 'Telemetry overwhelms control plane → DNS dies → everything breaks',
      metrics: [{ val: '4hr', lbl: 'outage' }, { val: '100%', lbl: 'services affected' }, { val: 'DNS', lbl: 'failure mode' }],
      body: ['A new telemetry service deployed to all clusters simultaneously caused every node to execute resource-intensive Kubernetes API operations. API servers overwhelmed. DNS caching masked the problem initially. Once caches expired, DNS resolution failed and all services went down.', 'Root architectural issue: CoreDNS was running on control plane nodes. When the control plane came under load, CoreDNS restarted but needed the API server to initialize — which was also down. A circular dependency.'],
      lesson: 'Run CoreDNS on worker nodes, not control plane nodes. DNS caching masks problems until they cascade.',
      link: { href: 'https://status.openai.com/incidents/ctrsv3lwd797', label: 'Official OpenAI post-mortem' },
    },
    {
      cls: 'war-anon', accent: '#2dd4bf',
      company: 'Anonymous large cluster · ~2024',
      title: 'Default 100m CPU limit throttles CoreDNS to 97% — payment service unreachable',
      metrics: [{ val: '312', lbl: 'pods' }, { val: '97%', lbl: 'CPU throttled' }, { val: '5s→2ms', lbl: 'latency after fix' }],
      body: ['CoreDNS at default settings for 18 months. Default CPU limit: 100m. At 312-pod scale, CoreDNS was throttled 97% of the time. All pods showed Running but DNS was timing out.', 'Fix: 200m request / 500m limit, ndots:2, Cluster Proportional Autoscaler, NodeLocal DNSCache.'],
      lesson: 'CoreDNS\'s default 100m CPU limit was sized for tiny clusters. Monitor it. Right-size it.',
    },
  ];

  return (
    <motion.div {...fade}>
      <div className="section-title">War stories</div>
      <div className="section-sub">Real companies, real post-mortems. DNS is always involved.</div>
      {wars.map((w, i) => (
        <Accordion key={i} title={`${w.company} — ${w.title}`} accent={w.accent}>
          {w.metrics && (
            <div className="war-metrics">
              {w.metrics.map(m => (
                <div className="war-metric" key={m.lbl}>
                  <span className="val">{m.val}</span>
                  <span className="lbl">{m.lbl}</span>
                </div>
              ))}
            </div>
          )}
          {w.body.map((b, j) => <p key={j} className="war-body">{b}</p>)}
          <div className="war-lesson">{w.lesson}</div>
          {w.link && <a className="war-link" href={w.link.href} target="_blank" rel="noreferrer">→ {w.link.label}</a>}
        </Accordion>
      ))}
    </motion.div>
  );
}

/* ── ROOT — sections rendered as components, not static JSX, so state persists ── */
export default function App() {
  const [active, setActive] = useState('trace');

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-inner">
          <div className="nav-logo">k8s <span>DNS</span></div>
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
        <div style={{ marginTop: 12 }}>
          {[['blue', 'DNS Chain'], ['purple', 'CoreDNS'], ['teal', 'Headless'], ['amber', 'NDOTS'], ['red', 'War Stories'], ['coral', 'Service Mesh']].map(([c, l]) => <Tag key={l} color={c}>{l}</Tag>)}
        </div>
      </div>

      <main className="main">
        <AnimatePresence mode="wait">
          <motion.div key={active} {...fade}>
            {active === 'trace' && <PacketTrace />}
            {active === 'chain' && <ChainSection />}
            {active === 'coredns' && <CoreDNSSection />}
            {active === 'headless' && <HeadlessSection />}
            {active === 'ndots' && <NdotsSection />}
            {active === 'debug' && <DebugSection />}
            {active === 'mesh' && <MeshSection />}
            {active === 'wars' && <WarSection />}
            {active === 'present' && <Presentation />}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="footer">
        Built for Advanced Study Session ·{' '}
        <a href="https://www.youtube.com/watch?v=QKI-JRs2RIE" target="_blank" rel="noreferrer">Datadog KubeCon 2019</a> ·{' '}
        <a href="https://status.openai.com/incidents/ctrsv3lwd797" target="_blank" rel="noreferrer">OpenAI Post-mortem 2024</a> ·{' '}
        <a href="https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/" target="_blank" rel="noreferrer">Kubernetes Docs</a>
      </footer>
    </div>
  );
}
