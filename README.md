# SpaceX Orbital Simulator

Interactive 3D visualization of Starlink and the proposed Orbital Data Center fleet.

**Canonical location:** `~/Desktop/Final runs/SpaceX Orbital Simulator`  
**GitHub:** https://github.com/NewDawn333/constellation-sim

This folder is the only working copy. Do not develop in `Cursor/constellation-sim`, `constellation-viz`, or `Grok Build Projects` copies.

## Run

```bash
cd ~/Desktop/Final\ runs/SpaceX\ Orbital\ Simulator
npm install
npm run dev
```

Or double-click **`Launch Constellation Sim.command`** on the Desktop or in this folder.

Open the URL Vite prints (usually **http://localhost:5175/**).

```bash
npm test      # unit tests
npm run build # production bundle
```

## What’s in the tree

| Path | Role |
|------|------|
| `src/data/` | ODC Table 1, Starlink Gen1/2/3, hardware, snapshots |
| `src/model/` | Constellation build, launch/compute, coverage grid |
| `src/render/` | Earth, GPU sats, tracks, coverage layer |
| `src/ui/` | Control panel (to be redesigned) |
| `src/orbits.ts` | ECI / Walker math |
| `src/main.ts` | App bootstrap and animation loop |

See **[ROADMAP.md](./ROADMAP.md)** for completed phases. UI cleanup and historic launch playback are next.
