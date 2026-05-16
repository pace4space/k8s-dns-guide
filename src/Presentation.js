import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SLIDES = [
  {
    id: 'hook',
    label: '🎤 Opening hook',
    title: '"It\'s ~~never~~ always DNS."',
    subtitle: 'Datadog · KubeCon Barcelona 2019 · Laurent Bernaille & Robert Boll',
    body: 'Show this slide. Say nothing for 3 seconds. Let it land.',
    tip: 'The strikethrough is the joke. The audience laughs. Then you say: "They run 1000-node clusters. They know." Now you have the room.',
    color: '#9b7ff4',
    youtubeUrl: null,
    imgNote: 'Use the screenshot you saved from https://www.youtube.com/watch?v=QKI-JRs2RIE',
  },
  {
    id: 'problem',
    label: '⚠️ The problem',
    title: 'Pods are ephemeral. IPs change. Names don\'t.',
    subtitle: 'The entire motivation for service discovery',
    body: 'Every pod restart = new IP. If Service A hardcodes the IP of Service B, it breaks. Silently. In production. On a Friday.',
    tip: 'Draw on the whiteboard: Pod A (IP 10.0.1.5) → crashes → Pod A (IP 10.0.2.3). Ask: "Who here has seen this happen?" Hands go up.',
    color: '#f87171',
    diagram: [
      { label: 'Pod B (10.0.1.5)', sub: 'running' },
      { label: '→ crashes / reschedules', sub: '' },
      { label: 'Pod B (10.0.2.3)', sub: 'new IP, old hardcode breaks' },
    ],
  },
  {
    id: 'chain',
    label: '🔗 Resolution chain',
    title: 'App → CoreDNS → ClusterIP → kube-proxy → Pod',
    subtitle: 'The full DNS resolution chain',
    body: 'Every service call in Kubernetes travels this path. DNS resolves the name to a virtual IP. kube-proxy rewrites it to a real pod IP. The app never knows.',
    tip: 'Walk through each step slowly. Ask after step 3: "Why is the ClusterIP virtual?" — pause for answers.',
    color: '#4f8ef7',
    chain: [
      { n: 1, c: '#4f8ef7', t: 'App calls "mongodb"', d: '/etc/resolv.conf → CoreDNS at 10.96.0.10' },
      { n: 2, c: '#9b7ff4', t: 'CoreDNS returns ClusterIP 10.96.0.2', d: 'Virtual IP — not on any real interface' },
      { n: 3, c: '#f59e0b', t: 'kube-proxy DNAT rewrite', d: '10.96.0.2 → 10.0.1.5 (real pod)' },
      { n: 4, c: '#4ade80', t: 'CNI delivers packet', d: 'App is connected' },
    ],
  },
  {
    id: 'coredns',
    label: '🧠 CoreDNS',
    title: 'CoreDNS: the cluster\'s phonebook',
    subtitle: 'Plugin chain, in-memory cache, Kubernetes API informer',
    body: 'CoreDNS runs as a Deployment in kube-system. Every pod\'s resolv.conf points to it. It watches the Kubernetes API via informer and serves DNS from an in-memory cache.',
    tip: 'Live demo: kubectl exec into a pod and show /etc/resolv.conf. Most people have never seen it. It makes the magic concrete.',
    color: '#2dd4bf',
    code: `# Inside any pod:
cat /etc/resolv.conf

nameserver 10.96.0.10        ← CoreDNS
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5`,
  },
  {
    id: 'headless',
    label: '🎯 Headless services',
    title: 'Regular service vs headless service',
    subtitle: 'The interesting bit — when identity matters more than load balancing',
    body: 'Regular service returns a ClusterIP — any healthy pod. Headless service returns direct pod IPs — stable identities. StatefulSets (MongoDB, Cassandra, etcd) need headless.',
    tip: 'Draw two columns. Left: "Give me any pod." Right: "Give me THIS pod." That\'s the entire distinction.',
    color: '#fb923c',
    compare: [
      { title: 'Regular', sub: 'clusterIP: 10.96.0.2', items: ['Returns virtual ClusterIP', 'kube-proxy load-balances', 'Any healthy pod', 'Stateless apps'], color: '#4f8ef7' },
      { title: 'Headless', sub: 'clusterIP: None', items: ['Returns direct pod IPs', 'No kube-proxy', 'Specific pod by name', 'StatefulSets'], color: '#2dd4bf' },
    ],
  },
  {
    id: 'ndots',
    label: '⏱️ NDOTS war story',
    title: 'The 5-second latency bug',
    subtitle: 'NDOTS=5 + conntrack race condition = intermittent 5s DNS timeouts',
    body: '"mongodb" has 0 dots. With ndots:5 (default), the resolver tries 5 search domain suffixes sequentially. If those queries overlap on the same UDP socket, the Linux conntrack table stalls. 5-second timeout.',
    tip: 'This is your signature moment. Say: "This took us 2 weeks to track down. Intermittent. Only under load. Here\'s how we found it."',
    color: '#f59e0b',
    fix: `dnsConfig:
  options:
  - name: ndots
    value: "2"        ← 80% fewer queries
  - name: single-request
    value: ""         ← no conntrack collision`,
    queries: [
      { q: 'mongodb.default.svc.cluster.local', r: 'slow', l: 'try 1 — may collide' },
      { q: 'mongodb.svc.cluster.local', r: 'fail', l: 'NXDOMAIN' },
      { q: 'mongodb.cluster.local', r: 'fail', l: 'NXDOMAIN' },
      { q: 'mongodb (bare)', r: 'fail', l: 'NXDOMAIN' },
    ],
  },
  {
    id: 'mesh',
    label: '🕸️ Service mesh',
    title: 'DNS solves WHERE. Mesh solves HOW.',
    subtitle: 'Show clip at 4:23 → https://youtu.be/cjhb7_uwzDk?t=263',
    youtubeUrl: 'https://youtu.be/cjhb7_uwzDk?t=263',
    body: 'DNS is discovery. A service mesh is everything that happens after discovery: encryption (mTLS), retries, circuit breaking, traffic splitting, observability. Linkerd\'s proxy intercepts the TCP connection after DNS resolves it.',
    tip: 'PLAY THE CLIP (4:23–4:44). Let the Connect/Secure/Monitor reveal get a laugh. Then explain each pillar takes 30 seconds.',
    color: '#9b7ff4',
    pillars: [
      { icon: '🔌', name: 'Connect', items: ['Latency-aware LB', 'Traffic shifting (canary)', 'Retries', 'Circuit breaking'] },
      { icon: '🔒', name: 'Secure', items: ['mTLS everywhere', 'Zero-trust', 'Auto cert rotation', 'Policy enforcement'] },
      { icon: '📊', name: 'Monitor', items: ['Request tracing', 'Error rates per route', 'Fault injection', 'Live tap (Linkerd)'] },
    ],
  },
  {
    id: 'nodelocalcache',
    label: '⚡ NodeLocal DNSCache',
    title: 'NodeLocal DNSCache — the architectural fix',
    subtitle: 'Per-node DNS cache via DaemonSet at 169.254.20.10',
    body: 'Runs a full CoreDNS instance on every node. Pods talk to their local cache instead of CoreDNS over the network. Uses TCP upstream — bypasses conntrack entirely. Eliminates the race condition at the architecture level.',
    tip: 'This is the "Level Up" moment. Most candidates know ndots:2. Few know NodeLocal DNSCache. Say: "ndots:2 is the quick fix. NodeLocal DNSCache is the right fix."',
    color: '#2dd4bf',
    chain: [
      { n: 1, c: '#4f8ef7', t: 'Pod queries 169.254.20.10', d: 'Link-local IP — local node cache only' },
      { n: 2, c: '#2dd4bf', t: 'NodeLocal DNSCache (DaemonSet)', d: 'Full CoreDNS per node. Cache hit → instant response.' },
      { n: 3, c: '#9b7ff4', t: 'Cache miss → CoreDNS pods via TCP', d: 'TCP bypasses conntrack — no race condition' },
      { n: 4, c: '#fb923c', t: 'CoreDNS → upstream if external', d: 'Normal forward path for google.com etc.' },
    ],
  },
  {
    id: 'debug',
    label: '🔧 Live debug demo',
    title: 'The debugging toolkit',
    subtitle: 'Commands to run live during Q&A',
    body: 'If someone asks "how would you debug this?" — this is your answer. Not theory. Actual commands. Run them live if you have a cluster.',
    tip: 'Have these commands ready to paste into a terminal. Nothing impresses more than typing a command and seeing the cluster respond.',
    color: '#4ade80',
    code: `# Step 1: debug pod
kubectl run debug -it --rm --image=nicolaka/netshoot -- sh

# Step 2: test DNS (inside pod)
nslookup mongodb
time nslookup mongodb          ← watch for 5s = NDOTS bug
cat /etc/resolv.conf           ← show the magic

# Step 3: check service + endpoints
kubectl get svc mongodb -n default
kubectl get endpoints mongodb -n default   ← empty = selector mismatch

# Step 4: CoreDNS logs
kubectl logs -n kube-system -l k8s-app=kube-dns -f`,
  },
  {
    id: 'openai',
    label: '🔥 OpenAI post-mortem',
    title: 'OpenAI outage — December 11, 2024',
    subtitle: '4 hours down. Root cause: DNS. official: status.openai.com/incidents/ctrsv3lwd797',
    body: 'New telemetry service deployed fleet-wide. Every node hammered the Kubernetes API simultaneously. API servers overwhelmed. CoreDNS restarted — but needed the API to restart. Circular dependency. DNS cached long enough to mask the problem. Then everything went down at once.',
    tip: 'This is your "it\'s always DNS" closer. Real company. Public post-mortem. $X billion product. Down for 4 hours. Because of DNS placement.',
    color: '#f87171',
    metrics: [
      { val: '4hr', lbl: 'outage duration' },
      { val: '100%', lbl: 'services affected' },
      { val: 'DNS', lbl: 'failure propagation' },
      { val: '✓', lbl: 'public post-mortem' },
    ],
    lesson: 'Run CoreDNS on worker nodes, not control plane nodes. DNS caching masks problems until they cascade. DNS is the nervous system of the cluster.',
    link: 'https://status.openai.com/incidents/ctrsv3lwd797',
  },
];

function Code({ children }) {
  return (
    <div style={{
      background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '12px 16px', margin: '12px 0', overflowX: 'auto',
    }}>
      <pre style={{ fontSize: 12, color: '#a8b4d8', lineHeight: 1.7, margin: 0 }}>{children}</pre>
    </div>
  );
}

function SlideCard({ slide, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderRadius: 10, width: '100%',
      background: active ? slide.color + '22' : 'transparent',
      border: `1px solid ${active ? slide.color + '66' : 'rgba(255,255,255,0.06)'}`,
      cursor: 'pointer', textAlign: 'left', marginBottom: 6,
      transition: 'all .15s',
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: slide.color, minWidth: 6 }} />
      <span style={{ fontSize: 13, color: active ? '#fff' : 'var(--text2)', fontWeight: active ? 600 : 400 }}>
        {slide.label}
      </span>
    </button>
  );
}

function SlideContent({ slide }) {
  return (
    <motion.div
      key={slide.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      style={{ height: '100%' }}
    >
      {/* Header */}
      <div style={{
        background: slide.color + '18',
        border: `1px solid ${slide.color}44`,
        borderRadius: 14, padding: '1.5rem',
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: slide.color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
          Presentation slide
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 8 }}>
          {slide.title}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{slide.subtitle}</div>
        {slide.youtubeUrl && (
          <a href={slide.youtubeUrl} target="_blank" rel="noreferrer" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 10, fontSize: 12, color: slide.color,
            textDecoration: 'none', fontWeight: 600,
          }}>
            ▶ Open clip ({slide.youtubeUrl.includes('t=263') ? '4:23–4:44' : ''})
          </a>
        )}
      </div>

      {/* Body */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '1.25rem', marginBottom: 12,
      }}>
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7 }}>{slide.body}</p>
      </div>

      {/* Presenter tip */}
      <div style={{
        background: 'rgba(79,142,247,0.08)',
        border: '1px solid rgba(79,142,247,0.25)',
        borderLeft: '3px solid #4f8ef7',
        borderRadius: '0 10px 10px 0',
        padding: '10px 14px', marginBottom: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#4f8ef7', marginBottom: 4 }}>🎙 PRESENTER TIP</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{slide.tip}</p>
      </div>

      {/* Diagram / Chain */}
      {slide.diagram && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', marginBottom: 12 }}>
          {slide.diagram.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < slide.diagram.length - 1 ? 8 : 0 }}>
              <div style={{
                background: i === 2 ? 'var(--red-bg)' : 'var(--bg3)',
                border: `1px solid ${i === 2 ? 'rgba(248,113,113,0.3)' : 'var(--border)'}`,
                borderRadius: 8, padding: '6px 14px', fontSize: 13,
                color: i === 2 ? 'var(--red)' : 'var(--text)',
                fontWeight: i === 2 ? 600 : 400,
              }}>{d.label}</div>
              {d.sub && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{d.sub}</span>}
            </div>
          ))}
        </div>
      )}

      {slide.chain && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', marginBottom: 12 }}>
          {slide.chain.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: i < slide.chain.length - 1 ? 12 : 0 }}>
              <div style={{
                width: 26, height: 26, minWidth: 26, borderRadius: '50%',
                background: s.c, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff',
              }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.t}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {slide.code && <Code>{slide.code}</Code>}
      {slide.fix && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', marginBottom: 8 }}>THE FIX</div>
          <Code>{slide.fix}</Code>
        </div>
      )}

      {slide.queries && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)', marginBottom: 10 }}>What "mongodb" actually triggers (ndots:5)</div>
          {slide.queries.map((q, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5 }}>
              <div style={{
                fontFamily: 'monospace', fontSize: 11, color: 'var(--text)',
                background: 'var(--bg3)', padding: '4px 10px', borderRadius: 6, flex: 1,
              }}>{q.q}</div>
              <div style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10,
                background: q.r === 'slow' ? 'var(--amber-bg)' : 'var(--red-bg)',
                color: q.r === 'slow' ? 'var(--amber)' : 'var(--red)',
              }}>{q.l}</div>
            </div>
          ))}
        </div>
      )}

      {slide.compare && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          {slide.compare.map(c => (
            <div key={c.title} style={{
              background: 'var(--bg2)',
              border: `1px solid ${c.color}44`,
              borderRadius: 12, padding: '1.25rem',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.color, marginBottom: 2 }}>{c.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>{c.sub}</div>
              {c.items.map(item => (
                <div key={item} style={{ fontSize: 12, color: 'var(--text2)', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {slide.pillars && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 12 }}>
          {slide.pillars.map(p => (
            <div key={p.name} style={{
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '1.25rem',
            }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{p.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{p.name}</div>
              {p.items.map(item => (
                <div key={item} style={{ fontSize: 12, color: 'var(--text2)', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {slide.metrics && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
          {slide.metrics.map(m => (
            <div key={m.lbl}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{m.val}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.lbl}</div>
            </div>
          ))}
        </div>
      )}

      {slide.lesson && (
        <div style={{
          borderLeft: `3px solid ${slide.color}`,
          background: slide.color + '15',
          borderRadius: '0 10px 10px 0',
          padding: '10px 14px', marginBottom: 12,
          fontSize: 13, color: 'var(--text)', fontWeight: 500,
        }}>{slide.lesson}</div>
      )}

      {slide.link && (
        <a href={slide.link} target="_blank" rel="noreferrer"
          style={{ fontSize: 12, color: '#4f8ef7', textDecoration: 'none' }}>
          → Official source
        </a>
      )}
    </motion.div>
  );
}

export default function Presentation() {
  const [active, setActive] = useState(0);
  const slide = SLIDES[active];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Teaching Notes</div>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>
          Your presenter cheat sheet — talking points, timing, tips, and demo cues for the 15-minute session.
          This is for <strong style={{ color: 'var(--text)' }}>your eyes only</strong> while you prepare, not a deck to show the audience.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, minHeight: '70vh' }}>
      {/* Sidebar */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
          Presentation slides
        </div>
        {SLIDES.map((s, i) => (
          <SlideCard key={s.id} slide={s} active={i === active} onClick={() => setActive(i)} />
        ))}
        <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 10, fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
          💡 Each slide has a presenter tip. Use this as your teaching notes before the session — not a deck to show the audience.
        </div>
      </div>

      {/* Slide content */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem', overflow: 'auto' }}>
        {/* Prev/Next controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={() => setActive(a => Math.max(0, a - 1))} disabled={active === 0} style={{
            padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: '1px solid var(--border)', background: 'transparent',
            color: active === 0 ? 'var(--text3)' : 'var(--text)', cursor: active === 0 ? 'default' : 'pointer',
          }}>← Previous</button>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{active + 1} / {SLIDES.length}</span>
          <button onClick={() => setActive(a => Math.min(SLIDES.length - 1, a + 1))} disabled={active === SLIDES.length - 1} style={{
            padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: '1px solid var(--border)', background: 'transparent',
            color: active === SLIDES.length - 1 ? 'var(--text3)' : 'var(--text)', cursor: active === SLIDES.length - 1 ? 'default' : 'pointer',
          }}>Next →</button>
        </div>
        <AnimatePresence mode="wait">
          <SlideContent key={slide.id} slide={slide} />
        </AnimatePresence>
      </div>
      </div>
    </div>
  );
}
