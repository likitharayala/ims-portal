'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { getApiError } from '@/lib/utils';
import type { AuthUser } from '@/lib/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [form, setForm] = useState({ emailOrPhone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const errs: Record<string, string> = {};
    if (!form.emailOrPhone.trim()) errs.emailOrPhone = 'Email or phone is required';
    if (!form.password) errs.password = 'Password is required';
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', form);
      const { accessToken, refreshToken, user } = data.data as {
        accessToken: string;
        refreshToken: string;
        user: AuthUser;
      };

      setAuth(accessToken, refreshToken, user);

      // Set cookies for middleware
      document.cookie = `accessToken=${accessToken}; path=/; max-age=900`;
      document.cookie = `userRole=${user.role}; path=/; max-age=604800`;

      if (user.mustChangePassword) {
        router.push('/change-password');
        return;
      }

      router.push(user.role === 'admin' ? '/admin/dashboard' : '/student/dashboard');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <h2 className="text-xl font-semibold text-slate-800 mb-6">Sign in to your account</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Email or Phone
          </label>
          <input
            type="text"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${fieldErrors.emailOrPhone ? 'border-red-400' : 'border-slate-300'}`}
            placeholder="your@email.com"
            value={form.emailOrPhone}
            onChange={(e) => setForm({ ...form, emailOrPhone: e.target.value })}
          />
          {fieldErrors.emailOrPhone && <p className="text-xs text-red-500 mt-1">{fieldErrors.emailOrPhone}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
          <input
            type="password"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${fieldErrors.password ? 'border-red-400' : 'border-slate-300'}`}
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {fieldErrors.password && <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>}
        </div>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        New institute?{' '}
        <Link href="/signup" className="text-blue-600 hover:text-blue-700 font-medium">
          Create account
        </Link>
      </p>

      <div className="mt-4 text-center">
        <Link
          href="/resend-verification"
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Resend verification email
        </Link>
      </div>
    </div>
  );
}
