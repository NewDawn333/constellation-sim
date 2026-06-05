# Starlink global coverage & bandwidth — phase plan

**Baseline save point:** git tag `baseline/pre-coverage-viz` (Earth + ODC + Starlink operational snapshots, no coverage layer).

**Goal:** Show how Starlink’s **geographic service footprint** and **aggregate capacity** evolve from sparse early coverage → near-global today → full Gen2 / Gen3 filing — using per-satellite **coverage discs** first, then a **bandwidth heatmap** differentiated by hardware generation.

---

## What we already have (reuse, don’t rewrite)

| Asset | Location | Use for coverage |
|-------|----------|------------------|
| Jan 1 milestones 2019–2026 | `starlinkDeploymentMilestones.ts`, `starlinkHistoricalSnapshots.ts` | Time scrubber presets; gap narrative |
| Exact Jun 2026 shell cut | `starlinkDeployed.ts` | “Today” reference topology |
| Per-sat positions | `orbits.ts` + `ConstellationRenderer` | Subsatellite points for footprint centers |
| Ground tracks | `render/groundTrack.ts` | Pattern for lat/lon geometry on Earth |
| Operational view toggle | UI “Operational snapshot” | Default mode for coverage demo |

---

## Hardware taxonomy (sim model)

Map each deployed / nominal shell to a **hardware class**. Shell IDs from `STARLINK_DEPLOYED_REFERENCE_SHELLS`:

| Class ID | Display name | Shell examples (id / name) | Role |
|----------|--------------|------------------------------|------|
| `v1` | Starlink V1.0 | Early Group 1 only (historical) | Legacy ~¼ V2-Mini capacity |
| `v1.5` | Starlink V1.5 | 301–306 Gen1 shells | Workhorse through ~2024 |
| `v2m` | V2 Mini (broadband) | 401, 402, 405, 406–409 | Primary capacity add since 2023 |
| `dtc-v1` | Direct-to-Cell v1 | Early 403/404 batches; sparse LTE overlay | Phone service, not home broadband |
| `dtc-v2` | Direct-to-Cell v2 | Later DTC + optical-ISL shells (403/404 post-upgrade era) | Denser cellular overlay |
| `v3` | Gen3 (future) | Nominal shells only; not in McDowell cut yet | Scenario / forward projection |

**Per-satellite parameters** (public disclosures — store in `src/data/starlinkHardware.ts`, cite in UI):

| Class | Downlink (Gbps/sat) | Uplink (Gbps/sat) | Beams | Min elev (°) | Notes / source |
|-------|---------------------|-------------------|-------|----------------|----------------|
| `v1` | **24** | **1.7** | 8 | 25 | Starlink 2024 report: V2 Mini ≈4× V1.5 → ~24 Gbps down implied for prior gen |
| `v1.5` | **24** | **1.7** | 8 | 25 | Same order as v1; treat as one bucket unless shell metadata distinguishes |
| `v2m` | **96** | **6.7** | 16 | 25 | Starlink network update; TheXLab FCC analysis (Jun 2025) |
| `dtc-v1` | **0.002–0.004** (area) | — | 1 cell beam | 10 | Order-of-magnitude: Mbps-scale **per cell**, not Gbps/sat — separate layer |
| `dtc-v2` | **0.008–0.016** (area) | — | multi-cell | 10 | Assumed ~4× v1 DTC until SpaceX publishes; mark as `assumed` in UI |
| `v3` | **1000** | **160–200** | TBD | 25 | Starlink network update (H1 2026 target); scenario-only until launched |

Beam-level detail (optional Phase 8): 16 beams × ~6 Gbps down / ~0.42 Gbps up per V2 Mini (TheXLab).

---

## Coverage geometry (shared math)

**Footprint radius** on Earth for a satellite at altitude `h` (km) and minimum elevation `ε`:

```
R_earth = 6371 km
ψ = acos( (R_earth / (R_earth + h)) · cos(ε) ) − ε    // geocentric angle to horizon cap
ground_radius_km = R_earth · ψ
scene_radius_Re = ground_radius_km / 6371
```

Example at **550 km, ε = 25°** → ~**940 km** ground radius (~**0.15 Re**).

**Visualization modes:**

1. **Disc union (Phase 7)** — semi-transparent cap per sat (or merged per shell); gaps = no color.
2. **Grid accumulation (Phase 8)** — equirectangular raster (start **0.5°** ≈ 360×180); each sat adds capacity into cells under its cap with optional `1/d` or beam-count weighting.
3. **DTC separate layer** — same geometry, different color scale (Mbps, not Gbps).

Performance: do **not** draw one mesh per sat at full density. Use **GPU texture splat** or **downsampled grid** updated each frame or when time/snapshot changes.

---

## Phase 7 — Coverage footprint layer

**Goal:** User scrubs 2019 → 2026+ and *sees* holes close.

### 7.1 Data & typing
- [ ] `starlinkHardware.ts` — class defs + shell-id → class map
- [ ] Extend `DeployedShellRecord` or parallel map: `hardwareClass: HardwareClassId`
- [ ] `footprintRadiusRe(altitudeKm, minElevDeg)` + unit tests

### 7.2 Renderer
- [ ] `render/coverageDisc.ts` — instanced circle on Earth surface (or shader disc in tangent plane)
- [ ] Toggle: **Show coverage** (master)
- [ ] Sub-toggle: **Show gaps** (invert / dark holes outside union)
- [ ] Color by layer: Gen1 gold, V2M blue, DTC purple (distinct from shell tracks)

### 7.3 Time integration
- [ ] Bind to existing **As-of date** snapshot selector (operational view)
- [ ] Optional **play** button: animate snapshot index 2019 → 2026 at configurable speed
- [ ] HUD: `% Earth land area covered` (rough, grid sampled) + `sats contributing`

### 7.4 Milestone story beats (acceptance demo script)
| Snapshot | Expected visual |
|----------|-----------------|
| 2019-01-01 | No meaningful coverage (Tintin) |
| 2020-01-01 | Narrow mid-latitude swaths, huge gaps |
| 2021-01-01 | Growing 53° belt; polar patchy |
| 2023-01-01 | Still ocean/remote gaps; continents patchy |
| 2025-01-01 | Most populated land covered; polar / ocean gaps |
| 2026-06-03 | Near-continuous mid-latitude + polar shells; residual ocean gaps |
| Future scenario | Full Gen2 filing + V3 — effectively global broadband |

**Exit criteria:** Scrubbing snapshots clearly shows coverage gaps early and near-global today; FPS stays ≥30 at 1:100 density.

---

## Phase 8 — Bandwidth heatmap

**Goal:** Same timeline, but color = **aggregate downlink capacity** (Gbps per grid cell), with hardware-class breakdown.

### 8.1 Capacity model (v1)
- [ ] `buildCapacityGrid(snapshot, simTime)` → `Float32Array` lat-lon grid
- [ ] Per sat: add `downlinkGbps / N_cells_in_cap` to each cell under footprint (uniform split v1)
- [ ] **Concurrency factor** slider (default 0.3): “fraction of nominal capacity usable simultaneously”
- [ ] Class filter checkboxes: V1/V1.5, V2M, DTC v1, DTC v2, V3 (future scenario)

### 8.2 Visualization
- [ ] Earth texture overlay or second mesh with `DataTexture` (log scale: 0.1 → 100+ Gbps)
- [ ] Legend + cursor readout: “~42 Gbps down (12 sats)”
- [ ] Toggle: **Broadband** vs **Direct-to-Cell** (separate scales)

### 8.3 Validation
- [ ] Sanity: Jun 2026 total nominal downlink ≈ `N_v2m×96 + N_gen1×24` order-of-magnitude check vs Starlink “450 Tbps cumulative” public figure (within 2× — document mismatch)
- [ ] Unit tests for footprint area and one-sat grid stamp

**Exit criteria:** Bandwidth map updates when snapshot changes; V2M-dominated regions visibly hotter than 2021 Gen1-only view.

---

## Phase 9 — Forward scenarios & polish

- [ ] **Scenario picker:** Today / Full Gen2 filing / Gen3 partial (Starship cadence assumption)
- [ ] V3 shells in nominal `starlinkGen2.ts` or new `starlinkGen3.ts` — grey/ dashed orbits
- [ ] Export PNG + share URL with snapshot + layer state
- [ ] Optional: min-elevation slider (15°–35°) for “consumer dish” vs “mobility”
- [ ] Optional: night-side dimming (only sats in view of user terminal locations count)

---

## Architecture sketch

```
src/data/
  starlinkHardware.ts       # class specs + shell → class
  starlinkCoverage.ts       # footprint math, grid builders

src/render/
  coverageLayer.ts          # disc union mode
  bandwidthHeatmap.ts       # DataTexture overlay on Earth

src/model/
  coverageGrid.ts           # lat-lon raster ops

UI additions (index.html / ui.ts):
  Coverage section: [ ] Footprints [ ] Bandwidth [ ] DTC layer
  Min elevation, concurrency, class filters, Play timeline
```

---

## Implementation order (recommended)

1. **Save baseline** — tag `baseline/pre-coverage-viz`; feature branch `feature/coverage-phase-7`
2. **Phase 7.1–7.2** — hardware table + static disc for *current* snapshot only (prove renderer)
3. **Phase 7.3** — wire all milestones; gap narrative works
4. **Phase 8.1–8.2** — grid bandwidth on top of same positions
5. **Phase 9** — V3 + scenarios

Keep **`constellation-viz` untouched**; all work in `constellation-sim`.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| GPU melt at full sat count | Grid splat at 0.5°; update on snapshot change, not every frame |
| DTC numbers not public | Separate layer, labeled “illustrative”; order-of-magnitude only |
| V1 vs V1.5 indistinguishable in McDowell | Single bucket until shell notes say otherwise |
| User expects exact Starlink QoS | HUD disclaimer: “nominal physics + public capacity estimates, not network simulation” |

---

## References

- [Starlink Network Update](https://starlink.com/ws/updates/network-update) — V2 Mini 4× V1, V3 >1 Tbps down
- [TheXLab Starlink Analysis (PDF)](https://thexlab.org/wp-content/uploads/2025/07/Starlink_Analysis_Working_Paper_v0.2-1.pdf) — 96 Gbps / 6.7 Gbps per V2, beam model
- [Jonathan McDowell GCAT Starlink stats](https://planet4589.org/space/con/star/stats.html) — operational shell counts (already in sim)
