import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Peace.Zone RPS',
  description: 'Provably-fair RPS tournament for Bluesky users',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
