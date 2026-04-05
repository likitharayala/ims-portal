'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getBrowserSupabaseClient } from '@/lib/supabase-browser';

function Spinner() {
  return (
    <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
  );
}

function SuccessIcon() {
  return (
    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
      <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}

function ErrorIcon() {
  return (
    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
      <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  );
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    let isCancelled = false;

    const verifyEmail = async () => {
      try {
        const errorMessage =
          searchParams.get('error_description') ?? searchParams.get('error') ?? '';

        if (errorMessage) {
          throw new Error(errorMessage);
        }

        const supabase = getBrowserSupabaseClient();
        const tokenHash = searchParams.get('token_hash');
        const type = searchParams.get('type') as EmailOtpType | null;

        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });

          if (error) {
            throw error;
          }
        }

        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (!data.session) {
          throw new Error('No Supabase session found after verification.');
        }

        if (isCancelled) {
          return;
        }

        setStatus('success');
        setMessage('Email verified successfully');

        window.setTimeout(() => {
          router.replace('/login');
        }, 2000);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setStatus('error');
        setMessage(
          error instanceof Error && error.message
            ? error.message
            : 'Verification failed',
        );
      }
    };

    void verifyEmail();

    return () => {
      isCancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {status === 'loading' && (
          <>
            <Spinner />
            <h1 className="mb-2 text-xl font-semibold text-slate-800">Verifying your email...</h1>
            <p className="text-sm text-slate-500">Please wait while we confirm your Supabase verification.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <SuccessIcon />
            <h1 className="mb-2 text-xl font-semibold text-slate-800">Email verified successfully</h1>
            <p className="text-sm text-slate-500">Redirecting you to login...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <ErrorIcon />
            <h1 className="mb-2 text-xl font-semibold text-slate-800">Verification failed</h1>
            <p className="text-sm text-slate-500">{message}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <Spinner />
            <h1 className="mb-2 text-xl font-semibold text-slate-800">Verifying your email...</h1>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
