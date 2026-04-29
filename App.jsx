import { useState, useEffect, useRef } from "react";

// ─── Inline hook (no separate file needed for demo) ─────────────────────
function useDisasters() {
  const [events,    setEvents]    = useState([]);
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [lastFetch, setLastFetch] = useState(null);
  const [newAlerts, setNewAlerts] = useState([]);

  const fetchData = async () => {
    try {
      const res  = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson");
      const data = await res.json();

      const evs = data.features.map(f => {
        const mag = f.properties.mag;
        const [lng, lat, depth] = f.geometry.coordinates;
        const sev = mag >= 7 ? "CRITICAL" : mag >= 6 ? "HIGH" : mag >= 5 ? "MEDIUM" : "LOW";
        return {
          eventId:     f.id,
          type:        "EARTHQUAKE",
          magnitude:   mag,
          depth:       Math.round(depth),
          location:    { lat, lng, name: f.properties.place || "Unknown" },
          severity:    sev,
          description: f.properties.place,
          source:      "USGS",
          timestamp:   new Date(f.properties.time).toISOString(),
          url:         f.properties.url,
        };
      }).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

      setEvents(prev => {
        const prevIds = new Set(prev.map(e => e.eventId));
        const fresh   = evs.filter(e => !prevIds.has(e.eventId));
        if (fresh.length > 0) setNewAlerts(fresh.slice(0, 3));
        return evs;
      });

      setStats({
        total:    evs.length,
        critical: evs.filter(e => e.severity === "CRITICAL").length,
        high:     evs.filter(e => e.severity === "HIGH").length,
        medium:   evs.filter(e => e.severity === "MEDIUM").length,
        low:      evs.filter(e => e.severity === "LOW").length,
      });
      setLastFetch(new Date());
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 30000);
    return () => clearInterval(t);
  }, []);

  return { events, stats, loading, lastFetch, newAlerts, refetch: fetchData };
}

// ─── Severity config ──────────────────────────────────────────────────────
const SEV = {
  CRITICAL: { color: "#ff2d55", bg: "rgba(255,45,85,0.12)",  glow: "rgba(255,45,85,0.4)",  label: "CRITICAL", rank: 4 },
  HIGH:     { color: "#ff9f0a", bg: "rgba(255,159,10,0.12)", glow: "rgba(255,159,10,0.4)", label: "HIGH",     rank: 3 },
  MEDIUM:   { color: "#ffd60a", bg: "rgba(255,214,10,0.12)", glow: "rgba(255,214,10,0.3)", label: "MEDIUM",   rank: 2 },
  LOW:      { color: "#30d158", bg: "rgba(48,209,88,0.10)",  glow: "rgba(48,209,88,0.3)",  label: "LOW",      rank: 1 },
};

// ─── Time ago helper ──────────────────────────────────────────────────────
function timeAgo(ts) {
  const mins = Math.round((Date.now() - new Date(ts)) / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins/60)}h ago`;
  return `${Math.floor(mins/1440)}d ago`;
}

// ─── Pulse dot component ──────────────────────────────────────────────────
function PulseDot({ color }) {
  return (
    <span style={{ position: "relative", display: "inline-block", width: 10, height: 10, flexShrink: 0 }}>
      <span style={{
        position: "absolute", inset: 0, borderRadius: "50%", background: color,
        animation: "ping 1.4s cubic-bezier(0,0,0.2,1) infinite", opacity: 0.5
      }} />
      <span style={{ position: "absolute", inset: 1, borderRadius: "50%", background: color }} />
    </span>
  );
}

// ─── Alert Card ───────────────────────────────────────────────────────────
function AlertCard({ event, isNew }) {
  const s    = SEV[event.severity] || SEV.LOW;
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background:    hov ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
        border:        `1px solid ${hov ? s.color + "60" : "rgba(255,255,255,0.07)"}`,
        borderLeft:    `3px solid ${s.color}`,
        borderRadius:  10,
        padding:       "14px 16px",
        cursor:        "pointer",
        transition:    "all 0.2s ease",
        animation:     isNew ? "slideIn 0.4s ease" : undefined,
        boxShadow:     hov ? `0 4px 20px ${s.glow}` : "none",
        position:      "relative",
        overflow:      "hidden",
      }}
      onClick={() => event.url && window.open(event.url, "_blank")}
    >
      {isNew && (
        <div style={{
          position: "absolute", top: 8, right: 10,
          background: s.color, color: "#000", fontSize: 9,
          fontWeight: 800, padding: "2px 6px", borderRadius: 4, letterSpacing: 1
        }}>NEW</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <PulseDot color={s.color} />
            <span style={{
              color: s.color, fontSize: 10, fontWeight: 800,
              letterSpacing: "1.5px", textTransform: "uppercase"
            }}>{s.label}</span>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>•</span>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>
              {event.type.replace("_", " ")}
            </span>
          </div>
          <div style={{
            color: "#e8e8e8", fontSize: 13, fontWeight: 500,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
          }}>
            📍 {event.location.name}
          </div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 4 }}>
            {timeAgo(event.timestamp)} · Depth: {event.depth}km · Source: {event.source}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            fontSize: 28, fontWeight: 800, color: s.color,
            lineHeight: 1, fontVariantNumeric: "tabular-nums",
            textShadow: `0 0 20px ${s.glow}`
          }}>
            M{event.magnitude?.toFixed(1)}
          </div>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 2 }}>magnitude</div>
        </div>
      </div>
    </div>
  );
}

// ─── World Map SVG (simplified marker map) ───────────────────────────────
function WorldMap({ events }) {
  // Convert lat/lng to SVG coordinates (simple equirectangular projection)
  const toXY = (lat, lng) => ({
    x: ((lng + 180) / 360) * 800,
    y: ((90 - lat) / 180) * 400,
  });

  const dots = events.slice(0, 80).map(e => ({
    ...toXY(e.location.lat, e.location.lng),
    sev: e.severity,
    mag: e.magnitude,
    name: e.location.name,
    id: e.eventId,
  }));

  const [hover, setHover] = useState(null);

  return (
    <div style={{ position: "relative", background: "rgba(0,0,0,0.3)", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>
          🌍 Live Global Map
        </span>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{events.length} events plotted</span>
      </div>
      <svg viewBox="0 0 800 400" style={{ width: "100%", display: "block" }}>
        {/* Ocean background */}
        <rect width="800" height="400" fill="#0a0f1e" />
        {/* Simple continent outlines (approximate) */}
        <g opacity="0.12" fill="rgba(100,140,200,0.8)">
          {/* North America */}
          <path d="M130,60 L200,50 L240,70 L260,120 L240,160 L200,180 L160,200 L130,190 L110,160 L100,120 L110,80 Z" />
          {/* South America */}
          <path d="M190,210 L230,200 L250,240 L240,300 L210,350 L180,340 L165,290 L170,240 Z" />
          {/* Europe */}
          <path d="M370,50 L430,45 L450,80 L420,100 L380,95 L360,70 Z" />
          {/* Africa */}
          <path d="M380,110 L440,105 L460,150 L450,230 L420,270 L390,260 L365,200 L360,150 Z" />
          {/* Asia */}
          <path d="M450,40 L620,35 L660,80 L650,140 L600,160 L540,150 L490,120 L455,90 Z" />
          {/* Australia */}
          <path d="M590,250 L660,245 L680,290 L650,320 L600,310 L575,280 Z" />
        </g>
        {/* Grid lines */}
        {[0,1,2,3].map(i => (
          <line key={i} x1={0} y1={i*100} x2={800} y2={i*100} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        ))}
        {[0,1,2,3,4].map(i => (
          <line key={i} x1={i*200} y1={0} x2={i*200} y2={400} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        ))}
        {/* Event dots */}
        {dots.map((dot, i) => {
          const s   = SEV[dot.sev] || SEV.LOW;
          const r   = Math.max(3, Math.min(10, (dot.mag || 4) - 2));
          const isH = hover === dot.id;
          return (
            <g key={dot.id}
              onMouseEnter={() => setHover(dot.id)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Pulse ring */}
              <circle cx={dot.x} cy={dot.y} r={r * 2.5} fill={s.color} opacity="0.15"
                style={{ animation: `mapPing 2s ease-in-out ${i * 0.1}s infinite` }} />
              {/* Core dot */}
              <circle cx={dot.x} cy={dot.y} r={isH ? r + 2 : r}
                fill={s.color} opacity={isH ? 1 : 0.8}
                filter={isH ? `drop-shadow(0 0 6px ${s.color})` : undefined}
              />
              {/* Tooltip */}
              {isH && (
                <g>
                  <rect x={dot.x + 8} y={dot.y - 20} width={140} height={36} rx={4}
                    fill="#1a2035" stroke={s.color} strokeWidth={1} opacity={0.95} />
                  <text x={dot.x + 14} y={dot.y - 7} fill={s.color} fontSize={9} fontWeight="bold">
                    M{dot.mag?.toFixed(1)} — {dot.sev}
                  </text>
                  <text x={dot.x + 14} y={dot.y + 6} fill="rgba(255,255,255,0.6)" fontSize={8}>
                    {dot.name?.slice(0, 22)}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Subscribe Panel ──────────────────────────────────────────────────────
function SubscribePanel() {
  const [email,     setEmail]     = useState("");
  const [severity,  setSeverity]  = useState("HIGH");
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);

  const handleSubmit = async () => {
    if (!email.includes("@")) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 800)); // Simulate API call
    setSubmitted(true);
    setLoading(false);
  };

  if (submitted) return (
    <div style={{ textAlign: "center", padding: "24px 16px" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
      <div style={{ color: "#30d158", fontWeight: 700 }}>Subscribed!</div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4 }}>
        You'll receive alerts for {severity}+ severity events
      </div>
    </div>
  );

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 14 }}>
        📬 Get Notified
      </div>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="your@email.com"
        style={{
          width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
          color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box",
          marginBottom: 10,
        }}
      />
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 6 }}>Min. severity:</div>
        <div style={{ display: "flex", gap: 6 }}>
          {["MEDIUM", "HIGH", "CRITICAL"].map(s => (
            <button key={s} onClick={() => setSeverity(s)} style={{
              flex: 1, padding: "6px 4px", borderRadius: 6, border: "none", cursor: "pointer",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
              background: severity === s ? SEV[s].color : "rgba(255,255,255,0.06)",
              color:      severity === s ? "#000" : "rgba(255,255,255,0.5)",
              transition: "all 0.15s",
            }}>{s}</button>
          ))}
        </div>
      </div>
      <button
        onClick={handleSubmit}
        disabled={loading || !email.includes("@")}
        style={{
          width: "100%", padding: "10px", borderRadius: 8, border: "none",
          background: email.includes("@") ? "linear-gradient(135deg, #ff2d55, #ff9f0a)" : "rgba(255,255,255,0.08)",
          color: email.includes("@") ? "#fff" : "rgba(255,255,255,0.3)",
          fontWeight: 700, fontSize: 13, cursor: email.includes("@") ? "pointer" : "not-allowed",
          transition: "all 0.2s",
        }}
      >
        {loading ? "Subscribing…" : "Subscribe to Alerts"}
      </button>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────
export default function App() {
  const { events, stats, loading, lastFetch, newAlerts } = useDisasters();
  const [filter,   setFilter]   = useState("ALL");
  const [toast,    setToast]    = useState(null);
  const [tick,     setTick]     = useState(0);
  const newIds = useRef(new Set());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Show toast for new alerts
  useEffect(() => {
    if (newAlerts.length > 0) {
      const a = newAlerts[0];
      setToast(a);
      setTimeout(() => setToast(null), 5000);
      newAlerts.forEach(e => newIds.current.add(e.eventId));
      setTimeout(() => newIds.current.clear(), 10000);
    }
  }, [newAlerts]);

  const filtered = filter === "ALL" ? events :
    filter === "CRITICAL" || filter === "HIGH" ? events.filter(e => e.severity === filter) :
    events.filter(e => e.type === filter);

  return (
    <div style={{ minHeight: "100vh", background: "#080d1a", fontFamily: "'SF Pro Display', 'Segoe UI', system-ui, sans-serif", color: "#fff" }}>

      {/* CSS Animations */}
      <style>{`
        @keyframes ping { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:0;transform:scale(2)} }
        @keyframes mapPing { 0%,100%{opacity:.15;transform:scale(1)} 50%{opacity:0;transform:scale(2)} }
        @keyframes slideIn { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scanline { 0%{top:-2px} 100%{top:100%} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:2px}
        input::placeholder{color:rgba(255,255,255,0.25)}
      `}</style>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: "#1a2035", border: `1px solid ${SEV[toast.severity]?.color}`,
          borderRadius: 12, padding: "14px 18px", maxWidth: 320,
          boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${SEV[toast.severity]?.color}22`,
          animation: "slideDown 0.3s ease",
        }}>
          <div style={{ color: SEV[toast.severity]?.color, fontWeight: 800, fontSize: 12, letterSpacing: 1 }}>
            🚨 NEW ALERT — {toast.severity}
          </div>
          <div style={{ color: "#e8e8e8", fontSize: 13, marginTop: 4 }}>{toast.location.name}</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>
            M{toast.magnitude?.toFixed(1)} · {toast.type}
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{
        padding: "0 24px", height: 60, display: "flex", alignItems: "center",
        justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(8,13,26,0.9)", backdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 16,
            background: "linear-gradient(135deg, #ff2d55, #ff9f0a)",
          }}>🌍</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.3px" }}>DisasterAlert</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, letterSpacing: "0.5px" }}>REAL-TIME MONITORING</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* Live indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PulseDot color="#30d158" />
            <span style={{ color: "#30d158", fontSize: 11, fontWeight: 700 }}>LIVE</span>
          </div>

          {/* Clock */}
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
            {new Date().toUTCString().slice(17, 25)} UTC
          </div>

          {/* Last fetch */}
          {lastFetch && (
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>
              Updated {timeAgo(lastFetch)}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", minHeight: "calc(100vh - 60px)", gap: 0 }}>

        {/* Left: Map + Filters + Event List */}
        <div style={{ padding: 24, overflowY: "auto", borderRight: "1px solid rgba(255,255,255,0.06)" }}>

          {/* Stats Bar */}
          {stats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Total Events", value: stats.total,    color: "rgba(255,255,255,0.8)" },
                { label: "Critical",     value: stats.critical, color: SEV.CRITICAL.color },
                { label: "High",         value: stats.high,     color: SEV.HIGH.color },
                { label: "Medium",       value: stats.medium,   color: SEV.MEDIUM.color },
                { label: "Low",          value: stats.low,      color: SEV.LOW.color },
              ].map(stat => (
                <div key={stat.label} style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10, padding: "12px 14px", textAlign: "center"
                }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: stat.color, lineHeight: 1 }}>
                    {stat.value}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 4, letterSpacing: "0.5px" }}>
                    {stat.label.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* World Map */}
          {!loading && <div style={{ marginBottom: 20 }}><WorldMap events={events} /></div>}

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {["ALL", "CRITICAL", "HIGH", "EARTHQUAKE"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "6px 14px", borderRadius: 20, border: "1px solid",
                fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                borderColor: filter === f ? (SEV[f]?.color || "#fff") : "rgba(255,255,255,0.12)",
                background:  filter === f ? (SEV[f]?.bg  || "rgba(255,255,255,0.1)") : "transparent",
                color:       filter === f ? (SEV[f]?.color || "#fff") : "rgba(255,255,255,0.4)",
              }}>{f}</button>
            ))}
            <div style={{ marginLeft: "auto", color: "rgba(255,255,255,0.25)", fontSize: 11, alignSelf: "center" }}>
              Showing {filtered.length} events
            </div>
          </div>

          {/* Event list */}
          {loading ? (
            <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🌐</div>
              <div>Fetching live disaster data…</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map(event => (
                <AlertCard key={event.eventId} event={event} isNew={newIds.current.has(event.eventId)} />
              ))}
              {filtered.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                  ✅ No events matching this filter
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ display: "flex", flexDirection: "column" }}>

          {/* Subscribe panel */}
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <SubscribePanel />
          </div>

          {/* Architecture info panel */}
          <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>
              ☁️ Architecture
            </div>
            {[
              { icon: "⚡", label: "EventBridge", desc: "Cron: every 5 min" },
              { icon: "λ", label: "Lambda",      desc: "Serverless compute" },
              { icon: "📡", label: "SNS",         desc: "Fan-out alerts" },
              { icon: "🗄️", label: "DynamoDB",    desc: "NoSQL event store" },
              { icon: "📧", label: "SES / SMS",   desc: "Email/SMS delivery" },
            ].map(item => (
              <div key={item.label} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)"
              }}>
                <div style={{ width: 28, height: 28, background: "rgba(255,255,255,0.06)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>
                  {item.icon}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#e8e8e8" }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Recent critical alerts */}
          <div style={{ padding: 16, flex: 1, overflowY: "auto" }}>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>
              🔥 Critical Events
            </div>
            {events.filter(e => e.severity === "CRITICAL" || e.severity === "HIGH").slice(0, 8).map(e => {
              const s = SEV[e.severity];
              return (
                <div key={e.eventId} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)"
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: s.color, fontSize: 10, fontWeight: 700, marginBottom: 1 }}>{e.severity}</div>
                    <div style={{ color: "#e8e8e8", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.location.name}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{timeAgo(e.timestamp)}</div>
                  </div>
                  <div style={{ color: s.color, fontWeight: 800, fontSize: 16, flexShrink: 0, marginLeft: 8 }}>
                    M{e.magnitude?.toFixed(1)}
                  </div>
                </div>
              );
            })}
            {events.filter(e => e.severity === "CRITICAL" || e.severity === "HIGH").length === 0 && !loading && (
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, textAlign: "center", padding: "20px 0" }}>
                ✅ No critical events right now
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, textAlign: "center", lineHeight: 1.6 }}>
              Data: USGS Earthquake Catalog<br/>
              Refreshes every 30 seconds · Cloud-native Architecture
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
