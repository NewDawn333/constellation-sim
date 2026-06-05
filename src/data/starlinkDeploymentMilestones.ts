/** Raw readings used to build Jan 1 operational milestones (see reconcileDeploymentTotal). */

export type DeploymentMetric = "operational_orbit" | "working" | "active";

export interface DeploymentSourceReading {
  name: string;
  url: string;
  asOf: string;
  metric: DeploymentMetric;
  count: number;
}

export interface DeploymentMilestoneInput {
  id: string;
  label: string;
  asOf: string;
  /** Shell ids present in this era (subset of reference shells in starlinkDeployed.ts). */
  shellIds: number[];
  primary: DeploymentSourceReading;
  secondary: DeploymentSourceReading;
  /** McDowell log.dat “Total working” at Jan 1 — tie-breaker when sources diverge. */
  mcdowellWorking: number;
  notes?: string;
}

const MCDOWELL_LOG = "https://planet4589.org/space/con/star/log.dat";

function mcdowellJan1(year: number, opOrbit: number): DeploymentSourceReading {
  return {
    name: "Jonathan McDowell GCAT",
    url: MCDOWELL_LOG,
    asOf: `${year}-01-01`,
    metric: "operational_orbit",
    count: opOrbit,
  };
}

/** Jan 1 milestones — McDowell log.dat bins tagged “Jan 1” (2023/2024 use adjacent bin when missing). */
export const DEPLOYMENT_MILESTONES: DeploymentMilestoneInput[] = [
  {
    id: "2019-01-01",
    label: "Jan 1 2019",
    asOf: "2019-01-01",
    shellIds: [301],
    primary: mcdowellJan1(2019, 0),
    secondary: {
      name: "Wikipedia / SpaceX filings",
      url: "https://en.wikipedia.org/wiki/Starlink",
      asOf: "2019-01-01",
      metric: "active",
      count: 2,
    },
    mcdowellWorking: 2,
    notes: "Tintin prototypes only · no operational shell yet",
  },
  {
    id: "2020-01-01",
    label: "Jan 1 2020",
    asOf: "2020-01-01",
    shellIds: [301],
    primary: mcdowellJan1(2020, 16),
    secondary: {
      name: "SpaceNews (Jan 2020 launch coverage)",
      url: "https://spacenews.com/spacex-becomes-operator-of-worlds-largest-commercial-satellite-constellation-with-starlink-launch/",
      asOf: "2020-01-01",
      metric: "active",
      count: 120,
    },
    mcdowellWorking: 117,
    notes: "First batch ops · most sats still orbit-raising (16 in op shell)",
  },
  {
    id: "2021-01-01",
    label: "Jan 1 2021",
    asOf: "2021-01-01",
    shellIds: [301, 305],
    primary: mcdowellJan1(2021, 539),
    secondary: {
      name: "UCS Satellite Database",
      url: "https://www.ucs.org/sites/default/files/2021-02/UCS-Satellite-Database-1-1-2021.txt",
      asOf: "2021-01-01",
      metric: "active",
      count: 902,
    },
    mcdowellWorking: 861,
    notes: "Better Than Nothing beta · 550 km shell + early polar",
  },
  {
    id: "2022-01-01",
    label: "Jan 1 2022",
    asOf: "2022-01-01",
    shellIds: [301, 305],
    primary: mcdowellJan1(2022, 1473),
    secondary: {
      name: "UCS Satellite Database",
      url: "https://www.ucs.org/sites/default/files/2022-02/UCS-Satellite-Database-1-1-2022.txt",
      asOf: "2022-01-01",
      metric: "active",
      count: 1815,
    },
    mcdowellWorking: 1752,
    notes: "Gen1 only · 550 km + early polar",
  },
  {
    id: "2023-01-01",
    label: "Jan 1 2023",
    asOf: "2023-01-01",
    shellIds: [301, 302, 304, 305, 306],
    primary: mcdowellJan1(2023, 3058),
    secondary: {
      name: "UCS Satellite Database",
      url: "https://www.ucs.org/sites/default/files/2023-06/UCS-Satellite-Database-1-1-2023.txt",
      asOf: "2023-01-01",
      metric: "active",
      count: 3349,
    },
    mcdowellWorking: 3326,
    notes: "Gen1 · Group 4 540 km shell online",
  },
  {
    id: "2024-01-01",
    label: "Jan 1 2024",
    asOf: "2024-01-01",
    shellIds: [301, 302, 303, 304, 305, 306, 401, 402],
    primary: mcdowellJan1(2024, 4543),
    secondary: {
      name: "Wikipedia / press (Jan 2024)",
      url: "https://earthsky.org/spaceflight/spacex-starlink-launches-january-2024/",
      asOf: "2024-01-01",
      metric: "active",
      count: 5289,
    },
    mcdowellWorking: 5202,
    notes: "Gen2 V2 Mini first shells · DTC test sats launching",
  },
  {
    id: "2025-01-01",
    label: "Jan 1 2025",
    asOf: "2025-01-01",
    shellIds: [301, 302, 303, 304, 305, 306, 401, 402, 403, 404, 405],
    primary: mcdowellJan1(2025, 5142),
    secondary: {
      name: "KeepTrack.space",
      url: "https://keeptrack.space/x-report/spacex-brief-2025-01-01",
      asOf: "2025-01-01",
      metric: "working",
      count: 6867,
    },
    mcdowellWorking: 6845,
    notes: "Gen2 ramp · many sats still in ascent vs op shell",
  },
  {
    id: "2026-01-01",
    label: "Jan 1 2026",
    asOf: "2026-01-01",
    shellIds: [301, 302, 303, 304, 305, 306, 401, 402, 403, 404, 405, 406, 407, 408, 409],
    primary: mcdowellJan1(2026, 8067),
    secondary: {
      name: "KeepTrack.space",
      url: "https://keeptrack.space/x-report/spacex-brief-2026-01-01",
      asOf: "2026-01-01",
      metric: "working",
      count: 9384,
    },
    mcdowellWorking: 9369,
    notes: "Pre-retirement wave · Gen2 majority of new launches",
  },
];
