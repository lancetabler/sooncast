import { requireUser, isResponse, ok, bad } from "@/lib/api";

// Stripe checkout. Fully wired for keys; without them it returns a clear 501 so
// the UI can explain that billing isn't configured yet (dev-safe).
export async function POST() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const secret = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (!secret || !price) {
    return bad("Billing isn't configured on this deployment yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID.", 501);
  }

  // Lazy import so the app runs without the stripe package installed in dev.
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      customer_email: user.email,
      success_url: `${appUrl}/?upgraded=1`,
      cancel_url: `${appUrl}/`,
      metadata: { userId: user.id },
    });
    return ok({ url: session.url });
  } catch (e) {
    return bad("Couldn't start checkout: " + (e as Error).message, 502);
  }
}
