'use client';

import Image from 'next/image';
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
    try {
      await api.post('/auth/logout');
    } catch {}
    clearAuth();
    queryClient.clear();
    document.cookie = 'accessToken=; path=/; max-age=0';
    document.cookie = 'userRole=; path=/; max-age=0';
    router.push('/login');
  };

  const isActive = (href: string) =>
    href === '/teacher/dashboard' ? pathname === href : pathname.startsWith(href);

  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-5">
        <Image
          src="/logo.png"
          alt="Teachly"
          width={130}
          height={40}
          className="object-contain"
          priority
        />
        {user?.instituteName && (
          <p className="mt-1 truncate text-xs text-slate-500">{user.instituteName}</p>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClose}
            className={`mx-2 flex items-center gap-3 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
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

      <div className="border-t border-slate-100 px-4 py-4">
        <div className="mb-3 flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-sm font-semibold text-purple-700">
            {user?.name?.[0]?.toUpperCase() ?? 'T'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{user?.name}</p>
            <p className="text-xs text-slate-500">Teacher</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
