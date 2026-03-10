'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { toIST } from '@/lib/utils';

interface Assessment {
  id: string;
  title: string;
  subject: string | null;
  instructions: string | null;
  status: string;
  startAt: string | null;
  endAt: string | null;
  totalMarks: number;
}

interface Material {
  id: string;
  title: string;
  subject: string;
  author: string | null;
  description: string | null;
  createdAt: string;
}

interface StudentDashboardData {
  upcomingAssessments: Assessment[];
  unreadNotifications: number;
  recentMaterials: Material[];
}

const STATUS_BADGE: Record<string, string> = {
  published: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
};

export default function StudentDashboardPage() {
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/student/dashboard');
      return data.data as StudentDashboardData;
    },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">
          Hi, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-slate-500 mt-1">Here's your overview for today.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Link href="/student/assessments" className="block">
          <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
            {isLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-8 w-10 bg-slate-200 rounded mx-auto" />
                <div className="h-3 w-24 bg-slate-100 rounded mx-auto" />
              </div>
            ) : (
              <>
                <p className="text-3xl font-bold text-blue-700">
                  {data?.upcomingAssessments.length ?? 0}
                </p>
                <p className="text-xs text-slate-500 mt-1">Upcoming Assessments</p>
              </>
            )}
          </div>
        </Link>

        <Link href="/student/notifications" className="block">
          <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
            {isLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-8 w-10 bg-slate-200 rounded mx-auto" />
                <div className="h-3 w-24 bg-slate-100 rounded mx-auto" />
              </div>
            ) : (
              <>
                <p className="text-3xl font-bold text-amber-600">
                  {data?.unreadNotifications ?? 0}
                </p>
                <p className="text-xs text-slate-500 mt-1">Unread Notifications</p>
              </>
            )}
          </div>
        </Link>

        <Link href="/student/materials" className="block">
          <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
            {isLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-8 w-10 bg-slate-200 rounded mx-auto" />
                <div className="h-3 w-24 bg-slate-100 rounded mx-auto" />
              </div>
            ) : (
              <>
                <p className="text-3xl font-bold text-purple-700">
                  {data?.recentMaterials.length ?? 0}
                </p>
                <p className="text-xs text-slate-500 mt-1">Recent Materials</p>
              </>
            )}
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Assessments */}
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-3">Upcoming Assessments</h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
                  <div className="h-4 w-48 bg-slate-200 rounded mb-2" />
                  <div className="h-3 w-32 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : data?.upcomingAssessments.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 border-dashed p-8 text-center">
              <p className="text-slate-400 text-sm">No upcoming assessments</p>
              <Link
                href="/student/assessments"
                className="inline-flex items-center justify-center mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                View Assessments
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.upcomingAssessments.map((a) => {
                const isLocked = a.status === 'published';
                const cardContent = (
                  <>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isLocked && (
                          <span
                            aria-label="Locked assessment"
                            className="text-sm text-slate-400"
                          >
                            🔒
                          </span>
                        )}
                        <h3 className="font-medium text-slate-800 text-sm truncate">
                          {a.title}
                        </h3>
                      </div>
                      <span
                        className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                          STATUS_BADGE[a.status] ?? 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {a.status}
                      </span>
                    </div>
                    {a.subject && (
                      <p className="text-xs text-slate-500 mb-2">{a.subject}</p>
                    )}
                    <div className="flex gap-4 text-xs text-slate-400">
                      {a.startAt && (
                        <span>Start: {toIST(a.startAt, 'dd MMM, hh:mm a')}</span>
                      )}
                      {a.endAt && (
                        <span>End: {toIST(a.endAt, 'dd MMM, hh:mm a')}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Total marks: {a.totalMarks}
                    </p>
                  </>
                );

                if (isLocked) {
                  return (
                    <div
                      key={a.id}
                      className="bg-white rounded-xl border border-slate-200 p-4 cursor-not-allowed opacity-75 pointer-events-none"
                    >
                      {cardContent}
                    </div>
                  );
                }

                return (
                  <Link
                    key={a.id}
                    href={`/student/assessments/${a.id}`}
                    className="block bg-white rounded-xl border border-slate-200 p-4"
                  >
                    {cardContent}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Materials */}
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-3">Recent Materials</h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
                  <div className="h-4 w-48 bg-slate-200 rounded mb-2" />
                  <div className="h-3 w-32 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : data?.recentMaterials.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 border-dashed p-8 text-center">
              <p className="text-slate-400 text-sm">No materials uploaded yet</p>
              <Link
                href="/student/materials"
                className="inline-flex items-center justify-center mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Browse Materials
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.recentMaterials.map((m) => (
                <div
                  key={m.id}
                  className="bg-white rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-800 text-sm truncate">
                        {m.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">{m.subject}</p>
                      {m.author && (
                        <p className="text-xs text-slate-400 mt-0.5">by {m.author}</p>
                      )}
                    </div>
                    <span className="flex-shrink-0 text-xs text-slate-400">
                      {toIST(m.createdAt, 'dd MMM')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
