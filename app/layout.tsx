import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import AppHeader from '@/components/AppHeader';
import AiChat from '@/components/AiChat';
import AuthGate from '@/components/AuthGate';
import { DataViewProvider } from '@/lib/dataView';
import './globals.css';

// Downloaded at build time and served with the site: no request to Google from the browser.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'IJF HR Database',
  description: 'New job openings in India for Data Analyst, Data Science, Data Engineering and Production Support roles',
};

// Applies a remembered light/dark choice before the page paints (see ThemeToggle), so it never flashes.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {/* Sign-in first: nothing below (or its data) loads until the person has an allowed role. */}
        <AuthGate>
          <DataViewProvider>
            <AppHeader />
            {children}
            <AiChat />
          </DataViewProvider>
        </AuthGate>
        <footer className="app-footer">
          <div className="app-footer-inner">
            <span className="app-footer-brand">IJF HR Database</span>
            <span>Job openings from LinkedIn, Naukri, Indeed and Glassdoor · updated every day</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
