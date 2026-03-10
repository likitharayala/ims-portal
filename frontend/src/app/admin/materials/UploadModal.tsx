'use client';

import { useState, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useCreateMaterial } from '@/hooks/use-materials';
import { getApiError } from '@/lib/utils';

interface Props {
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function UploadModal({ onClose, onSuccess, onError }: Props) {
  const [form, setForm] = useState({ title: '', subject: '', author: '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useCreateMaterial();

  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      onError('Only PDF files are allowed');
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      onError('File must be under 50MB');
      return;
    }
    setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { onError('Please select a PDF file'); return; }

    const formData = new FormData();
    formData.append('title', form.title);
    formData.append('subject', form.subject);
    if (form.author) formData.append('author', form.author);
    if (form.description) formData.append('description', form.description);
    formData.append('file', file);

    try {
      await mutation.mutateAsync(formData);
      onSuccess('Material uploaded successfully');
      onClose();
    } catch (err) {
      onError(getApiError(err));
    }
  };

  return (
    <Modal title="Upload Study Material" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            required
            type="text"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Chapter 5 — Algebra"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Subject <span className="text-red-500">*</span>
          </label>
          <input
            required
            type="text"
            value={form.subject}
            onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Mathematics"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Author</label>
          <input
            type="text"
            value={form.author}
            onChange={(e) => setForm((p) => ({ ...p, author: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Optional"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Optional"
          />
        </div>

        {/* File drop zone */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            PDF File <span className="text-red-500">*</span>
          </label>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-300'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {file ? (
              <div>
                <p className="font-medium text-slate-700 text-sm">{file.name}</p>
                <p className="text-xs text-slate-500 mt-1">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
            ) : (
              <div>
                <p className="text-slate-500 text-sm">Drop PDF here or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">Max 50MB</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
          >
            {mutation.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
