# ODC compute & launch capacity — research + sim plan

**Goal:** Turn the orbital visualization into a **capacity model** — simulate Starship launch cadence, cumulative ODC power/compute online, and “intelligence in space” vs terrestrial benchmarks (e.g. Vera Rubin data pipeline, frontier GPU fleets).

**Baseline:** Existing ODC geometry from FCC Table 1 (1,198,120 nominal sats, six groups). No compute layer yet.

---

## What is published (multi-source)

### Regulatory filing (primary)

| Item | Value | Source |
|------|--------|--------|
| Filing | SpaceX Orbital Data Center, FCC **SAT-LOA-20260108-00016**, submitted **30 Jan 2026** | [FCC narrative PDF](https://regmedia.co.uk/2026/02/05/spacex-orbital-dc-sat-narrative.pdf) |
| Fleet size (requested) | Up to **1,000,000** satellites | Same; [SpaceNews](https://spacenews.com/spacex-files-plans-for-million-satellite-orbital-data-center-constellation/) |
| Altitude | **500–2,000 km** | Filing |
| Inclinations | **~30°** and **sun-synchronous (~97°)** | Filing; matches our Table 1 groups |
| Shell thickness | Up to **50 km** per shell | Filing |
| Backhaul | **Optical ISL** → Starlink laser mesh → ground | Filing |
| Ka-band | TT&C backup, **non-interference / unprotected** | Filing |
| Deployment schedule | **Not specified**; milestone waiver requested | [SpaceNews](https://spacenews.com/spacex-files-plans-for-million-satellite-orbital-data-center-constellation/) |
| First launch (corporate) | **As early as 2028** (S-1 / press) | [Yahoo Finance](https://sg.finance.yahoo.com/news/elon-musk-wants-to-put-data-centers-in-space--heres-what-that-could-actually-look-like-143000204.html) |

**Important filing quote (throughput math, not a built spec):**

> *“Launching **1 million tonnes per year** of satellites generating **100 kW of compute power per tonne** would add **100 gigawatts** of AI compute capacity annually.”*

That is **100 kW per tonne of launched mass**, used as a **system-level planning density** — not necessarily “each satellite weighs one tonne.”

---

### Musk / SpaceNews (hardware class)

| Item | Value | Source |
|------|--------|--------|
| First vehicle class | **“AI Sat Mini”** | [SpaceNews, Mar 2026](https://spacenews.com/spacex-offers-details-on-orbital-data-center-satellites/) |
| Power per Mini | **100 kW** for on-board AI processors | Same (Musk Austin presentation) |
| Future class | **Megawatt-scale** satellites (“Mini” implies larger follow-ons) | Same |
| Space chip program | **D3** — space-optimized, hotter operation, radiation tolerance; **Terafab** chip scale-up with Tesla/xAI | Same |
| Long-range vision | **Petawatt** aggregate space compute; moon-built sats | Same |

**Art / scale:** Illustration shows AI Sat Mini **~170 m** long (solar arrays) vs **124 m** Starship — these are **large busses**, not Starlink V3 Mini-sized. Mass is **not** published in the FCC filing.

---

### Starship launch economics (capacity per flight)

| Item | Value | Source |
|------|--------|--------|
| LEO payload (design, reusable) | **100–150 t** | [SpaceX Starship page](https://www.spacex.com/vehicles/starship); [Wikipedia](https://en.wikipedia.org/wiki/SpaceX_Starship) |
| LEO payload (Block 2 flown) | **~35 t** (interim; not final) | Wikipedia flight logs; [Space Explored](https://spaceexplored.com/2025/10/15/spacex-closes-out-block-2-starship-flights-with-a-rather-boring-launch/) |
| Block 3 target | Restore **~100 t+** reusable | Same |
| Starlink V3 (reference) | **~1.2–2.0 t** each, **~60 sats** → **~72–120 t** per launch | [Techiexpert / V3 reporting](https://techiexpert.com/spacex-unveils-starlink-v3-massive-bandwidth-leap-and-fiber-like-latency/) |
| V3 power (comms sat) | **10–20 kW** solar | Same — **not** ODC class |

**Deriving MW per Starship launch (scenario math, not a SpaceX quote):**

| Assumption | Sats / launch | Power / launch |
|------------|---------------|----------------|
| 100 kW Mini, **1 t** each, 100 t payload | 100 | **10 MW** |
| 100 kW Mini, **2 t** each, 100 t payload | 50 | **5 MW** |
| 100 kW Mini, **10 t** each (large arrays) | 10 | **1 MW** |
| 1 MW-class future sat, **50 t** each | 2 | **2 MW** |

Your **~1 MW per launch** guess is **plausible** if each AI Sat Mini is **mass-dominated** (heavy arrays + radiators) — only **~10 sats** fit in 100 t. SpaceX’s **100 kW/tonne** filing math aligns with **~10 MW per 100 t**, i.e. **~100 kW per tonne** average across the deployed batch.

**Annual aspiration (filing):** 1 Mt/year × 100 kW/t = **+100 GW/year** added (requires **~18 Starship launches/day** at 150 t — [independent analysis](https://leonliao.substack.com/p/the-real-constraint-on-space-ai-is)).

**Realistic near-term (analyst envelope):** ~**0.5–1 GW/year** with thousands of ~1 t platforms — not 100 GW/year without aviation-scale launch ([Leon Liao](https://leonliao.substack.com/p/the-real-constraint-on-space-ai-is)).

---

### Skeptical / constraint sources (use as sim “low case”)

| Concern | Source |
|---------|--------|
| Starship not yet at cadence or full reuse | [Implicator.ai](https://www.implicator.ai/spacex-asks-to-put-one-million-data-centers-in-orbit-the-math-says-otherwise/); [Techarcade / S-1](https://www.techarcade.io/spacex-admits-its-orbital-ai-data-center-dream-may-never-work-right-before-going-public/) |
| **Heat rejection** may dominate mass & power budget | [Leon Liao](https://leonliao.substack.com/p/the-real-constraint-on-space-ai-is) |
| 1M sats = regulatory ceiling; operational fleet likely **much smaller** (Starlink precedent: 42k authorized → ~9.5k active) | Implicator.ai |
| Competitors: Blue Origin ODC, Starcloud (GPU demo sat), Axiom ISS modules, Google Suncatcher | [SatNews](https://satnews.com/2026/01/31/spacex-files-fcc-application-for-million-satellite-orbital-data-center/); [Carbon Credits](https://carboncredits.com/elon-musks-spacex-eyes-solar-data-centers-in-space-to-power-the-ai-boom/) |

---

## Vera Rubin benchmark (for “intelligence in space” comparisons)

Rubin is **observatory data processing**, not a single orbiting AI box — but it is a useful **published compute floor** for “big science AI pipeline”:

| Metric | Value | Source |
|--------|--------|--------|
| Processing (DR1) | **150 TFLOPS** | [Rubin DM](https://www.lsst.org/about/dm) |
| Processing (DR11, ~10 yr) | **950 TFLOPS** (~0.95 PFLOPS) | Same |
| Context | 150 TFLOPS ≈ **#1 supercomputer in 2004** | Same |
| Data rate | **~20 TB/night** raw; **~7M alerts/night** | [Rubin data page](https://rubinobservatory.org/explore/how-rubin-works/technology/data) |

**Sim convention:** 1 **Rubin-unit** = **950 TFLOPS** sustained pipeline compute (DR11). Display as “× Rubin” for intuition.

---

## GPU / power → compute (assumptions for the sim)

SpaceX has **not** published D3 TFLOPS. Use **configurable efficiency tiers**:

| Tier | Power to compute | Effective FP16 tensor | Notes |
|------|------------------|------------------------|-------|
| **Pilot** | 10 kW compute / sat | ~20 TFLOPS | Starlink V3-class edge pilot |
| **Mini (default)** | 100 kW total → **50 kW** compute | **~100 TFLOPS** | 50% duty cycle on ~2 TFLOPS/W (H100-class) |
| **Mini optimistic** | 100 kW → **80 kW** compute | **~200 TFLOPS** | Near-all power to processors (Musk wording) |
| **Future MW sat** | 1 MW → **700 kW** compute | **~1.4 PFLOPS** | Matches “megawatt satellite” roadmap |

Reference silicon: H100 SXM **1,979 TFLOPS FP16** (sparse peak) @ **700 W** ≈ **2.8 TFLOPS/W** peak — [NVIDIA H100](https://www.nvidia.com/en-us/data-center/h100/). Real sustained **~0.8–1.6 PFLOPS/kW** depending on utilization ([DeployBase](https://deploybase.ai/articles/a100-vs-h100)).

**Full ODC nominal fleet (1.198M sats), Mini default tier:**

- Power: 1.198M × 100 kW ≈ **120 GW**
- Compute: 1.198M × 100 TFLOPS ≈ **120 EFLOPS** (120,000,000 TFLOPS)
- vs Rubin DR11: **120e15 / 950e12 ≈ 126,000× Rubin**

Even **1% deployment** (12k sats) ≈ **1.2 GW** / **1.2 EFLOPS** ≈ **1,260× Rubin** — still civilization-scale if specs hold.

---

## What the sim should answer

1. **Given a launch schedule**, how many ODC sats are **on orbit** by year?
2. **Cumulative power (GW)** and **compute (PFLOPS / × Rubin)** online?
3. **Sunlight duty cycle** by shell (SSO vs 30°) affecting **effective** compute?
4. **Sensitivity:** mass model, kW/sat, launches/year, deployment fraction of filing cap?
5. **Scenario compare:** “Filing aspirational” vs “Starlink-scale realistic” vs “pilot only”?

---

## Phased implementation plan

### Phase A — Data model & constants (1–2 sessions)

**Deliverables**

- `src/data/odcComputeSpec.ts` — sourced constants with citations in comments:
  - `KW_PER_TONNE_FILING = 100`
  - `KW_PER_SAT_MIN = 100`
  - `MW_PER_SAT_FUTURE = 1`
  - Starship payload tiers (35 / 100 / 150 t)
  - Rubin TFLOPS anchor (950)
  - Compute tiers (pilot / mini / optimistic / MW)
- `src/model/odcCapacity.ts` — pure functions:
  - `satsPerLaunch(payloadTon, satMassTon)`
  - `powerMwPerLaunch(...)`
  - `computeTflopsFromKw(powerKw, tflopsPerKw)`
  - `cumulativeCapacity(launchSchedule, deployedSats)`

**Tests:** golden values for 1 launch/week @ 100 t, 1 t/sat, 100 kW/sat → 10 MW, 10 sats.

---

### Phase B — Launch timeline simulator (2–3 sessions)

**Deliverables**

- `src/data/odcLaunchScenarios.ts`:

  | Scenario | Launches/yr | Payload | Sat class | Notes |
  |----------|-------------|---------|-----------|-------|
  | `pilot-2028` | 4 | 35 t | 10 kW pilot | Starship Block maturity |
  | `ramp-2030` | 52 | 100 t | 100 kW Mini | ~1/week |
  | `filing-aspirational` | 6,700 | 150 t | 100 kW | 1 Mt/year |
  | `moderate` | 200 | 100 t | 100 kW | Analyst mid-case |

- `LaunchSchedule` type: `{ year, launches, satsPerLaunch?, groupAllocation? }`
- Assign sats to **ODC groups** (fill lower shells first, or user-weighted)
- Respect **1,198,120** filing cap

**UI (minimal):** dropdown scenario + year slider → stats panel only (no new 3D load).

---

### Phase C — Capacity dashboard (1–2 sessions)

**Deliverables**

- Panel section **“ODC compute”**:
  - Cumulative sats / GW / PFLOPS / **× Rubin**
  - This year: +sats, +GW, +PFLOPS from launches
  - Effective compute factor by group (SSO **~99% sun** vs 30° **~60–70%** — simple duty multiplier)
- Chart (canvas or DOM): GW and PFLOPS vs year
- Copy-to-clipboard summary for sharing

---

### Phase D — Tie to 3D sim (2 sessions)

**Deliverables**

- Color / opacity by **deployment year** or **compute density** on enabled shells
- Optional **“launch train”** animation: next N launches appear as new sats along planes
- Filter: show only sats deployed by year ≤ slider
- Performance: use existing representative GPU buffer; capacity math is **aggregate**, not per-GPU particle

---

### Phase E — Scenarios & export (1 session) ✅

**Deliverables**

- Share URL params: `#odc=scenario:ramp-2030;year:2035;tier:mini` (combined with `#s=` sim state)
- PNG export includes capacity readout overlay (bottom-left caption)
- Compute tier override dropdown in ODC compute panel
- Constants: `src/data/odcComputeSpec.ts`, scenarios: `src/data/odcLaunchScenarios.ts`

---

## Recommended default scenario for demos

**“2035 moderate ramp”**

- 2028–2029: 6 launches/yr × 35 t × 10 kW pilot
- 2030–2032: 40 launches/yr × 100 t × 100 kW Mini (5 MW/launch)
- 2033+: 100 launches/yr × 100 t × 100 kW
- Cap at filing table totals

Order-of-magnitude by **2035:** ~**250 launches**, ~**12,000–15,000 sats**, **~1–1.5 GW**, **~1–1.5 EFLOPS** (~**1,000–1,600× Rubin**) — enough to show “this is not incremental” without assuming 100 GW/year.

---

## Open questions (pick defaults in UI)

1. **Mass per AI Sat Mini** — default **1 t** ( filing math) vs **10 t** ( illustration scale)?
2. **kW meaning** — total bus power vs processor TDP (default: **50%** to compute)?
3. **Deployment** — fill polar SSO first (always-on compute) or balanced across groups?
4. **Failures** — apply **2%** sat loss / launch failure in advanced settings?

---

## Sources (quick links)

1. [SpaceX ODC FCC narrative PDF](https://regmedia.co.uk/2026/02/05/spacex-orbital-dc-sat-narrative.pdf)
2. [SpaceNews — million-satellite filing](https://spacenews.com/spacex-files-plans-for-million-satellite-orbital-data-center-constellation/)
3. [SpaceNews — AI Sat Mini 100 kW](https://spacenews.com/spacex-offers-details-on-orbital-data-center-satellites/)
4. [SpaceX Starship specs](https://www.spacex.com/vehicles/starship)
5. [Rubin data management TFLOPS](https://www.lsst.org/about/dm)
6. [NVIDIA H100 specs](https://www.nvidia.com/en-us/data-center/h100/)
7. [Launch/energy constraint analysis](https://leonliao.substack.com/p/the-real-constraint-on-space-ai-is)
8. [Skeptical scale analysis](https://www.implicator.ai/spacex-asks-to-put-one-million-data-centers-in-orbit-the-math-says-otherwise/)

---

## Next step

Implement **Phase A + B** first (pure model + scenario tests, no UI). That gives numbers you can sanity-check before wiring the dashboard.

When ready: *“implement ODC compute Phase A”* or publish to GitHub when stable.
