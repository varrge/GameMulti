import { BindingsShell } from "@/src/components/bindings-shell";

export default async function BindConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return <BindingsShell initialToken={params.token} />;
}
