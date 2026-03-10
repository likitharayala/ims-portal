'use client';

import { useState, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useUpdateMaterial } from '@/hooks/use-materials';
import type { Material } from '@/hooks/use-materials';
import { getApiError } from '@/lib/utils';

interface Props {
  material: Material;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function EditModal({ material, onClose, onSuccess, onError }: Props) {
  const [form, setForm] = useState({
    title: material.title,
    subject: material.subject,
    author: material.author ?? '',
    description: material.description ?? '',
  });
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useUpdateMaterial();

  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) { onError('Only PDF files are allowed'); return; }
    if (f.size > 50 * 1024 * 1024) { onError('File must be under 50MB'); return; }
    setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('title', form.title);
    formData.append('subject', form.subject);
    if (form.author) formData.append('author', form.author);
    if (form.description) formData.append('description', form.description);
    if (file) formData.append('file', file);

    try {
      await mutation.mutateAsync({ id: material.id, formData });
      onSuccess('Material updated successfully');
      onClose();
    } catch (err) {
      onError(getApiError(err));
    }
  };

  return (
    <Modal title="Edit Material" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Title <span className="text-red-500">*</span></label>
          <input required type="text" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Subject <span className="text-red-500">*</span></label>
          <input required type="text" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Author</label>
          <input type="text" value={form.author} onChange={(e) => setForm((p) => ({ ...p, author: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        {/* Replace PDF (optional) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Replace PDF (optional)</label>
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:border-blue-300 transition-colors"
          >
            <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {file ? (
              <p className="text-sm font-medium text-slate-700">{file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)</p>
            ) : (
              <p className="text-sm text-slate-500">Click to replace PDF (leave blank to keep existing)</p>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium">
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
