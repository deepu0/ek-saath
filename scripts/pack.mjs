// Builds dist/eksaath-<version>.zip for the Chrome Web Store with only the files the extension needs.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const FILES = ["manifest.json", "background.js", "domain.js", "reorder.js", "popup.html", "popup.js",
  "options.html", "options.js", "icons", "fonts", "LICENSE"];
for (const f of FILES) if (!fs.existsSync(path.join(root, f))) throw new Error(`missing ${f}`);

// every file the manifest and pages reference must be in the package
const refs = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page,
  ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
for (const html of ["popup.html", "options.html"]) {
  const src = fs.readFileSync(path.join(root, html), "utf8");
  for (const m of src.matchAll(/(?:src|href)="([^"#:]+)"/g)) refs.push(m[1]);
}
const css = fs.readFileSync(path.join(root, "fonts/fonts.css"), "utf8");
for (const m of css.matchAll(/url\('([^']+)'\)/g)) refs.push("fonts/" + m[1]);
for (const r of refs) if (!fs.existsSync(path.join(root, r))) throw new Error(`referenced but missing: ${r}`);
if (/https?:\/\//.test(css)) throw new Error("fonts.css must not load remote fonts");

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", `eksaath-${manifest.version}.zip`);
fs.rmSync(out, { force: true });
execFileSync("zip", ["-qr", "-X", out, ...FILES, "-x", "*.DS_Store"], { cwd: root, stdio: "inherit" });
console.log(`${path.relative(root, out)}  ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
