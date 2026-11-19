// Builds index.html (the page GitHub Pages serves) from the files in src/.
//
//   node build.mjs           write index.html
//   node build.mjs --check   exit 1 if index.html is not what src/ builds (no write)
//
// index.html is generated. Edit src/, then run the build. No dependencies.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(root, "src", ...p), "utf8");

// JS files are joined in name order (01-, 02-, ...). They share one global scope,
// exactly as if they were one <script>, so later files can use earlier names.
const jsDir = join(root, "src", "js");
const js = readdirSync(jsDir).filter(f => f.endsWith(".js")).sort().map(f => src("js", f)).join("");

const html =
  src("head.html") +
  "<style>\n" + src("styles.css") + "</style>\n" +
  src("body.html") +
  "<script>\n" + js + "</script>\n</body>\n</html>\n";

const out = join(root, "index.html");
if (process.argv.includes("--check")) {
  let current = "";
  try { current = readFileSync(out, "utf8"); } catch {}
  if (current !== html) {
    console.error("index.html is out of date. Run: node build.mjs");
    process.exit(1);
  }
  console.log("index.html matches src/ (" + Buffer.byteLength(html) + " bytes)");
} else {
  writeFileSync(out, html);
  console.log("Wrote index.html (" + Buffer.byteLength(html) + " bytes)");
}
