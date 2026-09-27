import { readFileSync, writeFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

// One portable HTML file: no runtime modules, stylesheets or worker requests.
const root = resolve("dist");
const embedded = new Set();
const asset = url => {
  const path = resolve(root, url);
  if (!path.startsWith(root + sep)) throw Error(`Build asset escapes output directory: ${url}`);
  embedded.add(path);
  return readFileSync(path, "utf8");
};
let html = readFileSync(resolve(root, "index.html"), "utf8");
let scripts = 0, styles = 0;
html = html.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, url) => {
  scripts++;
  return `<script type="module">${asset(url).replace(/<\/script/gi, "<\\/script")}</script>`;
});
html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, url) => {
  styles++;
  return `<style>${asset(url).replace(/<\/style/gi, "<\\/style")}</style>`;
});
html = html.replace(/(<link\b[^>]*rel="icon"[^>]*href=")([^"]+)(")/g,
  (_, before, url, after) => `${before}data:image/svg+xml,${encodeURIComponent(asset(url))}${after}`);
if (scripts !== 1 || styles !== 1 || /<(?:script|link)\b[^>]*(?:src|href)="(?!data:)/.test(html))
  throw Error("Standalone build still has external assets or an unexpected bundle layout.");
// Fail if future code splitting or asset imports create files this build cannot embed.
for (const name of readdirSync(root, { recursive: true })) {
  const path = resolve(root, name);
  if (name !== "index.html" && !embedded.has(path) && !statSync(path).isDirectory())
    throw Error(`Standalone build has an unembedded asset: ${name}`);
}
writeFileSync(resolve(root, "index.html"), html);
// Remove the now-inlined files, so copying dist/index.html is sufficient.
for (const name of readdirSync(root)) if (name !== "index.html") rmSync(resolve(root, name), { recursive: true });
console.log("Portable build: dist/index.html (inline styles, JavaScript, favicon and worker).");
