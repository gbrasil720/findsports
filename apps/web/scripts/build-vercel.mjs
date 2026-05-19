import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");

const distServer = resolve(webRoot, "dist/server");
const distClient = resolve(webRoot, "dist/client");

// Output relative to cwd (= Vercel's root directory).
// When Vercel root = apps/web  → cwd = apps/web  → apps/web/.vercel/output ✓
// When Vercel root = repo root → cwd = repo root → .vercel/output ✓
const vercelOut = resolve(process.cwd(), ".vercel/output");
const funcDir = resolve(vercelOut, "functions/ssr.func");

if (!existsSync(distServer)) {
	console.error("Error: dist/server not found. Run the web build first.");
	process.exit(1);
}

console.log("Creating Vercel Build Output...");
console.log("  cwd:    ", process.cwd());
console.log("  output: ", vercelOut);

// Clean previous output and create structure
rmSync(vercelOut, { recursive: true, force: true });
mkdirSync(`${vercelOut}/static`, { recursive: true });
mkdirSync(funcDir, { recursive: true });

// Static assets → served directly by Vercel CDN
cpSync(distClient, `${vercelOut}/static`, { recursive: true });

// Server assets (dynamic import chunks) → must live next to index.mjs
if (existsSync(`${distServer}/assets`)) {
	cpSync(`${distServer}/assets`, `${funcDir}/assets`, { recursive: true });
}

// Thin wrapper that re-exports the Web fetch handler.
// Placed in dist/server/ so it can import './server.js' via relative path.
// server.js exports `default { fetch(request): Promise<Response> }`
const wrapperPath = resolve(distServer, "_entry.mjs");
writeFileSync(
	wrapperPath,
	[
		`import server from './server.js'`,
		`export default async function handler(request) {`,
		`  return server.fetch(request)`,
		`}`,
	].join("\n"),
);

// Bundle wrapper + server.js + all npm deps into one self-contained file.
// Dynamic imports with literal paths (assets/*.js) are inlined by bun
// when splitting is disabled. Node built-ins stay external.
const result = await Bun.build({
	entrypoints: [wrapperPath],
	outdir: funcDir,
	naming: { entry: "index.mjs" },
	target: "node",
	format: "esm",
	external: ["node:*"],
	minify: false,
});

rmSync(wrapperPath);

if (!result.success) {
	for (const log of result.logs) console.error(log);
	console.error("Bundle failed.");
	process.exit(1);
}

// Copy server.js itself so dynamic imports that weren't inlined can still load
cpSync(`${distServer}/server.js`, `${funcDir}/server.js`);

// Vercel serverless function config
writeFileSync(
	resolve(funcDir, ".vc-config.json"),
	JSON.stringify(
		{
			runtime: "nodejs22.x",
			handler: "index.mjs",
			launcherType: "Nodejs",
		},
		null,
		2,
	),
);

// Routing: serve static files from CDN, everything else → SSR function
writeFileSync(
	resolve(vercelOut, "config.json"),
	JSON.stringify(
		{
			version: 3,
			routes: [
				{ handle: "filesystem" },
				{ src: "/(.*)", dest: "/ssr" },
			],
		},
		null,
		2,
	),
);

console.log("Done.");
