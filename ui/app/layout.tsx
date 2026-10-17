import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
const geist = localFont({ src: '../fonts/Geist-Latin.woff2', variable: '--font-geist', display: 'swap', weight: '100 900' });
export const metadata: Metadata = { title: 'Living World', description: 'AI-operated persistent world' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html className="dark" lang="en"><body className={geist.variable}>{children}</body></html>; }
