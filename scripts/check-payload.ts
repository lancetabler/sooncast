import { prisma } from "../src/lib/prisma";
async function main() {
  const total = await prisma.event.count();
  const rows = await prisma.event.findMany({ take: 400 });
  const bytes = Buffer.byteLength(JSON.stringify(rows));
  const perRow = bytes / rows.length;
  console.log(`events stored: ${total}`);
  console.log(`avg row JSON: ${Math.round(perRow)} bytes -> full /api/state payload approx ${(total * perRow / 1024 / 1024).toFixed(2)} MB`);
  const byFollow = await prisma.event.groupBy({ by: ["sourceLabel"], _count: true, orderBy: { _count: { sourceLabel: "desc" } }, take: 8 });
  for (const g of byFollow) console.log(`   ${String(g._count).padStart(5)}  ${g.sourceLabel ?? "manual"}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
