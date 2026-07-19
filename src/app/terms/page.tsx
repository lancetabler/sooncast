import Link from "next/link";

export const metadata = { title: "Terms — Cusp" };

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed text-muted-foreground">
      <Link href="/" className="text-primary">← Back</Link>
      <h1 className="mt-6 text-2xl font-bold text-foreground">Terms of Service</h1>
      <p className="mt-2 text-xs">Last updated: {new Date().getFullYear()}</p>

      <h2 className="mt-8 text-base font-semibold text-foreground">The gist</h2>
      <p className="mt-2">Cusp helps you track events and get reminders. It&apos;s provided as-is — we work hard to keep schedules accurate and reminders on time, but we can&apos;t guarantee external data is always correct or that every notification is delivered. Don&apos;t rely on it as your only source for anything critical.</p>

      <h2 className="mt-6 text-base font-semibold text-foreground">Your account</h2>
      <p className="mt-2">You&apos;re responsible for keeping your login secure and for the content you add. Don&apos;t use Cusp to break the law or abuse the service or the sources it pulls from.</p>

      <h2 className="mt-6 text-base font-semibold text-foreground">Data sources</h2>
      <p className="mt-2">Schedule data belongs to its respective owners; Cusp surfaces it for personal use. Availability of any given source may change.</p>

      <h2 className="mt-6 text-base font-semibold text-foreground">Subscriptions</h2>
      <p className="mt-2">Pro is billed through Stripe and can be cancelled anytime from the billing portal; access continues until the end of the paid period.</p>

      <h2 className="mt-6 text-base font-semibold text-foreground">Changes</h2>
      <p className="mt-2">We may update these terms and the service over time. Continued use means you accept the current version.</p>

      <p className="mt-8 text-xs italic">This is a starting template — have it reviewed before a public, commercial launch.</p>
    </main>
  );
}
