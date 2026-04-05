'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStudentMaterials, useStudentMaterialSubjects } from '@/hooks/use-materials';
import type { Material } from '@/hooks/use-materials';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { toIST } from '@/lib/utils';

function StudentMaterialCard({ material }: { material: Material }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 text-sm">{material.title}</h3>
          <p className="text-xs text-blue-600 font-medium mt-0.5">{material.subject}</p>
        </div>
        <div className="flex-shrink-0 w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center text-red-500 text-xs font-bold">
          PDF
        </div>
      </div>

      <div className="text-xs text-slate-500 space-y-0.5">
        {material.author && <p>by {material.author}</p>}
        {material.description && (
          <p className="text-slate-400 line-clamp-2">{material.description}</p>
        )}
        <p>{toIST(material.createdAt, 'dd MMM yyyy')}</p>
      </div>

      <Link
        href={`/student/materials/${material.id}`}
        className="mt-auto inline-flex items-center justify-center px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
      >
        View PDF
      </Link>
    </div>
  );
}

export default function StudentMaterialsPage() {
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useStudentMaterials({
    search: search || undefined,
    subject: subject || undefined,
    sort,
    page,
  });
  const { data: subjects } = useStudentMaterialSubjects();

  const materials = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Study Materials</h1>
        {meta && <p className="text-sm text-slate-500 mt-0.5">{meta.total} materials available</p>}
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
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : materials.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
          <p className="text-4xl mb-4">📄</p>
          <p className="text-slate-500 text-sm">No materials available yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {materials.map((m) => (
            <StudentMaterialCard key={m.id} material={m} />
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
    </div>
  );
}
