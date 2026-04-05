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

  const overduePaymentsCount = stats?.pendingPayments.count ?? 0;
  const assessmentsEndingToday: number = 0;
  const attendancePendingCount: number = 0;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">
          Welcome back, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Here is a clear summary of student activity, pending work, and the most
          important tasks to review today.
        </p>
      </div>

      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-800">Institute Overview</h2>
        <p className="text-sm text-slate-500 mt-1">
          Use these numbers to quickly understand the current status of students,
          payments, materials, and assessments.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/students" className="block">
          <StatCard
            label="Active Students"
            value={stats?.totalStudents ?? 0}
            sub="Students currently enrolled in your institute"
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
                ? `${formatINR(stats.pendingPayments.totalAmount)} still pending collection`
                : 'Loading...'
            }
            color="text-amber-600"
            loading={isLoading}
          />
        </Link>

        <Link href="/admin/materials" className="block">
          <StatCard
            label="Study Materials"
            value={stats?.totalMaterials ?? 0}
            sub="Materials currently available for students"
            color="text-purple-700"
            loading={isLoading}
          />
        </Link>

        <Link href="/admin/assessments" className="block">
          <StatCard
            label="Active Assessments"
            value={stats?.activeAssessments ?? 0}
            sub="Assessments that are published or currently running"
            color="text-green-700"
            loading={isLoading}
          />
        </Link>
      </div>

      <div className="mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">
            Needs Attention Today
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            Review these items first to keep daily operations complete and up to
            date.
          </p>

          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
              <span className="text-lg" aria-hidden="true">
                !
              </span>
              <p className="text-sm leading-6 text-slate-700">
                <span className="font-semibold text-slate-900">
                  {overduePaymentsCount}
                </span>{' '}
                payment record{overduePaymentsCount === 1 ? '' : 's'} overdue.
                These payments need follow-up because they have not been cleared on
                time.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
              <span className="text-lg" aria-hidden="true">
                i
              </span>
              <p className="text-sm leading-6 text-slate-700">
                <span className="font-semibold text-slate-900">
                  {assessmentsEndingToday}
                </span>{' '}
                assessment{assessmentsEndingToday === 1 ? '' : 's'} ending
                today. Review timings and student submissions before the exam
                window closes.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <span className="text-lg" aria-hidden="true">
                *
              </span>
              <p className="text-sm leading-6 text-slate-700">
                Attendance is still pending for{' '}
                <span className="font-semibold text-slate-900">
                  {attendancePendingCount}
                </span>{' '}
                batch{attendancePendingCount === 1 ? '' : 'es'}. Mark
                attendance to keep daily records complete.
              </p>
            </div>
          </div>
        </div>
      </div>

      {!isLoading && stats?.totalStudents === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-8 text-center sm:p-12">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            Your dashboard is ready
          </h2>
          <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
            Your institute setup is complete. Start by adding students, then
            continue with materials, assessments, payments, and attendance from
            one place.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <a
              href="/admin/students/new"
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Add Your First Student
            </a>
            <a
              href="/admin/settings"
              className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
            >
              Review Institute Settings
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
