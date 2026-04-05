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

function SummaryCard({
  href,
  value,
  label,
  accentClass,
  loading,
}: {
  href: string;
  value: number;
  label: string;
  accentClass: string;
  loading: boolean;
}) {
  return (
    <Link href={href} className="block">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:bg-slate-50">
        {loading ? (
          <div className="animate-pulse space-y-2">
            <div className="mx-auto h-8 w-10 rounded bg-slate-200" />
            <div className="mx-auto h-3 w-24 rounded bg-slate-100" />
          </div>
        ) : (
          <div className="text-center">
            <p className={`text-3xl font-bold ${accentClass}`}>{value}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
          </div>
        )}
      </div>
    </Link>
  );
}

export default function StudentDashboardPage() {
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/student/dashboard');
      return data.data as StudentDashboardData;
    },
  });

  const nextAssessment = data?.upcomingAssessments[0] ?? null;
  const nextAssessmentLocked = nextAssessment?.status === 'published';

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="space-y-8">
        {/* Greeting Section */}
        <section>
          <h1 className="text-2xl font-semibold text-slate-800">
            Hi {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ready to continue your learning today?
          </p>
        </section>

        {/* Next Assessment Card */}
        <section>
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-6 shadow-sm">
            {isLoading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-4 w-32 rounded bg-slate-200" />
                <div className="h-7 w-56 rounded bg-slate-100" />
                <div className="h-4 w-28 rounded bg-slate-100" />
                <div className="h-4 w-44 rounded bg-slate-100" />
                <div className="h-10 w-40 rounded-lg bg-slate-200" />
              </div>
            ) : nextAssessment ? (
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Next Assessment</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-800">
                    {nextAssessment.title}
                  </h2>
                  <p className="mt-2 text-sm text-blue-700">
                    {nextAssessment.subject ?? 'General'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {nextAssessment.startAt
                      ? toIST(nextAssessment.startAt, 'dd MMMM, hh:mm a')
                      : 'Schedule to be announced'}
                  </p>
                </div>

                {nextAssessmentLocked ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-400 cursor-not-allowed"
                  >
                    Starts Soon
                  </button>
                ) : (
                  <Link
                    href={`/student/assessments/${nextAssessment.id}`}
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Start Assessment
                  </Link>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Next Assessment</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-800">
                    No upcoming assessments
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Check your assessments page for newly published exams.
                  </p>
                </div>

                <Link
                  href="/student/assessments"
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  View Assessments
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Summary Cards */}
        <section>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard
              href="/student/assessments"
              value={data?.upcomingAssessments.length ?? 0}
              label="Upcoming Assessments"
              accentClass="text-blue-700"
              loading={isLoading}
            />
            <SummaryCard
              href="/student/notifications"
              value={data?.unreadNotifications ?? 0}
              label="Unread Notifications"
              accentClass="text-amber-600"
              loading={isLoading}
            />
            <SummaryCard
              href="/student/materials"
              value={data?.recentMaterials.length ?? 0}
              label="Recent Materials"
              accentClass="text-purple-700"
              loading={isLoading}
            />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Upcoming Assessments Section */}
          <section>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-slate-800">Upcoming Assessments</h2>
              <p className="mt-1 text-sm text-slate-500">
                Keep track of what is scheduled next.
              </p>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <div className="mb-3 h-4 w-40 rounded bg-slate-200" />
                    <div className="mb-2 h-3 w-24 rounded bg-slate-100" />
                    <div className="h-3 w-36 rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : data?.upcomingAssessments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
                <p className="text-sm text-slate-400">No upcoming assessments</p>
                <Link
                  href="/student/assessments"
                  className="mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  View Assessments
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {data?.upcomingAssessments.map((assessment) => {
                  const isLocked = assessment.status === 'published';

                  return (
                    <div
                      key={assessment.id}
                      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${
                        isLocked ? 'cursor-not-allowed opacity-70' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-slate-800">
                            {assessment.title}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {assessment.subject ?? 'General'}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                            isLocked
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {assessment.status}
                        </span>
                      </div>

                      <div className="mt-4 space-y-1 text-sm text-slate-500">
                        <p>
                          Start:{' '}
                          <span className="text-slate-700">
                            {assessment.startAt
                              ? toIST(assessment.startAt, 'dd MMM, hh:mm a')
                              : 'TBA'}
                          </span>
                        </p>
                        <p>
                          End:{' '}
                          <span className="text-slate-700">
                            {assessment.endAt
                              ? toIST(assessment.endAt, 'dd MMM, hh:mm a')
                              : 'TBA'}
                          </span>
                        </p>
                        <p>
                          Total Marks:{' '}
                          <span className="text-slate-700">{assessment.totalMarks}</span>
                        </p>
                      </div>

                      <div className="mt-4">
                        {isLocked ? (
                          <button
                            type="button"
                            disabled
                            className="inline-flex items-center justify-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed"
                          >
                            Starts Soon
                          </button>
                        ) : (
                          <Link
                            href={`/student/assessments/${assessment.id}`}
                            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                          >
                            Start Exam
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent Materials Section */}
          <section>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-slate-800">Recent Materials</h2>
              <p className="mt-1 text-sm text-slate-500">
                Revisit the latest uploads from your institute.
              </p>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <div className="mb-3 h-4 w-40 rounded bg-slate-200" />
                    <div className="mb-2 h-3 w-24 rounded bg-slate-100" />
                    <div className="h-9 w-28 rounded-lg bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : data?.recentMaterials.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
                <p className="text-sm text-slate-400">No materials uploaded yet</p>
                <Link
                  href="/student/materials"
                  className="mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Browse Materials
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {data?.recentMaterials.slice(0, 5).map((material) => (
                  <div
                    key={material.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-slate-800">
                          {material.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">{material.subject}</p>
                        <p className="mt-2 text-xs text-slate-400">
                          Uploaded {toIST(material.createdAt, 'dd MMM yyyy')}
                        </p>
                      </div>

                      <Link
                        href={`/student/materials/${material.id}`}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Open Material
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
