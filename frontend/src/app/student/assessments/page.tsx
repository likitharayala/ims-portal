'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStudentAssessments } from '@/hooks/use-assessments';
import type { Assessment } from '@/hooks/use-assessments';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { toIST } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  published: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-orange-100 text-orange-700',
  evaluated: 'bg-purple-100 text-purple-700',
};

function AssessmentCard({ a }: { a: Assessment }) {
  const canStart = a.status === 'active';
  const hasResult = a.status === 'evaluated' && a.resultsReleased;
  // Closed assessments link through to detail page — students with extra time
  // will see a Start Exam button there; others see "Exam closed"
  const isClosedOrEvaluated = a.status === 'closed' || a.status === 'evaluated';

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3 ${
        a.status === 'published' ? 'opacity-80' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 text-sm truncate">
            {a.title}
          </h3>
          {a.subject && (
            <p className="text-xs text-blue-600 font-medium mt-0.5">{a.subject}</p>
          )}
        </div>
        <span
          className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[a.status] ?? ''}`}
        >
          {a.status}
        </span>
      </div>

      <div className="text-xs text-slate-500 space-y-0.5">
        <p>{a._count?.questions ?? 0} questions · {a.totalMarks} marks</p>
        {a.startAt && (
          <p>Start: {toIST(a.startAt, 'dd MMM yyyy, hh:mm a')}</p>
        )}
        {a.endAt && (
          <p>End: {toIST(a.endAt, 'dd MMM yyyy, hh:mm a')}</p>
        )}
        {a.negativeMarking && (
          <p className="text-orange-500">Negative marking enabled</p>
        )}
      </div>

      <div className="mt-auto">
        {canStart ? (
          <Link
            href={`/student/assessments/${a.id}`}
            className="inline-flex items-center justify-center w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Start Exam
          </Link>
        ) : hasResult ? (
          <Link
            href={`/student/assessments/${a.id}/result`}
            className="inline-flex items-center justify-center w-full px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
          >
            View Result
          </Link>
        ) : isClosedOrEvaluated ? (
          <Link
            href={`/student/assessments/${a.id}`}
            className="inline-flex items-center justify-center w-full px-4 py-2 text-sm border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-colors"
          >
            View Details
          </Link>
        ) : (
          <button
            disabled
            className="w-full px-4 py-2 text-sm border border-slate-200 text-slate-400 rounded-lg cursor-not-allowed"
          >
            Not started yet
          </button>
        )}
      </div>
    </div>
  );
}

export default function StudentAssessmentsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useStudentAssessments({
    search: search || undefined,
    page,
  });

  const assessments = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Assessments</h1>
        {meta && (
          <p className="text-sm text-slate-500 mt-0.5">
            {meta.total} assessment{meta.total !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search title, subject…"
          className="w-full sm:w-80 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : assessments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
          <p className="text-4xl mb-4">📝</p>
          <p className="text-slate-500 text-sm">No assessments available yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(assessments as Assessment[]).map((a) => (
            <AssessmentCard key={a.id} a={a} />
          ))}
        </div>
      )}

      {meta && meta.total > meta.pageSize && (
        <div className="flex items-center justify-between mt-6 text-sm text-slate-600">
          <span>
            Page {meta.page} of {Math.ceil(meta.total / meta.pageSize)}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50"
            >
              Previous
            </button>
            <button
              disabled={page >= Math.ceil(meta.total / meta.pageSize)}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
