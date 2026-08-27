import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI CRM & Sales Automation',
  description: 'AI-native, automation-first CRM',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
