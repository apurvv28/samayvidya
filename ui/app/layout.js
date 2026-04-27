// app/layout.js
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'SamayVidya | Agentic Academic Timetable Management',
  description: 'Research-grade agentic framework for dynamic academic timetabling in Indian education institutions',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.className} antialiased`}>
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}