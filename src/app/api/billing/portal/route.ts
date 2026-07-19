import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// Opens the Stripe customer portal so a subscriber can manage/cancel.
export async function POST() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const secret = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (!secret) return bad("Billing isn't configured yet.", 501);

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.stripeCustomerId) return bad("No subscription found for this account.", 400);

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secret);
    const session = await stripe.billingPortal.sessions.create({
      customer: dbUser.stripeCustomerId,
      return_url: `${appUrl}/`,
    });
    return ok({ url: session.url });
  } catch (e) {
    return bad("Couldn't open billing portal: " + (e as Error).message, 502);
  }
}
