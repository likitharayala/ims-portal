'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { useStudentFeatures } from '@/hooks/use-features';

const NAV_LINKS = [
  { href: '/student/dashboard',      label: 'Dashboard',    icon: '⊞', feature: undefined },
  { href: '/student/assessments',    label: 'Assessments',  icon: '📝', feature: 'assessments' },
  { href: '/student/materials',      label: 'Materials',    icon: '📄', feature: 'materials' },
  { href: '/student/results',        label: 'My Results',   icon: '🏆', feature: 'assessments' },
  { href: '/student/attendance',     label: 'Attendance',   icon: '✓',  feature: undefined },
  { href: '/student/notifications',  label: 'Notifications',icon: '🔔', feature: undefined },
  { href: '/student/profile',        label: 'My Profile',   icon: '👤', feature: undefined },
];

interface Props {
  unreadCount?: number;
  onClose?: () => void;
}

export function StudentSidebar({ unreadCount = 0, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const { data: features } = useStudentFeatures();
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
    href === '/student/dashboard'
      ? pathname === href
      : pathname.startsWith(href);

  const visibleLinks = NAV_LINKS.filter((link) => {
    if (!link.feature) return true;
    if (!features) return true;
    return features[link.feature] === true;
  });

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-100">
        <Image src="/logo.png" alt="Teachly" width={120} height={40} className="object-contain" priority />
        {user?.instituteName && (
          <p className="text-xs text-slate-500 mt-1 truncate">{user.instituteName}</p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {visibleLinks.map((link) => (
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
            {link.href === '/student/notifications' && unreadCount > 0 && (
              <span className="ml-auto bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-4 py-4 border-t border-slate-100">
        <div className="flex items-center gap-3 px-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
            {user?.name?.[0]?.toUpperCase() ?? 'S'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{user?.name}</p>
            <p className="text-xs text-slate-500">Student</p>
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
