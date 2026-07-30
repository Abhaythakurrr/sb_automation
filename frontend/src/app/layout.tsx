import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import CopilotDock from '@/components/copilot/CopilotDock';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Stonebranch Automation',
  description: 'Enterprise automation platform for Stonebranch UAC — built by Abhay Thakur',
  icons: {
    icon:  '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className={inter.className}>
        <ToastProvider>
          {children}
          {/* AI Operations Copilot (Beta) — mounted at the root so it is
              available on every page, including the documentation and SOP
              routes that render outside the workspace shell. */}
          <CopilotDock />
        </ToastProvider>
      </body>
    </html>
  );
}
