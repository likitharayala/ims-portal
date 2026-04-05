'use client';

import { useMemo } from 'react';
import { useMyAttendance } from '@/hooks/use-attendance';
import { useMyPerformance } from '@/hooks/use-assessments';
import type { PerformanceRecord } from '@/hooks/use-assessments';
import { toIST } from '@/lib/utils';

function getCurrentMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function getScorePercent(record: PerformanceRecord) {
  if (record.marksObtained === null || record.totalMarks <= 0) return null;
  return Math.round((record.marksObtained / record.totalMarks) * 100);
}

export default function StudentProgressPage() {
  const { month, year } = getCurrentMonthYear();
  const { data: performance = [], isLoading: performanceLoading } = useMyPerformance();
  const { data: attendance, isLoading: attendanceLoading } = useMyAttendance(month, year);

  const groupedSubjects = useMemo(() => {
    const released = performance.filter((record) => record.marksObtained !== null);
    const grouped = released.reduce<Record<string, PerformanceRecord[]>>((acc, record) => {
      const subject = record.subject ?? 'General';
      if (!acc[subject]) acc[subject] = [];
      acc[subject].push(record);
      return acc;
    }, {});

    return Object.entries(grouped).map(([subject, records]) => ({
      subject,
      records: records
        .sort((a, b) => {
          const aTime = new Date(a.evaluatedAt ?? a.startAt ?? 0).getTime();
          const bTime = new Date(b.evaluatedAt ?? b.startAt ?? 0).getTime();
          return aTime - bTime;
        })
        .slice(-3),
    }));
  }, [performance]);

  const recentResults = useMemo(
    () =>
      performance
        .filter((record) => record.marksObtained !== null)
        .sort((a, b) => {
          const aTime = new Date(a.evaluatedAt ?? a.startAt ?? 0).getTime();
          const bTime = new Date(b.evaluatedAt ?? b.startAt ?? 0).getTime();
          return bTime - aTime;
        })
        .slice(0, 3),
    [performance],
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">Learning Progress</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track improvement across subjects, attendance, and recent test results.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Subject Performance</h2>
            <p className="mt-1 text-sm text-slate-500">
              Recent progress across your latest assessments in each subject.
            </p>
          </div>

          {performanceLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
                />
              ))}
            </div>
          ) : groupedSubjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
              <p className="text-sm text-slate-500">No subject performance data yet.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {groupedSubjects.map(({ subject, records }) => (
                <div
                  key={subject}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <h3 className="text-lg font-semibold text-slate-800">{subject}</h3>
                  <div className="mt-5 space-y-4">
                    {records.map((record, index) => {
                      const percent = getScorePercent(record) ?? 0;

                      return (
                        <div key={record.assessmentId}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="font-medium text-slate-700">
                              Week {index + 1}
                            </span>
                            <span className="text-slate-500">{percent}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full ${
                                percent >= 75
                                  ? 'bg-emerald-500'
                                  : percent >= 50
                                    ? 'bg-amber-500'
                                    : 'bg-rose-400'
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-slate-400">{record.title}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800">Attendance Summary</h2>
            {attendanceLoading ? (
              <div className="mt-5 space-y-3">
                <div className="h-6 animate-pulse rounded bg-slate-100" />
                <div className="h-6 animate-pulse rounded bg-slate-100" />
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">Attendance</p>
                    <span className="text-sm font-semibold text-blue-700">
                      {attendance?.percentage ?? 0}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${attendance?.percentage ?? 0}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Classes Missed
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-800">
                    {attendance?.absent ?? 0}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800">Recent Results</h2>
            <p className="mt-1 text-sm text-slate-500">Your latest 3 released scores.</p>

            {performanceLoading ? (
              <div className="mt-5 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-16 animate-pulse rounded-xl bg-slate-100"
                  />
                ))}
              </div>
            ) : recentResults.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <p className="text-sm text-slate-500">No recent results yet.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {recentResults.map((record) => {
                  const percent = getScorePercent(record) ?? 0;

                  return (
                    <div
                      key={record.assessmentId}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-800">{record.title}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {record.evaluatedAt
                              ? toIST(record.evaluatedAt, 'dd MMM yyyy')
                              : 'Recently added'}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-emerald-700">
                          {percent}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
