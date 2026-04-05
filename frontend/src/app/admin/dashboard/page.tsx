'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { formatINR } from '@/lib/utils';

interface AdminStats {
  totalStudents: number;
  pendingPayments: { count: number; totalAmount: number };
  activeAssessments: number;
  totalMaterials: number;
}

function StatCard({
  label,
  value,
  sub,
  color,
  loading,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  loading: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-8 w-16 bg-slate-200 rounded" />
          <div className="h-3 w-32 bg-slate-100 rounded" />
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className={`text-3xl font-bold mt-2 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuthStore();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: async () => {
      const { data } = await api.get('/admin/dashboard/stats');
      return data.data as AdminStats;
    },
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">
          Welcome back, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Here's what's happening at your institute today.
        </p>
      </div>

      {/* Stat cards — 2×2 on mobile, 4-in-a-row on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link href="/admin/students" className="block">
          <StatCard
            label="Total Students"
            value={stats?.totalStudents ?? 0}
            sub="Active enrollments"
            color="text-blue-700"
            loading={isLoading}
          />
        </Link>
        <Link href="/admin/payments?tab=pending" className="block">
          <StatCard
            label="Pending Payments"
            value={stats?.pendingPayments.count ?? 0}
            sub={
              stats
                ? `${formatINR(stats.pendingPayments.totalAmount)} outstanding`
                : 'Loading…'
            }
            color="text-amber-600"
            loading={isLoading}
          />
        </Link>
        <Link href="/admin/materials" className="block">
          <StatCard
            label="Study Materials"
            value={stats?.totalMaterials ?? 0}
            sub="Visible to students"
            color="text-purple-700"
            loading={isLoading}
          />
        </Link>
        <Link href="/admin/assessments" className="block">
          <StatCard
            label="Active Assessments"
            value={stats?.activeAssessments ?? 0}
            sub="Published + active"
            color="text-green-700"
            loading={isLoading}
          />
        </Link>
      </div>

      {/* Empty state for new institutes */}
      {!isLoading && stats?.totalStudents === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-12 text-center">
          <p className="text-4xl mb-4">🎉</p>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            Welcome to Teachly!
          </h2>
          <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
            Your institute is set up. Start by adding students, then upload study materials or
            create an assessment.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <a
              href="/admin/students/new"
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Add First Student
            </a>
            <a
              href="/admin/settings"
              className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
            >
              Institute Settings
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
