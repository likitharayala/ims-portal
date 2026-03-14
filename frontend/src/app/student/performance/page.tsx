'use client';

import Link from 'next/link';
import { useMyPerformance } from '@/hooks/use-assessments';
import type { PerformanceRecord } from '@/hooks/use-assessments';
import { toIST } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
  absent: 'bg-orange-100 text-orange-700',
  evaluated: 'bg-green-100 text-green-700',
  submitted: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-slate-100 text-slate-500',
};

const STATUS_LABEL: Record<string, string> = {
  absent: 'Absent',
  evaluated: 'Evaluated',
  submitted: 'Submitted',
  in_progress: 'In Progress',
};

export default function StudentPerformancePage() {
  const { data: records = [], isLoading } = useMyPerformance();

  const evaluated = records.filter((r) => r.marksObtained !== null);
  const avgPct =
    evaluated.length > 0
      ? Math.round(
          evaluated.reduce((sum, r) => sum + (r.marksObtained! / r.totalMarks) * 100, 0) /
            evaluated.length,
        )
      : null;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/student/profile" className="text-slate-400 hover:text-slate-600 text-sm">
          ← Profile
        </Link>
        <h1 className="text-2xl font-semibold text-slate-800">Performance History</h1>
      </div>

      {/* Summary cards */}
      {!isLoading && records.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{records.length}</p>
            <p className="text-xs text-slate-500 mt-1">Total Assessments</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{evaluated.length}</p>
            <p className="text-xs text-slate-500 mt-1">Results Released</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-purple-700">
              {avgPct !== null ? `${avgPct}%` : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1">Average Score</p>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm animate-pulse">
          Loading performance…
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
          <p className="text-4xl mb-4">📊</p>
          <p className="font-medium text-slate-700">No assessments yet</p>
          <p className="text-sm text-slate-500 mt-1">Your results will appear here once you take assessments.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Assessment</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase hidden sm:table-cell">Subject</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">Score</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase hidden md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r: PerformanceRecord) => {
                const pct =
                  r.marksObtained !== null && r.totalMarks > 0
                    ? Math.round((r.marksObtained / r.totalMarks) * 100)
                    : null;
                return (
                  <tr key={r.assessmentId} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{r.title}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                      {r.subject ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.marksObtained !== null ? (
                        <div>
                          <span
                            className={`font-semibold ${
                              pct !== null && pct >= 75
                                ? 'text-green-600'
                                : pct !== null && pct >= 40
                                ? 'text-amber-600'
                                : 'text-red-500'
                            }`}
                          >
                            {r.marksObtained} / {r.totalMarks}
                          </span>
                          {pct !== null && (
                            <p className="text-xs text-slate-400">{pct}%</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">
                          {r.resultReleased ? '—' : 'Awaiting results'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_STYLE[r.status] ?? 'bg-slate-100 text-slate-500'}`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                      {r.submittedAt ? toIST(r.submittedAt, 'dd MMM yyyy') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
