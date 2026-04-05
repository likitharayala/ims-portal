import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Teachly | Institute Management System',
  description: 'Teachly is a multi-tenant institute management system for tuition centres',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-50 font-sans text-slate-800 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
