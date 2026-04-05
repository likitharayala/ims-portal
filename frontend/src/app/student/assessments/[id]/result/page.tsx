'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useStudentResult } from '@/hooks/use-assessments';

export default function StudentResultPage() {
  const { id } = useParams<{ id: string }>();
  const { data: submission, isLoading, error } = useStudentResult(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-4 h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center">
        <p className="mb-2 text-sm text-slate-500">Results have not been released yet.</p>
        <Link
          href="/student/assessments"
          className="text-sm text-blue-600 hover:underline"
        >
          Back to Assessments
        </Link>
      </div>
    );
  }

  const questions = submission.assessment?.questions ?? [];
  const answers = (submission.answers as Record<string, any>) ?? {};
  const feedback = (submission.feedback as Record<string, any>) ?? {};
  const totalMarks =
    submission.totalMarks !== null && submission.totalMarks !== undefined
      ? Number(submission.totalMarks)
      : null;
  const maxMarks =
    typeof submission.assessment?.totalMarks === 'number'
      ? submission.assessment.totalMarks
      : 0;

  const attemptedCount = questions.filter((question: any) => {
    const answer = answers[question.id];
    if (question.questionType === 'mcq') return Boolean(answer?.selectedOption);
    return Boolean(answer?.text);
  }).length;

  const mcqQuestions = questions.filter((question: any) => question.questionType === 'mcq');
  const mcqCorrect = mcqQuestions.filter((question: any) => {
    const answer = answers[question.id];
    return question.correctOption && answer?.selectedOption === question.correctOption;
  }).length;
  const mcqWrong = mcqQuestions.filter((question: any) => {
    const answer = answers[question.id];
    return (
      question.correctOption &&
      answer?.selectedOption &&
      answer.selectedOption !== question.correctOption
    );
  }).length;
  const missedMcqCount = Math.max(mcqQuestions.length - mcqCorrect - mcqWrong, 0);
  const unattemptedCount = Math.max(questions.length - attemptedCount, 0);

  const scorePercent =
    totalMarks !== null && maxMarks > 0
      ? Math.min(100, Math.max(0, Math.round((totalMarks / maxMarks) * 100)))
      : 0;
  const attemptPercent =
    questions.length > 0 ? Math.round((attemptedCount / questions.length) * 100) : 0;
  const mcqBase = mcqQuestions.length || 1;
  const correctPercent = Math.round((mcqCorrect / mcqBase) * 100);
  const wrongPercent = Math.round((mcqWrong / mcqBase) * 100);
  const missedPercent = Math.max(100 - correctPercent - wrongPercent, 0);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/student/assessments"
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          Assessments
        </Link>
        <h1 className="text-xl font-semibold text-slate-800">
          {submission.assessment?.title} Result
        </h1>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="mb-1 text-xs font-medium uppercase text-slate-500">Your Score</p>
        <p className="mb-1 text-5xl font-bold text-slate-800">{totalMarks ?? 0}</p>
        <p className="text-slate-500">out of {maxMarks}</p>
        {submission.status === 'absent' && (
          <p className="mt-3 text-sm font-medium text-orange-600">Absent</p>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-slate-800">Performance Analysis</h2>
          <p className="mt-1 text-sm text-slate-500">
            A quick visual summary of your performance.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Score</p>
              <span className="text-sm font-semibold text-blue-700">{scorePercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${scorePercent}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {totalMarks ?? 0} out of {maxMarks} marks
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Attempt Rate</p>
              <span className="text-sm font-semibold text-emerald-700">{attemptPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${attemptPercent}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {attemptedCount} of {questions.length} questions attempted
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">MCQ Accuracy</p>
              <span className="text-sm font-semibold text-violet-700">{correctPercent}%</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-emerald-500" style={{ width: `${correctPercent}%` }} />
              <div className="h-full bg-rose-400" style={{ width: `${wrongPercent}%` }} />
              <div className="h-full bg-slate-300" style={{ width: `${missedPercent}%` }} />
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
              <span className="text-emerald-600">{mcqCorrect} correct</span>
              <span className="text-rose-500">{mcqWrong} wrong</span>
              <span>{missedMcqCount} missed</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Questions</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">{questions.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Attempted</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">{attemptedCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Unattempted</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">{unattemptedCount}</p>
          </div>
        </div>
      </div>

      {questions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Question Breakdown</h2>
          {questions.map((question: any) => {
            const answer = answers[question.id];
            const questionFeedback = feedback[question.id];
            const isCorrect =
              question.questionType === 'mcq' &&
              question.correctOption &&
              answer?.selectedOption === question.correctOption;
            const isWrong =
              question.questionType === 'mcq' &&
              question.correctOption &&
              answer?.selectedOption &&
              answer.selectedOption !== question.correctOption;

            return (
              <div
                key={question.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="mb-2 flex items-start gap-2">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-medium text-slate-600">
                    {question.questionNumber}
                  </span>
                  <p className="text-sm text-slate-800">{question.questionText}</p>
                </div>

                {question.questionType === 'mcq' ? (
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
                          {isCorrect ? ' OK' : ' X'}
                        </span>
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">Not attempted</p>
                    )}
                    {question.correctOption && (
                      <p className="text-xs text-green-600">
                        Correct: {question.correctOption}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-500">
                      {isCorrect
                        ? `+${Number(question.marks)}`
                        : isWrong && submission.assessment?.negativeMarking
                          ? `-${Number(submission.assessment.negativeValue ?? 0)}`
                          : '0'}{' '}
                      marks
                    </p>
                  </div>
                ) : (
                  <div className="ml-8">
                    {answer?.text ? (
                      <p className="whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2 text-sm text-slate-600">
                        {answer.text}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">Not attempted</p>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      {questionFeedback && (
                        <>
                          <span className="text-sm font-medium text-slate-700">
                            {questionFeedback.marks} / {Number(question.marks)} marks
                          </span>
                          {questionFeedback.comment && (
                            <span className="text-xs italic text-slate-500">
                              &quot;{questionFeedback.comment}&quot;
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
