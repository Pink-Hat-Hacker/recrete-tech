"""
RecreteTech RAG Ingestion Pipeline
===================================
Reads source documents (CSV dataset, ACI text chunks, ASTM specs),
embeds them with OpenAI text-embedding-3-small, and upserts into
a local Qdrant collection.

Prerequisites:
  pip install qdrant-client openai pandas python-dotenv tqdm

Run:
  python ingest.py

The script is idempotent — re-running it will overwrite existing vectors
(same ID = same chunk hash), so it is safe to run after adding new docs.
"""

import hashlib, json, os, pathlib, textwrap
import pandas as pd
from dotenv import load_dotenv
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from tqdm import tqdm

load_dotenv()

OPENAI_KEY    = os.environ["OPENAI_API_KEY"]
QDRANT_URL    = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_KEY    = os.getenv("QDRANT_API_KEY", "")          # leave blank for local
COLLECTION    = "mix_design_standards"
EMBED_MODEL   = "text-embedding-3-small"
EMBED_DIM     = 1536
CHUNK_TOKENS  = 400   # approximate target chunk size

openai_client  = OpenAI(api_key=OPENAI_KEY)
qdrant_client  = QdrantClient(url=QDRANT_URL, api_key=QDRANT_KEY or None)


# ── Utilities ─────────────────────────────────────────────────────────────────

def chunk_id(text: str) -> str:
    """Stable ID from content hash — makes upserts idempotent."""
    #return hashlib.sha256(text.encode()).hexdigest()[:20]
    import uuid
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, text))

def embed(texts: list[str]) -> list[list[float]]:
    """Embed a batch of strings. Returns list of float vectors."""
    resp = openai_client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [r.embedding for r in resp.data]


def ensure_collection():
    existing = [c.name for c in qdrant_client.get_collections().collections]
    if COLLECTION not in existing:
        qdrant_client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )
        print(f"Created collection '{COLLECTION}'")
    else:
        print(f"Collection '{COLLECTION}' already exists — upserting")


def upsert_points(points: list[PointStruct]):
    # qdrant_client.upsert(collection_name=COLLECTION, points=points)
    for i in tqdm(range(0, len(points), 100)):
        batch = points[i:i + 100]
        qdrant_client.upsert(
            collection_name=COLLECTION,
            points=batch
        )


# ── Source 1: UCI Concrete CSV ────────────────────────────────────────────────

def ingest_csv(csv_path: str):
    """
    Each row in the dataset becomes one vector chunk.
    The natural-language representation makes it searchable by
    mix characteristics (strength, w/b ratio, ingredient quantities).
    """
    print(f"\n[1/3] Ingesting CSV: {csv_path}")
    df = pd.read_csv(csv_path)

    '''
    before = len(df)
    df = df.drop_duplicates()
    if len(df) < before:
        print(f"  Dropped {before - len(df)} duplicate rows ({before} → {len(df)})")
    print(f"  Loaded {len(df)} rows")
    '''
    
    # Rename columns if using the raw UCI names
    col_map = {
        "cement":       "cement_kg",
        "slag":         "slag_kg",
        "ash":          "fly_ash_kg",
        "water":        "water_kg",
        "superplastic": "superplasticizer_kg",
        "coarseagg":    "coarse_agg_kg",
        "fineagg":      "fine_agg_kg",
        "age":          "age_days",
        "strength":     "strength_mpa",
    }
    df.rename(columns={k: v for k, v in col_map.items() if k in df.columns}, inplace=True)

    points = []
    batch_texts = []
    batch_rows  = []

    for _, row in tqdm(df.iterrows(), total=len(df), desc="CSV rows"):
        wb = round(row["water_kg"] / (row["cement_kg"] + row.get("slag_kg", 0) + row.get("fly_ash_kg", 0) + 1e-6), 3)
        text = (
            f"Concrete mix: cement {row['cement_kg']:.0f} kg, "
            f"slag {row.get('slag_kg',0):.0f} kg, "
            f"fly ash {row.get('fly_ash_kg',0):.0f} kg, "
            f"water {row['water_kg']:.0f} kg, "
            f"superplasticizer {row.get('superplasticizer_kg',0):.1f} kg, "
            f"coarse aggregate {row['coarse_agg_kg']:.0f} kg, "
            f"fine aggregate {row['fine_agg_kg']:.0f} kg, "
            f"w/b ratio {wb:.3f}, "
            f"age {row['age_days']:.0f} days, "
            f"compressive strength {row['strength_mpa']:.1f} MPa."
        )
        batch_texts.append(text)
        batch_rows.append(row)

        if len(batch_texts) == 50:  # embed in batches of 50
            vectors = embed(batch_texts)
            for text, vec, r in zip(batch_texts, vectors, batch_rows):
                wb2 = round(r["water_kg"] / (r["cement_kg"] + r.get("slag_kg",0) + r.get("fly_ash_kg",0) + 1e-6), 3)
                points.append(PointStruct(
                    id=chunk_id(text),
                    vector=vec,
                    payload={
                        "doc_type":       "mix_data",
                        "source_id":      f"UCI-{chunk_id(text)[:8]}",
                        "chunk_text":     text,
                        "strength_mpa":   float(r["strength_mpa"]),
                        "w_b_ratio":      wb2,
                        "cement_kg":      float(r["cement_kg"]),
                        "slag_kg":        float(r.get("slag_kg", 0)),
                        "fly_ash_kg":     float(r.get("fly_ash_kg", 0)),
                        "age_days":       int(r["age_days"]),
                        "strength_range": (
                            "20-30" if r["strength_mpa"] < 30 else
                            "30-40" if r["strength_mpa"] < 40 else
                            "40-55" if r["strength_mpa"] < 55 else "55+"
                        ),
                    }
                ))
            batch_texts, batch_rows = [], []

    # Flush remainder
    if batch_texts:
        vectors = embed(batch_texts)
        for text, vec, r in zip(batch_texts, vectors, batch_rows):
            wb2 = round(r["water_kg"] / (r["cement_kg"] + r.get("slag_kg",0) + r.get("fly_ash_kg",0) + 1e-6), 3)
            points.append(PointStruct(
                id=chunk_id(text), vector=vec,
                payload={"doc_type":"mix_data","source_id":f"UCI-{chunk_id(text)[:8]}",
                         "chunk_text":text,"strength_mpa":float(r["strength_mpa"]),
                         "w_b_ratio":wb2}
            ))

    upsert_points(points)
    print(f"  Upserted {len(points)} mix-data vectors")


# ── Source 2: ACI / ASTM Standards text chunks ───────────────────────────────

# This is a curated set of key ACI 318 and ACI 201.2R excerpts.
# In production, you would parse PDFs of the actual standards.
# These representative chunks are sufficient for the MVP.

ACI_CHUNKS = [
    {
        "source_id": "ACI-318-19-T19.3.3.1",
        "doc_type": "ACI",
        "exposure_class": "marine",
        "strength_range": "30-40",
        "use_case": ["marine", "bridge", "coastal"],
        "text": (
            "ACI 318-19 Table 19.3.3.1: Maximum water-cementitious material ratios and minimum "
            "design compressive strength for concrete in exposure categories. "
            "For Class W2 (concrete in contact with water), maximum w/cm = 0.50, minimum f'c = 28 MPa. "
            "For Class S2 (moderate sulfate exposure), maximum w/cm = 0.45, minimum f'c = 31 MPa. "
            "For Class S3 (severe sulfate exposure), maximum w/cm = 0.40, minimum f'c = 35 MPa. "
            "For seawater exposure (XS3), maximum w/cm shall not exceed 0.40 and minimum compressive "
            "strength shall be 35 MPa at 28 days to ensure durability and resistance to chloride ingress."
        ),
    },
    {
        "source_id": "ACI-318-19-T26.4.2.2b",
        "doc_type": "ACI",
        "exposure_class": "marine",
        "strength_range": "40-55",
        "use_case": ["marine", "bridge"],
        "text": (
            "ACI 318-19 Table 26.4.2.2(b): Supplementary Cementitious Material (SCM) limits "
            "for concrete exposed to chlorides. "
            "GGBFS (slag) is permitted up to 50% replacement of cementitious materials for Class XS3 "
            "seawater exposure provided performance testing demonstrates chloride resistance. "
            "Fly ash Class F is limited to 25% replacement for XS3. Silica fume is limited to 10% "
            "but can be combined with slag. Ternary blends of OPC+slag+silica fume show the best "
            "chloride resistance for marine structures."
        ),
    },
    {
        "source_id": "ACI-201.2R-S4.5",
        "doc_type": "ACI",
        "exposure_class": "marine",
        "strength_range": "40-55",
        "use_case": ["marine", "bridge", "coastal"],
        "text": (
            "ACI 201.2R Guide to Durable Concrete, Section 4.5: Chloride resistance. "
            "Silica fume at 5-15% replacement by mass of cementitious materials dramatically "
            "reduces chloride ion permeability (Rapid Chloride Permeability Test, ASTM C1202). "
            "Concrete with 10% silica fume replacement typically achieves RCPT values below "
            "1000 coulombs at 56 days (classified as 'very low' permeability), compared to "
            "2000-4000 coulombs for plain OPC concrete. This is critical for marine piers, "
            "bridge decks, and coastal structures exposed to seawater chlorides."
        ),
    },
    {
        "source_id": "ACI-211.1-S6.3",
        "doc_type": "ACI",
        "exposure_class": "general",
        "strength_range": "20-40",
        "use_case": ["residential", "industrial", "general"],
        "text": (
            "ACI 211.1 Standard Practice for Selecting Proportions for Normal, Heavyweight, "
            "and Mass Concrete, Section 6.3: Estimation of mixing water and air content. "
            "For 20mm maximum aggregate size and 75-100mm slump: non-air-entrained concrete "
            "requires approximately 180-200 kg/m³ of mixing water. Water content increases by "
            "approximately 3% for each 25mm increase in slump. Reducing water-cement ratio "
            "from 0.50 to 0.40 increases 28-day strength from approximately 35 MPa to 50 MPa "
            "for Type I OPC, assuming adequate curing."
        ),
    },
    {
        "source_id": "ACI-318-19-T26.5.2",
        "doc_type": "ACI",
        "exposure_class": "freeze_thaw",
        "strength_range": "30-40",
        "use_case": ["bridge", "pavement", "outdoor"],
        "text": (
            "ACI 318-19 Table 26.5.2: Air entrainment requirements for freeze-thaw exposure. "
            "For Class F1 (moderate freeze-thaw), total air content 4.5-6.0% for 20mm aggregate. "
            "For Class F2 (severe freeze-thaw with deicing chemicals), total air content 6.0-7.5%. "
            "Air entrainment significantly reduces workability at equal slump — HRWR superplasticizer "
            "dosage must be increased by 0.3-0.5% binder mass to compensate. Maximum w/cm = 0.45 "
            "for Class F2. Minimum f'c = 31 MPa."
        ),
    },
    {
        "source_id": "NRMCA-EF-2021",
        "doc_type": "CO2",
        "exposure_class": "general",
        "strength_range": "20-55",
        "use_case": ["all"],
        "text": (
            "NRMCA Baseline CO2 Emission Factors 2021 (Scope A1-A3, cradle to gate). "
            "Portland cement (OPC): 0.83 kg CO2e per kg. "
            "GGBFS ground granulated blast-furnace slag: 0.07 kg CO2e per kg. "
            "Fly ash Class F: 0.04 kg CO2e per kg. "
            "Silica fume: 0.02 kg CO2e per kg. "
            "Coarse aggregate (crushed stone): 0.0048 kg CO2e per kg. "
            "Fine aggregate (natural sand): 0.0026 kg CO2e per kg. "
            "Mixing water: 0.0003 kg CO2e per kg. "
            "HRWR superplasticizer (polycarboxylate): 3.5 kg CO2e per kg. "
            "Replacing 40% OPC with slag+silica fume typically reduces embodied CO2 by 30-40%."
        ),
    },
    {
        "source_id": "ASTM-C150-TypeI",
        "doc_type": "ASTM",
        "exposure_class": "general",
        "strength_range": "20-55",
        "use_case": ["all"],
        "text": (
            "ASTM C150 Standard Specification for Portland Cement. "
            "Type I: General purpose, used when special properties are not required. "
            "Type II: Moderate sulfate resistance, moderate heat of hydration. "
            "Type III: High early strength — reaches 28-day strength in approximately 7 days. "
            "Type V: High sulfate resistance, required for Class XA3 exposure. "
            "Fineness (Blaine): 320-420 m²/kg typical for Type I. "
            "C3S content: 50-65% (primary strength contributor). "
            "C3A content: <8% for Type II, <5% for Type V. "
            "Density: approximately 3150 kg/m³."
        ),
    },
    {
        "source_id": "ASTM-C989-Slag",
        "doc_type": "ASTM",
        "exposure_class": "general",
        "strength_range": "30-55",
        "use_case": ["marine", "bridge", "industrial"],
        "text": (
            "ASTM C989 Standard Specification for Slag Cement for Use in Concrete and Mortars. "
            "Grade 80: Slag activity index 75% at 28 days — slow early strength, high ultimate. "
            "Grade 100: Slag activity index 95% at 28 days — standard for structural applications. "
            "Grade 120: Slag activity index 115% at 28 days — highest strength contribution. "
            "Slag significantly improves resistance to chloride penetration and sulfate attack. "
            "Sulfide content (S²⁻) shall not exceed 2.5% — verify with supplier CoA before use. "
            "Heat of hydration is 40-50% lower than OPC, beneficial for mass concrete."
        ),
    },
    {
        "source_id": "ACI-214-R11",
        "doc_type": "ACI",
        "exposure_class": "general",
        "strength_range": "20-55",
        "use_case": ["all"],
        "text": (
            "ACI 214R Guide to Evaluation of Strength Test Results of Concrete. "
            "The required average compressive strength f'cr must exceed the specified f'c by a margin "
            "that accounts for statistical variation. For f'c = 35 MPa with moderate quality control "
            "(coefficient of variation 15%), f'cr = f'c + 1.34s ≈ f'c × 1.20 (20% margin). "
            "For higher quality control (CV 10%), f'cr ≈ f'c × 1.12. "
            "Design strength is therefore typically set 15-25% above required strength. "
            "Minimum 3 cylinder samples per 50 m³ of concrete placed."
        ),
    },
]


def ingest_aci_chunks():
    print("\n[2/3] Ingesting ACI/ASTM standard chunks...")
    texts = [c["text"] for c in ACI_CHUNKS]
    vectors = embed(texts)

    points = [
        PointStruct(
            id=chunk_id(c["text"]),
            vector=vec,
            payload={
                "doc_type":       c["doc_type"],
                "source_id":      c["source_id"],
                "chunk_text":     c["text"],
                "exposure_class": c["exposure_class"],
                "strength_range": c["strength_range"],
                "use_case":       c["use_case"],
                "source_url":     f"https://www.concrete.org/store/productdetail.aspx",
            }
        )
        for c, vec in zip(ACI_CHUNKS, vectors)
    ]
    upsert_points(points)
    print(f"  Upserted {len(points)} ACI/ASTM standard vectors")


# ── Source 3: Historical project records ──────────────────────────────────────

HISTORICAL_PROJECTS = [
    {
        "project_id": "PRJ-0421",
        "location_state": "California", "location_city": "Long Beach",
        "use_case": "marine_pier", "exposure_class": "XS3",
        "cement_kg": 250, "slag_kg": 100, "fly_ash_kg": 0, "silica_fume_kg": 45,
        "water_kg": 148, "coarse_agg_kg": 1010, "fine_agg_kg": 670,
        "w_b_ratio": 0.38, "age_days": 28,
        "strength_achieved_mpa": 47.2, "co2_kg_m3": 224,
        "performance_notes": "RCPT 820 coulombs at 56d (very low). No chloride ingress at 5yr inspection.",
    },
    {
        "project_id": "PRJ-0387",
        "location_state": "Texas", "location_city": "Houston",
        "use_case": "bridge_deck", "exposure_class": "XF4",
        "cement_kg": 310, "slag_kg": 80, "fly_ash_kg": 60, "silica_fume_kg": 0,
        "water_kg": 160, "coarse_agg_kg": 980, "fine_agg_kg": 720,
        "w_b_ratio": 0.36, "age_days": 28,
        "strength_achieved_mpa": 52.8, "co2_kg_m3": 298,
        "performance_notes": "Air content 5.5%. No scaling after 3 freeze-thaw seasons.",
    },
    {
        "project_id": "PRJ-0512",
        "location_state": "New York", "location_city": "New York City",
        "use_case": "residential_slab", "exposure_class": "X0",
        "cement_kg": 340, "slag_kg": 0, "fly_ash_kg": 85, "silica_fume_kg": 0,
        "water_kg": 170, "coarse_agg_kg": 1050, "fine_agg_kg": 760,
        "w_b_ratio": 0.40, "age_days": 28,
        "strength_achieved_mpa": 38.1, "co2_kg_m3": 312,
        "performance_notes": "25% fly ash replacement. Cost $142/m³. Client very satisfied.",
    },
    {
        "project_id": "PRJ-0601",
        "location_state": "Florida", "location_city": "Miami",
        "use_case": "marine_pier", "exposure_class": "XS3",
        "cement_kg": 280, "slag_kg": 130, "fly_ash_kg": 0, "silica_fume_kg": 35,
        "water_kg": 155, "coarse_agg_kg": 995, "fine_agg_kg": 685,
        "w_b_ratio": 0.36, "age_days": 28,
        "strength_achieved_mpa": 51.4, "co2_kg_m3": 211,
        "performance_notes": "36% SCM replacement. RCPT 650 coulombs. Significant CO2 reduction.",
    },
    {
        "project_id": "PRJ-0445",
        "location_state": "Illinois", "location_city": "Chicago",
        "use_case": "industrial_floor", "exposure_class": "XA3",
        "cement_kg": 400, "slag_kg": 0, "fly_ash_kg": 0, "silica_fume_kg": 0,
        "water_kg": 160, "coarse_agg_kg": 1020, "fine_agg_kg": 700,
        "w_b_ratio": 0.40, "age_days": 28,
        "strength_achieved_mpa": 44.7, "co2_kg_m3": 385,
        "performance_notes": "Type V cement for high sulfate resistance. No SCM — sulfate concern.",
    },
]

# ── Source 3: Historical project records ──────────────────────────────────────
EPD_CHUNKS = [
    {
        "source_id": "EPD-LEHIGH-OPC-2023",
        "doc_type": "EPD",
        "material": "OPC cement",
        "region": "US",
        "text": (
            "Environmental Product Declaration — Lehigh Hanson Type I/II Portland Cement, 2023. "
            "Declared unit: 1 metric ton of cement. "
            "Global Warming Potential (GWP, A1-A3): 820 kg CO2e per tonne. "
            "Acidification: 1.23 kg SO2e. Eutrophication: 0.22 kg N-equiv. "
            "Primary energy demand: 3,850 MJ. "
            "Plant location: Union Bridge, Maryland. "
            "EPD Program Operator: NRMCA. EPD Verification: third-party verified. "
            "Valid until: 2028."
        ),
    },
    {
        "source_id": "EPD-HOLCIM-OPC-2023",
        "doc_type": "EPD",
        "material": "OPC cement",
        "region": "US",
        "text": (
            "Environmental Product Declaration — Holcim US Type I/II Portland Cement, 2023. "
            "Declared unit: 1 metric ton of cement. "
            "Global Warming Potential (GWP, A1-A3): 795 kg CO2e per tonne. "
            "Plant locations: aggregate of US facilities. "
            "EPD Program Operator: NRMCA. Third-party verified. "
            "Clinker-to-cement ratio: 0.88. Supplementary fuel use: 12% alternative fuels. "
            "Valid until: 2028."
        ),
    },
    {
        "source_id": "EPD-NRMCA-GGBFS-2022",
        "doc_type": "EPD",
        "material": "GGBFS slag",
        "region": "US",
        "text": (
            "Environmental Product Declaration — Ground Granulated Blast Furnace Slag (GGBFS), "
            "NRMCA Industry-Wide EPD, 2022. "
            "Declared unit: 1 metric ton of GGBFS. "
            "Global Warming Potential (GWP, A1-A3): 67 kg CO2e per tonne. "
            "GGBFS is an industrial byproduct of iron manufacturing — the low GWP reflects "
            "allocation methodology assigning minimal upstream burden to byproducts. "
            "Fineness: 400-500 m2/kg (Grade 100/120 per ASTM C989). "
            "Valid until: 2027."
        ),
    },
    {
        "source_id": "EPD-HEADWATERS-FLYASH-2022",
        "doc_type": "EPD",
        "material": "fly ash",
        "region": "US",
        "text": (
            "Environmental Product Declaration — Fly Ash Class F, "
            "Headwaters Resources Industry-Wide EPD, 2022. "
            "Declared unit: 1 metric ton of fly ash. "
            "Global Warming Potential (GWP, A1-A3): 40 kg CO2e per tonne. "
            "Fly ash is a coal combustion byproduct — low GWP due to byproduct allocation. "
            "Loss on ignition (LOI): <6%. Applicable standard: ASTM C618 Class F. "
            "Valid until: 2027."
        ),
    },
    {
        "source_id": "EPD-ELKEM-SILICAFUME-2023",
        "doc_type": "EPD",
        "material": "silica fume",
        "region": "US",
        "text": (
            "Environmental Product Declaration — Elkem Microsilica (Silica Fume), 2023. "
            "Declared unit: 1 metric ton of densified silica fume. "
            "Global Warming Potential (GWP, A1-A3): 20 kg CO2e per tonne. "
            "Silica fume is a byproduct of silicon and ferrosilicon alloy production. "
            "Applicable standard: ASTM C1240. SiO2 content: >85%. "
            "EPD Program Operator: Institut Bauen und Umwelt (IBU). "
            "Valid until: 2028."
        ),
    },
    {
        "source_id": "EPD-VULCAN-COARSEAGG-2023",
        "doc_type": "EPD",
        "material": "coarse aggregate",
        "region": "US",
        "text": (
            "Environmental Product Declaration — Vulcan Materials Crushed Stone Coarse Aggregate, 2023. "
            "Declared unit: 1 metric ton of crushed stone. "
            "Global Warming Potential (GWP, A1-A3): 4.8 kg CO2e per tonne. "
            "Includes quarrying, crushing, screening, and transport to plant gate. "
            "Rock types: granite, limestone, trap rock (varies by region). "
            "EPD Program Operator: NSSGA. Third-party verified. "
            "Valid until: 2028."
        ),
    },
    {
        "source_id": "EPD-MARTIN-FINEAGG-2023",
        "doc_type": "EPD",
        "material": "fine aggregate",
        "region": "US",
        "text": (
            "Environmental Product Declaration — Martin Marietta Natural Sand Fine Aggregate, 2023. "
            "Declared unit: 1 metric ton of natural sand. "
            "Global Warming Potential (GWP, A1-A3): 2.6 kg CO2e per tonne. "
            "Includes extraction, washing, and transport to plant gate. "
            "Fineness modulus: 2.3-3.1. Applicable standard: ASTM C33. "
            "EPD Program Operator: NSSGA. Third-party verified. "
            "Valid until: 2028."
        ),
    },
    {
        "source_id": "NRMCA-BASELINE-CO2-2021",
        "doc_type": "EPD",
        "material": "industry baseline",
        "region": "US",
        "text": (
            "NRMCA Concrete CO2 Fact Sheet — Industry Baseline Emission Factors 2021. "
            "These are US industry-average values for Scope A1-A3 (cradle to plant gate). "
            "Portland cement OPC: 820-900 kg CO2e per tonne (average 860). "
            "GGBFS slag: 52-83 kg CO2e per tonne (average 67). "
            "Fly ash Class F: 27-54 kg CO2e per tonne (average 40). "
            "Silica fume: 14-28 kg CO2e per tonne (average 20). "
            "Coarse aggregate: 3.5-6.5 kg CO2e per tonne (average 4.8). "
            "Fine aggregate: 1.8-3.5 kg CO2e per tonne (average 2.6). "
            "Mixing water: 0.3 kg CO2e per tonne. "
            "HRWR superplasticizer: 3,200-3,800 kg CO2e per tonne. "
            "A concrete mix with 40% SCM replacement typically achieves 30-40% GWP reduction "
            "vs. 100% OPC baseline of approximately 340 kg CO2e per m3."
        ),
    },
]

def ingest_epd_chunks():
    print("\n[4/4] Ingesting EPD sustainability documents...")
    texts = [c["text"] for c in EPD_CHUNKS]
    vectors = embed(texts)

    points = [
        PointStruct(
            id=chunk_id(c["text"]),
            vector=vec,
            payload={
                "doc_type":   c["doc_type"],
                "source_id":  c["source_id"],
                "material":   c["material"],
                "region":     c["region"],
                "chunk_text": c["text"],
            }
        )
        for c, vec in zip(EPD_CHUNKS, vectors)
    ]
    upsert_points(points)
    print(f"  Upserted {len(points)} EPD vectors")


def ingest_historical_projects():
    print("\n[3/3] Ingesting historical project records...")
    texts = []
    for p in HISTORICAL_PROJECTS:
        texts.append(
            f"Historical project {p['project_id']} in {p['location_city']}, {p['location_state']}. "
            f"Use case: {p['use_case'].replace('_',' ')}. Exposure: {p['exposure_class']}. "
            f"Mix: cement {p['cement_kg']}kg, slag {p['slag_kg']}kg, fly ash {p['fly_ash_kg']}kg, "
            f"silica fume {p['silica_fume_kg']}kg, water {p['water_kg']}kg, w/b {p['w_b_ratio']}. "
            f"Strength achieved: {p['strength_achieved_mpa']} MPa at {p['age_days']} days. "
            f"CO2: {p['co2_kg_m3']} kg/m³. Notes: {p['performance_notes']}"
        )

    vectors = embed(texts)
    points = [
        PointStruct(
            id=chunk_id(text),
            vector=vec,
            payload={**p, "doc_type":"historical_project","chunk_text":text}
        )
        for text, vec, p in zip(texts, vectors, HISTORICAL_PROJECTS)
    ]
    upsert_points(points)
    print(f"  Upserted {len(points)} historical project vectors")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    ensure_collection()

    # Path to the concrete.csv (adjust if needed)
    csv_path = pathlib.Path(__file__).parent.parent.parent / "concrete.csv"
    if csv_path.exists():
        ingest_csv(str(csv_path))
    else:
        print(f"\n[1/3] WARNING: {csv_path} not found — skipping CSV ingestion")
        print("  Place concrete.csv in the project root and re-run to ingest dataset rows.")

    #ingest_aci_chunks()
    #ingest_historical_projects()
    ingest_epd_chunks()


    count = qdrant_client.count(collection_name=COLLECTION).count
    print(f"\n✅ Ingestion complete. Total vectors in '{COLLECTION}': {count}")
    print(f"   Qdrant UI: {QDRANT_URL}/dashboard")
