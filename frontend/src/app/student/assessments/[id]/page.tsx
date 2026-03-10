'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStudentAssessment, useMySubmission, useStartExam, useMyExtraTime } from '@/hooks/use-assessments';
import { toIST, getApiError } from '@/lib/utils';
import { useState, useEffect } from 'react';

export default function AssessmentInstructionsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [error, setError] = useState('');
  const [showModeModal, setShowModeModal] = useState(false);
  const [startingMode, setStartingMode] = useState<'portal' | 'upload' | null>(null);

  const { data: assessment, isLoading } = useStudentAssessment(id);
  const { data: submission, refetch: refetchSubmission } = useMySubmission(id);
  const { data: extraTime } = useMyExtraTime(id, 30_000); // poll every 30s
  const startMutation = useStartExam();

  // Student has active extra time if effectiveEndAt is in the future
  const hasActiveExtraTime =
    !!extraTime?.effectiveEndAt &&
    new Date(extraTime.effectiveEndAt) > new Date();

  // When extra time is granted while student is on this page, refetch submission status
  // Must be above early returns to satisfy Rules of Hooks
  useEffect(() => {
    if (hasActiveExtraTime) refetchSubmission();
  }, [hasActiveExtraTime]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="animate-pulse h-8 w-48 bg-slate-200 rounded mb-4" />
        <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="p-6 text-slate-500">
        Assessment not found.{' '}
        <Link href="/student/assessments" className="text-blue-600 hover:underline">
          Back
        </Link>
      </div>
    );
  }

  const alreadySubmitted = submission?.status === 'submitted' || submission?.status === 'evaluated';
  const inProgress = submission?.status === 'in_progress';
  // Can resume if submitted (not evaluated) and has active extra time
  const canResume = submission?.status === 'submitted' && hasActiveExtraTime;

  const handleStart = async (mode: 'portal' | 'upload') => {
    setError('');
    setStartingMode(mode);
    try {
      await startMutation.mutateAsync(id);
      if (mode === 'upload') {
        router.push(`/student/assessments/${id}/exam?mode=upload`);
      } else {
        router.push(`/student/assessments/${id}/exam`);
      }
    } catch (err) {
      setError(getApiError(err));
      setStartingMode(null);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/student/assessments"
          className="text-slate-400 hover:text-slate-600 text-sm"
        >
          ← Assessments
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h1 className="text-xl font-semibold text-slate-800 mb-1">
          {assessment.title}
        </h1>
        {assessment.subject && (
          <p className="text-sm text-blue-600 mb-4">{assessment.subject}</p>
        )}

        <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
          <div>
            <p className="text-xs text-slate-500">Total Marks</p>
            <p className="font-semibold text-slate-800">{assessment.totalMarks}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Questions</p>
            <p className="font-semibold text-slate-800">
              {assessment._count?.questions ?? '—'}
            </p>
          </div>
          {assessment.startAt && (
            <div>
              <p className="text-xs text-slate-500">Start</p>
              <p className="font-medium text-slate-700 text-sm">
                {toIST(assessment.startAt, 'dd MMM yyyy, hh:mm a')}
              </p>
            </div>
          )}
          {assessment.endAt && (
            <div>
              <p className="text-xs text-slate-500">End</p>
              <p className="font-medium text-slate-700 text-sm">
                {toIST(assessment.endAt, 'dd MMM yyyy, hh:mm a')}
              </p>
            </div>
          )}
          {assessment.negativeMarking && (
            <div className="col-span-2">
              <p className="text-xs text-orange-600 font-medium">
                ⚠ Negative marking enabled — wrong MCQ answers will deduct marks
              </p>
            </div>
          )}
        </div>

        {/* How to attempt */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg">
          <h2 className="text-sm font-semibold text-blue-800 mb-2">How to Attempt</h2>
          <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
            <li>Choose how you want to submit your answers (see below).</li>
            <li>View the full question paper on the next screen.</li>
            <li>Write or type your answers, then submit before the deadline.</li>
          </ol>
        </div>

        {assessment.instructions && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">
              Instructions
            </h2>
            <p className="text-sm text-slate-600 whitespace-pre-wrap bg-yellow-50 p-4 rounded-lg border border-yellow-100">
              {assessment.instructions}
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500 mb-4 bg-red-50 p-3 rounded-lg">
            {error}
          </p>
        )}

        {/* Extra time notice */}
        {extraTime && extraTime.extraMinutes > 0 && hasActiveExtraTime && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            +{extraTime.extraMinutes} min extra time granted
            {extraTime.reason && ` — ${extraTime.reason}`}
            {extraTime.effectiveEndAt && (
              <span className="block mt-0.5 font-medium">
                Extended deadline: {toIST(extraTime.effectiveEndAt, 'dd MMM yyyy, hh:mm a')}
              </span>
            )}
          </div>
        )}

        {canResume ? (
          <div>
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-semibold text-green-800 mb-1">
                Extra time has been granted. You may resume your assessment.
              </p>
              <p className="text-xs text-green-700">
                Your previous answers are saved and intact.
                {extraTime?.effectiveEndAt && (
                  <> Extended deadline: <span className="font-medium">{toIST(extraTime.effectiveEndAt, 'dd MMM yyyy, hh:mm a')}</span>.</>
                )}
              </p>
            </div>
            <button
              onClick={() => setShowModeModal(true)}
              disabled={startMutation.isPending}
              className="w-full py-3 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-60"
            >
              Resume Assessment
            </button>
          </div>
        ) : alreadySubmitted ? (
          <div className="text-center">
            <p className="text-sm text-green-600 font-medium mb-3">
              You have already submitted this assessment.
            </p>
            {assessment.resultsReleased && (
              <Link
                href={`/student/assessments/${id}/result`}
                className="inline-block px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                View Result
              </Link>
            )}
          </div>
        ) : inProgress ? (
          <button
            onClick={() => router.push(`/student/assessments/${id}/exam`)}
            className="w-full py-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Resume Test
          </button>
        ) : assessment.status === 'active' || (assessment.status === 'closed' && hasActiveExtraTime) ? (
          <button
            onClick={() => setShowModeModal(true)}
            disabled={startMutation.isPending}
            className="w-full py-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60"
          >
            Start Exam
          </button>
        ) : (
          <button
            disabled
            className="w-full py-3 text-sm bg-slate-100 text-slate-400 rounded-lg cursor-not-allowed"
          >
            {assessment.status === 'published'
              ? 'Exam not started yet'
              : 'Exam closed'}
          </button>
        )}
      </div>

      {/* Mode selection modal */}
      {showModeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">
              How would you like to submit?
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              Both modes are available. You can also use both on the same exam screen.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {/* Write in Portal */}
              <button
                onClick={() => handleStart('portal')}
                disabled={!!startingMode}
                className="group flex flex-col items-start gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 bg-blue-100 group-hover:bg-blue-200 rounded-xl flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">Write in Portal</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Select MCQ options and type your descriptive answers directly in the browser.
                  </p>
                </div>
                {startingMode === 'portal' ? (
                  <span className="text-xs text-blue-600 font-medium">Starting…</span>
                ) : (
                  <span className="text-xs text-blue-600 font-medium group-hover:underline">Choose this →</span>
                )}
              </button>

              {/* Upload PDF */}
              <button
                onClick={() => handleStart('upload')}
                disabled={!!startingMode}
                className="group flex flex-col items-start gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-green-400 hover:bg-green-50 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 bg-green-100 group-hover:bg-green-200 rounded-xl flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">Upload Answer Sheet</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Write answers on paper, scan/photograph them, and upload as a single PDF.
                  </p>
                </div>
                {startingMode === 'upload' ? (
                  <span className="text-xs text-green-600 font-medium">Starting…</span>
                ) : (
                  <span className="text-xs text-green-600 font-medium group-hover:underline">Choose this →</span>
                )}
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowModeModal(false)}
                disabled={!!startingMode}
                className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
