import fs from "node:fs/promises";

const names = [
  "messages-square",
  "circle-help",
  "plus",
  "layout-dashboard",
  "message-square-text",
  "list-ordered",
  "chart-pie",
  "file-chart-column",
  "database",
  "x",
  "map-pin",
  "chevron-down",
  "arrow-up-right",
  "arrow-right",
  "arrow-left",
  "search",
  "sliders-horizontal",
  "bus",
  "heart-pulse",
  "hand-heart",
  "leaf",
  "shield-check",
  "shapes",
  "users",
  "coins",
  "check",
  "check-check",
  "info",
  "rotate-ccw",
  "download",
  "printer",
  "send",
  "check-circle-2",
  "triangle-alert",
  "refresh-cw",
  "sparkles",
  "chevron-right",
  "calendar-days",
  "lock-keyhole",
  "clipboard-list",
  "scale",
  "target",
  "clock-3",
];
const symbols = [];
for (const name of names) {
  const svg = await fs.readFile(
    new URL(`../node_modules/lucide-static/icons/${name}.svg`, import.meta.url),
    "utf8",
  );
  const body = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1];
  if (!body) throw new Error(`Invalid Lucide source: ${name}`);
  symbols.push(`<symbol id="${name}" viewBox="0 0 24 24">${body}</symbol>`);
}
await fs.writeFile(
  new URL("../public/app/icons.svg", import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg"><!-- Lucide 1.63.0, ISC license --><defs>\n${symbols.join("\n")}\n</defs></svg>\n`,
);
