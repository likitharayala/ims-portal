'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useStudentResult } from '@/hooks/use-assessments';

export default function StudentResultPage() {
  const { id } = useParams<{ id: string }>();
  const { data: submission, isLoading, error } = useStudentResult(id);

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="animate-pulse h-8 w-48 bg-slate-200 rounded mb-4" />
        <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center">
        <p className="text-slate-500 text-sm mb-2">
          Results have not been released yet.
        </p>
        <Link
          href="/student/assessments"
          className="text-blue-600 hover:underline text-sm"
        >
          ← Back to Assessments
        </Link>
      </div>
    );
  }

  const questions = submission.assessment?.questions ?? [];
  const answers = (submission.answers as Record<string, any>) ?? {};
  const feedback = (submission.feedback as Record<string, any>) ?? {};
  const totalMarks = submission.totalMarks !== null && submission.totalMarks !== undefined
    ? Number(submission.totalMarks)
    : null;
  const maxMarks = submission.assessment?.totalMarks ?? '—';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/student/assessments"
          className="text-slate-400 hover:text-slate-600 text-sm"
        >
          ← Assessments
        </Link>
        <h1 className="text-xl font-semibold text-slate-800">
          {submission.assessment?.title} — Result
        </h1>
      </div>

      {/* Score card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 text-center">
        <p className="text-xs text-slate-500 uppercase font-medium mb-1">
          Your Score
        </p>
        <p className="text-5xl font-bold text-slate-800 mb-1">
          {totalMarks ?? '—'}
        </p>
        <p className="text-slate-500">out of {maxMarks}</p>
        {submission.status === 'absent' && (
          <p className="mt-3 text-sm text-orange-600 font-medium">Absent</p>
        )}
      </div>

      {/* Per-question breakdown */}
      {questions.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-slate-700 text-sm">
            Question Breakdown
          </h2>
          {questions.map((q: any) => {
            const answer = answers[q.id];
            const fb = feedback[q.id];
            const isCorrect =
              q.questionType === 'mcq' &&
              q.correctOption &&
              answer?.selectedOption === q.correctOption;
            const isWrong =
              q.questionType === 'mcq' &&
              q.correctOption &&
              answer?.selectedOption &&
              answer.selectedOption !== q.correctOption;

            return (
              <div
                key={q.id}
                className="bg-white rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-start gap-2 mb-2">
                  <span className="flex-shrink-0 w-6 h-6 bg-slate-100 rounded text-xs flex items-center justify-center font-medium text-slate-600">
                    {q.questionNumber}
                  </span>
                  <p className="text-sm text-slate-800">{q.questionText}</p>
                </div>

                {q.questionType === 'mcq' ? (
                  <div className="ml-8 text-sm">
                    {answer?.selectedOption ? (
                      <p>
                        Your answer:{' '}
                        <span
                          className={`font-medium ${
                            isCorrect ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {answer.selectedOption}
                          {isCorrect ? ' ✓' : ' ✗'}
                        </span>
                      </p>
                    ) : (
                      <p className="text-slate-400 text-xs">Not attempted</p>
                    )}
                    {q.correctOption && (
                      <p className="text-xs text-green-600">
                        Correct: {q.correctOption}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isCorrect
                        ? `+${Number(q.marks)}`
                        : isWrong && submission.assessment?.negativeMarking
                        ? `-${Number(submission.assessment.negativeValue ?? 0)}`
                        : '0'}{' '}
                      marks
                    </p>
                  </div>
                ) : (
                  <div className="ml-8">
                    {answer?.text ? (
                      <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded border border-slate-200 whitespace-pre-wrap">
                        {answer.text}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">Not attempted</p>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      {fb && (
                        <>
                          <span className="text-sm font-medium text-slate-700">
                            {fb.marks} / {Number(q.marks)} marks
                          </span>
                          {fb.comment && (
                            <span className="text-xs text-slate-500 italic">
                              &quot;{fb.comment}&quot;
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
