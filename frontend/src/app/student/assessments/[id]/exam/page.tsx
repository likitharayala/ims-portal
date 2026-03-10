'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useStudentAssessment,
  useMySubmission,
  useSubmitExam,
  useUploadAnswerSheet,
  useSaveAnswers,
  useMyExtraTime,
} from '@/hooks/use-assessments';
import type { AssessmentQuestion } from '@/hooks/use-assessments';
import { getApiError } from '@/lib/utils';

function useCountdown(endAt: Date | null) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!endAt) return;

    const tick = () => {
      const diff = endAt.getTime() - Date.now();
      const clamped = Math.max(0, diff);
      setRemaining(clamped);
      if (clamped === 0) clearInterval(interval);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endAt]);

  return remaining;
}

function formatCountdown(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  return `${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20MB

// ─── Portal mode: interactive questions ──────────────────────────────────────
function PortalExam({
  questions,
  assessmentId,
  onSubmit,
  submitPending,
  submitError,
}: {
  questions: AssessmentQuestion[];
  assessmentId: string;
  onSubmit: (answers: Record<string, { selectedOption?: string; text?: string }>) => void;
  submitPending: boolean;
  submitError: string;
}) {
  const [answers, setAnswers] = useState<Record<string, { selectedOption?: string; text?: string }>>({});
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveMutation = useSaveAnswers();
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Auto-save every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        setAutoSaveStatus('saving');
        await saveMutation.mutateAsync({ assessmentId, answers: answersRef.current });
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      } catch {
        setAutoSaveStatus('idle');
      }
    }, 60_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  const answeredCount = Object.values(answers).filter(
    (a) => a.selectedOption || (a.text && a.text.trim()),
  ).length;

  const handleMcqSelect = useCallback((qId: string, option: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], selectedOption: option } }));
  }, []);

  const handleTextChange = useCallback((qId: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], text } }));
  }, []);

  const unanswered = questions.filter((q) => {
    const a = answers[q.id];
    return !a?.selectedOption && !(a?.text && a.text.trim());
  });

  return (
    <>
      {/* Answer progress bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-blue-600">{answeredCount}</span>
            <span className="text-slate-400"> / {questions.length} answered</span>
          </div>
          {autoSaveStatus === 'saving' && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Auto-saving…
            </span>
          )}
          {autoSaveStatus === 'saved' && (
            <span className="text-xs text-green-600">✓ Saved</span>
          )}
        </div>
        <div className="w-40 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Questions */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800 text-sm">Answer the Questions</h2>
          <p className="text-xs text-slate-500 mt-0.5">Select MCQ options or type your answers below.</p>
        </div>

        <div className="divide-y divide-slate-100">
          {questions.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No questions found.</div>
          ) : (
            questions.map((q) => {
              const answer = answers[q.id];
              const isAnswered = !!answer?.selectedOption || !!(answer?.text && answer.text.trim());
              return (
                <div key={q.id} className={`px-5 py-5 transition-colors ${isAnswered ? 'bg-blue-50/30' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                      isAnswered ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {q.questionNumber}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 leading-relaxed mb-3">{q.questionText}</p>

                      {q.questionType === 'mcq' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                            const val = q[`option${opt}` as keyof typeof q] as string;
                            if (!val) return null;
                            const selected = answer?.selectedOption === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleMcqSelect(q.id, opt)}
                                className={`flex items-start gap-2.5 text-sm px-3 py-2.5 rounded-lg border-2 text-left transition-all ${
                                  selected
                                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                                    : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <span className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold mt-0.5 ${
                                  selected ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 text-slate-500'
                                }`}>
                                  {opt}
                                </span>
                                <span className="leading-snug">{val}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <textarea
                          value={answer?.text ?? ''}
                          onChange={(e) => handleTextChange(q.id, e.target.value)}
                          placeholder="Type your answer here…"
                          rows={4}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 resize-y focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 placeholder-slate-400 text-slate-800"
                        />
                      )}

                      <div className="mt-2 flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          q.questionType === 'mcq'
                            ? 'bg-purple-50 text-purple-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {q.questionType === 'mcq' ? 'MCQ' : 'Descriptive'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {Number(q.marks)} mark{Number(q.marks) !== 1 ? 's' : ''}
                        </span>
                        {isAnswered && (
                          <span className="text-xs text-blue-600 font-medium">✓ Answered</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Submit section */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 text-sm mb-1">Submit Assessment</h2>
        <p className="text-xs text-slate-500 mb-4">Once submitted you cannot make changes.</p>
        {unanswered.length > 0 && (
          <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg mb-3">
            ⚠ {unanswered.length} question{unanswered.length !== 1 ? 's' : ''} unanswered: Q
            {unanswered.map((q) => q.questionNumber).join(', Q')}
          </p>
        )}
        <button
          onClick={() => setSubmitConfirm(true)}
          className="w-full py-3 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
        >
          Submit Assessment
        </button>
      </div>

      {/* Submit confirmation */}
      {submitConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h2 className="font-semibold text-slate-800 mb-2">Submit Assessment?</h2>
            {unanswered.length > 0 && (
              <div className="flex items-start gap-2 text-sm text-orange-700 bg-orange-50 border border-orange-200 px-3 py-2.5 rounded-lg mb-3">
                <span className="flex-shrink-0 mt-0.5">⚠</span>
                <span>
                  {unanswered.length} question{unanswered.length !== 1 ? 's are' : ' is'} unanswered.
                  You can still submit.
                </span>
              </div>
            )}
            <p className="text-sm text-slate-600 mb-5">This action cannot be undone.</p>
            {submitError && (
              <p className="text-sm text-red-500 mb-4 bg-red-50 p-2 rounded-lg">{submitError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSubmitConfirm(false)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => onSubmit(answers)}
                disabled={submitPending}
                className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 font-medium"
              >
                {submitPending ? 'Submitting…' : 'Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Upload mode: question paper (read-only) + upload ────────────────────────
function UploadExam({
  questions,
  assessmentId,
  existingFile,
  onSubmit,
  submitPending,
  submitError,
}: {
  questions: AssessmentQuestion[];
  assessmentId: string;
  existingFile: { originalName: string; fileSize: number } | null;
  onSubmit: (answers: Record<string, never>) => void;
  submitPending: boolean;
  submitError: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<{ fileName: string; time: string } | null>(null);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const uploadMutation = useUploadAnswerSheet();

  const hasUploadedFile = uploadDone || !!existingFile;

  // Auto-dismiss upload success popup
  useEffect(() => {
    if (!uploadSuccess) return;
    const t = setTimeout(() => setUploadSuccess(null), 5000);
    return () => clearTimeout(t);
  }, [uploadSuccess]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError('');
    setUploadDone(false);
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setFileError('Only PDF files are allowed');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_PDF_SIZE) {
      setFileError('File size must not exceed 20MB');
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setFileError('');
    try {
      await uploadMutation.mutateAsync({ assessmentId, file: selectedFile });
      setUploadDone(true);
      const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      setUploadSuccess({ fileName: selectedFile.name, time });
    } catch (err) {
      setFileError(getApiError(err));
    }
  };

  return (
    <>
      {/* Section 1: Question Paper (read-only reference) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
            <div>
              <h2 className="font-semibold text-slate-800 text-sm">Question Paper</h2>
              <p className="text-xs text-slate-500">Read all questions. Write answers on paper, then upload below.</p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {questions.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No questions found.</div>
          ) : (
            questions.map((q) => (
              <div key={q.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                    {q.questionNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 leading-relaxed">{q.questionText}</p>

                    {q.questionType === 'mcq' && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                          const val = q[`option${opt}` as keyof typeof q] as string;
                          if (!val) return null;
                          return (
                            <div
                              key={opt}
                              className="flex items-start gap-2 text-xs text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200"
                            >
                              <span className="font-semibold text-slate-500 flex-shrink-0">{opt}.</span>
                              <span>{val}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        q.questionType === 'mcq' ? 'bg-purple-50 text-purple-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {q.questionType === 'mcq' ? 'MCQ' : 'Descriptive'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {Number(q.marks)} mark{Number(q.marks) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Section 2: Upload */}
      <div className="bg-white rounded-xl border border-green-300 ring-2 ring-green-100 overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
            <div>
              <h2 className="font-semibold text-slate-800 text-sm">Upload Answer Sheet</h2>
              <p className="text-xs text-slate-500">Upload your handwritten answers as a single PDF (max 20MB).</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          {existingFile && !uploadDone && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 px-4 py-2.5 rounded-lg">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>
                Previously uploaded: <span className="font-medium">{existingFile.originalName}</span>
                <span className="text-green-500 ml-1">({(existingFile.fileSize / 1024 / 1024).toFixed(2)} MB)</span>
              </span>
            </div>
          )}

          {/* Hidden file input — never wrap in <label> in React/Next.js */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`w-full flex flex-col items-center justify-center gap-3 px-6 py-10 border-2 border-dashed rounded-xl transition-colors ${
              selectedFile && !uploadDone
                ? 'border-blue-400 bg-blue-50'
                : uploadDone
                ? 'border-green-400 bg-green-50'
                : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
            }`}
          >
            {uploadDone ? (
              <>
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-semibold text-green-700">Upload successful!</p>
                  <p className="text-xs text-green-600">{selectedFile?.name}</p>
                  <p className="text-xs text-slate-400 mt-1">Click to replace</p>
                </div>
              </>
            ) : selectedFile ? (
              <>
                <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-semibold text-blue-700">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Click to change</p>
                </div>
              </>
            ) : (
              <>
                <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">Click to select your PDF</p>
                  <p className="text-xs text-slate-400">PDF files only · Max 20MB</p>
                </div>
              </>
            )}
          </button>

          {fileError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{fileError}</p>
          )}

          {selectedFile && !uploadDone && (
            <button
              onClick={handleUpload}
              disabled={uploadMutation.isPending}
              className="w-full py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium flex items-center justify-center gap-2"
            >
              {uploadMutation.isPending ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Uploading…
                </>
              ) : 'Upload Answer Sheet'}
            </button>
          )}
        </div>
      </div>

      {/* Section 3: Submit */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
          <h2 className="font-semibold text-slate-800 text-sm">Submit Assessment</h2>
        </div>
        <p className="text-xs text-slate-500 ml-8 mb-4">
          Once submitted you cannot make changes. Ensure your answer sheet is uploaded first.
        </p>
        {!hasUploadedFile && (
          <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg mb-3">
            ⚠ No answer sheet uploaded yet. Upload your PDF before submitting.
          </p>
        )}
        <button
          onClick={() => setSubmitConfirm(true)}
          className="w-full py-3 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
        >
          Submit Assessment
        </button>
      </div>

      {/* Upload success popup */}
      {uploadSuccess && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-white border border-green-200 rounded-xl shadow-xl p-4 flex items-start gap-3">
            <div className="flex-shrink-0 w-9 h-9 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">Answer sheet uploaded successfully</p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{uploadSuccess.fileName}</p>
              <p className="text-xs text-green-600 mt-0.5">Uploaded at {uploadSuccess.time}</p>
              <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-400 rounded-full animate-[shrink_5s_linear_forwards]" />
              </div>
            </div>
            <button
              onClick={() => setUploadSuccess(null)}
              className="flex-shrink-0 text-slate-400 hover:text-slate-600 p-0.5"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Submit confirmation */}
      {submitConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h2 className="font-semibold text-slate-800 mb-2">Submit Assessment?</h2>
            {!hasUploadedFile && (
              <div className="flex items-start gap-2 text-sm text-orange-700 bg-orange-50 border border-orange-200 px-3 py-2.5 rounded-lg mb-3">
                <span className="flex-shrink-0 mt-0.5">⚠</span>
                <span>You haven't uploaded your answer sheet. You can still submit, but the evaluator won't have your answers.</span>
              </div>
            )}
            <p className="text-sm text-slate-600 mb-5">This action cannot be undone. Are you sure?</p>
            {submitError && (
              <p className="text-sm text-red-500 mb-4 bg-red-50 p-2 rounded-lg">{submitError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSubmitConfirm(false)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => onSubmit({})}
                disabled={submitPending}
                className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 font-medium"
              >
                {submitPending ? 'Submitting…' : 'Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main exam page ───────────────────────────────────────────────────────────
export default function ExamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // SSR-safe: initialised as false, set in useEffect (client-only)
  const [isUploadMode, setIsUploadMode] = useState(false);

  const { data: assessment, isLoading } = useStudentAssessment(id);
  const { data: submission, isFetching: isSubmissionFetching } = useMySubmission(id);
  const { data: extraTime } = useMyExtraTime(id);
  const submitMutation = useSubmitExam();

  const effectiveEndAt = useMemo(() => {
    const iso = extraTime?.effectiveEndAt ?? assessment?.endAt ?? null;
    return iso ? new Date(iso) : null;
  }, [extraTime?.effectiveEndAt, assessment?.endAt]);

  const remaining = useCountdown(effectiveEndAt);

  const [submitError, setSubmitError] = useState('');

  // Guard: redirect if no active submission
  const initialCheckDone = useRef(false);
  useEffect(() => {
    if (initialCheckDone.current) return;
    if (submission === undefined) return;
    if (isSubmissionFetching) return;
    initialCheckDone.current = true;
    if (
      submission === null ||
      submission?.status === 'submitted' ||
      submission?.status === 'evaluated'
    ) {
      router.replace(`/student/assessments/${id}`);
    }
  }, [submission, isSubmissionFetching, id, router]);

  // Read ?mode=upload after mount
  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    setIsUploadMode(mode === 'upload');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (answers: Record<string, { selectedOption?: string; text?: string }>) => {
    setSubmitError('');
    try {
      await submitMutation.mutateAsync({ assessmentId: id, answers });
      router.push(`/student/assessments/${id}`);
    } catch (err) {
      setSubmitError(getApiError(err));
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="animate-pulse h-8 w-48 bg-slate-200 rounded mb-4" />
        <div className="animate-pulse h-96 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center py-20">
        <p className="text-slate-500 mb-4">Assessment not found or could not be loaded.</p>
        <Link href="/student/assessments" className="text-sm text-blue-600 hover:underline">
          ← Back to Assessments
        </Link>
      </div>
    );
  }

  const questions: AssessmentQuestion[] = assessment.questions ?? [];
  const existingFile = (submission?.uploadedFiles as any[])?.[0] ?? null;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">

      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm truncate">{assessment.title}</p>
            <p className="text-xs text-slate-500 flex items-center gap-2">
              {assessment.subject && `${assessment.subject} · `}
              {questions.length} question{questions.length !== 1 ? 's' : ''} · {assessment.totalMarks} marks
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                isUploadMode ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {isUploadMode ? 'Upload mode' : 'Portal mode'}
              </span>
            </p>
          </div>

          {remaining !== null && (
            <div className={`flex-shrink-0 text-center px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold ${
              remaining <= 5 * 60 * 1000
                ? 'bg-red-50 border-red-200 text-red-700'
                : remaining <= 15 * 60 * 1000
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              {remaining === 0 ? (
                <span className="text-red-600">Time&apos;s up!</span>
              ) : (
                <>
                  <span className="block text-xs font-normal leading-none mb-0.5 opacity-60">
                    {(extraTime?.extraMinutes ?? 0) > 0 ? 'Extended end' : 'Time left'}
                  </span>
                  {formatCountdown(remaining)}
                </>
              )}
            </div>
          )}

          {/* Mode switcher */}
          <button
            onClick={() => setIsUploadMode((v) => !v)}
            className="flex-shrink-0 text-xs px-3 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50"
          >
            Switch to {isUploadMode ? 'Portal' : 'Upload'}
          </button>
        </div>

        {(extraTime?.extraMinutes ?? 0) > 0 && (
          <div className="max-w-3xl mx-auto px-4 pb-2">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg inline-flex items-center gap-1">
              ⏱ You have been granted <strong>{extraTime!.extraMinutes} extra minute{extraTime!.extraMinutes !== 1 ? 's' : ''}</strong>
              {extraTime!.reason && ` · ${extraTime!.reason}`}
            </p>
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {isUploadMode ? (
          <UploadExam
            questions={questions}
            assessmentId={id}
            existingFile={existingFile}
            onSubmit={handleSubmit}
            submitPending={submitMutation.isPending}
            submitError={submitError}
          />
        ) : (
          <PortalExam
            questions={questions}
            assessmentId={id}
            onSubmit={handleSubmit}
            submitPending={submitMutation.isPending}
            submitError={submitError}
          />
        )}
      </div>
    </div>
  );
}
