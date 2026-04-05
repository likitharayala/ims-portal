'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { api } from '@/lib/api';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token found in the URL.');
      return;
    }

    api
      .get(`/auth/verify-email?token=${token}`)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        const e = err as { response?: { data?: { error?: { message?: string } } } };
        setMessage(e.response?.data?.error?.message ?? 'Verification failed');
      });
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <p className="text-slate-500 text-sm">Verifying your email…</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Email verified!</h2>
        <p className="text-slate-500 text-sm mb-6">Your account is now active. You can sign in.</p>
        <Link
          href="/login"
          className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-slate-800 mb-2">Verification failed</h2>
      <p className="text-slate-500 text-sm mb-4">{message}</p>
      <Link href="/login" className="text-blue-600 text-sm font-medium hover:text-blue-700">
        Request a new verification email
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="bg-white rounded-2xl p-8 text-center text-sm text-slate-500">Loading…</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
