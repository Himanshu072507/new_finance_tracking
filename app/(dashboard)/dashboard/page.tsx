import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSpendByCategory, getMonthlySpend } from "@/lib/db/transactions";
import SummaryCards from "@/components/dashboard/summary-cards";
import MonthlyTrendChart from "@/components/dashboard/monthly-trend-chart";
import CategoryDonutChart from "@/components/dashboard/category-donut-chart";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;

  const selectedMonth = sp.month ?? "";

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  let categoryRangeStart: string;
  let categoryRangeEnd: string;

  if (selectedMonth) {
    const [y, m] = selectedMonth.split("-").map(Number);
    categoryRangeStart = `${selectedMonth}-01`;
    categoryRangeEnd = new Date(y, m, 0).toISOString().slice(0, 10);
  } else {
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    categoryRangeStart = sixMonthsAgo.toISOString().slice(0, 10);
    categoryRangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  }

  const [categoryData, monthlyData] = await Promise.all([
    getSpendByCategory(supabase, user.id, categoryRangeStart, categoryRangeEnd).catch((e) => {
      return [];
    }),
    getMonthlySpend(supabase, user.id, 6).catch((e) => {
      return [];
    }),
  ]);

  const thisMonthSpend = monthlyData.find((d) => d.month === thisMonthKey)?.total ?? 0;
  const totalSpend = monthlyData.reduce((sum, d) => sum + d.total, 0);
  const topCategory = categoryData[0]?.category ?? "";

  // Generate last 12 months as options for the filter
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    return { key, label };
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <SummaryCards totalSpend={totalSpend} thisMonthSpend={thisMonthSpend} topCategory={topCategory} />
      <div className="grid grid-cols-2 gap-6">
        <MonthlyTrendChart data={monthlyData} />
        <CategoryDonutChart data={categoryData} selectedMonth={selectedMonth} monthOptions={monthOptions} />
      </div>
    </div>
  );
}
