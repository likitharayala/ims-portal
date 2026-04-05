'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useAdminAssessments,
  useDeleteAssessment,
  useDuplicateAssessment,
} from '@/hooks/use-assessments';
import type { Assessment } from '@/hooks/use-assessments';
import { AssessmentCard } from './AssessmentCard';
import { Modal } from '@/components/ui/Modal';
import { Toast, useToast } from '@/components/ui/Toast';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { getApiError } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
  { value: 'evaluated', label: 'Evaluated' },
];

export default function AdminAssessmentsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<Assessment | null>(null);
  const { toast, show: showToast, hide: hideToast } = useToast();

  const { data, isLoading } = useAdminAssessments({
    search: search || undefined,
    status: status || undefined,
    page,
  });
  const deleteMutation = useDeleteAssessment();
  const duplicateMutation = useDuplicateAssessment();

  const assessments = data?.data ?? [];
  const meta = data?.meta;

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      showToast('Assessment deleted');
      setDeleting(null);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateMutation.mutateAsync(id);
      showToast('Assessment duplicated');
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Assessments</h1>
          {meta && (
            <p className="text-sm text-slate-500 mt-0.5">{meta.total} total</p>
          )}
        </div>
        <Link
          href="/admin/assessments/new"
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-center"
        >
          + New Assessment
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="Search title, subject…"
          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : assessments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
          <p className="text-4xl mb-4">📝</p>
          <h2 className="text-base font-semibold text-slate-700 mb-1">
            No assessments yet
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            Create your first assessment to get started.
          </p>
          <Link
            href="/admin/assessments/new"
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            New Assessment
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {assessments.map((a) => (
            <AssessmentCard
              key={a.id}
              assessment={a}
              onDelete={() => setDeleting(a)}
              onDuplicate={() => handleDuplicate(a.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
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

      {/* Delete confirm */}
      {deleting && (
        <Modal title="Delete Assessment" onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-600 mb-6">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-slate-800">
              &quot;{deleting.title}&quot;
            </span>
            ? This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleting(null)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
