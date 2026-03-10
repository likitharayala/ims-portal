'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStudents, useStudentFilterOptions, useDeleteStudent } from '@/hooks/use-students';
import type { Student } from '@/hooks/use-students';
import { Toast, useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { toIST, formatINR, getApiError } from '@/lib/utils';
import { BulkUploadModal } from './BulkUploadModal';
import { api } from '@/lib/api';

function DeleteConfirmDialog({
  student,
  onConfirm,
  onCancel,
  loading,
}: {
  student: Student;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <Modal title="Delete Student" onClose={onCancel}>
      <p className="text-sm text-slate-600 mb-6">
        Are you sure you want to delete{' '}
        <span className="font-semibold text-slate-800">{student.user.name}</span>? This action
        cannot be undone.
      </p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
        >
          {loading ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}

export default function StudentsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const { toast, show: showToast, hide: hideToast } = useToast();

  const { data, isLoading } = useStudents({
    page,
    search: search || undefined,
    class: classFilter || undefined,
    school: schoolFilter || undefined,
  });

  const { data: filterOptions } = useStudentFilterOptions();
  const deleteMutation = useDeleteStudent();

  const exportStudents = async () => {
    setExportLoading(true);
    try {
      const res = await api.get('/admin/students/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'students.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(getApiError(err), 'error');
    } finally {
      setExportLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingStudent) return;
    try {
      await deleteMutation.mutateAsync(deletingStudent.id);
      showToast('Student deleted successfully');
      setDeletingStudent(null);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const students = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Students</h1>
          {meta && (
            <p className="text-sm text-slate-500 mt-0.5">{meta.total} total students</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBulkUpload(true)}
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
          >
            Bulk Upload
          </button>
          <Link
            href="/admin/students/new"
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            + Add Student
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search name, email, phone, class, school…"
          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          value={classFilter}
          onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Classes</option>
          {filterOptions?.classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          value={schoolFilter}
          onChange={(e) => { setSchoolFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Schools</option>
          {filterOptions?.schools.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          onClick={exportStudents}
          disabled={exportLoading}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 whitespace-nowrap disabled:opacity-60"
        >
          {exportLoading ? 'Exporting…' : 'Export'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 hidden md:table-cell">Email</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 hidden lg:table-cell">Phone</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Class</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 hidden lg:table-cell">School</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 hidden xl:table-cell">Parent</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 hidden xl:table-cell">Joined</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 hidden sm:table-cell">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <SkeletonRows rows={5} cols={9} />
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-slate-500">
                    <p className="text-base font-medium">No students yet</p>
                    <p className="text-sm mt-1">
                      <Link href="/admin/students/new" className="text-blue-600 hover:underline">
                        Add your first student
                      </Link>
                    </p>
                  </td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      <Link href={`/admin/students/${s.id}`} className="hover:text-blue-600">
                        {s.user.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{s.user.email}</td>
                    <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{s.user.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{s.class}</td>
                    <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{s.school}</td>
                    <td className="px-4 py-3 text-slate-600 hidden xl:table-cell">
                      {s.parentName ?? '—'}
                      {s.parentPhone && <span className="text-xs text-slate-400 ml-1">({s.parentPhone})</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs hidden xl:table-cell">
                      {toIST(s.joinedDate, 'dd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {s.user.mustChangePassword ? (
                        <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">
                          Pending login
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Link
                          href={`/admin/students/${s.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                          title="Edit student"
                        >
                          ✎ Edit
                        </Link>
                        <button
                          onClick={() => setDeletingStudent(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-red-200 rounded-lg text-red-600 hover:bg-red-50 font-medium"
                          title="Delete student"
                        >
                          ✕ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && meta.total > meta.pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
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
      </div>

      {/* Modals */}
      {deletingStudent && (
        <DeleteConfirmDialog
          student={deletingStudent}
          onConfirm={handleDelete}
          onCancel={() => setDeletingStudent(null)}
          loading={deleteMutation.isPending}
        />
      )}

      {showBulkUpload && <BulkUploadModal onClose={() => setShowBulkUpload(false)} />}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
