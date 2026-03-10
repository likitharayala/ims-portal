'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Assessment } from '@/hooks/use-assessments';
import { toIST } from '@/lib/utils';
import { DropdownMenu } from '@/components/ui/DropdownMenu';

interface Props {
  assessment: Assessment;
  onDelete: () => void;
  onDuplicate: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-orange-100 text-orange-700',
  evaluated: 'bg-purple-100 text-purple-700',
};

export function AssessmentCard({ assessment, onDelete, onDuplicate }: Props) {
  const router = useRouter();
  const questionCount = assessment._count?.questions ?? 0;
  const submissionCount = assessment._count?.submissions ?? 0;

  const canEvaluate =
    assessment.status === 'closed' ||
    assessment.status === 'evaluated' ||
    assessment.status === 'active';

  const menuItems = [
    {
      label: 'Edit',
      onClick: () => router.push(`/admin/assessments/${assessment.id}`),
    },
    ...(canEvaluate
      ? [
          {
            label: 'Evaluate',
            onClick: () =>
              router.push(`/admin/assessments/${assessment.id}/evaluate`),
          },
        ]
      : []),
    {
      label: 'Duplicate',
      onClick: onDuplicate,
    },
    {
      label: 'Delete',
      onClick: onDelete,
      variant: 'danger' as const,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 text-sm truncate">
            {assessment.title}
          </h3>
          {assessment.subject && (
            <p className="text-xs text-blue-600 font-medium mt-0.5">
              {assessment.subject}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[assessment.status] ?? 'bg-slate-100 text-slate-600'}`}
          >
            {assessment.status}
          </span>
          <DropdownMenu items={menuItems} />
        </div>
      </div>

      {/* Meta */}
      <div className="text-xs text-slate-500 space-y-0.5">
        <p>{questionCount} question{questionCount !== 1 ? 's' : ''} · {assessment.totalMarks} marks</p>
        {assessment.startAt && (
          <p>Start: {toIST(assessment.startAt, 'dd MMM yyyy, hh:mm a')}</p>
        )}
        {assessment.endAt && (
          <p>End: {toIST(assessment.endAt, 'dd MMM yyyy, hh:mm a')}</p>
        )}
        {submissionCount > 0 && (
          <p>{submissionCount} submission{submissionCount !== 1 ? 's' : ''}</p>
        )}
      </div>

      {/* Quick action */}
      <div className="pt-1 border-t border-slate-100">
        <Link
          href={`/admin/assessments/${assessment.id}`}
          className="text-xs text-slate-500 hover:text-blue-600 transition-colors"
        >
          View details →
        </Link>
      </div>
    </div>
  );
}
