'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  useSubmission,
  useEnterMarks,
  useFinalizeSubmission,
} from '@/hooks/use-assessments';
import type { AssessmentQuestion } from '@/hooks/use-assessments';
import { Toast, useToast } from '@/components/ui/Toast';
import { getApiError } from '@/lib/utils';
import { api, API_BASE_URL } from '@/lib/api';

// ─── PDF Viewer ───────────────────────────────────────────────────────────────

function PdfViewer({ filePath }: { filePath: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setBlobUrl(null);

    api
      .get(`/submissions/file?path=${encodeURIComponent(filePath)}`, {
        responseType: 'blob',
      })
      .then((res) => {
        // Force application/pdf so iframe renders inline
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setBlobUrl(url);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));

    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [filePath]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-sm">Loading answer sheet…</p>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
        <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p className="text-sm">Could not load answer sheet</p>
        <a
          href={`${API_BASE_URL}/submissions/file?path=${encodeURIComponent(filePath)}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-600 hover:underline"
        >
          Try opening directly ↗
        </a>
      </div>
    );
  }

  return (
    <iframe
      src={blobUrl}
      className="w-full h-full border-0"
      title="Answer Sheet"
    />
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EvaluateSubmissionPage() {
  const { id, sid } = useParams<{ id: string; sid: string }>();
  const { toast, show: showToast, hide: hideToast } = useToast();

  const { data: submission, isLoading } = useSubmission(id, sid);
  const enterMarksMutation = useEnterMarks();
  const finalizeMutation = useFinalizeSubmission();

  const [marksInput, setMarksInput] = useState<
    Record<string, { marks: string; comment: string; flagged: boolean; showComment: boolean }>
  >({});

  // ── Derived data ────────────────────────────────────────────────────────
  const questions: AssessmentQuestion[] = submission?.assessment?.questions ?? [];
  const answers = useMemo(
    () => (submission?.answers as Record<string, any>) ?? {},
    [submission?.answers],
  );
  const existingFeedback = useMemo(
    () => (submission?.feedback as Record<string, any>) ?? {},
    [submission?.feedback],
  );

  const uploadedFiles: any[] = useMemo(() => {
    const raw = submission?.uploadedFiles;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'object') return Object.values(raw as Record<string, any[]>).flat();
    return [];
  }, [submission?.uploadedFiles]);

  const isUploadSubmission = uploadedFiles.length > 0;
  const pdfFile = uploadedFiles[0] ?? null;

  // ── Marks helpers ───────────────────────────────────────────────────────
  const getMarkInput = (qid: string) =>
    marksInput[qid] ?? {
      marks: String(existingFeedback[qid]?.marks ?? ''),
      comment: existingFeedback[qid]?.comment ?? '',
      flagged: false,
      showComment: false,
    };

  const setMarkField = (
    qid: string,
    field: 'marks' | 'comment' | 'flagged' | 'showComment',
    value: string | boolean,
  ) => {
    setMarksInput((p) => ({
      ...p,
      [qid]: { ...getMarkInput(qid), [field]: value },
    }));
  };

  // ── Live total ──────────────────────────────────────────────────────────
  const { liveTotal, maxTotal } = useMemo(() => {
    let live = 0;
    let max = 0;
    for (const q of questions) {
      max += Number(q.marks);
      if (q.questionType === 'mcq' && !isUploadSubmission) {
        const ans = answers[q.id];
        if (ans?.selectedOption) {
          if (ans.selectedOption === q.correctOption) {
            live += Number(q.marks);
          } else {
            const neg = (submission?.assessment as any)?.negativeMarking
              ? Number((submission?.assessment as any)?.negativeValue || 0)
              : 0;
            live -= neg;
          }
        }
      } else {
        live += Number(getMarkInput(q.id).marks) || 0;
      }
    }
    return { liveTotal: Math.max(0, live), maxTotal: max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, answers, marksInput, isUploadSubmission, submission]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleSaveMarks = async () => {
    const marks = questions
      .filter(
        (q) =>
          q.questionType === 'descriptive' ||
          (isUploadSubmission && q.questionType === 'mcq'),
      )
      .map((q) => ({
        questionId: q.id,
        marks: Number(getMarkInput(q.id).marks || 0),
        comment: getMarkInput(q.id).comment || undefined,
        flagged: getMarkInput(q.id).flagged,
      }));

    try {
      await enterMarksMutation.mutateAsync({ assessmentId: id, submissionId: sid, marks });
      showToast('Marks saved');
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const handleFinalize = async () => {
    try {
      await finalizeMutation.mutateAsync({ assessmentId: id, submissionId: sid });
      showToast('Submission finalized');
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  // ── Loading / empty states ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 h-14 bg-white border-b border-slate-200 animate-pulse" />
        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="flex-1 p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse h-28 bg-slate-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="p-6 text-slate-500">
        Submission not found.{' '}
        <Link href={`/admin/assessments/${id}/evaluate`} className="text-blue-600 hover:underline">
          Back
        </Link>
      </div>
    );
  }

  if ((submission.student as any)?.isDeleted) {
    return (
      <div className="p-6 text-slate-500">
        Submission not found.{' '}
        <Link href={`/admin/assessments/${id}/evaluate`} className="text-blue-600 hover:underline">
          Back
        </Link>
      </div>
    );
  }

  const progressPct = maxTotal > 0 ? Math.round((liveTotal / maxTotal) * 100) : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">

      {/* ── Sticky header ── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-3">
        <Link
          href={`/admin/assessments/${id}/evaluate`}
          className="text-slate-400 hover:text-slate-600 text-sm flex-shrink-0"
        >
          ← Submissions
        </Link>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {submission.student?.user?.name ?? 'Student'}
          </p>
          <p className="text-xs text-slate-400 truncate">
            {submission.student?.user?.email} · Class {submission.student?.class}
          </p>
        </div>

        {/* Live total badge */}
        <div className="flex-shrink-0 text-center px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-xs text-slate-500 leading-none mb-0.5">Total</p>
          <p className="text-sm font-bold text-slate-800 leading-none">
            <span className={liveTotal === maxTotal ? 'text-green-600' : ''}>{liveTotal}</span>
            <span className="text-slate-400 font-normal">/{maxTotal}</span>
          </p>
        </div>

        {submission.isFinalized && (
          <span className="flex-shrink-0 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full font-medium">
            Finalized ✓
          </span>
        )}
        {submission.resultReleased && (
          <span className="flex-shrink-0 text-xs text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1 rounded-full font-medium">
            Released ✓
          </span>
        )}

        <div className="flex-shrink-0 flex items-center gap-2">
          <button
            onClick={handleSaveMarks}
            disabled={enterMarksMutation.isPending}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-60 font-medium"
          >
            {enterMarksMutation.isPending ? 'Saving…' : 'Save Marks'}
          </button>
          <button
            onClick={handleFinalize}
            disabled={finalizeMutation.isPending || submission.isFinalized}
            className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 font-medium"
          >
            {finalizeMutation.isPending ? 'Finalizing…' : submission.isFinalized ? 'Finalized ✓' : 'Finalize'}
          </button>
        </div>
      </div>

      {/* ── Split panels ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── LEFT: Questions + marks ── */}
        <div className={`${isUploadSubmission ? 'w-[46%] flex-shrink-0' : 'flex-1'} flex flex-col overflow-hidden border-r border-slate-200`}>

          {/* Progress bar */}
          <div className="flex-shrink-0 h-1 bg-slate-100">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Questions list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {questions.length === 0 && (
              <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
                No questions found.
              </div>
            )}

            {questions.map((q) => {
              const answer = answers[q.id];
              const input = getMarkInput(q.id);
              const isAutoEval = q.questionType === 'mcq' && q.correctOption && !isUploadSubmission;

              // For auto-eval: determine if student got it right
              const studentSelected = answer?.selectedOption;
              const isCorrect = studentSelected === q.correctOption;
              const attempted = !!studentSelected;

              return (
                <div
                  key={q.id}
                  className={`bg-white rounded-xl border p-3 ${
                    input.flagged ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'
                  }`}
                >
                  {/* Question header */}
                  <div className="flex items-start gap-2 mb-2.5">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded text-[10px] flex items-center justify-center font-bold mt-0.5">
                      {q.questionNumber}
                    </span>
                    <p className="text-xs text-slate-800 leading-relaxed flex-1">{q.questionText}</p>
                    <span className="flex-shrink-0 text-[10px] text-slate-400 font-medium ml-1">
                      [{Number(q.marks)}m]
                    </span>
                  </div>

                  {/* MCQ options */}
                  {q.questionType === 'mcq' && (
                    <div className="ml-7 space-y-1 mb-2.5">
                      {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                        const optVal = q[`option${opt}` as keyof typeof q] as string;
                        if (!optVal) return null;
                        const sel = studentSelected === opt;
                        const correct = q.correctOption === opt;
                        return (
                          <div
                            key={opt}
                            className={`flex items-center gap-2 text-[11px] px-2 py-1 rounded-md ${
                              sel && correct
                                ? 'bg-green-100 text-green-800 font-medium'
                                : sel && !correct
                                ? 'bg-red-100 text-red-700 font-medium'
                                : correct && !isUploadSubmission
                                ? 'bg-green-50 text-green-700'
                                : 'text-slate-600'
                            }`}
                          >
                            <span className="font-semibold w-3 flex-shrink-0">{opt}.</span>
                            <span className="flex-1">{optVal}</span>
                            {sel && correct && <span className="flex-shrink-0 text-green-600">✓</span>}
                            {sel && !correct && <span className="flex-shrink-0 text-red-500">✗</span>}
                            {correct && !sel && !isUploadSubmission && (
                              <span className="flex-shrink-0 text-green-600 text-[10px]">correct</span>
                            )}
                          </div>
                        );
                      })}
                      {!attempted && (
                        <p className="text-[11px] text-slate-400 italic px-2">Not attempted</p>
                      )}
                    </div>
                  )}

                  {/* Descriptive answer */}
                  {q.questionType === 'descriptive' && (
                    <div className="ml-7 mb-2.5">
                      {isUploadSubmission ? (
                        <p className="text-[11px] text-slate-400 italic">
                          See answer sheet →
                        </p>
                      ) : answer?.text ? (
                        <p className="text-[11px] text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                          {answer.text}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">Not attempted</p>
                      )}
                    </div>
                  )}

                  {/* ── Marks input row ── */}
                  <div className="ml-7">
                    {isAutoEval ? (
                      /* Auto-evaluated MCQ */
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                            !attempted
                              ? 'bg-slate-100 text-slate-500'
                              : isCorrect
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-600'
                          }`}
                        >
                          {!attempted ? 'Not attempted · 0' : isCorrect ? `✓ Correct · +${Number(q.marks)}` : '✗ Wrong · 0'}
                        </span>
                        <span className="text-[11px] text-slate-400">Auto-evaluated</span>
                      </div>
                    ) : isUploadSubmission && q.questionType === 'mcq' ? (
                      /* Upload MCQ: ✓/✗ toggle */
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-slate-500">MCQ:</span>
                        <button
                          type="button"
                          onClick={() => setMarkField(q.id, 'marks', String(Number(q.marks)))}
                          className={`px-2.5 py-1 text-[11px] rounded-lg border font-semibold transition-colors ${
                            input.marks === String(Number(q.marks))
                              ? 'bg-green-600 text-white border-green-600'
                              : 'border-green-400 text-green-600 hover:bg-green-50'
                          }`}
                        >
                          ✓ Correct
                        </button>
                        <button
                          type="button"
                          onClick={() => setMarkField(q.id, 'marks', '0')}
                          className={`px-2.5 py-1 text-[11px] rounded-lg border font-semibold transition-colors ${
                            input.marks === '0'
                              ? 'bg-red-600 text-white border-red-600'
                              : 'border-red-400 text-red-600 hover:bg-red-50'
                          }`}
                        >
                          ✗ Wrong
                        </button>
                        <span className="text-[11px] text-slate-400">/ {Number(q.marks)}</span>
                        {/* Flag */}
                        <button
                          type="button"
                          onClick={() => setMarkField(q.id, 'flagged', !input.flagged)}
                          className={`ml-auto text-[11px] px-2 py-0.5 rounded border transition-colors ${
                            input.flagged
                              ? 'bg-amber-100 text-amber-700 border-amber-300'
                              : 'border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-600'
                          }`}
                        >
                          {input.flagged ? '⚑ Flagged' : '⚐ Flag'}
                        </button>
                      </div>
                    ) : (
                      /* Descriptive: marks input */
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500">Marks:</span>
                          <input
                            type="number"
                            min={0}
                            max={Number(q.marks)}
                            step={0.5}
                            value={input.marks}
                            onChange={(e) => setMarkField(q.id, 'marks', e.target.value)}
                            placeholder="0"
                            className="w-14 px-2 py-1 border border-slate-300 rounded-md text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <span className="text-[11px] text-slate-400">/ {Number(q.marks)}</span>
                          {/* Comment toggle */}
                          <button
                            type="button"
                            onClick={() => setMarkField(q.id, 'showComment', !input.showComment)}
                            className="text-[11px] text-slate-400 hover:text-blue-600 underline-offset-1 hover:underline ml-1"
                          >
                            {input.showComment ? 'hide note' : '+ note'}
                          </button>
                          {/* Flag */}
                          <button
                            type="button"
                            onClick={() => setMarkField(q.id, 'flagged', !input.flagged)}
                            className={`ml-auto text-[11px] px-2 py-0.5 rounded border transition-colors ${
                              input.flagged
                                ? 'bg-amber-100 text-amber-700 border-amber-300'
                                : 'border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-600'
                            }`}
                          >
                            {input.flagged ? '⚑ Flagged' : '⚐ Flag'}
                          </button>
                        </div>
                        {input.showComment && (
                          <input
                            type="text"
                            placeholder="Add a note for this question…"
                            value={input.comment}
                            onChange={(e) => setMarkField(q.id, 'comment', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-300 rounded-md text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Bottom summary card */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 mt-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">Evaluation Summary</p>
                <span className="text-xs text-slate-500 capitalize">{submission.status}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-slate-800 flex-shrink-0">
                  {liveTotal} / {maxTotal}
                </span>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={handleSaveMarks}
                  disabled={enterMarksMutation.isPending}
                  className="flex-1 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-60 font-medium"
                >
                  {enterMarksMutation.isPending ? 'Saving…' : 'Save Marks'}
                </button>
                <button
                  onClick={handleFinalize}
                  disabled={finalizeMutation.isPending || submission.isFinalized}
                  className="flex-1 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 font-medium"
                >
                  {finalizeMutation.isPending ? 'Finalizing…' : submission.isFinalized ? 'Finalized ✓' : 'Finalize'}
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ── RIGHT: PDF viewer — only shown for upload submissions ── */}
        {isUploadSubmission && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-100">
            {pdfFile ? (
              <PdfViewer filePath={pdfFile.filePath} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
                <svg className="w-14 h-14 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm font-medium">No answer sheet uploaded</p>
                <p className="text-xs text-slate-400">Upload submission — no file found</p>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}
    </div>
  );
}
