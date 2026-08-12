import type { OdcCapacityTimeline } from "../model/odcCapacity";

export interface OdcCapacityChartOptions {
  timeline: OdcCapacityTimeline;
  highlightYear?: number;
  width?: number;
  height?: number;
}

const PAD = { top: 10, right: 44, bottom: 22, left: 40 };

export function drawOdcCapacityChart(
  canvas: HTMLCanvasElement,
  options: OdcCapacityChartOptions
): void {
  const { timeline, highlightYear } = options;
  const points = timeline.byYear;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(200, options.width ?? (rect.width || canvas.clientWidth || 280));
  const cssH = options.height ?? 128;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (points.length === 0) {
    ctx.fillStyle = "#6e7d96";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText("No launches in scenario", PAD.left, cssH / 2);
    return;
  }

  const plotW = cssW - PAD.left - PAD.right;
  const plotH = cssH - PAD.top - PAD.bottom;

  const years = points.map((p) => p.year);
  const minYear = years[0]!;
  const maxYear = years[years.length - 1]!;
  const yearSpan = Math.max(1, maxYear - minYear);

  const gwValues = points.map((p) => p.snapshot.powerGw);
  const pflopsValues = points.map((p) => p.snapshot.computePflops);
  const maxGw = Math.max(...gwValues, 1e-9);
  const maxPflops = Math.max(...pflopsValues, 1e-9);

  const xAt = (year: number) => PAD.left + ((year - minYear) / yearSpan) * plotW;
  const yGw = (gw: number) => PAD.top + plotH - (gw / maxGw) * plotH;
  const yPf = (pf: number) => PAD.top + plotH - (pf / maxPflops) * plotH;

  ctx.strokeStyle = "rgba(120, 160, 220, 0.12)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + plotW, y);
    ctx.stroke();
  }

  const drawSeries = (values: number[], yMap: (v: number) => number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = xAt(points[i]!.year);
      const y = yMap(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  drawSeries(gwValues, yGw, "#ffb347");
  drawSeries(pflopsValues, yPf, "#6eb5ff");

  if (highlightYear !== undefined && highlightYear >= minYear && highlightYear <= maxYear) {
    const hx = xAt(highlightYear);
    ctx.strokeStyle = "rgba(232, 240, 255, 0.55)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, PAD.top);
    ctx.lineTo(hx, PAD.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = "#8a9bb5";
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillText(String(minYear), PAD.left, cssH - 4);
  ctx.textAlign = "right";
  ctx.fillText(String(maxYear), PAD.left + plotW, cssH - 4);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffb347";
  ctx.fillText(formatAxisGw(maxGw), 4, PAD.top + 10);
  ctx.fillStyle = "#6eb5ff";
  ctx.textAlign = "right";
  ctx.fillText(formatAxisPflops(maxPflops), cssW - 4, PAD.top + 10);

  ctx.textAlign = "left";
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillStyle = "#ffb347";
  ctx.fillText("GW", PAD.left, cssH - 4);
  ctx.fillStyle = "#6eb5ff";
  ctx.fillText("PFLOPS", PAD.left + 28, cssH - 4);
}

function formatAxisGw(max: number): string {
  if (max >= 1) return `${max.toFixed(1)}GW`;
  if (max >= 1e-3) return `${(max * 1000).toFixed(0)}MW`;
  return `${(max * 1e6).toFixed(0)}kW`;
}

function formatAxisPflops(max: number): string {
  if (max >= 1000) return `${(max / 1000).toFixed(1)}E`;
  if (max >= 1) return `${max.toFixed(0)}P`;
  return `${(max * 1000).toFixed(0)}T`;
}
