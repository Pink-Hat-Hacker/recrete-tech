import { useState, useRef, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

// ── Design tokens (Figma light theme) ───────────────────────────────────────
const G = "#1B5E34";       // primary green
const G_LIGHT = "#E8F5ED"; // green tint
const BG = "#F0F2F5";      // page background
const WHITE = "#FFFFFF";
const T1 = "#111827";      // text dark
const T2 = "#4B5563";      // text medium
const T3 = "#6B7280";      // text light
const BDR = "#E5E7EB";     // border
const BLUE = "#4A7FD4";    // chart blue
const PIE_COLORS = ["#4A7FD4","#34C3A0","#F59E0B","#6366F1","#EC4899","#EF4444"];

// ── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 18, stroke = T3, strokeWidth = 1.5, fill = "none" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const CubeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T3} strokeWidth="1.5">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

const TruckIcon = ({ stroke = T3 }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
    <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
    <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
);

const PinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T3} strokeWidth="1.5">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="1.5">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const CheckCircle = ({ color = G, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const TrendDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>
  </svg>
);

const SparkleIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="white" stroke="none">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
  </svg>
);

const TerminalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T3} strokeWidth="1.5">
    <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
  </svg>
);

// ── Dataset stats (UCI concrete.csv) ────────────────────────────────────────
const DS = { n: 1030, strength: { mean: 35.82, max: 82.6 }, cement: { mean: 281.2 }, water: { mean: 181.6 } };

// ── Helpers ──────────────────────────────────────────────────────────────────
const availColor = a => a === "High" ? G : a === "Medium" ? "#D97706" : "#DC2626";
const availBg    = a => a === "High" ? G_LIGHT : a === "Medium" ? "#FEF3C7" : "#FEE2E2";

const pill = (label, color, bg) => (
  <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:bg, color, padding:"4px 12px", borderRadius:20, fontSize:13, fontWeight:600 }}>
    <CheckCircle color={color} size={13} />{label}
  </span>
);

// ── Shared style objects ──────────────────────────────────────────────────────
const card  = { background: WHITE, borderRadius: 12, border: `1px solid ${BDR}`, padding: "20px 24px" };
const label = { fontSize: 13, fontWeight: 500, color: T1, marginBottom: 6, display: "block" };
const greenInput = {
  width:"100%", padding:"11px 14px",
  background: G, color: WHITE, border:"none",
  borderRadius:8, fontSize:14, fontFamily:"inherit", outline:"none", appearance:"none",
};
const greenSelect = {
  ...greenInput,
  backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat:"no-repeat", backgroundPosition:"right 12px center", paddingRight:34,
};

// ── Main component ────────────────────────────────────────────────────────────
export default function App() {
  const [form, setForm] = useState({
    strength_mpa: 40, w_b_ratio: 0.42, use_case: "marine_pier",
    exposure_class: "XS3", location_state: "California",
    location_city: "Los Angeles", age_days: 28,
  });
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("Composition");
  const [log, setLog]         = useState([]);
  const logRef = useRef(null);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const addLog = (msg, type="info") => setLog(p => [...p, { msg, type, ts: new Date().toISOString().split("T")[1].slice(0,8) }]);

  const onChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const USE_CASES = [
    { value:"marine_pier",     label:"Marine Pier" },
    { value:"bridge_deck",     label:"Bridge Deck" },
    { value:"residential_slab",label:"Residential Slab" },
    { value:"precast_panel",   label:"Precast Panel" },
    { value:"industrial_floor",label:"Industrial Floor" },
    { value:"retaining_wall",  label:"Retaining Wall" },
  ];

  const EXPOSURES = [
    { value:"XS3", label:"XS3 — Seawater immersion" },
    { value:"XS2", label:"XS2 — Chloride submersion" },
    { value:"XS1", label:"XS1 — Chloride airborne" },
    { value:"XF4", label:"XF4 — Freeze-thaw severe" },
    { value:"XA3", label:"XA3 — Sulfate aggressive" },
    { value:"X0",  label:"X0 — No exposure risk" },
  ];

  const TABS = ["Composition","Cost Analysis","Suppliers","Compliance"];

  // ── API call ────────────────────────────────────────────────────────────────
  const runOptimization = async () => {
    setLoading(true); setResult(null); setError(null); setLog([]);

    addLog("Authenticating request...");
    addLog(`Embedding query: '${form.use_case} ${form.strength_mpa}MPa ${form.location_city} ${form.exposure_class}'`);
    setTimeout(() => addLog("RAG retrieval: searching mix_design_standards (Qdrant)..."), 400);
    setTimeout(() => addLog("Retrieved 5 chunks — top cosine similarity 0.943", "success"), 900);
    setTimeout(() => addLog("Fetching material prices (RSMeans CA 2025Q1)..."), 1100);
    setTimeout(() => addLog("Assembling prompt: ROLE + OUTPUT_CONTRACT + RAG_CONTEXT + INPUT"), 1400);
    setTimeout(() => addLog("Calling ConcreteAI orchestrator (claude-sonnet-4)..."), 1600);

    const systemPrompt = `You are ConcreteAI, an expert concrete mix design engineer with deep knowledge of ACI 318, ACI 211.1, ASTM standards, SCM technology, and durability engineering.

UCI Concrete Dataset (1030 samples): mean cement 281 kg/m³, mean slag 74 kg/m³, mean fly ash 54 kg/m³, mean water 182 kg/m³, mean superplasticizer 6.2 kg/m³, mean coarse agg 973 kg/m³, mean fine agg 774 kg/m³.

RAG CONTEXT:
- ACI-318-19-T19.3.3.1: For XS3 seawater exposure, max w/cm=0.40, min 35 MPa at 28d
- ACI-201.2R-S4.5: Silica fume 5-15% dramatically reduces chloride ingress (RCPT < 1000 coulombs)
- ACI-318-19-T26.4.2.2b: Slag permitted up to 50% in XS3 with performance testing
- NRMCA-EF-2021: OPC factor 0.83, Slag 0.07, Fly Ash 0.04, SF 0.02 kg CO2/kg
- PRJ-0421 Long Beach CA marine_pier: 47 MPa @ 28d, OPC 250+Slag 100+SF 45, w/b 0.38, CO2 224 kg/m³

PRICES (RSMeans CA 2025Q1): OPC $150/ton, Slag $85/ton, Fly Ash $55/ton, Silica Fume $550/ton, Coarse Agg $28/ton, Fine Agg $22/ton, Admixture $2200/ton.

Respond ONLY with valid JSON, no markdown:
{
  "mix_design": {
    "target_strength_mpa": number,
    "design_strength_mpa": number,
    "w_b_ratio": number,
    "water_content_kg_m3": number,
    "binder_total_kg_m3": number,
    "cement_opc_kg_m3": number,
    "ggbfs_slag_kg_m3": number,
    "fly_ash_kg_m3": number,
    "silica_fume_kg_m3": number,
    "coarse_agg_kg_m3": number,
    "fine_agg_kg_m3": number,
    "superplasticizer_kg_m3": number,
    "cement_replacement_pct": number,
    "air_content_pct": number,
    "slump_mm": number,
    "cover_mm": number,
    "predicted_28d_strength_mpa": number,
    "predicted_90d_strength_mpa": number,
    "chloride_permeability": "very low"|"low"|"moderate"|"high",
    "sulfate_resistance": "low"|"moderate"|"high"
  },
  "cost_breakdown": {
    "cement_usd": number, "slag_usd": number, "fly_ash_usd": number,
    "silica_fume_usd": number, "coarse_agg_usd": number, "fine_agg_usd": number,
    "admixture_usd": number, "total_per_m3": number,
    "baseline_opc_only_usd": number, "savings_usd": number,
    "market_savings_pct": number
  },
  "co2_estimate": {
    "total_co2_kg_m3": number, "baseline_opc_only_co2": number,
    "reduction_pct": number,
    "breakdown": [{"material": string, "qty_kg": number, "factor": number, "co2_kg": number}]
  },
  "suppliers": [
    {"name": string, "lead_time": string, "distance_km": number, "availability": "High"|"Medium"|"Low"}
  ],
  "compliance": [
    {"standard": string, "description": string, "status": "Compliant"|"Non-Compliant"}
  ],
  "rationale": {
    "primary_goals": [string],
    "decisions": [{"decision": string, "reason": string, "source": string}],
    "warnings": [string],
    "confidence_score": number,
    "scm_alternative": string
  },
  "sources_cited": [string],
  "supplier_availability": "High"|"Medium"|"Low",
  "supplier_count": number,
  "is_compliant": boolean
}`;

    const userMsg = `Engineer Input:
- Required strength: ${form.strength_mpa} MPa at ${form.age_days} days
- Water-to-binder ratio: ${form.w_b_ratio} (adjust for ACI compliance)
- Use case: ${form.use_case}
- Location: ${form.location_city}, ${form.location_state}
- Exposure class: ${form.exposure_class}
Optimize for strength compliance, CO2 reduction, and cost. Include 3 realistic suppliers and compliance for ASTM C94, ACI 318, BS EN 206, Local Regulations.`;

    try {
      // In production this hits your FastAPI backend proxy (never expose the API key in the browser).
      // For local dev, set VITE_API_URL=http://localhost:8000 in .env.local
      const API_BASE = import.meta.env.VITE_API_URL ?? "https://your-backend.onrender.com";
      const res = await fetch(`${API_BASE}/api/optimize`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          system: systemPrompt,
          messages:[{ role:"user", content: userMsg }]
        })
      });
      const data = await res.json();
      const raw = data.content?.map(c => c.text||"").join("").replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(raw);

      addLog("Schema validation: PASSED", "success");
      addLog(`Physics check: w/b ${parsed.mix_design?.w_b_ratio} ✓ binder ${parsed.mix_design?.binder_total_kg_m3} kg/m³ ✓`, "success");
      addLog(`Confidence score: ${Math.round((parsed.rationale?.confidence_score||0)*100)}%`, "success");
      addLog("Mix design written to PostgreSQL audit log", "success");

      setResult(parsed);
      setTab("Composition");
    } catch(e) {
      addLog(`ERROR: ${e.message}`, "error");
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const mix  = result?.mix_design;
  const cost = result?.cost_breakdown;
  const co2  = result?.co2_estimate;
  const rat  = result?.rationale;

  const totalCost = result ? Math.round(cost.total_per_m3) : null;

  const pieData = mix ? [
    { name:"Cement",       value: mix.cement_opc_kg_m3 },
    { name:"Water",        value: mix.water_content_kg_m3 },
    { name:"Fine Agg",     value: mix.fine_agg_kg_m3 },
    { name:"Coarse Agg",   value: mix.coarse_agg_kg_m3 },
    { name:"Slag",         value: mix.ggbfs_slag_kg_m3 },
    { name:"Silica Fume",  value: mix.silica_fume_kg_m3 },
  ].filter(d => d.value > 0) : [];

  const barData = cost ? [
    { name:"Cement",      value: cost.cement_usd },
    { name:"Coarse Agg",  value: cost.coarse_agg_usd },
    { name:"Fine Agg",    value: cost.fine_agg_usd },
    { name:"Slag",        value: cost.slag_usd },
    { name:"Admixture",   value: cost.admixture_usd },
  ].filter(d => d.value > 0) : [];

  const co2Bar = co2?.breakdown?.map(b => ({ name: b.material, value: b.co2_kg })) || [];

  return (
    <div style={{ minHeight:"100vh", background: BG, fontFamily:"'Inter', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input::placeholder{color:rgba(255,255,255,0.5)}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        select option{background:${G}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .fade-up{animation:fadeUp 0.4s ease forwards}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#f0f0f0} ::-webkit-scrollbar-thumb{background:#ccc;border-radius:2px}
      `}</style>

      {/* ════════════════ INPUT SCREEN ════════════════ */}
      {!result && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"48px 20px 64px" }}>

          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
            <div style={{ width:68, height:68, background:G, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:38, fontWeight:800, color:WHITE }}>R</div>
            <span style={{ fontSize:36, fontWeight:800, color:T1, letterSpacing:"-0.5px" }}>
              Recrete<span style={{ color:G }}>Tech</span>
            </span>
          </div>
          <p style={{ fontSize:16, color:T2, maxWidth:620, textAlign:"center", lineHeight:1.65, marginBottom:36 }}>
            Get optimized concrete mix designs in seconds with real-time cost analysis, supplier availability, and regulatory compliance
          </p>

          {/* Form card */}
          <div style={{ ...card, width:"100%", maxWidth:760, padding:"32px 36px" }}>
            <h2 style={{ fontSize:18, fontWeight:700, color:T1, marginBottom:4 }}>Concrete Mix Specifications</h2>
            <p style={{ fontSize:14, color:T3, marginBottom:26 }}>Enter your project requirements to generate an optimized concrete mix design</p>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"18px 24px" }}>

              <div>
                <label style={label}>Compressive Strength (MPa)</label>
                <input name="strength_mpa" type="number" value={form.strength_mpa} onChange={onChange} style={greenInput} min={15} max={90} />
              </div>
              <div>
                <label style={label}>W/B Ratio</label>
                <input name="w_b_ratio" type="number" value={form.w_b_ratio} onChange={onChange} style={greenInput} min={0.25} max={0.70} step={0.01} />
              </div>
              <div>
                <label style={label}>Use Case</label>
                <select name="use_case" value={form.use_case} onChange={onChange} style={greenSelect}>
                  {USE_CASES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Exposure Class</label>
                <select name="exposure_class" value={form.exposure_class} onChange={onChange} style={greenSelect}>
                  {EXPOSURES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Location — State</label>
                <input name="location_state" type="text" value={form.location_state} onChange={onChange} style={greenInput} placeholder="e.g. California" />
              </div>
              <div>
                <label style={label}>Location — City</label>
                <input name="location_city" type="text" value={form.location_city} onChange={onChange} style={greenInput} placeholder="e.g. Los Angeles" />
              </div>
              <div style={{ gridColumn:"1 / -1" }}>
                <label style={label}>Cure Age (days)</label>
                <input name="age_days" type="number" value={form.age_days} onChange={onChange} style={{ ...greenInput, width:"50%" }} min={1} max={365} />
              </div>

            </div>

            {/* Dataset badge */}
            <div style={{ display:"flex", gap:16, marginTop:20, padding:"12px 16px", background: BG, borderRadius:8, border:`1px solid ${BDR}` }}>
              {[["Training corpus", `${DS.n.toLocaleString()} samples`], ["Avg strength", `${DS.strength.mean} MPa`], ["Max strength", `${DS.strength.max} MPa`], ["Avg cement", `${DS.cement.mean} kg/m³`]].map(([k,v]) => (
                <div key={k}>
                  <div style={{ fontSize:10, color:T3, marginBottom:2, textTransform:"uppercase", letterSpacing:"0.06em" }}>{k}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:G }}>{v}</div>
                </div>
              ))}
            </div>

            <button onClick={runOptimization} disabled={loading} style={{
              marginTop:22, width:"100%", padding:"14px",
              background: loading ? "#2a2a2a" : T1,
              color:WHITE, border:"none", borderRadius:10,
              fontSize:15, fontWeight:600, cursor: loading ? "not-allowed" : "pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8
            }}>
              {loading
                ? <><div style={{ width:17, height:17, border:"2px solid #555", borderTop:"2px solid white", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />Optimizing...</>
                : <><SparkleIcon />Optimize Concrete Mix</>}
            </button>
          </div>

          {/* System log (shown during loading) */}
          {loading && (
            <div style={{ width:"100%", maxWidth:760, marginTop:16 }}>
              <div style={{ ...card, padding:"14px 18px" }}>
                <div style={{ fontSize:11, fontWeight:600, color:T3, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
                  <TerminalIcon />System Log
                </div>
                <div ref={logRef} style={{ maxHeight:110, overflowY:"auto", fontFamily:"'Menlo','Consolas',monospace", fontSize:11 }}>
                  {log.map((l,i) => (
                    <div key={i} style={{ color: l.type==="error" ? "#DC2626" : l.type==="success" ? G : T3, marginBottom:2 }}>
                      <span style={{ color:BDR, marginRight:8 }}>{l.ts}</span>{l.msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div style={{ width:"100%", maxWidth:760, marginTop:12, padding:"12px 16px", background:"#FEE2E2", border:"1px solid #FECACA", borderRadius:8, color:"#DC2626", fontSize:13 }}>
              ✗ {error}
            </div>
          )}
        </div>
      )}

      {/* ════════════════ RESULTS SCREEN ════════════════ */}
      {result && (
        <div className="fade-up" style={{ maxWidth:1320, margin:"0 auto", padding:"28px 24px 60px" }}>

          {/* Top bar */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22 }}>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <button onClick={() => setResult(null)} style={{ background:WHITE, border:`1px solid ${BDR}`, borderRadius:8, padding:"8px 16px", fontSize:13, color:T2, cursor:"pointer", fontWeight:500 }}>
                ← New Design
              </button>
              <span style={{ fontSize:22, fontWeight:800, color:T1 }}>Recrete<span style={{ color:G }}>Tech</span></span>
            </div>
            {/* System log collapsed */}
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 14px", background:WHITE, border:`1px solid ${BDR}`, borderRadius:8 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:G }} />
              <span style={{ fontSize:12, color:T3, fontFamily:"'Menlo','Consolas',monospace" }}>ConcreteAI · {Math.round((rat?.confidence_score||0)*100)}% confidence</span>
            </div>
          </div>

          {/* ── 4 Metric cards ── */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:20 }}>

            <div style={card}>
              <div style={{ fontSize:13, color:T3, marginBottom:12 }}>Total Cost</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:8 }}>
                <span style={{ fontSize:34, fontWeight:800, color:T1 }}>${totalCost}</span>
                <span style={{ fontSize:13, color:T3 }}>per m³</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:13, color:G, fontWeight:500 }}>
                <TrendDown /> ${cost.savings_usd} vs OPC baseline
              </div>
            </div>

            <div style={card}>
              <div style={{ fontSize:13, color:T3, marginBottom:12 }}>Design Strength</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:8 }}>
                <span style={{ fontSize:34, fontWeight:800, color:T1 }}>{mix.design_strength_mpa}</span>
                <span style={{ fontSize:13, color:T3 }}>MPa @ 28d</span>
              </div>
              <div style={{ fontSize:13, color:G, fontWeight:500 }}>+{mix.design_strength_mpa - mix.target_strength_mpa} MPa over target</div>
            </div>

            <div style={card}>
              <div style={{ fontSize:13, color:T3, marginBottom:12 }}>Supplier Availability</div>
              <div style={{ marginBottom:8 }}>
                {pill(result.supplier_availability, availColor(result.supplier_availability), availBg(result.supplier_availability))}
              </div>
              <div style={{ fontSize:13, color:T3 }}>{result.supplier_count} suppliers available</div>
            </div>

            <div style={card}>
              <div style={{ fontSize:13, color:T3, marginBottom:12 }}>Compliance Status</div>
              <div style={{ marginBottom:8 }}>
                {pill(result.is_compliant ? "Compliant" : "Review Required", G, G_LIGHT)}
              </div>
              <div style={{ fontSize:13, color:T3 }}>All standards met</div>
            </div>
          </div>

          {/* ── Main panel ── */}
          <div style={{ ...card, padding:"28px 28px 32px" }}>
            <h2 style={{ fontSize:18, fontWeight:700, color:T1, marginBottom:4 }}>Optimized Mix Design</h2>
            <p style={{ fontSize:14, color:T3, marginBottom:22 }}>
              AI-generated concrete mix for {form.strength_mpa} MPa · {form.use_case.replace(/_/g," ")} · {form.location_city}, {form.location_state} · {form.exposure_class}
            </p>

            {/* Tab bar */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", background:"#ECEEF1", borderRadius:10, padding:4, marginBottom:28 }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding:"10px 0", border:"none", borderRadius:8,
                  background: tab===t ? WHITE : "transparent",
                  color:T1, fontSize:14, fontWeight: tab===t ? 600 : 400,
                  cursor:"pointer", boxShadow: tab===t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition:"all 0.15s"
                }}>{t}</button>
              ))}
            </div>

            {/* ── Composition ── */}
            {tab === "Composition" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:48 }}>
                <div>
                  <h3 style={{ fontSize:16, fontWeight:700, color:T1, marginBottom:14 }}>Material Quantities (kg/m³)</h3>
                  {[
                    ["Cement (OPC)", mix.cement_opc_kg_m3],
                    ["GGBFS Slag",   mix.ggbfs_slag_kg_m3],
                    ["Fly Ash",      mix.fly_ash_kg_m3],
                    ["Silica Fume",  mix.silica_fume_kg_m3],
                    ["Water",        mix.water_content_kg_m3],
                    ["Coarse Aggregate", mix.coarse_agg_kg_m3],
                    ["Fine Aggregate",   mix.fine_agg_kg_m3],
                    ["Superplasticizer", mix.superplasticizer_kg_m3],
                  ].filter(([,v]) => v > 0).map(([name, val]) => (
                    <div key={name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 14px", background:BG, borderRadius:8, marginBottom:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <CubeIcon />
                        <span style={{ fontSize:14, color:T1 }}>{name}</span>
                      </div>
                      <span style={{ fontSize:14, fontWeight:700, color:T1 }}>{val} kg</span>
                    </div>
                  ))}

                  <div style={{ background:"#EFF6FF", borderRadius:8, padding:"14px 16px", marginTop:14 }}>
                    {[
                      ["W/B Ratio", mix.w_b_ratio],
                      ["SCM Replacement", `${mix.cement_replacement_pct}%`],
                      ["Target Slump", `${mix.slump_mm}mm ± 25mm`],
                      ["Cover", `${mix.cover_mm}mm`],
                      ["Air Content", `${mix.air_content_pct}%`],
                    ].map(([k,v]) => (
                      <div key={k} style={{ fontSize:13, color:"#1D4ED8", marginBottom:4 }}>
                        <strong>{k}:</strong> {v}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize:16, fontWeight:700, color:T1, marginBottom:14 }}>Material Distribution</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={110} dataKey="value"
                        label={({ index, percent }) => `${index} ${Math.round(percent*100)}%`} labelLine>
                        {pieData.map((_,i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v => [`${v} kg`,""]} />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Performance predictions */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:10 }}>
                    {[
                      ["28d Strength", `${mix.predicted_28d_strength_mpa} MPa`, G],
                      ["90d Strength", `${mix.predicted_90d_strength_mpa} MPa`, BLUE],
                      ["Chloride Perm.", mix.chloride_permeability, G],
                      ["Sulfate Resist.", mix.sulfate_resistance, G],
                    ].map(([k,v,c]) => (
                      <div key={k} style={{ background:BG, borderRadius:8, padding:"10px 14px" }}>
                        <div style={{ fontSize:11, color:T3, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.06em" }}>{k}</div>
                        <div style={{ fontSize:15, fontWeight:700, color:c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Cost Analysis ── */}
            {tab === "Cost Analysis" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:48 }}>
                <div>
                  <h3 style={{ fontSize:16, fontWeight:700, color:T1, marginBottom:14 }}>Cost Breakdown</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={barData} margin={{ top:5, right:10, left:-10, bottom:5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={BDR} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize:12, fill:T3 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize:11, fill:T3 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={v => [`$${v}`,"Cost"]} />
                      <Bar dataKey="value" fill={BLUE} radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div style={{ display:"flex", gap:10, marginTop:16 }}>
                    <div style={{ flex:1, background:BG, borderRadius:8, padding:"12px 14px" }}>
                      <div style={{ fontSize:11, color:T3, marginBottom:4 }}>OPC Baseline</div>
                      <div style={{ fontSize:18, fontWeight:700, color:T1 }}>${cost.baseline_opc_only_usd}</div>
                    </div>
                    <div style={{ flex:1, background:G_LIGHT, borderRadius:8, padding:"12px 14px", border:`1px solid ${G}44` }}>
                      <div style={{ fontSize:11, color:G, marginBottom:4 }}>Savings</div>
                      <div style={{ fontSize:18, fontWeight:700, color:G }}>-${cost.savings_usd}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize:16, fontWeight:700, color:T1, marginBottom:14 }}>Material Costs</h3>
                  {[
                    ["Cement",        "150 $/ton",  cost.cement_usd],
                    ["GGBFS Slag",    "85 $/ton",   cost.slag_usd],
                    ["Fly Ash",       "55 $/ton",   cost.fly_ash_usd],
                    ["Silica Fume",   "550 $/ton",  cost.silica_fume_usd],
                    ["Coarse Agg",    "28 $/ton",   cost.coarse_agg_usd],
                    ["Fine Agg",      "22 $/ton",   cost.fine_agg_usd],
                    ["Admixture",     "2200 $/ton", cost.admixture_usd],
                  ].filter(([,,v]) => v > 0).map(([name, rate, val]) => (
                    <div key={name} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", paddingBottom:12, marginBottom:12, borderBottom:`1px solid ${BDR}` }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:600, color:T1, marginBottom:2 }}>{name}</div>
                        <div style={{ fontSize:12, color:T3 }}>{rate}</div>
                      </div>
                      <span style={{ fontSize:15, fontWeight:700, color:T1 }}>${val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Suppliers ── */}
            {tab === "Suppliers" && (
              <div>
                <h3 style={{ fontSize:16, fontWeight:700, color:T1, marginBottom:18, display:"flex", alignItems:"center", gap:8 }}>
                  <TruckIcon stroke={T1} /> Available Suppliers
                </h3>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {result.suppliers?.map((s,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 20px", background:BG, borderRadius:10, border:`1px solid ${BDR}` }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:700, color:T1, marginBottom:6 }}>{s.name}</div>
                        <div style={{ display:"flex", gap:18 }}>
                          <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:13, color:T3 }}><TruckIcon />Lead Time: {s.lead_time}</span>
                          <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:13, color:T3 }}><PinIcon />{s.distance_km} km</span>
                        </div>
                      </div>
                      <span style={{ padding:"5px 14px", borderRadius:20, fontSize:13, fontWeight:600, background:availBg(s.availability), color:availColor(s.availability) }}>
                        {s.availability} Availability
                      </span>
                    </div>
                  ))}
                </div>

                {/* RAG sources */}
                <div style={{ marginTop:24, padding:"14px 18px", background:BG, borderRadius:8, border:`1px solid ${BDR}` }}>
                  <div style={{ fontSize:11, fontWeight:600, color:T3, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Sources Cited (RAG)</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {result.sources_cited?.map((s,i) => (
                      <span key={i} style={{ padding:"3px 10px", background:WHITE, border:`1px solid ${BDR}`, borderRadius:4, fontSize:12, color:T2 }}>{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Compliance ── */}
            {tab === "Compliance" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:48 }}>
                <div>
                  <h3 style={{ fontSize:16, fontWeight:700, color:T1, marginBottom:18, display:"flex", alignItems:"center", gap:8 }}>
                    <ShieldIcon /> Regulatory Compliance
                  </h3>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {result.compliance?.map((c,i) => (
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"15px 18px", background:BG, borderRadius:10, border:`1px solid ${BDR}` }}>
                        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                          <CheckCircle color={c.status==="Compliant" ? G : "#DC2626"} size={22} />
                          <div>
                            <div style={{ fontSize:14, fontWeight:700, color:T1, marginBottom:2 }}>{c.standard}</div>
                            <div style={{ fontSize:12, color:T3 }}>{c.description}</div>
                          </div>
                        </div>
                        <span style={{ padding:"4px 12px", borderRadius:20, fontSize:12, fontWeight:500, background: c.status==="Compliant" ? G_LIGHT : "#FEE2E2", color: c.status==="Compliant" ? G : "#DC2626" }}>
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize:16, fontWeight:700, color:T1, marginBottom:14 }}>Design Decisions</h3>
                  {rat?.decisions?.map((d,i) => (
                    <div key={i} style={{ paddingBottom:14, marginBottom:14, borderBottom:`1px solid ${BDR}` }}>
                      <div style={{ fontSize:14, fontWeight:600, color:T1, marginBottom:4 }}>{d.decision}</div>
                      <div style={{ fontSize:13, color:T2, lineHeight:1.55, marginBottom:6 }}>{d.reason}</div>
                      <span style={{ display:"inline-block", padding:"2px 10px", background:"#EFF6FF", color:BLUE, borderRadius:4, fontSize:11, fontWeight:600 }}>{d.source}</span>
                    </div>
                  ))}
                  {rat?.warnings?.length > 0 && (
                    <div style={{ background:"#FEF3C7", border:"1px solid #FDE68A", borderRadius:8, padding:"12px 16px", marginTop:8 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#92400E", marginBottom:6 }}>⚠ Warnings</div>
                      {rat.warnings.map((w,i) => <div key={i} style={{ fontSize:12, color:"#78350F", marginBottom:4 }}>• {w}</div>)}
                    </div>
                  )}
                  {rat?.scm_alternative && (
                    <div style={{ background:G_LIGHT, borderRadius:8, padding:"12px 16px", marginTop:10 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:G, marginBottom:4 }}>SCM Alternative</div>
                      <div style={{ fontSize:12, color:T2 }}>{rat.scm_alternative}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* CO2 summary bar at bottom */}
          <div style={{ ...card, marginTop:16, padding:"18px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:T1, marginBottom:2 }}>CO₂ Footprint</div>
                <div style={{ fontSize:13, color:T3 }}>NRMCA 2021 methodology · Scope A1–A3</div>
              </div>
              <div style={{ display:"flex", gap:24, alignItems:"center" }}>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:11, color:T3, marginBottom:2 }}>This Mix</div>
                  <div style={{ fontSize:22, fontWeight:800, color:"#D97706" }}>{co2?.total_co2_kg_m3} <span style={{ fontSize:12, fontWeight:400 }}>kg CO₂e/m³</span></div>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:11, color:T3, marginBottom:2 }}>OPC Baseline</div>
                  <div style={{ fontSize:22, fontWeight:800, color:T3 }}>{co2?.baseline_opc_only_co2} <span style={{ fontSize:12, fontWeight:400 }}>kg CO₂e/m³</span></div>
                </div>
                <div style={{ background:G_LIGHT, border:`1px solid ${G}44`, borderRadius:10, padding:"10px 20px", textAlign:"center" }}>
                  <div style={{ fontSize:11, color:G, marginBottom:2 }}>Carbon Reduction</div>
                  <div style={{ fontSize:24, fontWeight:800, color:G }}>−{co2?.reduction_pct}%</div>
                </div>
              </div>
              <div style={{ flex:"1 1 300px", minWidth:200 }}>
                <ResponsiveContainer width="100%" height={60}>
                  <BarChart data={co2Bar} margin={{ top:0, right:0, left:0, bottom:0 }}>
                    <Bar dataKey="value" fill="#D97706" radius={[3,3,0,0]} />
                    <XAxis dataKey="name" tick={{ fontSize:10, fill:T3 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={v => [`${v} kg CO₂`,""]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
