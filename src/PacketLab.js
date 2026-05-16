import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PacketTrace from './PacketTrace';
import PacketStories from './PacketStories';
import PacketUniverse from './PacketUniverse';

const SCENARIO_KEYS = ['pablo', 'nadia', 'carlos', 'reina', 'maya'];
const SCENARIO_LABELS = { pablo:'📦 Pablo', nadia:'🌀 Nadia', carlos:'🌍 Carlos', reina:'⏳ Reina', maya:'🔒 Maya' };
const SCENARIO_COLORS = { pablo:'#2dd4bf', nadia:'#f59e0b', carlos:'#fb923c', reina:'#f87171', maya:'#9b7ff4' };

// Info panel rendered as an absolute overlay INSIDE the canvas container
// so it works both in normal view and in fullscreen mode
function NodeInfoOverlay({ info, onClose }) {
  if (!info) return null;
  return (
    <motion.div
      key={info.nodeId}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.18 }}
      style={{
        position: 'absolute',
        top: 12, right: 52,       // right of fullscreen button
        width: 300,
        maxHeight: 'calc(100% - 24px)',
        overflowY: 'auto',
        background: 'rgba(12,12,20,0.97)',
        border: `1px solid ${info.info.color}55`,
        borderRadius: 12,
        boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px ${info.info.color}22`,
        zIndex: 50,
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <div style={{
        background: info.info.color + '20',
        padding: '12px 14px',
        borderBottom: `1px solid ${info.info.color}33`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        position: 'sticky', top: 0, zIndex: 2,
        backdropFilter: 'blur(8px)',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{info.info.title}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{info.info.subtitle}</div>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: 'none',
          color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
          fontSize: 16, padding: '0 2px', lineHeight: 1, flexShrink: 0,
        }}>✕</button>
      </div>

      {/* Sections */}
      <div style={{ padding: '10px 14px' }}>
        {info.info.sections.map((s, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: info.info.color, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>{s.label}</div>
            {s.code && (
              <div style={{ background: '#050508', borderRadius: 7, padding: '8px 10px', fontFamily: 'monospace', fontSize: 10.5, color: '#a8b4d8', lineHeight: 1.7, whiteSpace: 'pre', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.06)' }}>{s.code}</div>
            )}
            {s.bullets && (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {s.bullets.map((b, j) => (
                  <li key={j} style={{ fontSize: 12, color: 'rgba(200,210,230,0.85)', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', lineHeight: 1.5, display: 'flex', gap: 6 }}>
                    <span style={{ color: info.info.color, minWidth: 8 }}>›</span>{b}
                  </li>
                ))}
              </ul>
            )}
            {s.warn && <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 7, padding: '8px 10px', fontSize: 12, color: '#f59e0b', lineHeight: 1.5 }}>⚠ {s.warn}</div>}
            {s.info && <div style={{ background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.3)', borderRadius: 7, padding: '8px 10px', fontSize: 12, color: '#4f8ef7', lineHeight: 1.5 }}>ℹ {s.info}</div>}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function PacketLab() {
  const [mode, setMode] = useState('universe');
  const [universeScenario, setUniverseScenario] = useState('pablo');
  const [universeStep, setUniverseStep] = useState(-1);
  const [universePlaying, setUniversePlaying] = useState(true);
  const [invertY, setInvertY] = useState(false);
  const [followPacket, setFollowPacket] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [activeNodeInfo, setActiveNodeInfo] = useState(null);

  const handleStoryStep = useCallback((scenarioKey, stepIndex) => {
    setUniverseScenario(scenarioKey);
    setUniverseStep(stepIndex);
  }, []);

  const handleReset = () => { setFollowPacket(false); setResetSignal(s => s + 1); };

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Packet Lab</div>
      <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
        Three lenses on the same journey. The 3D universe updates as you step through stories.
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { id: 'universe', icon: '🌌', label: '3D Universe', sub: 'Live packet visualization' },
          { id: 'stories', icon: '📖', label: 'Packet Stories', sub: 'Pablo, Nadia, Carlos, Reina, Maya' },
          { id: 'trace', icon: '🔬', label: 'Technical Trace', sub: 'Step-by-step hop detail' },
        ].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            border: '1px solid', cursor: 'pointer', transition: 'all .15s', flex: 1, minWidth: 140,
            background: mode === m.id ? 'rgba(79,142,247,0.15)' : 'var(--bg2)',
            borderColor: mode === m.id ? 'rgba(79,142,247,0.5)' : 'var(--border)',
            color: mode === m.id ? '#fff' : 'var(--text2)',
          }}>
            <div style={{ fontSize: 18, marginBottom: 2 }}>{m.icon}</div>
            <div>{m.label}</div>
            <div style={{ fontSize: 11, color: mode === m.id ? 'rgba(255,255,255,0.5)' : 'var(--text3)', marginTop: 2, fontWeight: 400 }}>{m.sub}</div>
          </button>
        ))}
      </div>

      {/* Universe — always mounted */}
      <div style={{ display: mode === 'universe' ? 'block' : 'none' }}>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {SCENARIO_KEYS.map(k => (
            <button key={k} onClick={() => { setUniverseScenario(k); setUniverseStep(-1); setUniversePlaying(true); setActiveNodeInfo(null); }} style={{
              padding: '5px 14px', borderRadius: 16, fontSize: 12, fontWeight: 600,
              border: '1px solid', cursor: 'pointer', transition: 'all .12s',
              background: universeScenario === k ? SCENARIO_COLORS[k] + '33' : 'transparent',
              borderColor: universeScenario === k ? SCENARIO_COLORS[k] : 'var(--border)',
              color: universeScenario === k ? '#fff' : 'var(--text2)',
            }}>{SCENARIO_LABELS[k]}</button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={handleReset} style={{ padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:600, border:'1px solid var(--border)', background:'transparent', color:'var(--text2)', cursor:'pointer' }} title="Reset camera">⊙ Reset</button>
            <button onClick={() => setFollowPacket(f => !f)} style={{ padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:600, border:'1px solid', cursor:'pointer', background:followPacket?'rgba(79,142,247,0.2)':'transparent', borderColor:followPacket?'rgba(79,142,247,0.5)':'var(--border)', color:followPacket?'var(--blue)':'var(--text3)' }}>
              {followPacket ? '🎯 Following' : '🎯 Follow'}
            </button>
            <button onClick={() => setInvertY(y => !y)} style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:600, border:'1px solid', cursor:'pointer', background:invertY?'rgba(155,127,244,0.2)':'transparent', borderColor:invertY?'rgba(155,127,244,0.5)':'var(--border)', color:invertY?'var(--purple)':'var(--text3)' }}>↕ Inv Y</button>
            <button onClick={() => setUniversePlaying(p => !p)} style={{ padding:'5px 14px', borderRadius:8, fontSize:12, fontWeight:600, border:'1px solid var(--border)', background:'transparent', color:universePlaying?'var(--amber)':'var(--green)', cursor:'pointer' }}>{universePlaying ? '⏸ Pause' : '▶ Play'}</button>
          </div>
        </div>

        {/* Canvas — info overlay lives INSIDE so fullscreen works */}
        <div style={{ height: 500, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative', background: '#0a0a0f' }}>
          <PacketUniverse
            scenarioKey={universeScenario}
            stepIndex={universeStep}
            playing={universePlaying}
            invertY={invertY}
            followPacket={followPacket}
            resetSignal={resetSignal}
            onNodeInfo={setActiveNodeInfo}
          />

          {/* Node info overlay — absolute inside canvas, works in fullscreen */}
          <AnimatePresence>
            {activeNodeInfo && (
              <NodeInfoOverlay info={activeNodeInfo} onClose={() => setActiveNodeInfo(null)} />
            )}
          </AnimatePresence>

          {/* Hint */}
          <div style={{ position:'absolute', bottom:12, left:12, fontSize:11, color:'rgba(255,255,255,0.22)', pointerEvents:'none', lineHeight:1.6 }}>
            left-drag to orbit · mid-drag to pan<br />scroll to zoom · click node for info
          </div>
          {/* Scenario label */}
          <div style={{ position:'absolute', top:12, left:12, fontSize:12, fontWeight:600, color:SCENARIO_COLORS[universeScenario], background:'rgba(10,10,15,0.8)', padding:'4px 10px', borderRadius:8, border:`1px solid ${SCENARIO_COLORS[universeScenario]}44`, pointerEvents:'none' }}>
            {SCENARIO_LABELS[universeScenario]}
          </div>
          {followPacket && (
            <div style={{ position:'absolute', bottom:12, right:52, fontSize:11, fontWeight:600, color:'var(--blue)', background:'rgba(10,10,15,0.8)', padding:'4px 10px', borderRadius:8, border:'1px solid rgba(79,142,247,0.4)', pointerEvents:'none' }}>🎯 Following</div>
          )}
        </div>

        {/* Step scrubber */}
        <div style={{ marginTop:12, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:8 }}>Step through the path — or switch to Stories / Technical Trace for full detail</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <button onClick={() => { setUniverseStep(-1); setUniversePlaying(true); }} style={stepBtn(universeStep === -1, SCENARIO_COLORS[universeScenario])}>Auto</button>
            {getPathLabels(universeScenario).map((label, i) => (
              <button key={i} onClick={() => { setUniverseStep(i); setUniversePlaying(false); }} style={stepBtn(universeStep === i, SCENARIO_COLORS[universeScenario])}>
                {i + 1}. {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stories / Trace */}
      <AnimatePresence mode="wait">
        {mode === 'stories' && (
          <motion.div key="stories" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} transition={{ duration:0.18 }}>
            <PacketStories onStep={handleStoryStep} />
          </motion.div>
        )}
        {mode === 'trace' && (
          <motion.div key="trace" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} transition={{ duration:0.18 }}>
            <PacketTrace />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function stepBtn(active, color) {
  return { padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:500, border:`1px solid ${active?color:'var(--border)'}`, background:active?color+'22':'transparent', color:active?color:'var(--text3)', cursor:'pointer', transition:'all .12s', whiteSpace:'nowrap' };
}

function getPathLabels(key) {
  const labels = {
    pablo: ['calls mongo-0','resolv.conf','CoreDNS','EndpointSlice','CNI','mongo-0'],
    nadia: ['calls mongodb','CoreDNS','NXDOMAIN','FQDN retry','CoreDNS','connected'],
    carlos: ['calls stripe.com','CoreDNS','node DNS','cloud DNS','stripe.com'],
    reina: ['calls backend','CoreDNS','ClusterIP','kube-proxy','empty endpoints'],
    maya: ['checkout app','sidecar proxy','DNS→ClusterIP','mTLS','dest proxy','payment app'],
  };
  return labels[key] || [];
}
