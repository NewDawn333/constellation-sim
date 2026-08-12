# SpaceX Orbital Simulator — Roadmap

**Canonical tree:** `~/Desktop/Final runs/SpaceX Orbital Simulator`  
**GitHub:** https://github.com/NewDawn333/constellation-sim

The old `constellation-viz` demo and other working copies are retired. Work only in this folder.

---

## What we have today (Phase 0 ✓)

- Six **Orbital Data Center (ODC)** groups from Table 1 (1M satellites nominal)
- Correct ECI orbital math (RAAN × inclination × mean anomaly)
- Walker-style shells / planes / along-track spacing
- Satellites sampled ÷100 (2–8 per plane) for performance
- All orbital tracks drawn (one line per plane)
- Canvas Earth map with slow rotation

### Why polar groups (2, 4, 6) look “narrow”

This is **mostly correct geometry**, not a bug:

| | Inclined groups (1, 3, 5) | Polar / SSO groups (2, 4, 6) |
|---|---|---|
| Inclination | ~29–30° | ~97–99° (retrograde, sun-sync class) |
| Planes per shell | **30** | **2** |
| Sats per plane | ~333 | **4,999–5,770** |
| Visual effect | 30 interleaved rings → wide “shell” | 2 great circles 180° apart → two crossing tracks |

At ~97°, each plane is a near-polar great circle. With only **two RAANs per shell**, the constellation is **dense along-track** (thousands of sats per plane) but **sparse in plane count**. The inclined shells look “wider” because 30 planes fan out in RAAN; polar shells intentionally use 2 planes × thousands of sats — a different Walker topology.

**Phase 2** will add ground-track footprints and density modes so this reads clearly, not like a rendering error.

---

## Constellation inventory (target data sources)

### A. Orbital Data Center (proposed — your Table 1)

Filing: SpaceX Orbital Data Center, ICFS SAT-LOA-20260108-00016 (Jan 2026).  
Narrative: 500–2,000 km, **30°** and **sun-synchronous (~97°)** inclinations, shells up to ~50 km thick.

| Group | Alt (km) | Inc (°) | Shells | Planes/shell | Sats/plane | Max |
|-------|----------|---------|--------|--------------|------------|-----|
| 1 | 550–568 | 26–32 | 10 | 30 | 333 | 99,900 |
| 2 | 565–585 | 97.7 | 10 | 2 | 4,999 | 99,980 |
| 3 | 686–718 | 30 | 25 | 30 | 333 | 249,750 |
| 4 | 707–744 | 97.2 | 22 | 2 | 5,565 | 244,860 |
| 5 | 946–978 | 30 | 25 | 30 | 333 | 249,750 |
| 6 | 967–1002 | 99.4 | 22 | 2 | 5,770 | 253,880 |

### B. Starlink Gen1 (operational + authorized)

Apr 2020 modified authorization (~4,408 sats). Primary deployed shell:

| Shell | Alt (km) | Inc (°) | Planes | Sats/plane | Total |
|-------|----------|---------|--------|------------|-------|
| Group 1 | 550 | 53.0 | 72 | 22 | 1,584 |
| Group 2 | 570 | 70.0 | 36 | 20 | 720 |
| Group 3 | 560 | 97.6 | 6 | 58 | 348 |
| Group 4 | 540 | 53.2 | 72 | 22 | 1,584 |
| Group 5 | 560 | 97.6 | 4 | 43 | 172 |

**Also deployed in practice:** additional shells ~475–475 km (53.2°) as Gen1 satellites migrate lower (per Jonathan McDowell / SpaceX mods).

### C. Starlink Gen2 (authorized + proposed)

**Granted tranche (DA-26-36, 2026):** 7,500 sats in lower shells + continued 525 km shell:

| Shell (km) | Inc (°) | Max planes | Max sats/plane |
|------------|---------|------------|----------------|
| 340 | 53 | 72 | 144 |
| 345 | 48 | 72 | 144 |
| 350 | 38 | 72 | 144 |
| 355 | 43 | 72 | 144 |
| 360 | 96.9 | 72 | 144 |
| 365 | 28 or 32 | 72 | 144 |
| 475 | 28 or 32 | — | — |
| 480 | 53 | 56 | 120 |
| 485 | 43 | 56 | 120 |
| 525 | 53 | (continued) | — |

**Full Gen2 application (partially deferred):** up to **29,988** sats, 340–614 km, including retrograde shells at 604 km (148°) and 614 km (115.7°).

### D. Relationship between systems

SpaceX states ODC will use optical ISL and may interconnect with Gen1/Gen2. The simulator should eventually support **layered toggles**: Gen1 → Gen2 → ODC, with shared Earth frame and time base.

---

## Phased implementation plan

### Phase 1 — Scale, pacing, and inspection ✓

**Goal:** Feel the size of the system without melting the GPU.

| Task | Detail | Status |
|------|--------|--------|
| Progressive reveal | Intro mode: Group 1 → 6, staged camera, HUD counts | ✓ |
| Shell inspector | Tree UI: Group → Shell → Plane; isolate/highlight | ✓ |
| Altitude exaggeration | ×5 shell separation toggle | ✓ |
| Density slider | 1:1 (cap), 1:10, 1:100, 1:1000 | ✓ |
| Stats panel | Planes, shells, visible vs nominal, alt span, FPS | ✓ |
| Render budget | Auto-reduce satellite density when FPS drops; tracks always on | ✓ |

**Exit criteria:** User can walk through groups one at a time and inspect every shell/plane structure.

---

Phase 2 — Full shell/plane fidelity + polar clarity ✓

**Goal:** Every plane represented correctly; polar groups read as intentional.

| Task | Detail |
|------|--------|
| Unified `Constellation` model | `{ layers[], shells[], planes[], satellites[] }` — single source for tracks + instances |
| Track modes | (a) all planes, (b) one shell, (c) selected plane only |
| Polar visualization | Ground-track overlay on Earth; along-track density heat for 2-plane shells |
| Shell bands | Semi-transparent torus or altitude guide rings at shell min/max |
| Validation suite | Unit tests for ECI position, RAAN spacing, sat count = shells×planes×sats |
| Inc range Group 1 | Support 26–32° spread across shells (currently single 29°) |

**Exit criteria:** Side-by-side inclined (30-plane) vs polar (2-plane) groups are visually and numerically explainable.

---

### Phase 3 — Starlink Gen1 layer ✓

**Goal:** Add real-world reference constellation.

| Task | Detail |
|------|--------|
| `starlink-gen1.json` | Authoritative shell table (above) + version note |
| Distinct styling | Smaller points, different palette — clearly separate from ODC |
| Deployment state | Optional: “as authorized” vs “as deployed” (475 km migration shells) |
| Toggle | Master “Starlink Gen1” + per-shell checkboxes |
| Scale context | HUD: “Gen1 ~4.4k · ODC proposed 1M” |

**Exit criteria:** Gen1 visible alongside ODC; orbits match published FCC parameters.

---

### Phase 4 — Starlink Gen2 layer ✓

**Goal:** Current authorized + proposed expansion.

| Task | Detail | Status |
|------|--------|--------|
| Two sub-modes | **Gen2-A (granted 7,500)** vs **Gen2-B (full 29,988 application)** | ✓ |
| Shell catalog | All DA-26-36 shells + deferred 604/614 km retrograde shells | ✓ |
| Inclination variants | 365 km 28° vs 32° as selectable sub-shells | ✓ |
| Timeline scrubber | *(optional)* deployment order: 525–535 → 340–360 → 604–614 | — |
| Link to Gen1 | Visual gap between Gen1 ~550 km and Gen2 340–360 km shells | ✓ |

**Exit criteria:** User can overlay Gen1 + Gen2-A and see non-overlapping shell structure.

---

### Phase 5 — ODC full representative mode ✓

**Goal:** As faithful as browser WebGL allows to 1M sats.

| Task | Detail | Status |
|------|--------|--------|
| GPU instancing | Typed orbital-element buffers + shader-animated `Points` per ODC group | ✓ |
| LOD tiers | Auto camera LOD: far → sparser draw range + hide tracks; near → full buffer | ✓ |
| Compute pass *(optional)* | WebGPU compute for positions if CPU-bound | — |
| Full nominal counts | 1,198,120 nominal structure; display at 1:100 ≈ 12k GPU points | ✓ |
| Inter-shell spacing | Per-shell thickness bands (18–50 km) + exaggeration toggle | ✓ |

**Exit criteria:** 1M nominal structure addressable; interactive on mid-range GPU at 1:100+ display density.

---

### Phase 7 — Starlink coverage footprints *(next)*

**Goal:** Per-satellite ground coverage discs; timeline shows gaps closing 2019 → today.

See **[COVERAGE_PHASE_PLAN.md](./COVERAGE_PHASE_PLAN.md)** for full spec (hardware classes, geometry, milestones, architecture).

| Task | Detail |
|------|--------|
| Hardware taxonomy | V1/V1.5, V2 Mini, DTC v1/v2, future V3 — map from deployed shell IDs |
| Footprint math | Min-elevation cap radius from shell altitude |
| Coverage renderer | Earth-surface discs or gap mask; bind to operational snapshot scrubber |
| Demo script | 2020 sparse → 2026 near-global |

**Baseline tag:** `baseline/pre-coverage-viz` — checkout before starting Phase 7.

---

### Phase 8 — Bandwidth heatmap

**Goal:** Lat-lon capacity grid from public Gbps/sat disclosures; filter by hardware class.

See **COVERAGE_PHASE_PLAN.md** Phase 8.

---

### Phase 9 — Forward scenarios (Gen3, full filing)

V3 nominal shells, scenario picker, export/share. See **COVERAGE_PHASE_PLAN.md** Phase 9.

---

### Phase 6 — Simulation polish (stretch)

| Task | Detail |
|------|--------|
| TLE import | CelesTrak / Space-Track for **actual** Starlink positions vs nominal |
| Time control | UTC clock, pause, jump |
| Sun vector | Terminator on Earth; SSO groups aligned to sun-sync logic |
| ISL graph | Optical links between co-planar / adjacent-plane sats (ODC + Starlink) |
| Export | Screenshot / share preset views |

---

## Architecture sketch (for implementation)

```
src/
  data/           # ODC Table 1, Starlink Gen1/2/3, hardware, snapshots
  model/          # constellation build, launch/compute, coverage grid
  render/         # Earth, GPU sats, tracks, coverage
  ui/             # control panel (redesign next — keep this folder)
    types.ts
    controlPanel.ts
    odcCapacityChart.ts
  orbits.ts       # ECI / Walker math
  main.ts         # bootstrap + animation loop
```

Shared config shape:

```ts
interface ShellConfig {
  id: string;
  layer: "odc" | "starlink-gen1" | "starlink-gen2";
  altitudeKm: number | [number, number];
  inclinationDeg: number | [number, number];
  planeCount: number;
  satsPerPlane: number;
  shellCount?: number;      // ODC multi-shell bands
}
```

---

## Recommended order of work

1. **Phase 1** — biggest UX win, low risk  
2. **Phase 2** — fixes perception of polar groups + inspection  
3. **Phase 3** — Gen1 as sanity check against real orbits  
4. **Phase 4** — Gen2 before pushing ODC to full scale  
5. **Phase 5** — ODC 1M representative rendering  
6. **Phase 6** — live data & polish  

---

## Running

```bash
cd ~/Desktop/Final\ runs/SpaceX\ Orbital\ Simulator
npm install
npm run dev    # → http://localhost:5175
```

---

## References

- SpaceX Orbital Data Center application (Jan 2026): [FCC DA-26-113](https://docs.fcc.gov/public/attachments/DA-26-113A1.pdf)
- Starlink Gen2 partial grant: [FCC DA-26-36](https://docs.fcc.gov/public/attachments/DA-26-36A1.pdf)
- Starlink Gen2 original order: [FCC-22-91](https://docs.fcc.gov/public/attachments/FCC-22-91A1.pdf)
- Gen1 modified constellation: [Jonathan McDowell — Starlink](https://planet4589.org/astro/starsim/con.html)
