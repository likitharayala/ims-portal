'use client';

import { useState } from 'react';
import {
  useAdminMaterials,
  useAdminMaterialSubjects,
  useToggleHidden,
  useDeleteMaterial,
} from '@/hooks/use-materials';
import type { Material } from '@/hooks/use-materials';
import { MaterialCard } from './MaterialCard';
import { UploadModal } from './UploadModal';
import { EditModal } from './EditModal';
import { Modal } from '@/components/ui/Modal';
import { Toast, useToast } from '@/components/ui/Toast';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { getApiError } from '@/lib/utils';

export default function AdminMaterialsPage() {
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [deleting, setDeleting] = useState<Material | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { toast, show: showToast, hide: hideToast } = useToast();

  const { data, isLoading } = useAdminMaterials({ search: search || undefined, subject: subject || undefined, sort, page });
  const { data: subjects } = useAdminMaterialSubjects();
  const toggleMutation = useToggleHidden();
  const deleteMutation = useDeleteMaterial();

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    try {
      await toggleMutation.mutateAsync(id);
      showToast('Visibility updated');
    } catch (err) {
      showToast(getApiError(err), 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      showToast('Material deleted');
      setDeleting(null);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const materials = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Study Materials</h1>
          {meta && <p className="text-sm text-slate-500 mt-0.5">{meta.total} total</p>}
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
        >
          + Upload Material
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="Search title, subject, author…"
          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          value={subject}
          onChange={(e) => { setSubject(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All Subjects</option>
          {subjects?.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : materials.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
          <p className="text-4xl mb-4">📄</p>
          <h2 className="text-base font-semibold text-slate-700 mb-1">No materials yet</h2>
          <p className="text-sm text-slate-500 mb-4">Upload your first PDF to get started.</p>
          <button
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Upload Material
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {materials.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              onEdit={() => setEditing(m)}
              onDelete={() => setDeleting(m)}
              onToggleHidden={() => handleToggle(m.id)}
              toggling={togglingId === m.id}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.total > meta.pageSize && (
        <div className="flex items-center justify-between mt-6 text-sm text-slate-600">
          <span>Page {meta.page} of {Math.ceil(meta.total / meta.pageSize)}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}
              className="px-3 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50">
              Previous
            </button>
            <button disabled={page >= Math.ceil(meta.total / meta.pageSize)} onClick={() => setPage(page + 1)}
              className="px-3 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50">
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={(msg) => showToast(msg)}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {editing && (
        <EditModal
          material={editing}
          onClose={() => setEditing(null)}
          onSuccess={(msg) => showToast(msg)}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {deleting && (
        <Modal title="Delete Material" onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-600 mb-6">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-slate-800">"{deleting.title}"</span>?
            The file will be permanently removed.
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setDeleting(null)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
