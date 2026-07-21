import { getCurrentUser } from "@/lib/auth";
import { Landing } from "@/components/marketing/Landing";

export const dynamic = "force-dynamic";

// The public front door is now a marketing landing page + beta waitlist.
// The web app itself lives at /app; the mobile app talks to /api/* (unchanged).
export default async function Home() {
  const user = await getCurrentUser();
  return <Landing loggedIn={!!user} />;
}
