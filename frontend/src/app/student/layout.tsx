'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StudentSidebar } from '@/components/StudentSidebar';
import { useUnreadCount } from '@/hooks/use-notifications';
import { Toast, useToast } from '@/components/ui/Toast';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: unreadCount = 0 } = useUnreadCount();
  const { toast, show: showToast, hide: hideToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    const handler = () => {
      showToast('This feature is not available for your institute.', 'error');
      router.push('/student/dashboard');
    };
    window.addEventListener('feature-disabled', handler);
    return () => window.removeEventListener('feature-disabled', handler);
  }, [router, showToast]);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-shrink-0">
        <StudentSidebar unreadCount={unreadCount} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-50 flex-shrink-0">
            <StudentSidebar unreadCount={unreadCount} onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Image src="/logo.png" alt="Teachly" width={130} height={40} className="h-9 w-auto object-contain" priority />
          {unreadCount > 0 && (
            <span className="ml-auto bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
