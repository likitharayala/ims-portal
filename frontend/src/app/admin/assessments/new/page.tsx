'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreateAssessment } from '@/hooks/use-assessments';
import { getApiError, istLocalToUTC } from '@/lib/utils';
import { DateTimePicker } from '@/components/ui/DateTimePicker';

export default function NewAssessmentPage() {
  const router = useRouter();
  const createMutation = useCreateAssessment();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
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

  const set = (k: string, v: unknown) =>
    setForm((p) => ({ ...p, [k]: v }));

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    if (Number(form.totalMarks) < 1) errs.totalMarks = 'Total marks must be at least 1';
    if (form.startAt && form.endAt && new Date(form.endAt) <= new Date(form.startAt)) {
      errs.endAt = 'End time must be after start time';
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    try {
      const assessment = await createMutation.mutateAsync({
        title: form.title,
        subject: form.subject || undefined,
        description: form.description || undefined,
        instructions: form.instructions || undefined,
        totalMarks: Number(form.totalMarks),
        negativeMarking: form.negativeMarking,
        negativeValue: form.negativeMarking ? Number(form.negativeValue) : undefined,
        startAt: form.startAt ? istLocalToUTC(form.startAt) : undefined,
        endAt: form.endAt ? istLocalToUTC(form.endAt) : undefined,
      } as any);
      router.push(`/admin/assessments/${assessment.id}`);
    } catch (err) {
      setError(getApiError(err));
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/assessments"
          className="text-slate-400 hover:text-slate-600 text-sm"
        >
          ← Assessments
        </Link>
        <h1 className="text-xl font-semibold text-slate-800">
          New Assessment
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        {error && (
          <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{error}</p>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${fieldErrors.title ? 'border-red-400' : 'border-slate-300'}`}
            placeholder="e.g. Chapter 5 Test"
          />
          {fieldErrors.title && <p className="text-xs text-red-500 mt-1">{fieldErrors.title}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Subject
          </label>
          <input
            type="text"
            value={form.subject}
            onChange={(e) => set('subject', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Mathematics"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Description
          </label>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Instructions (shown before exam starts)
          </label>
          <textarea
            rows={3}
            value={form.instructions}
            onChange={(e) => set('instructions', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Total Marks <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={form.totalMarks}
              onChange={(e) => set('totalMarks', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${fieldErrors.totalMarks ? 'border-red-400' : 'border-slate-300'}`}
            />
            {fieldErrors.totalMarks && <p className="text-xs text-red-500 mt-1">{fieldErrors.totalMarks}</p>}
          </div>

          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.negativeMarking}
                onChange={(e) => set('negativeMarking', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              <span className="text-sm text-slate-700">Negative marking</span>
            </label>
            {form.negativeMarking && (
              <input
                type="number"
                min={0}
                step={0.25}
                value={form.negativeValue}
                onChange={(e) => set('negativeValue', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Deduction per wrong MCQ"
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Start Time (IST)
            </label>
            <DateTimePicker
              value={form.startAt}
              onChange={(v) => set('startAt', v)}
              placeholder="Select start time"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              End Time (IST)
            </label>
            <DateTimePicker
              value={form.endAt}
              onChange={(v) => set('endAt', v)}
              placeholder="Select end time"
            />
            {fieldErrors.endAt && <p className="text-xs text-red-500 mt-1">{fieldErrors.endAt}</p>}
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Link
            href="/admin/assessments"
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
          >
            {createMutation.isPending ? 'Creating…' : 'Create & Add Questions'}
          </button>
        </div>
      </form>
    </div>
  );
}
