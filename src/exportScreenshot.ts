/** Download current WebGL canvas as PNG (requires preserveDrawingBuffer on renderer). */
export function exportCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, filename);
  }, "image/png");
}

/** Composite WebGL canvas with a caption block and download PNG. */
export function exportCanvasPngWithOverlay(
  canvas: HTMLCanvasElement,
  overlayLines: string[],
  filename: string
): void {
  const lines = overlayLines.filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    exportCanvasPng(canvas, filename);
    return;
  }

  const w = canvas.width;
  const h = canvas.height;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d");
  if (!ctx) {
    exportCanvasPng(canvas, filename);
    return;
  }

  ctx.drawImage(canvas, 0, 0);
  const dpr = w / Math.max(1, canvas.clientWidth);
  const fontSize = Math.round(11 * dpr);
  const lineHeight = Math.round(14 * dpr);
  const pad = Math.round(10 * dpr);
  ctx.font = `${fontSize}px ui-monospace, Menlo, monospace`;
  const maxW = lines.reduce((m, line) => Math.max(m, ctx.measureText(line).width), 0);
  const boxW = maxW + pad * 2;
  const boxH = lines.length * lineHeight + pad * 2;
  const x = pad;
  const y = h - boxH - pad;

  ctx.fillStyle = "rgba(8, 12, 22, 0.84)";
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = "#e8eef8";
  lines.forEach((line, i) => {
    ctx.fillText(line, x + pad, y + pad + (i + 0.85) * lineHeight);
  });

  off.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, filename);
  }, "image/png");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function screenshotFilename(prefix = "constellation-sim"): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
}
