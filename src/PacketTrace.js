import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SCENARIOS = {
  short: {
    label: 'mongodb (short name)',
    domain: 'mongodb',
    type: 'cluster-short',
    description: 'Short name from default namespace — triggers NDOTS search domain expansion',
  },
  fqdn: {
    label: 'mongodb.default.svc.cluster.local',
    domain: 'mongodb.default.svc.cluster.local',
    type: 'cluster-fqdn',
    description: 'Full FQDN — resolves directly, no search domain expansion needed',
  },
  crossns: {
    label: 'mongodb from payments namespace',
    domain: 'mongodb',
    type: 'cross-namespace',
    description: 'Short name from wrong namespace — returns NXDOMAIN',
  },
  external: {
    label: 'google.com (external)',
    domain: 'google.com',
    type: 'external',
    description: 'External domain — forwarded upstream through CoreDNS forward plugin',
  },
  headless: {
    label: 'mongo-0.mongodb (headless)',
    domain: 'mongo-0.mongodb.default.svc.cluster.local',
    type: 'headless',
    description: 'Headless service — returns direct pod IP, no ClusterIP involved',
  },
};

const STEPS = {
  'cluster-short': [
    { id: 'app', from: 'App Pod', to: 'Kernel', label: 'App calls mongodb', detail: 'Your app calls connect("mongodb", 27017). The kernel reads /etc/resolv.conf inside the pod network namespace.', color: '#4f8ef7', icon: '📦' },
    { id: 'resolv', from: 'Kernel', to: 'Resolver', label: 'Check /etc/resolv.conf', detail: 'resolv.conf shows: nameserver 10.96.0.10, search default.svc.cluster.local svc.cluster.local cluster.local, options ndots:5. "mongodb" has 0 dots < 5, so search domains apply.', color: '#9b7ff4', icon: '📄' },
    { id: 'ndots1', from: 'Resolver', to: 'CoreDNS', label: 'Try #1: mongodb.default.svc.cluster.local', detail: 'Resolver appends first search domain. Sends UDP query to CoreDNS at 10.96.0.10. This is query attempt 1 of potentially 5.', color: '#f59e0b', icon: '🔍', warn: true },
    { id: 'coredns', from: 'CoreDNS', to: 'In-memory cache', label: 'Kubernetes plugin matches .cluster.local', detail: 'CoreDNS kubernetes plugin is authoritative for .cluster.local zone. Checks in-memory cache synced from Kubernetes API via informer. Finds Service "mongodb" in namespace "default".', color: '#2dd4bf', icon: '🧠' },
    { id: 'clusterip', from: 'CoreDNS', to: 'Resolver', label: 'Returns ClusterIP 10.96.0.2', detail: 'CoreDNS returns A record: mongodb.default.svc.cluster.local → 10.96.0.2 (the virtual ClusterIP). TTL: 30 seconds.', color: '#4ade80', icon: '✅' },
    { id: 'iptables', from: 'Kernel', to: 'iptables DNAT', label: 'kube-proxy intercepts ClusterIP', detail: 'Packet destined for 10.96.0.2:27017 hits kube-proxy iptables DNAT rule. KUBE-SERVICES → KUBE-SVC-MONGODB → KUBE-SEP-POD1. Destination rewritten to 10.0.1.5:27017.', color: '#fb923c', icon: '🔀' },
    { id: 'pod', from: 'CNI', to: 'Backend Pod', label: 'Packet arrives at mongo pod', detail: 'CNI plugin routes the rewritten packet to node hosting 10.0.1.5. Pod receives connection on port 27017. App is connected.', color: '#4ade80', icon: '🎯' },
  ],
  'cluster-fqdn': [
    { id: 'app', from: 'App Pod', to: 'Kernel', label: 'App calls full FQDN', detail: 'Your app calls connect("mongodb.default.svc.cluster.local", 27017). 4 dots ≥ ndots (if ndots:2) or less than 5 (if default). With ndots:2, this is queried directly.', color: '#4f8ef7', icon: '📦' },
    { id: 'resolv', from: 'Kernel', to: 'CoreDNS', label: 'Direct query — no search expansion', detail: 'FQDN has 4 dots. With ndots:5 (default) this still triggers search expansion. With ndots:2, it\'s queried as-is. Best practice: always use FQDN to avoid ambiguity.', color: '#4ade80', icon: '⚡' },
    { id: 'coredns', from: 'CoreDNS', to: 'In-memory cache', label: 'Kubernetes plugin resolves directly', detail: 'CoreDNS kubernetes plugin matches .cluster.local. Single query, immediate cache lookup. No search domain retries.', color: '#2dd4bf', icon: '🧠' },
    { id: 'clusterip', from: 'CoreDNS', to: 'App Pod', label: 'Returns ClusterIP 10.96.0.2', detail: 'Single DNS response. Much faster than short name with ndots:5. This is why using FQDNs in cross-namespace calls matters.', color: '#4ade80', icon: '✅' },
    { id: 'iptables', from: 'Kernel', to: 'iptables DNAT', label: 'kube-proxy rewrites to real pod IP', detail: 'Same DNAT rewrite as before. ClusterIP 10.96.0.2 → real pod IP 10.0.1.5. Happens in kernel before packet leaves node.', color: '#fb923c', icon: '🔀' },
    { id: 'pod', from: 'CNI', to: 'Backend Pod', label: 'Connected — faster path', detail: '1 DNS query instead of up to 5. Faster, less CoreDNS load, no conntrack race risk.', color: '#4ade80', icon: '🎯' },
  ],
  'cross-namespace': [
    { id: 'app', from: 'App Pod (payments ns)', to: 'Kernel', label: 'App calls mongodb (short name)', detail: 'Pod is in the "payments" namespace. resolv.conf search domains include payments.svc.cluster.local, NOT default.svc.cluster.local.', color: '#4f8ef7', icon: '📦' },
    { id: 'resolv', from: 'Resolver', to: 'CoreDNS', label: 'Try #1: mongodb.payments.svc.cluster.local', detail: 'Resolver appends the local namespace first. Queries for mongodb in the payments namespace — where it doesn\'t exist.', color: '#f59e0b', icon: '🔍', warn: true },
    { id: 'nxdomain1', from: 'CoreDNS', to: 'Resolver', label: 'NXDOMAIN — not in payments namespace', detail: 'CoreDNS kubernetes plugin finds no Service named "mongodb" in the "payments" namespace. Returns NXDOMAIN.', color: '#f87171', icon: '❌', error: true },
    { id: 'ndots2', from: 'Resolver', to: 'CoreDNS', label: 'Try #2: mongodb.svc.cluster.local', detail: 'Resolver tries next search domain. mongodb.svc.cluster.local is not a valid service name format — also fails.', color: '#f87171', icon: '❌', error: true },
    { id: 'final-nxdomain', from: 'CoreDNS', to: 'App Pod', label: 'Final NXDOMAIN — connection fails', detail: 'All search domains exhausted. App receives "no such host" error. Fix: use mongodb.default.svc.cluster.local (full FQDN) or mongodb.default (partial with explicit namespace).', color: '#f87171', icon: '💥', error: true },
  ],
  'external': [
    { id: 'app', from: 'App Pod', to: 'Kernel', label: 'App calls google.com', detail: 'App needs to reach an external API. DNS query for google.com. Has 1 dot — less than ndots:5 default, so search domains are tried first.', color: '#4f8ef7', icon: '📦' },
    { id: 'ndots1', from: 'Resolver', to: 'CoreDNS', label: 'Try: google.com.default.svc.cluster.local', detail: 'With ndots:5, the resolver tries appending cluster search domains first. This is wasteful for external domains — another reason to set ndots:2.', color: '#f59e0b', icon: '🔍', warn: true },
    { id: 'nxdomain', from: 'CoreDNS', to: 'Resolver', label: 'NXDOMAIN from kubernetes plugin', detail: 'CoreDNS kubernetes plugin doesn\'t know about google.com. Falls through to the forward plugin via the fallthrough directive.', color: '#9b7ff4', icon: '↩️' },
    { id: 'forward', from: 'CoreDNS forward', to: 'Upstream DNS', label: 'Forwarded to upstream resolver', detail: 'CoreDNS forward plugin sends the query to the upstream resolver — typically the node\'s /etc/resolv.conf nameserver, which is your cloud provider\'s DNS (e.g. 169.254.169.253 on AWS).', color: '#fb923c', icon: '🌐' },
    { id: 'upstream', from: 'Upstream DNS', to: 'CoreDNS', label: 'Upstream returns real IP', detail: 'Public DNS resolves google.com → 142.250.x.x. Response travels back through CoreDNS which caches it (TTL from upstream record). Future queries for google.com are served from cache.', color: '#4ade80', icon: '✅' },
    { id: 'pod', from: 'App Pod', to: 'Internet', label: 'App connects to external IP', detail: 'Pod connects to 142.250.x.x. Traffic routes through the node\'s default gateway out to the internet. No kube-proxy involvement — this is a real external IP, not a ClusterIP.', color: '#4ade80', icon: '🌍' },
  ],
  'headless': [
    { id: 'app', from: 'App Pod', to: 'CoreDNS', label: 'Query for mongo-0 specific pod', detail: 'StatefulSet pod needs to reach mongo-0 specifically (e.g. to check replica set membership). Queries mongo-0.mongodb.default.svc.cluster.local.', color: '#4f8ef7', icon: '📦' },
    { id: 'coredns', from: 'CoreDNS', to: 'EndpointSlice', label: 'Kubernetes plugin — headless service lookup', detail: 'CoreDNS detects this is a headless service (clusterIP: None). Instead of returning a ClusterIP, it looks up the specific pod by ordinal name in the EndpointSlice.', color: '#2dd4bf', icon: '🧠' },
    { id: 'podip', from: 'CoreDNS', to: 'App Pod', label: 'Returns direct pod IP 10.0.1.5', detail: 'CoreDNS returns the actual pod IP — NOT a ClusterIP. No kube-proxy DNAT involved. Direct pod-to-pod routing via CNI.', color: '#4ade80', icon: '✅' },
    { id: 'direct', from: 'App Pod', to: 'CNI', label: 'Direct connection — no kube-proxy', detail: 'Packet goes directly to 10.0.1.5. CNI routes it. No iptables DNAT rewrite. This is why stable pod identity works — the DNS name always resolves to the same pod IP as long as the pod is alive.', color: '#2dd4bf', icon: '⚡' },
    { id: 'pod', from: 'CNI', to: 'mongo-0 Pod', label: 'mongo-0 receives connection', detail: 'Direct connection to the specific StatefulSet pod. If mongo-0 reschedules to a different node with a new IP, the DNS record updates automatically. The name is stable even when the IP changes.', color: '#4ade80', icon: '🎯' },
  ],
};

export default function PacketTrace() {
  const [scenario, setScenario] = useState('short');
  const [currentStep, setCurrentStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1200);
  const intervalRef = useRef(null);
  const steps = STEPS[SCENARIOS[scenario].type];

  useEffect(() => {
    setCurrentStep(-1);
    setPlaying(false);
  }, [scenario]);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= steps.length - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, speed);
    }
    return () => clearInterval(intervalRef.current);
  }, [playing, speed, steps.length]);

  const play = () => {
    if (currentStep >= steps.length - 1) setCurrentStep(-1);
    setPlaying(true);
  };
  const pause = () => setPlaying(false);
  const reset = () => { setCurrentStep(-1); setPlaying(false); };
  const stepForward = () => { if (currentStep < steps.length - 1) setCurrentStep(s => s + 1); };
  const stepBack = () => { if (currentStep > -1) setCurrentStep(s => s - 1); };

  const activeStep = currentStep >= 0 ? steps[currentStep] : null;

  return (
    <div style={{ padding: '0 0 2rem' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Packet trace simulator</div>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>Watch a DNS query travel through the cluster in real time. Choose a scenario and press play.</div>
      </div>

      {/* Scenario selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {Object.entries(SCENARIOS).map(([key, s]) => (
          <button key={key} onClick={() => setScenario(key)} style={{
            padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
            border: '1px solid', cursor: 'pointer', transition: 'all .15s',
            background: scenario === key ? 'var(--blue)' : 'transparent',
            borderColor: scenario === key ? 'var(--blue)' : 'var(--border2)',
            color: scenario === key ? '#fff' : 'var(--text2)',
          }}>{s.label}</button>
        ))}
      </div>

      {/* Scenario description */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>
        <strong style={{ color: 'var(--text)' }}>Scenario: </strong>{SCENARIOS[scenario].description}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={reset} style={btnStyle('var(--text3)')}>↺ Reset</button>
        <button onClick={stepBack} disabled={currentStep <= -1} style={btnStyle('var(--text2)')}>← Back</button>
        {playing
          ? <button onClick={pause} style={btnStyle('var(--amber)')}>⏸ Pause</button>
          : <button onClick={play} style={btnStyle('var(--blue)', true)}>▶ Play</button>
        }
        <button onClick={stepForward} disabled={currentStep >= steps.length - 1} style={btnStyle('var(--text2)')}>Next →</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Speed</span>
          <input type="range" min={400} max={2400} step={200} value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            style={{ width: 80 }} />
          <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 40 }}>{speed > 1600 ? 'slow' : speed > 800 ? 'normal' : 'fast'}</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 'auto' }}>
          {currentStep + 1} / {steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
        <motion.div style={{ height: '100%', background: 'var(--blue)', borderRadius: 2 }}
          animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          transition={{ duration: 0.3 }} />
      </div>

      {/* Step timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        {steps.map((step, i) => {
          const state = i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending';
          return (
            <motion.div key={step.id}
              onClick={() => setCurrentStep(i)}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: state === 'pending' ? 0.4 : 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px',
                borderRadius: 10, cursor: 'pointer', transition: 'background .15s',
                background: state === 'active' ? (step.error ? 'var(--red-bg)' : step.warn ? 'var(--amber-bg)' : 'var(--blue-bg)') : 'var(--bg2)',
                border: `1px solid ${state === 'active' ? (step.error ? 'rgba(248,113,113,0.4)' : step.warn ? 'rgba(245,158,11,0.4)' : 'rgba(79,142,247,0.4)') : 'var(--border)'}`,
              }}>
              <div style={{ fontSize: 16, minWidth: 24 }}>{step.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {step.from} → {step.to}
                  </span>
                  {state === 'done' && <span style={{ fontSize: 10, color: 'var(--green)' }}>✓</span>}
                  {state === 'active' && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1 }} style={{ fontSize: 10, color: step.error ? 'var(--red)' : 'var(--blue)' }}>●</motion.span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: step.error ? 'var(--red)' : step.warn ? 'var(--amber)' : 'var(--text)', marginTop: 2 }}>{step.label}</div>
                <AnimatePresence>
                  {state === 'active' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6, lineHeight: 1.6 }}>{step.detail}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Active step detail card */}
      <AnimatePresence mode="wait">
        {activeStep && (
          <motion.div key={activeStep.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{
              background: activeStep.error ? 'var(--red-bg)' : activeStep.warn ? 'var(--amber-bg)' : 'var(--bg2)',
              border: `1px solid ${activeStep.error ? 'rgba(248,113,113,0.3)' : activeStep.warn ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
              borderRadius: 12, padding: '1.25rem',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 24 }}>{activeStep.icon}</span>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>Step {currentStep + 1} of {steps.length}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: activeStep.error ? 'var(--red)' : 'var(--text)' }}>{activeStep.label}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{activeStep.detail}</div>
          </motion.div>
        )}
        {!activeStep && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: 'var(--text3)' }}>Select a scenario above, then step through or play the trace</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function btnStyle(color, primary) {
  return {
    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    border: `1px solid ${primary ? color : 'var(--border)'}`,
    background: primary ? color : 'transparent',
    color: primary ? '#fff' : color, cursor: 'pointer',
  };
}
