import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, cp } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "xlsx",
  "zod",
  "zod-validation-error",
];

// These packages should NEVER be bundled - they need runtime access to env vars
const forceExternals = [
  "pg",
  "@prisma/client",
  "@prisma/adapter-pg",
  "@neondatabase/serverless",
  "ws",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = [
    ...allDeps.filter((dep) => !allowlist.includes(dep)),
    ...forceExternals,
  ];

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "dist/index.js",
    minify: true,
    external: externals,
    logLevel: "info",
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });

  // Copy generated Prisma client to dist
  console.log("copying generated prisma client...");
  await cp("generated", "dist/generated", { recursive: true });

  // Create CJS wrapper for ESM module
  console.log("creating CJS wrapper...");
  const { writeFile } = await import("fs/promises");
  await writeFile("dist/index.cjs", `import("./index.js");`);
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
