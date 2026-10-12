import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Living World', description: 'AI-operated persistent world' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html className="dark" lang="en"><body>{children}</body></html>; }
