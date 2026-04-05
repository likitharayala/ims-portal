'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';

const NAV_LINKS = [
  { href: '/teacher/dashboard', label: 'Dashboard', icon: '⊞' },
  { href: '/teacher/students', label: 'My Students', icon: '👥' },
  { href: '/teacher/attendance', label: 'Attendance', icon: '✓' },
];

interface Props {
  onClose?: () => void;
}

export function TeacherSidebar({ onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    clearAuth();
    queryClient.clear();
    document.cookie = 'accessToken=; path=/; max-age=0';
    document.cookie = 'userRole=; path=/; max-age=0';
    router.push('/login');
  };

  const isActive = (href: string) =>
    href === '/teacher/dashboard'
      ? pathname === href
      : pathname.startsWith(href);

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-100">
        <span className="text-xl font-bold text-blue-600 tracking-tight">Teachly</span>
        {user?.instituteName && (
          <p className="text-xs text-slate-500 mt-1 truncate">{user.instituteName}</p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClose}
            className={`flex items-center gap-3 px-5 py-2.5 mx-2 rounded-lg text-sm font-medium transition-colors ${
              isActive(link.href)
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <span className="w-5 text-center text-base leading-none">{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-4 py-4 border-t border-slate-100">
        <div className="flex items-center gap-3 px-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-semibold text-sm">
            {user?.name?.[0]?.toUpperCase() ?? 'T'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{user?.name}</p>
            <p className="text-xs text-slate-500">Teacher</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
