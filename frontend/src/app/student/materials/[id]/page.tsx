'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStudentMaterial } from '@/hooks/use-materials';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';

export default function MaterialViewerPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const { data: material, isLoading } = useStudentMaterial(id);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(true);
  const [fileError, setFileError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoadingFile(true);
    setFileError('');

    api
      .get(`/materials/${id}/file`, { responseType: 'blob' })
      .then((res) => {
        const blob = new Blob([res.data as BlobPart], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch(() => setFileError('Failed to load PDF. Please try again.'))
      .finally(() => setLoadingFile(false));

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="animate-pulse h-8 w-48 bg-slate-200 rounded mb-4" />
        <div className="animate-pulse h-[80vh] bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (!material) {
    return (
      <div className="p-6 text-center text-slate-500">
        Material not found.{' '}
        <Link href="/student/materials" className="text-blue-600 hover:underline">
          Back to materials
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/student/materials" className="text-slate-400 hover:text-slate-600 text-sm">
          ← Materials
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-slate-800 truncate">{material.title}</h1>
          <p className="text-sm text-blue-600">{material.subject}</p>
        </div>
      </div>

      {/* Viewer */}
      <div
        className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
        style={{ height: '82vh' }}
      >
        {/* Watermark */}
        <div
          className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden"
          aria-hidden="true"
        >
          {Array.from({ length: 8 }).map((_, row) =>
            Array.from({ length: 4 }).map((_, col) => (
              <span
                key={`${row}-${col}`}
                className="absolute text-slate-400 font-semibold text-sm whitespace-nowrap"
                style={{
                  top: `${row * 13}%`,
                  left: `${col * 28 - 5}%`,
                  transform: 'rotate(-28deg)',
                  opacity: 0.35,
                }}
              >
                {user?.name ?? 'Student'}
              </span>
            )),
          )}
        </div>

        {/* PDF iframe */}
        {loadingFile ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3" />
              <p className="text-sm text-slate-500">Loading PDF…</p>
            </div>
          </div>
        ) : fileError ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-red-500">{fileError}</p>
          </div>
        ) : blobUrl ? (
          <iframe
            src={`${blobUrl}#toolbar=0&navpanes=0`}
            className="w-full h-full border-0"
            title={material.title}
          />
        ) : null}
      </div>

      {material.author && (
        <p className="text-xs text-slate-400 mt-2 text-right">Author: {material.author}</p>
      )}
    </div>
  );
}
