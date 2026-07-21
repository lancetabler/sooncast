import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { rateLimit, clientId } from "@/lib/ratelimit";

const schema = z.object({ email: z.string().email() });

// Beta-access signups from the marketing landing page. No auth — just an email, deduped.
export async function POST(req: Request) {
  const rl = rateLimit(`waitlist:${clientId(req)}`, 5, 60 * 60 * 1000);
  if (!rl.ok) return bad("Too many requests. Try again later.", 429);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Enter a valid email");
  const email = parsed.data.email.toLowerCase();

  // Upsert so re-submitting is idempotent and never leaks whether the email was already there.
  await prisma.waitlist.upsert({
    where: { email },
    update: {},
    create: { email, source: "landing" },
  });
  return ok({ ok: true });
}
