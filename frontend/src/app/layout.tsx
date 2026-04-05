import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  
  title: 'Teachly — Institute Management',
  description: 'Multi-tenant institute management system for tuition centres',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased bg-gray-50 text-slate-800 font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
