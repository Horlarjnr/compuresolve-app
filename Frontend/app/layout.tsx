import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import AuthProvider from '@/components/providers/AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';

const poppins = Poppins({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-poppins', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'CompuResolve', template: '%s · CompuResolve' },
  description: 'Every Voice Matters. Every Issue Deserves Resolution. The Faculty of Computing complaint resolution platform.',
  icons: { icon: '/logo-mark.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0B2B26' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen font-sans">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
