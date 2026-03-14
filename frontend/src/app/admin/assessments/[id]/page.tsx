'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useAdminAssessment,
  useUpdateAssessment,
  usePublishAssessment,
  useAddQuestion,
  useUpdateQuestion,
  useDeleteQuestion,
  useGenerateQuestions,
} from '@/hooks/use-assessments';
import type { AssessmentQuestion } from '@/hooks/use-assessments';
import { Toast, useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { getApiError, toIST, utcToISTLocal, istLocalToUTC } from '@/lib/utils';
import { DateTimePicker } from '@/components/ui/DateTimePicker';

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

function QuestionRow({
  q,
  onEdit,
  onDelete,
}: {
  q: AssessmentQuestion;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
      <span className="flex-shrink-0 w-6 h-6 bg-white border border-slate-300 rounded text-xs flex items-center justify-center font-medium text-slate-600">
        {q.questionNumber}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 line-clamp-2">{q.questionText}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {q.questionType.toUpperCase()} · {Number(q.marks)} mark{Number(q.marks) !== 1 ? 's' : ''}
          {q.questionType === 'mcq' && q.correctOption && ` · Answer: ${q.correctOption}`}
        </p>
      </div>
      <div className="flex gap-1">
        <button
          onClick={onEdit}
          className="text-xs px-2 py-1 border border-slate-300 rounded text-slate-600 hover:bg-white"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-xs px-2 py-1 border border-red-200 rounded text-red-600 hover:bg-red-50"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function QuestionForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: AssessmentQuestion;
  onSave: (data: any) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [qtype, setQtype] = useState<'mcq' | 'descriptive'>(
    initial?.questionType ?? 'mcq',
  );
  const [text, setText] = useState(initial?.questionText ?? '');
  const [opts, setOpts] = useState({
    A: initial?.optionA ?? '',
    B: initial?.optionB ?? '',
    C: initial?.optionC ?? '',
    D: initial?.optionD ?? '',
  });
  const [correct, setCorrect] = useState(initial?.correctOption ?? 'A');
  const [marks, setMarks] = useState(initial ? Number(initial.marks) : 1);
  const [difficultyLevel, setDifficultyLevel] = useState<'' | 'easy' | 'medium' | 'hard'>('');
  const [err, setErr] = useState('');

  const handleSave = () => {
    if (!text.trim()) { setErr('Question text is required'); return; }
    if (qtype === 'mcq') {
      if (!opts.A || !opts.B || !opts.C || !opts.D) {
        setErr('All 4 options are required for MCQ');
        return;
      }
    }
    setErr('');
    const payload: any = {
      questionType: qtype,
      questionText: text,
      marks,
    };
    if (qtype === 'mcq') {
      payload.optionA = opts.A;
      payload.optionB = opts.B;
      payload.optionC = opts.C;
      payload.optionD = opts.D;
      payload.correctOption = correct;
    }
    if (difficultyLevel) payload.difficultyLevel = difficultyLevel;
    onSave(payload);
  };

  return (
    <div className="space-y-3">
      {err && <p className="text-xs text-red-500">{err}</p>}

      <div className="flex gap-3">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            checked={qtype === 'mcq'}
            onChange={() => setQtype('mcq')}
          />
          <span className="text-sm">MCQ</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            checked={qtype === 'descriptive'}
            onChange={() => setQtype('descriptive')}
          />
          <span className="text-sm">Descriptive</span>
        </label>
      </div>

      <textarea
        rows={2}
        placeholder="Question text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />

      {qtype === 'mcq' && (
        <div className="space-y-2">
          {OPTION_LABELS.map((label) => (
            <div key={label} className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="correct"
                  checked={correct === label}
                  onChange={() => setCorrect(label)}
                />
                <span className="text-sm font-medium w-4">{label}.</span>
              </label>
              <input
                type="text"
                value={opts[label]}
                onChange={(e) =>
                  setOpts((p) => ({ ...p, [label]: e.target.value }))
                }
                placeholder={`Option ${label}`}
                className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600">Marks:</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={marks}
            onChange={(e) => setMarks(Number(e.target.value))}
            className="w-20 px-2 py-1 border border-slate-300 rounded text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Difficulty:</label>
          <select
            value={difficultyLevel}
            onChange={(e) => setDifficultyLevel(e.target.value as any)}
            className="px-2 py-1 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">—</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
        >
          {isPending ? 'Saving…' : initial ? 'Update' : 'Add Question'}
        </button>
      </div>
    </div>
  );
}

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast, show: showToast, hide: hideToast } = useToast();

  const { data: assessment, isLoading } = useAdminAssessment(id);
  const updateMutation = useUpdateAssessment();
  const publishMutation = usePublishAssessment();
  const addQMutation = useAddQuestion();
  const updateQMutation = useUpdateQuestion();
  const deleteQMutation = useDeleteQuestion();
  const generateMutation = useGenerateQuestions();

  const [editingQ, setEditingQ] = useState<AssessmentQuestion | null>(null);
  const [deletingQ, setDeletingQ] = useState<AssessmentQuestion | null>(null);
  const [showAddQ, setShowAddQ] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAiGenerate, setShowAiGenerate] = useState(false);

  // AI Generate form state
  const [aiForm, setAiForm] = useState({
    topic: '',
    subject: '',
    questionType: 'mcq' as 'mcq' | 'descriptive' | 'both',
    mcqCount: 5,
    descCount: 3,
    mcqMarks: 1,
    descMarks: 2,
    diffEasy: 3,
    diffMedium: 2,
    diffHard: 0,
  });

  const [settingsForm, setSettingsForm] = useState({
    title: '',
    subject: '',
    description: '',
    instructions: '',
    totalMarks: 100,
    negativeMarking: false,
    negativeValue: 0,
    startAt: '',
    endAt: '',
  });

  useEffect(() => {
    if (assessment) {
      setSettingsForm({
        title: assessment.title,
        subject: assessment.subject ?? '',
        description: assessment.description ?? '',
        instructions: assessment.instructions ?? '',
        totalMarks: assessment.totalMarks,
        negativeMarking: assessment.negativeMarking,
        negativeValue: Number(assessment.negativeValue ?? 0),
        startAt: utcToISTLocal(assessment.startAt),
        endAt: utcToISTLocal(assessment.endAt),
      });
    }
  }, [assessment]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <div className="animate-pulse h-8 w-48 bg-slate-200 rounded mb-6" />
        <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="p-4 text-slate-500 sm:p-6">
        Assessment not found.{' '}
        <Link href="/admin/assessments" className="text-blue-600 hover:underline">
          Back
        </Link>
      </div>
    );
  }

  const questions = assessment.questions ?? [];
  const canPublish =
    assessment.status === 'draft' &&
    questions.length > 0 &&
    assessment.startAt &&
    assessment.endAt;

  const handleSaveSettings = async () => {
    try {
      await updateMutation.mutateAsync({
        id,
        data: {
          title: settingsForm.title,
          subject: settingsForm.subject || undefined,
          description: settingsForm.description || undefined,
          instructions: settingsForm.instructions || undefined,
          totalMarks: Number(settingsForm.totalMarks),
          negativeMarking: settingsForm.negativeMarking,
          negativeValue: settingsForm.negativeMarking
            ? Number(settingsForm.negativeValue)
            : undefined,
          startAt: settingsForm.startAt
            ? istLocalToUTC(settingsForm.startAt)
            : undefined,
          endAt: settingsForm.endAt
            ? istLocalToUTC(settingsForm.endAt)
            : undefined,
        } as any,
      });
      showToast('Settings saved');
      setShowSettings(false);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const handlePublish = async () => {
    try {
      await publishMutation.mutateAsync(id);
      showToast('Assessment published!');
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const handleAddQuestion = async (data: any) => {
    try {
      await addQMutation.mutateAsync({ assessmentId: id, data });
      showToast('Question added');
      setShowAddQ(false);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const handleUpdateQuestion = async (data: any) => {
    if (!editingQ) return;
    try {
      await updateQMutation.mutateAsync({
        assessmentId: id,
        questionId: editingQ.id,
        data,
      });
      showToast('Question updated');
      setEditingQ(null);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const handleAiGenerate = async () => {
    if (!aiForm.topic.trim()) { showToast('Topic is required', 'error'); return; }
    const totalCount = aiForm.questionType === 'mcq' ? aiForm.mcqCount
      : aiForm.questionType === 'descriptive' ? aiForm.descCount
      : aiForm.mcqCount + aiForm.descCount;
    const diffTotal = aiForm.diffEasy + aiForm.diffMedium + aiForm.diffHard;
    if (diffTotal !== totalCount) {
      showToast(`Difficulty counts must sum to ${totalCount} (total questions)`, 'error');
      return;
    }
    try {
      let totalGenerated = 0;
      if (aiForm.questionType === 'both') {
        // Two sequential calls (same mutation instance — run sequentially)
        const mcqQs = await generateMutation.mutateAsync({
          assessmentId: id,
          topic: aiForm.topic,
          subject: aiForm.subject || undefined,
          questionType: 'mcq',
          count: aiForm.mcqCount,
          marksPerQuestion: aiForm.mcqMarks,
        });
        const descQs = await generateMutation.mutateAsync({
          assessmentId: id,
          topic: aiForm.topic,
          subject: aiForm.subject || undefined,
          questionType: 'descriptive',
          count: aiForm.descCount,
          marksPerQuestion: aiForm.descMarks,
        });
        totalGenerated = mcqQs.length + descQs.length;
      } else {
        const questions = await generateMutation.mutateAsync({
          assessmentId: id,
          topic: aiForm.topic,
          subject: aiForm.subject || undefined,
          questionType: aiForm.questionType as 'mcq' | 'descriptive',
          count: aiForm.questionType === 'mcq' ? aiForm.mcqCount : aiForm.descCount,
          marksPerQuestion: aiForm.questionType === 'mcq' ? aiForm.mcqMarks : aiForm.descMarks,
        });
        totalGenerated = questions.length;
      }
      showToast(`${totalGenerated} question(s) generated`);
      setShowAiGenerate(false);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const handleDeleteQuestion = async () => {
    if (!deletingQ) return;
    try {
      await deleteQMutation.mutateAsync({
        assessmentId: id,
        questionId: deletingQ.id,
      });
      showToast('Question deleted');
      setDeletingQ(null);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const STATUS_COLOR: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    published: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    closed: 'bg-orange-100 text-orange-700',
    evaluated: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start">
        <Link
          href="/admin/assessments"
          className="text-slate-400 hover:text-slate-600 text-sm mt-1"
        >
          ←
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-800">
              {assessment.title}
            </h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOR[assessment.status]}`}
            >
              {assessment.status}
            </span>
          </div>
          {assessment.subject && (
            <p className="text-sm text-blue-600 mt-0.5">{assessment.subject}</p>
          )}
          <div className="text-xs text-slate-500 mt-1 space-x-3">
            <span>{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
            <span>{assessment.totalMarks} marks</span>
            {assessment.startAt && (
              <span>
                {toIST(assessment.startAt, 'dd MMM, hh:mm a')} –{' '}
                {assessment.endAt
                  ? toIST(assessment.endAt, 'dd MMM, hh:mm a')
                  : '?'}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="text-sm px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            Edit
          </button>
          {(assessment.status === 'active' ||
            assessment.status === 'closed' ||
            assessment.status === 'evaluated') && (
            <Link
              href={`/admin/assessments/${id}/evaluate`}
              className="text-sm px-3 py-1.5 border border-purple-300 rounded-lg text-purple-600 hover:bg-purple-50"
            >
              Evaluate
            </Link>
          )}
          {assessment.status === 'draft' && (
            <button
              onClick={handlePublish}
              disabled={!canPublish || publishMutation.isPending}
              className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              title={
                !canPublish
                  ? 'Need questions + start/end time to publish'
                  : ''
              }
            >
              {publishMutation.isPending ? 'Publishing…' : 'Publish'}
            </button>
          )}
        </div>
      </div>

      {/* Questions */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-slate-800">Questions</h2>
          {!showAddQ && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setShowAiGenerate(true)}
                className="text-sm px-3 py-1.5 border border-purple-300 text-purple-600 rounded-lg hover:bg-purple-50"
              >
                Generate with AI
              </button>
              <button
                onClick={() => setShowAddQ(true)}
                className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                + Add Question
              </button>
            </div>
          )}
        </div>

        {showAddQ && (
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-sm font-medium text-slate-700 mb-3">
              New Question
            </h3>
            <QuestionForm
              onSave={handleAddQuestion}
              onCancel={() => setShowAddQ(false)}
              isPending={addQMutation.isPending}
            />
          </div>
        )}

        {questions.length === 0 && !showAddQ ? (
          <div className="text-center py-8 text-slate-400">
            <p className="text-sm">No questions yet. Add your first question.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {questions.map((q) => (
              <QuestionRow
                key={q.id}
                q={q}
                onEdit={() => setEditingQ(q)}
                onDelete={() => setDeletingQ(q)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit question modal */}
      {editingQ && (
        <Modal title="Edit Question" onClose={() => setEditingQ(null)}>
          <QuestionForm
            initial={editingQ}
            onSave={handleUpdateQuestion}
            onCancel={() => setEditingQ(null)}
            isPending={updateQMutation.isPending}
          />
        </Modal>
      )}

      {/* Delete question confirm */}
      {deletingQ && (
        <Modal title="Delete Question" onClose={() => setDeletingQ(null)}>
          <p className="text-sm text-slate-600 mb-6">
            Delete question {deletingQ.questionNumber}?
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeletingQ(null)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteQuestion}
              disabled={deleteQMutation.isPending}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
            >
              {deleteQMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {/* Settings modal */}
      {showSettings && (
        <Modal title="Assessment Settings" onClose={() => setShowSettings(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Title
              </label>
              <input
                type="text"
                value={settingsForm.title}
                onChange={(e) =>
                  setSettingsForm((p) => ({ ...p, title: e.target.value }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={settingsForm.subject}
                onChange={(e) =>
                  setSettingsForm((p) => ({ ...p, subject: e.target.value }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Instructions
              </label>
              <textarea
                rows={3}
                value={settingsForm.instructions}
                onChange={(e) =>
                  setSettingsForm((p) => ({
                    ...p,
                    instructions: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Total Marks
                </label>
                <input
                  type="number"
                  min={1}
                  value={settingsForm.totalMarks}
                  onChange={(e) =>
                    setSettingsForm((p) => ({
                      ...p,
                      totalMarks: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsForm.negativeMarking}
                    onChange={(e) =>
                      setSettingsForm((p) => ({
                        ...p,
                        negativeMarking: e.target.checked,
                      }))
                    }
                  />
                  <span className="text-sm">Negative marking</span>
                </label>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Start (IST)
                </label>
                <DateTimePicker
                  value={settingsForm.startAt}
                  onChange={(v) => setSettingsForm((p) => ({ ...p, startAt: v }))}
                  placeholder="Select start time"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  End (IST)
                </label>
                <DateTimePicker
                  value={settingsForm.endAt}
                  onChange={(v) => setSettingsForm((p) => ({ ...p, endAt: v }))}
                  placeholder="Select end time"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={() => setShowSettings(false)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={updateMutation.isPending}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* AI Generate modal */}
      {showAiGenerate && (
        <Modal title="Generate Questions with AI" onClose={() => setShowAiGenerate(false)}>
          <div className="space-y-3">
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700">
              AI will generate questions based on your topic and settings.
            </div>

            {/* Topic */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Topic <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={aiForm.topic}
                onChange={(e) => setAiForm((p) => ({ ...p, topic: e.target.value }))}
                placeholder="e.g. Newton's Laws of Motion"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Subject (optional)</label>
              <input
                type="text"
                value={aiForm.subject}
                onChange={(e) => setAiForm((p) => ({ ...p, subject: e.target.value }))}
                placeholder="e.g. Physics"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Question Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Question Type</label>
              <select
                value={aiForm.questionType}
                onChange={(e) => setAiForm((p) => ({ ...p, questionType: e.target.value as 'mcq' | 'descriptive' | 'both' }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value="mcq">MCQ</option>
                <option value="descriptive">Descriptive</option>
                <option value="both">Both (MCQ + Descriptive)</option>
              </select>
            </div>

            {/* Dynamic count + marks fields */}
            {(aiForm.questionType === 'mcq' || aiForm.questionType === 'both') && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">MCQ Questions (1–20)</label>
                  <input
                    type="number" min={1} max={20}
                    value={aiForm.mcqCount}
                    onChange={(e) => setAiForm((p) => ({ ...p, mcqCount: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Marks per MCQ</label>
                  <input
                    type="number" min={0.5} step={0.5}
                    value={aiForm.mcqMarks}
                    onChange={(e) => setAiForm((p) => ({ ...p, mcqMarks: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            )}
            {(aiForm.questionType === 'descriptive' || aiForm.questionType === 'both') && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Descriptive Questions (1–20)</label>
                  <input
                    type="number" min={1} max={20}
                    value={aiForm.descCount}
                    onChange={(e) => setAiForm((p) => ({ ...p, descCount: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Marks per Descriptive</label>
                  <input
                    type="number" min={0.5} step={0.5}
                    value={aiForm.descMarks}
                    onChange={(e) => setAiForm((p) => ({ ...p, descMarks: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            )}

            {/* Calculated total marks */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600">
              Total marks this generation will add:{' '}
              <span className="font-semibold text-slate-800">
                {aiForm.questionType === 'mcq'
                  ? aiForm.mcqCount * aiForm.mcqMarks
                  : aiForm.questionType === 'descriptive'
                  ? aiForm.descCount * aiForm.descMarks
                  : aiForm.mcqCount * aiForm.mcqMarks + aiForm.descCount * aiForm.descMarks}
              </span>
            </div>

            {/* Difficulty distribution */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Difficulty Distribution
                <span className="ml-1 text-xs text-slate-400 font-normal">
                  (Easy + Medium + Hard must equal total questions:{' '}
                  {aiForm.questionType === 'mcq' ? aiForm.mcqCount
                    : aiForm.questionType === 'descriptive' ? aiForm.descCount
                    : aiForm.mcqCount + aiForm.descCount})
                </span>
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-green-700 font-medium mb-1">Easy</label>
                  <input
                    type="number" min={0}
                    value={aiForm.diffEasy}
                    onChange={(e) => setAiForm((p) => ({ ...p, diffEasy: Number(e.target.value) }))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs text-amber-700 font-medium mb-1">Medium</label>
                  <input
                    type="number" min={0}
                    value={aiForm.diffMedium}
                    onChange={(e) => setAiForm((p) => ({ ...p, diffMedium: Number(e.target.value) }))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs text-red-700 font-medium mb-1">Hard</label>
                  <input
                    type="number" min={0}
                    value={aiForm.diffHard}
                    onChange={(e) => setAiForm((p) => ({ ...p, diffHard: Number(e.target.value) }))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 text-center"
                  />
                </div>
              </div>
              {(() => {
                const total = aiForm.questionType === 'mcq' ? aiForm.mcqCount
                  : aiForm.questionType === 'descriptive' ? aiForm.descCount
                  : aiForm.mcqCount + aiForm.descCount;
                const diffSum = aiForm.diffEasy + aiForm.diffMedium + aiForm.diffHard;
                if (diffSum !== total) {
                  return (
                    <p className="text-xs text-red-500 mt-1">
                      Sum is {diffSum}, expected {total}
                    </p>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={() => setShowAiGenerate(false)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleAiGenerate}
              disabled={generateMutation.isPending}
              className="px-5 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60 font-medium"
            >
              {generateMutation.isPending ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </Modal>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}
    </div>
  );
}
