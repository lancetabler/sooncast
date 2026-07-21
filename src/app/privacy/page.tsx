import Link from "next/link";

export const metadata = { title: "Privacy — Sooncast" };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed text-muted-foreground">
      <Link href="/" className="text-primary">← Back</Link>
      <h1 className="mt-6 text-2xl font-bold text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-xs">Last updated: {new Date().getFullYear()}</p>

      <h2 className="mt-8 text-base font-semibold text-foreground">What we store</h2>
      <p className="mt-2">Your email, a hashed password, and the events, categories, and sources you choose to track. That&apos;s it — we don&apos;t collect more than the app needs to work.</p>

      <h2 className="mt-6 text-base font-semibold text-foreground">Notifications</h2>
      <p className="mt-2">If you enable push notifications, we store an anonymous push subscription for your device so we can send reminders. You can turn this off anytime in Settings or your browser.</p>

      <h2 className="mt-6 text-base font-semibold text-foreground">Third parties</h2>
      <p className="mt-2">We fetch schedules from public sources (e.g. ESPN, TheSportsDB, Jolpica, TMDB) on your behalf. We use privacy-friendly, aggregate analytics to understand usage, and a payment processor (Stripe) if you subscribe to Pro. We don&apos;t sell your data.</p>

      <h2 className="mt-6 text-base font-semibold text-foreground">Your data</h2>
      <p className="mt-2">You can export everything (Settings → Export) and delete your account at any time, which removes your data from our database.</p>

      <h2 className="mt-6 text-base font-semibold text-foreground">Contact</h2>
      <p className="mt-2">Questions? Email the address listed in the app.</p>

      <p className="mt-8 text-xs italic">This is a starting template — have it reviewed before a public, commercial launch.</p>
    </main>
  );
}
