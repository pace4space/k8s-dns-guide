import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Supabase config ──────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://sinbikpigvbycftvxpup.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpbmJpa3BpZ3ZieWNmdHZ4cHVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NTU1NDMsImV4cCI6MjA5NDUzMTU0M30.H-3pQVl78-z2aObZLvEKpO0X8JslN4AnOrC7K1wIX4c';

// Each device/browser gets a stable anonymous UUID stored in localStorage.
// This is the "identity" used as the row key in Supabase.
function getUserKey() {
  const k = 'mynotes-user-key';
  let id = localStorage.getItem(k);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(k, id);
  }
  return id;
}

async function dbFetch(userKey) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notes?user_key=eq.${userKey}&select=items`,
    { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
  );
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const rows = await res.json();
  return rows.length > 0 ? rows[0].items : [];
}

async function dbSave(userKey, items) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notes`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ user_key: userKey, items, updated_at: new Date().toISOString() }),
    }
  );
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
}

// ─── Local fallback (used while cloud syncs) ──────────────────────────────────
const LOCAL_KEY = 'mynotes-items-v1';
function localLoad() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}
function localSave(items) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(items)); } catch {}
}

// ─── YouTube embed URL builder ────────────────────────────────────────────────
function youtubeEmbedUrl(url, start, end) {
  try {
    const u = new URL(url);
    const videoId = u.hostname.includes('youtu.be')
      ? u.pathname.slice(1).split('?')[0]
      : u.searchParams.get('v') || '';
    if (!videoId) return null;
    const s = start || u.searchParams.get('start') || '';
    const e = end   || u.searchParams.get('end')   || '';
    let embed = `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0`;
    if (s) embed += `&start=${s}`;
    if (e) embed += `&end=${e}`;
    return embed;
  } catch { return null; }
}

function parseTimecode(tc) {
  if (!tc) return '';
  if (/^\d+$/.test(tc)) return tc;
  const parts = tc.split(':').map(Number);
  if (parts.length === 2) return String(parts[0] * 60 + parts[1]);
  if (parts.length === 3) return String(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return tc;
}

// ─── Presets & pinned ─────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Service Mesh: Connect/Secure/Monitor reveal', url: 'https://youtu.be/cjhb7_uwzDk?start=263&end=284', start: '263', end: '284', note: 'KubeCon — "Service Mesh In Kubernetes Explained"\n4:23–4:44: The Connect / Secure / Monitor reveal slide.\nGreat laugh moment. Show this when introducing service mesh boundary.', tag: 'service-mesh' },
  { label: "Datadog: It's always DNS — KubeCon 2019", url: 'https://www.youtube.com/watch?v=QKI-JRs2RIE', start: '', end: '', note: 'Laurent Bernaille & Robert Boll, Datadog.\nSlide #1: "It\'s ~~never~~ always DNS." Use as opening hook.\nCovers: ndots, autopath trap, conntrack race, CronJob IOPS spike.', tag: 'war-story' },
  { label: 'Understanding CoreDNS in Kubernetes', url: 'https://www.youtube.com/watch?v=qRiLmLACYSY', start: '', end: '', note: 'Deep dive: CoreDNS deployment anatomy, plugin list, autopath internals.\n16:00 resolving queries | 21:20 cache tuning | 24:30 kubernetes plugin options | 25:30 full plugin list.', tag: 'coredns' },
];

const PINNED = [
  { id: 'pinned-mesh-reveal', type: 'youtube', label: '🎤 Service Mesh reveal — show this in your presentation', url: 'https://youtu.be/cjhb7_uwzDk?start=263&end=284', start: '263', end: '284', note: 'KubeCon — "Service Mesh In Kubernetes Explained"\n4:23–4:44 · The Connect / Secure / Monitor reveal.\nPlay this when you introduce the service mesh boundary. Gets a laugh.', tag: 'service-mesh', pinned: true },
];

const TAGS = ['all', 'coredns', 'service-mesh', 'war-story', 'ndots', 'headless', 'debug', 'other'];
const TAG_COLORS = { 'coredns': '#2dd4bf', 'service-mesh': '#9b7ff4', 'war-story': '#f87171', 'ndots': '#f59e0b', 'headless': '#fb923c', 'debug': '#4ade80', 'other': '#5a5a78' };

// ─── UI helpers ───────────────────────────────────────────────────────────────
function TagBadge({ tag }) {
  return <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:(TAG_COLORS[tag]||'#5a5a78')+'22', color:TAG_COLORS[tag]||'#5a5a78', border:`1px solid ${(TAG_COLORS[tag]||'#5a5a78')}44` }}>{tag}</span>;
}

function iconBtn(color) {
  return { padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:600, border:`1px solid ${color}44`, background:color+'11', color, cursor:'pointer' };
}

const inputStyle = { width:'100%', padding:'8px 12px', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:8, color:'var(--text)', fontSize:13 };

function Field({ label, hint, children }) {
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <label style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>{label}</label>
        {hint && <span style={{ fontSize:11, color:'var(--text3)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────
function YouTubeCard({ item, onDelete, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const embedUrl = youtubeEmbedUrl(item.url, item.start, item.end);
  const fmtTime = s => s ? (parseInt(s) >= 60 ? `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` : `0:${String(s).padStart(2,'0')}`) : null;
  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', marginBottom:12 }}>
      <div style={{ padding:'12px 14px', display:'flex', alignItems:'flex-start', gap:10 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
            <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{item.label||'YouTube clip'}</span>
            {item.tag && <TagBadge tag={item.tag} />}
            {item.start && item.end && <span style={{ fontSize:11, color:'var(--text3)', fontFamily:'monospace' }}>{fmtTime(item.start)} → {fmtTime(item.end)}</span>}
          </div>
          <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'monospace', wordBreak:'break-all' }}>{item.url}</div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => setExpanded(e => !e)} style={iconBtn('#4f8ef7')}>{expanded ? '▲ Hide' : '▶ Play'}</button>
          {!item.pinned && <><button onClick={onEdit} style={iconBtn('var(--text3)')}>✎</button><button onClick={onDelete} style={iconBtn('var(--red)')}>✕</button></>}
        </div>
      </div>
      {item.note && <div style={{ padding:'0 14px 12px' }}>{item.note.split('\n').map((l,i) => <p key={i} style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6, margin:0 }}>{l}</p>)}</div>}
      <AnimatePresence>
        {expanded && embedUrl && (
          <motion.div initial={{ height:0 }} animate={{ height:'auto' }} exit={{ height:0 }} style={{ overflow:'hidden' }}>
            <div style={{ position:'relative', paddingBottom:'56.25%', background:'#000' }}>
              <iframe src={embedUrl} title={item.label} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%' }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ImageCard({ item, onDelete, onEdit }) {
  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', marginBottom:12 }}>
      <div style={{ padding:'12px 14px', display:'flex', alignItems:'flex-start', gap:10 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
            <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{item.label||'Image'}</span>
            {item.tag && <TagBadge tag={item.tag} />}
          </div>
          {item.note && item.note.split('\n').map((l,i) => <p key={i} style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6, margin:0 }}>{l}</p>)}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={onEdit} style={iconBtn('var(--text3)')}>✎</button>
          <button onClick={onDelete} style={iconBtn('var(--red)')}>✕</button>
        </div>
      </div>
      <img src={item.dataUrl} alt={item.label} style={{ width:'100%', display:'block', maxHeight:500, objectFit:'contain', background:'#000' }} />
    </div>
  );
}

function NoteCard({ item, onDelete, onEdit }) {
  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:14, marginBottom:12 }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:8 }}>
            <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{item.label||'Note'}</span>
            {item.tag && <TagBadge tag={item.tag} />}
          </div>
          <div style={{ background:'var(--bg3)', borderRadius:8, padding:'10px 12px' }}>
            {item.note.split('\n').map((l,i) => <p key={i} style={{ fontSize:13, color:'var(--text2)', lineHeight:1.7, margin:'0 0 4px' }}>{l}</p>)}
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={onEdit} style={iconBtn('var(--text3)')}>✎</button>
          <button onClick={onDelete} style={iconBtn('var(--red)')}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add / Edit modal ─────────────────────────────────────────────────────────
function AddModal({ initial, onSave, onClose }) {
  const [type, setType] = useState(initial?.type || 'youtube');
  const [label, setLabel] = useState(initial?.label || '');
  const [url, setUrl] = useState(initial?.url || '');
  const [startRaw, setStartRaw] = useState(initial?.startRaw || '');
  const [endRaw, setEndRaw] = useState(initial?.endRaw || '');
  const [note, setNote] = useState(initial?.note || '');
  const [tag, setTag] = useState(initial?.tag || 'other');
  const [dataUrl, setDataUrl] = useState(initial?.dataUrl || '');
  const [previewEmbed, setPreviewEmbed] = useState(false);
  const fileRef = useRef();

  const handleImage = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setDataUrl(ev.target.result);
    reader.readAsDataURL(file);
  };
  const handlePreset = p => { setLabel(p.label); setUrl(p.url); setStartRaw(p.start); setEndRaw(p.end); setNote(p.note); setTag(p.tag); setType('youtube'); };
  const embedPreview = type === 'youtube' ? youtubeEmbedUrl(url, parseTimecode(startRaw), parseTimecode(endRaw)) : null;
  const handleSave = () => onSave({ ...initial, type, label, url, note, tag, dataUrl, start: parseTimecode(startRaw), end: parseTimecode(endRaw), startRaw, endRaw, id: initial?.id || Date.now() });

  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ scale:0.95, y:10 }} animate={{ scale:1, y:0 }}
        style={{ background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:16, padding:'1.5rem', width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{initial?.id ? 'Edit item' : 'Add to My Notes'}</div>
          <button onClick={onClose} style={iconBtn('var(--text3)')}>✕</button>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[['youtube','▶ YouTube'],['image','🖼 Image'],['note','📝 Note']].map(([t,l]) => (
            <button key={t} onClick={() => setType(t)} style={{ padding:'6px 14px', borderRadius:8, fontSize:12, fontWeight:600, border:'1px solid', cursor:'pointer', background:type===t?'var(--blue)':'transparent', borderColor:type===t?'var(--blue)':'var(--border)', color:type===t?'#fff':'var(--text2)' }}>{l}</button>
          ))}
        </div>
        {type === 'youtube' && !initial?.id && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Quick add from study material</div>
            {PRESETS.map((p,i) => (
              <button key={i} onClick={() => handlePreset(p)} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', borderRadius:8, marginBottom:6, background:'var(--bg3)', border:'1px solid var(--border)', cursor:'pointer', fontSize:12, color:'var(--text2)' }}>
                <span style={{ color:'var(--text)', fontWeight:500 }}>{p.label}</span>
                {p.start && <span style={{ color:'var(--text3)', marginLeft:8, fontFamily:'monospace' }}>{Math.floor(parseInt(p.start)/60)}:{String(parseInt(p.start)%60).padStart(2,'0')} → {Math.floor(parseInt(p.end)/60)}:{String(parseInt(p.end)%60).padStart(2,'0')}</span>}
              </button>
            ))}
          </div>
        )}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Title / Label"><input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Service mesh reveal clip" style={inputStyle} /></Field>
          {type === 'youtube' && <>
            <Field label="YouTube URL"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtu.be/..." style={inputStyle} /></Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Field label="Start time" hint="e.g. 4:23 or 263"><input value={startRaw} onChange={e => setStartRaw(e.target.value)} placeholder="4:23" style={inputStyle} /></Field>
              <Field label="End time" hint="e.g. 4:44 or 284"><input value={endRaw} onChange={e => setEndRaw(e.target.value)} placeholder="4:44" style={inputStyle} /></Field>
            </div>
            {embedPreview && (
              <div>
                <button onClick={() => setPreviewEmbed(p => !p)} style={{ fontSize:12, color:'var(--blue)', background:'transparent', border:'none', cursor:'pointer', padding:0, marginBottom:8 }}>{previewEmbed ? '▲ Hide preview' : '▶ Preview clip'}</button>
                <AnimatePresence>
                  {previewEmbed && (
                    <motion.div initial={{ height:0 }} animate={{ height:'auto' }} exit={{ height:0 }} style={{ overflow:'hidden' }}>
                      <div style={{ position:'relative', paddingBottom:'56.25%' }}>
                        <iframe src={embedPreview} title="preview" frameBorder="0" allowFullScreen style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', borderRadius:8 }} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </>}
          {type === 'image' && (
            <Field label="Upload image">
              <input type="file" accept="image/*" ref={fileRef} onChange={handleImage} style={{ display:'none' }} />
              <button onClick={() => fileRef.current.click()} style={{ padding:'10px 16px', borderRadius:8, border:'1px dashed var(--border2)', background:'var(--bg3)', color:'var(--text2)', cursor:'pointer', fontSize:13, width:'100%' }}>
                {dataUrl ? '✓ Image loaded — click to replace' : '📁 Click to upload image or screenshot'}
              </button>
              {dataUrl && <img src={dataUrl} alt="preview" style={{ marginTop:8, borderRadius:8, maxHeight:200, objectFit:'contain', width:'100%' }} />}
            </Field>
          )}
          <Field label="Notes (optional)"><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add context, timestamps, key points..." rows={4} style={{ ...inputStyle, resize:'vertical', fontFamily:'inherit' }} /></Field>
          <Field label="Tag">
            <select value={tag} onChange={e => setTag(e.target.value)} style={inputStyle}>
              {TAGS.filter(t => t !== 'all').map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'8px 18px', borderRadius:8, fontSize:13, border:'1px solid var(--border)', background:'transparent', color:'var(--text2)', cursor:'pointer' }}>Cancel</button>
          <button onClick={handleSave} style={{ padding:'8px 18px', borderRadius:8, fontSize:13, fontWeight:600, border:'none', background:'var(--blue)', color:'#fff', cursor:'pointer' }}>Save</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Import/Export ────────────────────────────────────────────────────────────
function exportNotes(items) {
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mynotes-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function SyncStatus({ status }) {
  const cfg = {
    idle:    { color: 'var(--text3)', label: '☁ synced' },
    saving:  { color: 'var(--amber)', label: '↑ saving…' },
    loading: { color: 'var(--blue)',  label: '↓ loading…' },
    error:   { color: 'var(--red)',   label: '⚠ sync error — saved locally' },
    offline: { color: 'var(--text3)', label: '💾 local only' },
  }[status] || { color: 'var(--text3)', label: '' };
  return <span style={{ fontSize:11, color: cfg.color, fontWeight:500 }}>{cfg.label}</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MyNotes() {
  const [items, setItems] = useState(localLoad);
  const [syncStatus, setSyncStatus] = useState('loading');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterTag, setFilterTag] = useState('all');
  const userKey = useRef(getUserKey());
  const saveTimer = useRef(null);

  // Load from Supabase on mount
  useEffect(() => {
    setSyncStatus('loading');
    dbFetch(userKey.current)
      .then(cloudItems => {
        if (cloudItems.length > 0) {
          setItems(cloudItems);
          localSave(cloudItems);
        }
        setSyncStatus('idle');
      })
      .catch(() => setSyncStatus('offline'));
  }, []);

  // Debounced save to Supabase whenever items change
  const syncToCloud = useCallback((newItems) => {
    localSave(newItems);
    setSyncStatus('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await dbSave(userKey.current, newItems);
        setSyncStatus('idle');
      } catch {
        setSyncStatus('error');
      }
    }, 800); // debounce — don't fire on every keystroke
  }, []);

  const updateItems = useCallback((updater) => {
    setItems(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncToCloud(next);
      return next;
    });
  }, [syncToCloud]);

  const handleSave = item => {
    updateItems(prev => {
      const idx = prev.findIndex(i => i.id === item.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = item; return n; }
      return [item, ...prev];
    });
    setShowAdd(false); setEditing(null);
  };

  const handleImport = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (Array.isArray(imported)) {
          updateItems(imported);
          alert(`Imported ${imported.length} items and synced to cloud.`);
        }
      } catch { alert('Invalid JSON file.'); }
    };
    reader.readAsText(file);
  };

  const importRef = useRef();
  const filtered = filterTag === 'all' ? items : items.filter(i => i.tag === filterTag);

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:700, color:'var(--text)' }}>My Notes</div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:3 }}>
            <div style={{ fontSize:14, color:'var(--text2)' }}>YouTube clips, diagrams, notes — synced across all devices.</div>
            <SyncStatus status={syncStatus} />
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => exportNotes(items)} style={{ padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:600, border:'1px solid var(--border)', background:'transparent', color:'var(--text2)', cursor:'pointer' }}>💾 Export</button>
          <button onClick={() => importRef.current.click()} style={{ padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:600, border:'1px solid var(--border)', background:'transparent', color:'var(--text2)', cursor:'pointer' }}>📂 Import</button>
          <input type="file" accept=".json" ref={importRef} onChange={handleImport} style={{ display:'none' }} />
          <button onClick={() => { setEditing(null); setShowAdd(true); }} style={{ padding:'7px 18px', borderRadius:8, fontSize:13, fontWeight:600, border:'none', background:'var(--blue)', color:'#fff', cursor:'pointer' }}>+ Add item</button>
        </div>
      </div>

      {/* Tag filter */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', margin:'14px 0' }}>
        {TAGS.map(t => (
          <button key={t} onClick={() => setFilterTag(t)} style={{ padding:'4px 12px', borderRadius:16, fontSize:11, fontWeight:600, border:'1px solid', cursor:'pointer', transition:'all .12s', background:filterTag===t?(TAG_COLORS[t]||'var(--blue)'):'transparent', borderColor:filterTag===t?(TAG_COLORS[t]||'var(--blue)'):'var(--border)', color:filterTag===t?'#fff':'var(--text2)' }}>
            {t}{t !== 'all' && items.filter(i => i.tag===t).length > 0 && ` (${items.filter(i => i.tag===t).length})`}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {syncStatus === 'loading' && (
        <div style={{ textAlign:'center', padding:'2rem', color:'var(--text3)', fontSize:13 }}>
          <motion.div animate={{ opacity:[0.4,1,0.4] }} transition={{ repeat:Infinity, duration:1.4 }}>↓ Loading your notes from cloud…</motion.div>
        </div>
      )}

      {/* Empty state */}
      {syncStatus !== 'loading' && filtered.length === 0 && (
        <div style={{ textAlign:'center', padding:'3rem 1rem', background:'var(--bg2)', border:'1px dashed var(--border2)', borderRadius:14 }}>
          <div style={{ fontSize:32, marginBottom:10 }}>📎</div>
          <div style={{ fontSize:14, color:'var(--text2)', marginBottom:6 }}>{filterTag === 'all' ? 'No items yet.' : `No items tagged "${filterTag}".`}</div>
          <div style={{ fontSize:13, color:'var(--text3)', marginBottom:16 }}>Add YouTube clips, architecture diagrams, or text notes. They sync across all your devices.</div>
          <button onClick={() => { setEditing(null); setShowAdd(true); }} style={{ padding:'8px 18px', borderRadius:10, fontSize:13, fontWeight:600, border:'none', background:'var(--blue)', color:'#fff', cursor:'pointer' }}>+ Add your first item</button>
        </div>
      )}

      {/* Pinned */}
      {syncStatus !== 'loading' && (filterTag === 'all' || filterTag === 'service-mesh') && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--purple)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8 }}>📌 Pinned</div>
          {PINNED.map(p => (
            <div key={p.id} style={{ border:'1px solid rgba(155,127,244,0.35)', borderRadius:14, overflow:'hidden', marginBottom:8, background:'rgba(155,127,244,0.04)' }}>
              <YouTubeCard item={p} onDelete={() => {}} onEdit={() => {}} />
            </div>
          ))}
        </div>
      )}

      {/* Items */}
      <AnimatePresence>
        {filtered.map(item => (
          <motion.div key={item.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, scale:0.97 }} transition={{ duration:0.15 }}>
            {item.type === 'youtube' && <YouTubeCard item={item} onDelete={() => updateItems(p => p.filter(i => i.id !== item.id))} onEdit={() => { setEditing(item); setShowAdd(true); }} />}
            {item.type === 'image'   && <ImageCard   item={item} onDelete={() => updateItems(p => p.filter(i => i.id !== item.id))} onEdit={() => { setEditing(item); setShowAdd(true); }} />}
            {item.type === 'note'    && <NoteCard    item={item} onDelete={() => updateItems(p => p.filter(i => i.id !== item.id))} onEdit={() => { setEditing(item); setShowAdd(true); }} />}
          </motion.div>
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {showAdd && <AddModal initial={editing} onSave={handleSave} onClose={() => { setShowAdd(false); setEditing(null); }} />}
      </AnimatePresence>
    </div>
  );
}
