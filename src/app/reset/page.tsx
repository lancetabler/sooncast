import ResetForm from "@/components/app/ResetForm";

export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="radar-glow flex min-h-dvh items-center justify-center px-6">
      <ResetForm token={token ?? ""} />
    </div>
  );
}
