import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PACKETS = [
  {
    id: 'pablo',
    emoji: '📦',
    name: 'Pablo',
    tagline: 'The one who knew exactly who he wanted',
    color: '#2dd4bf',
    origin: 'app-service pod · namespace: default · IP: 10.0.1.10',
    destination: 'mongo-0 · headless StatefulSet · namespace: default',
    outcome: 'success',
    outcomeLabel: 'Direct connection established',
    intro: `My name is Pablo. I'm a TCP SYN packet, born inside the app-service container at 10.0.1.10.

My mission: reach mongo-0 specifically. Not mongo-1. Not mongo-2. mongo-0. 
The primary. The one who holds the replica set election.

Most packets are happy with "any healthy pod." Not me. I have standards.`,
    steps: [
      {
        icon: '📦',
        title: 'I leave the app container',
        technical: 'app-service calls connect("mongo-0.mongodb.default.svc.cluster.local", 27017)',
        narrative: `The developer wrote "mongo-0.mongodb.default.svc.cluster.local" in the connection string. Smart. They used the full FQDN — 4 dots, which with ndots:2 means I get queried directly. No search domain expansion nonsense for me.`,
        node: 'App Container',
        nodeColor: '#2dd4bf',
      },
      {
        icon: '📄',
        title: 'I check the phonebook',
        technical: '/etc/resolv.conf → nameserver 10.96.0.10 (CoreDNS)',
        narrative: `The kernel reads /etc/resolv.conf. It points to 10.96.0.10 — that's CoreDNS. The cluster's phonebook. I need an address before I can travel anywhere.`,
        node: '/etc/resolv.conf',
        nodeColor: '#9b7ff4',
      },
      {
        icon: '🧠',
        title: 'CoreDNS knows about headless services',
        technical: 'kubernetes plugin: headless service — returns pod IP directly, no ClusterIP',
        narrative: `CoreDNS checks its in-memory cache. "mongodb" — headless service (clusterIP: None). For headless services, I don't get a virtual ClusterIP. I get the actual pod IP. CoreDNS replies: mongo-0 lives at 10.0.1.5.

This is the magic of headless services. I get a direct address, not a load-balancer.`,
        node: 'CoreDNS',
        nodeColor: '#2dd4bf',
      },
      {
        icon: '🚫',
        title: 'kube-proxy stays out of my way',
        technical: 'No DNAT rule for 10.0.1.5 — it\'s a real pod IP, not a ClusterIP',
        narrative: `Normally kube-proxy intercepts packets heading to ClusterIPs and rewrites them. But 10.0.1.5 is a real pod IP — there's no iptables DNAT rule for it. kube-proxy has nothing to do with me. I travel direct.`,
        node: 'kube-proxy',
        nodeColor: '#5a5a78',
      },
      {
        icon: '🌐',
        title: 'The CNI routes me across nodes',
        technical: 'CNI plugin routes 10.0.1.5 → node-2 veth interface → mongo-0 pod',
        narrative: `mongo-0 is on a different node. The CNI plugin (Calico, Flannel, whatever's running) knows the route. It sends me across the node network to node-2, then into mongo-0's network namespace through its veth interface.`,
        node: 'CNI Plugin',
        nodeColor: '#fb923c',
      },
      {
        icon: '🎯',
        title: 'I arrive at mongo-0',
        technical: 'TCP SYN received at 10.0.1.5:27017 — connection accepted',
        narrative: `I made it. mongo-0 receives my SYN, responds with SYN-ACK, and the connection is established. The app can now talk directly to the primary replica. 

The replica set is healthy. The data is safe. My work here is done.`,
        node: 'mongo-0 Pod',
        nodeColor: '#4ade80',
      },
    ],
  },

  {
    id: 'nadia',
    emoji: '🌀',
    name: 'Nadia',
    tagline: 'The one who got lost in the wrong namespace',
    color: '#f59e0b',
    origin: 'payments pod · namespace: payments · IP: 10.0.2.20',
    destination: 'mongodb · namespace: default (but Nadia doesn\'t know that)',
    outcome: 'retry',
    outcomeLabel: 'Failed then succeeded with FQDN',
    intro: `My name is Nadia. I'm a DNS query packet, and I have to be honest with you — I started this journey confused.

The developer who created me wrote just "mongodb" in the connection string. Simple. Clean. Totally wrong namespace.

I'm from the payments namespace. mongodb lives in default. These are different worlds.

This is the story of how I failed, learned, and tried again.`,
    steps: [
      {
        icon: '🌀',
        title: 'I leave payments namespace, already wrong',
        technical: 'payments pod calls connect("mongodb", 27017) — short name, wrong namespace',
        narrative: `I'm born with a simple destination: "mongodb." The developer didn't use a full FQDN. They assumed the service was in the same namespace. It's not.

My /etc/resolv.conf shows: search payments.svc.cluster.local svc.cluster.local cluster.local. My search domains only include "payments." I have no idea "default" exists.`,
        node: 'payments Pod',
        nodeColor: '#f59e0b',
      },
      {
        icon: '🔍',
        title: 'First attempt: I try payments namespace',
        technical: 'DNS query: mongodb.payments.svc.cluster.local',
        narrative: `The resolver appends my first search domain: payments.svc.cluster.local. So I query "mongodb.payments.svc.cluster.local." 

CoreDNS checks. No Service named "mongodb" in the payments namespace.`,
        node: 'CoreDNS',
        nodeColor: '#f59e0b',
      },
      {
        icon: '❌',
        title: 'NXDOMAIN. First death.',
        technical: 'CoreDNS returns NXDOMAIN — no such service in payments namespace',
        narrative: `NXDOMAIN. Non-Existent Domain. CoreDNS is telling me: "I've never heard of mongodb in payments."

I don't give up. The resolver tries the next search domain.`,
        node: 'CoreDNS',
        nodeColor: '#f87171',
      },
      {
        icon: '❌',
        title: 'NXDOMAIN again. Second death.',
        technical: 'DNS query: mongodb.svc.cluster.local → NXDOMAIN',
        narrative: `"mongodb.svc.cluster.local" — also nothing. 

The resolver tries "mongodb.cluster.local." Also nothing.

Then just "mongodb" bare. Also nothing.

I am thoroughly lost. The app gets a connection error. The developer is confused. Logs show nothing useful. It's a bad day.`,
        node: 'CoreDNS',
        nodeColor: '#f87171',
      },
      {
        icon: '💡',
        title: 'The developer fixes the connection string',
        technical: 'Connection string updated: mongodb.default.svc.cluster.local',
        narrative: `Someone checks the namespace. "Oh. mongodb is in default, not payments." They update the connection string to use the full FQDN: mongodb.default.svc.cluster.local.

A new packet is born — let's call her Nadia 2.0. She has the right address this time.`,
        node: 'Developer',
        nodeColor: '#9b7ff4',
      },
      {
        icon: '✅',
        title: 'Nadia 2.0 queries with FQDN',
        technical: 'DNS query: mongodb.default.svc.cluster.local → ClusterIP 10.96.0.2',
        narrative: `The FQDN has 4 dots. With ndots:2 it goes straight to CoreDNS without search domain expansion. CoreDNS finds "mongodb" in the "default" namespace immediately. Returns ClusterIP 10.96.0.2.

kube-proxy rewrites to a real pod IP. Connection established.

Lesson learned: always use FQDNs for cross-namespace service calls.`,
        node: 'mongo Pod',
        nodeColor: '#4ade80',
      },
    ],
  },

  {
    id: 'carlos',
    emoji: '🌍',
    name: 'Carlos',
    tagline: 'The one who left the cluster entirely',
    color: '#fb923c',
    origin: 'api-gateway pod · namespace: default · IP: 10.0.1.30',
    destination: 'api.stripe.com (external payment API)',
    outcome: 'success',
    outcomeLabel: 'Exited cluster, reached external API',
    intro: `My name is Carlos. I'm headed somewhere no cluster-internal packet usually goes: the internet.

The api-gateway needs to call Stripe's payment API. That means leaving the cluster entirely — past CoreDNS, past the node, past the cloud VPC, out into the real world.

Most packets in this cluster never see the internet. I'm one of the few.`,
    steps: [
      {
        icon: '🌍',
        title: 'Born with an external destination',
        technical: 'api-gateway calls connect("api.stripe.com", 443)',
        narrative: `The app calls api.stripe.com. The kernel reads /etc/resolv.conf. CoreDNS is still the first resolver — even for external domains. Every DNS query starts here.

With default ndots:5 — "api.stripe.com" has 2 dots, less than 5, so the resolver tries search domains first. This is wasteful. With ndots:2, it would go direct.`,
        node: 'api-gateway Pod',
        nodeColor: '#fb923c',
      },
      {
        icon: '🔍',
        title: 'CoreDNS: not my zone',
        technical: 'Query: api.stripe.com.default.svc.cluster.local → NXDOMAIN (wasteful with ndots:5)',
        narrative: `With ndots:5, the resolver first tries "api.stripe.com.default.svc.cluster.local." CoreDNS kubernetes plugin checks — obviously not a cluster service. NXDOMAIN.

After exhausting search domains, it finally queries "api.stripe.com" directly. CoreDNS checks: does anyone handle "stripe.com"? No internal zone matches. Falls through to the forward plugin.`,
        node: 'CoreDNS',
        nodeColor: '#fb923c',
      },
      {
        icon: '🌐',
        title: 'Forward plugin: out you go',
        technical: 'CoreDNS forward plugin → node /etc/resolv.conf → cloud DNS 169.254.169.253',
        narrative: `The forward plugin reads the node's /etc/resolv.conf. On AWS, that's 169.254.169.253 — the VPC DNS resolver. On GCP it's 169.254.169.254. The query leaves CoreDNS and goes to the cloud's DNS infrastructure.`,
        node: 'CoreDNS forward',
        nodeColor: '#9b7ff4',
      },
      {
        icon: '📡',
        title: 'Real DNS resolution',
        technical: 'Cloud DNS → authoritative nameservers for stripe.com → 54.187.x.x',
        narrative: `The cloud DNS resolver queries the real internet. Stripe's authoritative nameservers respond. I get a real IP: 54.187.x.x. CoreDNS caches it (TTL from Stripe's DNS record — typically 300s). Returns it to the pod.`,
        node: 'Cloud DNS',
        nodeColor: '#2dd4bf',
      },
      {
        icon: '🚪',
        title: 'I leave the node',
        technical: 'Packet → node eth0 → VPC routing → internet gateway → Stripe',
        narrative: `Unlike cluster-internal traffic, there's no kube-proxy DNAT rule for 54.187.x.x. I route normally through the node's default gateway, through the VPC, through the internet gateway (NAT if needed), and out to Stripe's servers.

No mesh proxy intercepts me unless the cluster has an egress gateway configured.`,
        node: 'Node eth0',
        nodeColor: '#fb923c',
      },
      {
        icon: '💳',
        title: 'I reach Stripe',
        technical: 'TLS handshake with api.stripe.com:443 — payment API call succeeds',
        narrative: `TLS handshake. Certificate verified. Payment API call made. Response returns the same path in reverse.

I'm one of the few packets in this cluster who got to see the real internet. The others will never know what they're missing.`,
        node: 'api.stripe.com',
        nodeColor: '#4ade80',
      },
    ],
  },

  {
    id: 'reina',
    emoji: '⏳',
    name: 'Reina',
    tagline: 'The one who arrived nowhere',
    color: '#f87171',
    origin: 'frontend pod · namespace: default · IP: 10.0.1.40',
    destination: 'backend service · but all pods are dead',
    outcome: 'failure',
    outcomeLabel: 'Connection refused — empty endpoints',
    intro: `My name is Reina. Mine is a tragedy.

I was created during a rolling deployment that went wrong. The backend service exists. CoreDNS knows about it. kube-proxy has rules for it.

But the pods behind it? All terminated. The Endpoints object is empty.

I am going to travel the entire DNS chain correctly, reach the destination perfectly, and then — nothing. Connection refused. Timeout.

I am the packet that does everything right and still fails.`,
    steps: [
      {
        icon: '⏳',
        title: 'Born during a bad deployment',
        technical: 'frontend calls connect("backend.default.svc.cluster.local", 8080)',
        narrative: `A rolling deployment just finished. New backend pods failed their health checks and terminated. The old ones were already gone. The Endpoints object is empty — it has no healthy pod IPs.

Nobody told me this. I set off with confidence.`,
        node: 'frontend Pod',
        nodeColor: '#f87171',
      },
      {
        icon: '🧠',
        title: 'CoreDNS answers correctly',
        technical: 'DNS query: backend.default.svc.cluster.local → ClusterIP 10.96.0.5',
        narrative: `CoreDNS finds the "backend" Service in default namespace. Returns ClusterIP 10.96.0.5. 

CoreDNS has no idea that the pods behind the Service are all dead. It only knows about the Service object, not the health of individual pods. That's not its job.

Everything looks fine from DNS's perspective.`,
        node: 'CoreDNS',
        nodeColor: '#9b7ff4',
      },
      {
        icon: '🔀',
        title: 'kube-proxy: I have rules, but no targets',
        technical: 'KUBE-SVC-BACKEND chain exists, but KUBE-SEP-* entries are empty',
        narrative: `I arrive at 10.96.0.5. kube-proxy's iptables rules intercept me. The KUBE-SVC-BACKEND chain exists — the Service is real.

But the KUBE-SEP-* entries (the actual endpoint pods) are all gone. kube-proxy has nothing to rewrite my destination to.

Different versions of kube-proxy handle this differently — some drop me, some return RST, some let me timeout.`,
        node: 'kube-proxy',
        nodeColor: '#f87171',
      },
      {
        icon: '💀',
        title: 'Connection refused',
        technical: 'TCP RST or timeout — no healthy endpoints in EndpointSlice',
        narrative: `The connection fails. I never reach a pod. The app gets "connection refused" or a timeout depending on how kube-proxy handles empty endpoint lists.

The developer runs kubectl get endpoints backend and sees: <none>. That's the clue. Not a DNS problem. Not a network problem. A deployment problem.`,
        node: 'Nowhere',
        nodeColor: '#f87171',
      },
      {
        icon: '🔧',
        title: 'The investigation',
        technical: 'kubectl get endpoints backend → <none>. kubectl get pods -l app=backend → all CrashLoopBackOff',
        narrative: `The on-call engineer runs the debugging toolkit:

kubectl get endpoints backend -n default
→ No resources found (endpoints are empty)

kubectl get pods -l app=backend
→ backend-7d9f8: CrashLoopBackOff

Now they know. It's not DNS. The pods are crashing. That's why I failed.`,
        node: 'kubectl',
        nodeColor: '#2dd4bf',
      },
      {
        icon: '✅',
        title: 'After the fix: a new packet succeeds',
        technical: 'Pods recover → EndpointSlice updated → kube-proxy adds SEP entries → next packet succeeds',
        narrative: `The deployment is rolled back. New pods start, pass health checks, get added to the EndpointSlice. kube-proxy writes new KUBE-SEP-* rules within seconds.

The next packet — let's call her Reina 2.0 — travels the exact same path I did. But this time kube-proxy has a target. She connects.

I was not a DNS problem. I was a deployment problem. Remember me.`,
        node: 'backend Pod',
        nodeColor: '#4ade80',
      },
    ],
  },

  {
    id: 'maya',
    emoji: '🔒',
    name: 'Maya',
    tagline: 'The one who travelled through the mesh',
    color: '#9b7ff4',
    origin: 'checkout pod · Linkerd injected · namespace: default',
    destination: 'payment-service pod · also Linkerd injected',
    outcome: 'success',
    outcomeLabel: 'mTLS connection — encrypted and authenticated',
    intro: `My name is Maya. I travel in a cluster with Linkerd installed.

What makes my journey different from every other packet in this guide: I never travel alone. My pod has a sidecar proxy. The destination pod has one too. We don't just connect — we negotiate identity, encrypt everything, and if the first attempt fails, the proxy retries on my behalf.

I am what zero-trust networking looks like from the inside.`,
    steps: [
      {
        icon: '🔒',
        title: 'Born in a meshed pod',
        technical: 'checkout pod has linkerd-proxy sidecar injected (annotation: linkerd.io/inject: enabled)',
        narrative: `The checkout pod has two containers: the app, and the Linkerd proxy sidecar. The proxy was injected automatically when the pod was created.

iptables rules inside the pod redirect ALL outbound traffic through the proxy on port 4140. I don't get to leave the pod directly. The proxy handles me first.`,
        node: 'checkout Pod',
        nodeColor: '#9b7ff4',
      },
      {
        icon: '🧠',
        title: 'DNS still resolves normally',
        technical: 'DNS query: payment-service.default.svc.cluster.local → ClusterIP 10.96.0.8',
        narrative: `DNS still works the same way. CoreDNS resolves "payment-service" to ClusterIP 10.96.0.8. The mesh doesn't change service discovery. It changes what happens after discovery.

The app gets the ClusterIP and tries to connect to port 8080.`,
        node: 'CoreDNS',
        nodeColor: '#2dd4bf',
      },
      {
        icon: '🔀',
        title: 'Proxy intercepts me',
        technical: 'iptables redirect: outbound port 8080 → Linkerd proxy port 4140',
        narrative: `Before I leave the pod, iptables intercepts me and redirects me to the Linkerd proxy at 127.0.0.1:4140. The app doesn't know this happened. It thinks it's talking directly to 10.96.0.8.

The proxy looks at my destination and decides how to handle me.`,
        node: 'Linkerd Proxy',
        nodeColor: '#9b7ff4',
      },
      {
        icon: '🔑',
        title: 'mTLS negotiation',
        technical: 'Proxy presents TLS cert (issued by Linkerd identity CA, 24hr TTL) → destination proxy verifies',
        narrative: `The Linkerd proxy initiates a TLS connection to the destination proxy — not the destination app. It presents a certificate signed by the Linkerd identity CA. The destination proxy verifies it.

Both sides prove who they are. Neither can be impersonated. This is mutual TLS — mTLS.

The certificate is valid for 24 hours and was auto-rotated. The developer did nothing to set this up.`,
        node: 'mTLS Handshake',
        nodeColor: '#9b7ff4',
      },
      {
        icon: '📊',
        title: 'Telemetry recorded',
        technical: 'Proxy records: latency, status code, retry count → Prometheus metrics',
        narrative: `As I travel, the proxy records everything: which service called which, how long it took, whether it succeeded, how many retries. This data flows to Prometheus.

The engineering team can now run "linkerd viz stat deploy/payment-service" and see my success rate, p99 latency, and request volume. In real time. Without touching the app code.`,
        node: 'Prometheus',
        nodeColor: '#f59e0b',
      },
      {
        icon: '🎯',
        title: 'I arrive — encrypted',
        technical: 'Destination proxy decrypts → forwards to payment-service container on localhost',
        narrative: `I arrive at the destination Linkerd proxy, encrypted. The proxy decrypts me and forwards me to the payment-service container on localhost. The app receives a normal HTTP request and never knew I was encrypted.

The mesh was invisible to both apps. Security, observability, and reliability — all added without a single line of application code.

This is what "zero-trust" means in practice.`,
        node: 'payment-service',
        nodeColor: '#4ade80',
      },
    ],
  },
];

function OutcomeBadge({ outcome, label }) {
  const styles = {
    success: { bg: 'var(--green-bg)', color: 'var(--green)', border: 'rgba(74,222,128,0.3)' },
    failure: { bg: 'var(--red-bg)', color: 'var(--red)', border: 'rgba(248,113,113,0.3)' },
    retry: { bg: 'var(--amber-bg)', color: 'var(--amber)', border: 'rgba(245,158,11,0.3)' },
  };
  const s = styles[outcome];
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>{label}</span>
  );
}

export default function PacketStories() {
  const [selected, setSelected] = useState('pablo');
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2000);
  const intervalRef = useRef(null);
  const packet = PACKETS.find(p => p.id === selected);

  useEffect(() => { setStep(-1); setPlaying(false); }, [selected]);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setStep(prev => {
          if (prev >= packet.steps.length - 1) { setPlaying(false); return prev; }
          return prev + 1;
        });
      }, speed);
    }
    return () => clearInterval(intervalRef.current);
  }, [playing, speed, packet.steps.length]);

  const play = () => { if (step >= packet.steps.length - 1) setStep(-1); setPlaying(true); };
  const pause = () => setPlaying(false);
  const reset = () => { setStep(-1); setPlaying(false); };

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Packet stories</div>
      <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>
        Five packets. Five journeys. Each one a different failure mode, success path, or lesson about Kubernetes networking.
      </div>

      {/* Packet selector */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        {PACKETS.map(p => (
          <button key={p.id} onClick={() => setSelected(p.id)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
            padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
            background: selected === p.id ? p.color + '22' : 'var(--bg2)',
            border: `1px solid ${selected === p.id ? p.color + '66' : 'var(--border)'}`,
            transition: 'all .15s', minWidth: 140,
          }}>
            <span style={{ fontSize: 22, marginBottom: 4 }}>{p.emoji}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: selected === p.id ? '#fff' : 'var(--text)' }}>{p.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4, marginTop: 2 }}>{p.tagline}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={packet.id}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>

          {/* Packet header */}
          <div style={{
            background: packet.color + '18', border: `1px solid ${packet.color}44`,
            borderRadius: 14, padding: '1.5rem', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 32 }}>{packet.emoji}</span>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{packet.name}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>{packet.tagline}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: packet.color, textTransform: 'uppercase', letterSpacing: '.06em' }}>From</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{packet.origin}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: packet.color, textTransform: 'uppercase', letterSpacing: '.06em' }}>To</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{packet.destination}</div>
                  </div>
                </div>
              </div>
              <OutcomeBadge outcome={packet.outcome} label={packet.outcomeLabel} />
            </div>
          </div>

          {/* Intro */}
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '1.25rem', marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              {packet.emoji} {packet.name}'s intro
            </div>
            {packet.intro.split('\n\n').map((para, i) => (
              <p key={i} style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8, marginBottom: 10, fontStyle: i === 0 ? 'italic' : 'normal' }}>{para}</p>
            ))}
          </div>

          {/* Journey controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <button onClick={reset} style={btn('var(--text3)')}>↺ Reset</button>
            <button onClick={() => setStep(s => Math.max(-1, s - 1))} disabled={step <= -1} style={btn('var(--text2)')}>← Back</button>
            {playing
              ? <button onClick={pause} style={btn('var(--amber)')}>⏸ Pause</button>
              : <button onClick={play} style={btn(packet.color, true)}>▶ Play {packet.name}'s journey</button>}
            <button onClick={() => setStep(s => Math.min(packet.steps.length - 1, s + 1))} disabled={step >= packet.steps.length - 1} style={btn('var(--text2)')}>Next →</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Speed</span>
              <input type="range" min={600} max={3000} step={200} value={speed}
                onChange={e => setSpeed(Number(e.target.value))} style={{ width: 70 }} />
              <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 16 }}>{speed > 2000 ? '🐢' : speed > 1200 ? '🚶' : '🚀'}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
            <motion.div animate={{ width: `${((step + 1) / packet.steps.length) * 100}%` }}
              style={{ height: '100%', background: packet.color, borderRadius: 2 }}
              transition={{ duration: 0.3 }} />
          </div>

          {/* Journey steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {packet.steps.map((s, i) => {
              const state = i < step ? 'done' : i === step ? 'active' : 'pending';
              const isError = s.node === 'Nowhere' || s.title.includes('NXDOMAIN') || s.title.includes('death') || s.title.includes('refused');
              return (
                <motion.div key={i} onClick={() => setStep(i)}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: state === 'pending' ? 0.4 : 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    background: state === 'active'
                      ? (isError ? 'var(--red-bg)' : packet.color + '18')
                      : 'var(--bg2)',
                    border: `1px solid ${state === 'active'
                      ? (isError ? 'rgba(248,113,113,0.4)' : packet.color + '55')
                      : 'var(--border)'}`,
                    transition: 'background .15s, border-color .15s',
                  }}>
                  <span style={{ fontSize: 18, minWidth: 24 }}>{s.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: state === 'active' ? (isError ? 'var(--red)' : '#fff') : 'var(--text)',
                      }}>{s.title}</span>
                      {state === 'done' && <span style={{ fontSize: 10, color: 'var(--green)' }}>✓</span>}
                      {state === 'active' && (
                        <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 0.9 }}
                          style={{ fontSize: 10, color: isError ? 'var(--red)' : packet.color }}>●</motion.span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {s.node} {state === 'done' ? '→ done' : ''}
                    </div>

                    {/* Expanded detail */}
                    <AnimatePresence initial={false}>
                      {state === 'active' && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                          style={{ overflow: 'hidden' }}>
                          <div style={{
                            marginTop: 10, paddingTop: 10,
                            borderTop: `1px solid ${isError ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.08)'}`,
                          }}>
                            {/* Technical line */}
                            <div style={{
                              fontFamily: 'monospace', fontSize: 11,
                              color: isError ? 'var(--red)' : packet.color,
                              background: '#0a0a0f', padding: '6px 10px',
                              borderRadius: 6, marginBottom: 10,
                            }}>{s.technical}</div>
                            {/* Narrative */}
                            {s.narrative.split('\n\n').map((para, pi) => (
                              <p key={pi} style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 8 }}>{para}</p>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Journey summary when complete */}
          <AnimatePresence>
            {step === packet.steps.length - 1 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{
                  background: packet.outcome === 'failure' ? 'var(--red-bg)' : 'var(--green-bg)',
                  border: `1px solid ${packet.outcome === 'failure' ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`,
                  borderRadius: 12, padding: '1.25rem',
                }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: packet.outcome === 'failure' ? 'var(--red)' : 'var(--green)', marginBottom: 6 }}>
                  {packet.outcome === 'failure' ? '💀 Journey complete — but failed' : `✅ ${packet.name}'s journey complete`}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
                  <OutcomeBadge outcome={packet.outcome} label={packet.outcomeLabel} />
                </p>
              </motion.div>
            )}
          </AnimatePresence>

        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function btn(color, primary) {
  return {
    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    border: `1px solid ${primary ? color : 'var(--border)'}`,
    background: primary ? color : 'transparent',
    color: primary ? '#fff' : color, cursor: 'pointer',
  };
}
