import { prisma } from "@/lib/prisma";

// Stripe sends events here. Verify the signature, then flip the user's plan.
// Configure the endpoint in the Stripe dashboard and set STRIPE_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) return new Response("Billing not configured", { status: 501 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const raw = await req.text();
  let event;
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secret);
    event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (e) {
    return new Response("Bad signature: " + (e as Error).message, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as {
          client_reference_id?: string | null;
          metadata?: { userId?: string } | null;
          customer?: string | null;
        };
        const userId = s.client_reference_id || s.metadata?.userId;
        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data: { plan: "PRO", ...(s.customer ? { stripeCustomerId: String(s.customer) } : {}) },
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as { customer?: string; metadata?: { userId?: string } };
        if (sub.metadata?.userId) {
          await prisma.user.update({ where: { id: sub.metadata.userId }, data: { plan: "FREE" } }).catch(() => {});
        } else if (sub.customer) {
          await prisma.user.updateMany({ where: { stripeCustomerId: String(sub.customer) }, data: { plan: "FREE" } });
        }
        break;
      }
    }
  } catch (e) {
    return new Response("Handler error: " + (e as Error).message, { status: 500 });
  }

  return Response.json({ received: true });
}
