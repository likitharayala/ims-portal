'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { rehydrateAuth } from '@/lib/auth-store';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            // Prevent OS dialogs (file picker, print, etc.) from triggering
            // background refetches when the window regains focus — especially
            // important on the exam page where a stale-query refetch failure
            // would clear assessment data and show a blank screen.
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    rehydrateAuth();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
