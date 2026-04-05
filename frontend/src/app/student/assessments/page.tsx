'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  useStudentAssessments,
  useStudentResults,
} from '@/hooks/use-assessments';
import type {
  Assessment,
  StudentResultRecord,
} from '@/hooks/use-assessments';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { toIST } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  published: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-slate-100 text-slate-700',
};

function formatDate(value?: string | null) {
  if (!value) return 'To be announced';
  return toIST(value, 'dd MMMM');
}

function formatDateWithYear(value?: string | null) {
  if (!value) return 'To be announced';
  return toIST(value, 'dd MMM yyyy');
}

function formatDuration(startAt?: string, endAt?: string) {
  if (!startAt || !endAt) return 'TBA';
  const diffMs = new Date(endAt).getTime() - new Date(startAt).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes >= 60 && diffMinutes % 60 === 0) {
    return `${diffMinutes / 60} hr`;
  }
  if (diffMinutes > 60) {
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours} hr ${minutes} mins`;
  }
  return `${diffMinutes} mins`;
}

function formatScore(result: StudentResultRecord) {
  if (!result.totalMarks) return '0%';
  const percentage = Math.round((result.marksObtained / result.totalMarks) * 100);
  return `${percentage}%`;
}

function UpcomingTestCard({ assessment }: { assessment: Assessment }) {
  const isActive = assessment.status === 'active';
  const statusLabel = isActive ? 'Active' : 'Upcoming';

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-800">
            {assessment.title}
          </h3>
          <p className="mt-1 text-sm font-medium text-blue-700">
            {assessment.subject ?? 'General'}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[assessment.status] ?? STATUS_STYLES.published}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <p>
          <span className="font-medium text-slate-700">Date:</span>{' '}
          {formatDate(assessment.startAt)}
        </p>
        <p>
          <span className="font-medium text-slate-700">Duration:</span>{' '}
          {formatDuration(assessment.startAt, assessment.endAt)}
        </p>
        <p>
          <span className="font-medium text-slate-700">Total Marks:</span>{' '}
          {assessment.totalMarks}
        </p>
      </div>

      <div className="mt-5">
        {isActive ? (
          <Link
            href={`/student/assessments/${assessment.id}`}
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Start Test
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-400"
          >
            Start Test
          </button>
        )}
      </div>
    </div>
  );
}

function CompletedTestCard({ result }: { result: StudentResultRecord }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-800">
            {result.title}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {result.subject ?? 'General'}
          </p>
        </div>
        <span className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100">
          Completed
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <p>
          <span className="font-medium text-slate-700">Score:</span>{' '}
          {formatScore(result)}
        </p>
        <p>
          <span className="font-medium text-slate-700">Date:</span>{' '}
          {formatDateWithYear(result.evaluatedAt ?? result.startAt)}
        </p>
      </div>

      <div className="mt-5">
        <Link
          href={`/student/assessments/${result.assessmentId}/result`}
          className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          View Analysis
        </Link>
      </div>
    </div>
  );
}

export default function StudentAssessmentsPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useStudentAssessments({
    search: search || undefined,
  });
  const { data: results = [], isLoading: resultsLoading } = useStudentResults();

  const upcomingTests = useMemo(
    () =>
      (data?.data ?? []).filter(
        (assessment) =>
          assessment.status === 'published' || assessment.status === 'active',
      ),
    [data],
  );

  const completedTests = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return results;
    return results.filter(
      (result) =>
        result.title.toLowerCase().includes(query) ||
        (result.subject ?? '').toLowerCase().includes(query),
    );
  }, [results, search]);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Assessments</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track your upcoming tests and review completed ones in one place.
        </p>
      </div>

      <div className="mb-8">
        <input
          type="text"
          placeholder="Search title or subject..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-80"
        />
      </div>

      <section className="mb-10">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Upcoming Tests</h2>
          <p className="mt-1 text-sm text-slate-500">
            Tests that are scheduled next or currently active.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        ) : upcomingTests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <p className="text-sm text-slate-500">No upcoming tests right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {upcomingTests.map((assessment) => (
              <UpcomingTestCard key={assessment.id} assessment={assessment} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Completed Tests</h2>
          <p className="mt-1 text-sm text-slate-500">
            Review your released results and open detailed analysis.
          </p>
        </div>

        {resultsLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        ) : completedTests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <p className="text-sm text-slate-500">No completed tests available yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {completedTests.map((result) => (
              <CompletedTestCard key={result.submissionId} result={result} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
