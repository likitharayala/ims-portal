'use client';

import Link from 'next/link';
import { useStudentResults } from '@/hooks/use-assessments';
import { toIST } from '@/lib/utils';

function PassBadge({ marks, total }: { marks: number; total: number }) {
  const pct = total > 0 ? (marks / total) * 100 : 0;
  const passed = pct >= 40;
  return (
    <span
      className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${
        passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
      }`}
    >
      {passed ? 'Pass' : 'Fail'}
    </span>
  );
}

export default function StudentResultsPage() {
  const { data: results, isLoading } = useStudentResults();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">My Results</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Assessments with released results
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading results…</div>
        ) : !results || results.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-base font-medium text-slate-600">No results yet</p>
            <p className="text-sm text-slate-400 mt-1">
              Results will appear here once your teacher releases them.
            </p>
            <Link
              href="/student/assessments"
              className="mt-4 inline-block text-blue-600 text-sm hover:underline"
            >
              View assessments
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Assessment</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 hidden sm:table-cell">Subject</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">Marks</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">Result</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 hidden lg:table-cell">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((r) => (
                  <tr key={r.submissionId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {r.title}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                      {r.subject ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-semibold text-slate-800">{r.marksObtained}</span>
                      <span className="text-slate-400 text-xs">/{r.totalMarks}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <PassBadge marks={r.marksObtained} total={r.totalMarks} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">
                      {r.evaluatedAt ? toIST(r.evaluatedAt, 'dd MMM yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/student/assessments/${r.assessmentId}/result`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
