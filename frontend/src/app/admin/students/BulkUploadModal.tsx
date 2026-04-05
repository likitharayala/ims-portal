'use client';

import { useState, useRef, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Toast, useToast } from '@/components/ui/Toast';
import { useBulkUpload } from '@/hooks/use-students';
import type { BulkUploadResult } from '@/hooks/use-students';
import { getApiError } from '@/lib/utils';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  onClose: () => void;
}

function downloadCredentialsCSV(
  credentials: Array<{ name: string; email: string; tempPassword: string }>,
) {
  const header = 'Name,Email,Temporary Password\n';
  const rows = credentials
    .map((c) => `"${c.name}","${c.email}","${c.tempPassword}"`)
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'student-credentials.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function downloadErrorReport(
  errors: Array<{ row: number; email: string; reason: string }>,
) {
  const header = 'Row,Email,Reason\n';
  const rows = errors.map((e) => `${e.row},"${e.email}","${e.reason}"`).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'upload-errors.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkUploadModal({ onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { toast, show: showToast, hide: hideToast } = useToast();

  const uploadMutation = useBulkUpload();

  const handleFile = useCallback(
    (f: File) => {
      if (!f.name.endsWith('.xlsx')) {
        showToast('Only .xlsx files are allowed', 'error');
        return;
      }
      setFile(f);
    },
    [showToast],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    try {
      const res = await uploadMutation.mutateAsync(file);
      setResult(res);
      // Refresh student lists
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['student-filter-options'] });
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  // Template download with auth header (plain <a> won't work — backend requires JWT)
  const handleDownloadTemplate = async () => {
    try {
      const { data } = await api.get('/admin/students/bulk-upload/template', {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'students-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Failed to download template', 'error');
    }
  };

  const handleClose = () => onClose();

  const total = result ? result.created + result.skipped : 0;

  return (
    <>
      <Modal title="Bulk Upload Students" onClose={handleClose} maxWidth="max-w-xl">
        {/* ── File selection ─────────────────────────────────────── */}
        {!result && !uploadMutation.isPending && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Upload an <strong>.xlsx</strong> file with columns: Name, Email, Phone, Class, School,
              Fee Amount (required) + optional fields.{' '}
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-blue-600 hover:underline text-sm"
              >
                Download template
              </button>
            </p>

            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-blue-400 bg-blue-50'
                  : file
                  ? 'border-green-400 bg-green-50'
                  : 'border-slate-300 hover:border-blue-300'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {file ? (
                <div>
                  <svg
                    className="w-8 h-8 text-green-500 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="font-medium text-slate-700">{file.name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {(file.size / 1024).toFixed(1)} KB · Click to change
                  </p>
                </div>
              ) : (
                <div>
                  <svg
                    className="w-8 h-8 text-slate-400 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  <p className="text-slate-500">Drag & drop your .xlsx file here</p>
                  <p className="text-xs text-slate-400 mt-1">or click to browse</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploadMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Upload
              </button>
            </div>
          </div>
        )}

        {/* ── Processing ─────────────────────────────────────────── */}
        {uploadMutation.isPending && (
          <div className="text-center py-10">
            <div className="inline-block w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
            <p className="text-slate-700 font-medium">Processing file…</p>
            <p className="text-xs text-slate-400 mt-1">Creating student accounts. Please wait.</p>
          </div>
        )}

        {/* ── Result ─────────────────────────────────────────────── */}
        {result && (
          <div className="space-y-5">
            {/* Summary stats */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="text-center p-4 bg-green-50 rounded-xl border border-green-100">
                <p className="text-3xl font-bold text-green-700">{result.created}</p>
                <p className="text-xs text-green-600 mt-1 font-medium">Created</p>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-3xl font-bold text-amber-700">{result.skipped}</p>
                <p className="text-xs text-amber-600 mt-1 font-medium">Skipped</p>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-3xl font-bold text-slate-700">{result.errors.length}</p>
                <p className="text-xs text-slate-500 mt-1 font-medium">Errors</p>
              </div>
            </div>

            <p className="text-xs text-slate-500 text-center">
              Total processed: <strong>{total}</strong> row{total !== 1 ? 's' : ''}
            </p>

            {/* Error list */}
            {result.errors.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-700">
                    Errors ({result.errors.length})
                  </p>
                  <button
                    onClick={() => downloadErrorReport(result.errors)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Download error report
                  </button>
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                  {result.errors.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-100"
                    >
                      <span className="font-semibold flex-shrink-0">Row {e.row}:</span>
                      {e.email && <span className="text-red-500 flex-shrink-0">{e.email}</span>}
                      <span className="text-red-600">— {e.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Credentials download */}
            {result.credentials.length > 0 && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-blue-800 font-semibold text-sm mb-1">
                  {result.credentials.length} credential{result.credentials.length !== 1 ? 's' : ''} generated
                </p>
                <p className="text-blue-700 text-xs mb-3">
                  Download now and share with students. Passwords are shown only once.
                </p>
                <button
                  onClick={() => downloadCredentialsCSV(result.credentials)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium"
                >
                  Download Credentials CSV
                </button>
              </div>
            )}

            {result.created === 0 && result.errors.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-2">
                No data rows found in the file.
              </p>
            )}

            <div className="flex gap-3 justify-between">
              {/* Allow uploading another file */}
              <button
                onClick={() => {
                  setResult(null);
                  setFile(null);
                  uploadMutation.reset();
                }}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                Upload Another
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </>
  );
}
