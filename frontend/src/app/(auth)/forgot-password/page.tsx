'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getApiError } from '@/lib/utils';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <p className="text-slate-700 text-sm">
          If <strong>{email}</strong> is registered, a password reset link has been sent. Check your
          inbox (and spam folder).
        </p>
        <Link href="/login" className="mt-6 inline-block text-blue-600 text-sm font-medium">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <h2 className="text-xl font-semibold text-slate-800 mb-2">Forgot password</h2>
      <p className="text-sm text-slate-500 mb-6">
        Enter your email and we'll send a reset link valid for 30 minutes.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            type="email"
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          {loading ? 'Sending…' : 'Send Reset Link'}
        </button>
      </form>

      <Link href="/login" className="mt-6 block text-center text-sm text-slate-500 hover:text-slate-700">
        ← Back to login
      </Link>
    </div>
  );
}
