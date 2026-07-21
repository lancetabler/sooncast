import { getCurrentUser } from "@/lib/auth";
import { loadState } from "@/lib/state";
import AuthScreen from "@/components/app/AuthScreen";
import AppClient from "@/components/app/AppClient";

export const dynamic = "force-dynamic";

// The web app (moved off "/" — which is now the marketing landing page).
export default async function AppPage() {
  const user = await getCurrentUser();
  if (!user) return <AuthScreen />;
  const state = await loadState(user.id);
  if (!state) return <AuthScreen />;
  return <AppClient initial={state} />;
}
