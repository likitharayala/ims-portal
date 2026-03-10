'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';

interface Props {
  email: string;
  tempPassword: string;
  studentName: string;
  onClose: () => void;
}

export function CredentialModal({ email, tempPassword, studentName, onClose }: Props) {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPwd, setCopiedPwd] = useState(false);

  const copy = async (text: string, which: 'email' | 'pwd') => {
    await navigator.clipboard.writeText(text);
    if (which === 'email') {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } else {
      setCopiedPwd(true);
      setTimeout(() => setCopiedPwd(false), 2000);
    }
  };

  return (
    <Modal title="Student Created" onClose={onClose}>
      <div className="space-y-4">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <strong>Important:</strong> Share these credentials with{' '}
          <span className="font-semibold">{studentName}</span>. The password will not be shown
          again.
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-sm font-mono text-slate-800">
                {email}
              </code>
              <button
                onClick={() => copy(email, 'email')}
                className="px-3 py-2 text-xs bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-700 whitespace-nowrap"
              >
                {copiedEmail ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Temporary Password
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-sm font-mono text-slate-800 tracking-widest">
                {tempPassword}
              </code>
              <button
                onClick={() => copy(tempPassword, 'pwd')}
                className="px-3 py-2 text-xs bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-700 whitespace-nowrap"
              >
                {copiedPwd ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          The student will be prompted to change their password on first login.
        </p>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
