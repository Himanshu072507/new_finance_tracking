import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("plan").eq("id", user.id).single();

  const plan = (profile?.plan ?? "free") as "free" | "pro";

  console.log("User:", user);
  console.log("Plan:", plan);

  return (
    <div className="flex min-h-screen">
      <Sidebar plan={plan} />
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
