import { getCurrentUser } from "@/lib/auth";
import { loadState } from "@/lib/state";
import AuthScreen from "@/components/app/AuthScreen";
import AppClient from "@/components/app/AppClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <AuthScreen />;
  const state = await loadState(user.id);
  if (!state) return <AuthScreen />;
  return <AppClient initial={state} />;
}
