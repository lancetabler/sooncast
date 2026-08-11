/* Diagnose which follows fail to import: fetch each follow's source read-only and report.
   Run from d:\Tracker:  npx tsx scripts/check-follows.ts   */
import { readFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import { fetchFromSource } from "../src/lib/sources/registry";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const follows = await prisma.follow.findMany({ orderBy: { label: "asc" } });
  console.log(`${follows.length} follows\n`);
  for (const f of follows) {
    const t0 = Date.now();
    try {
      const events = await fetchFromSource(f.provider, f.ref);
      console.log(`OK    ${f.provider}:${f.ref} [${f.label}] -> ${events.length} events (${Date.now() - t0}ms)`);
    } catch (e) {
      console.log(`FAIL  ${f.provider}:${f.ref} [${f.label}] -> ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
