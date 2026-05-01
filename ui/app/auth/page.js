import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import AuthCard from '../components/Auth/AuthCard';

export default function AuthPage() {
  return (
    <div className="min-h-screen w-full bg-white relative flex flex-col items-center justify-center p-4 overflow-hidden">
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808014_1px,transparent_1px),linear-gradient(to_bottom,#80808014_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <Link 
        href="/" 
        className="absolute top-8 left-8 z-20 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors group"
      >
        <div className="p-2 rounded-full bg-white group-hover:bg-gray-50 ring-1 ring-gray-200 transition-all">
            <ChevronLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
        </div>
        <span className="font-medium">Back to Home</span>
      </Link>

      <div className="z-10 w-full max-w-5xl relative grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
         <div className="hidden lg:block space-y-4">
           <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold">
             Academic Access Portal
           </span>
           <h1 className="text-4xl font-normal text-gray-900 leading-tight" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
             Secure sign in for timetable automation
           </h1>
           <p className="text-gray-600 max-w-md">
             Access your role-based workspace with a modern interface consistent across the platform.
           </p>
         </div>
         <AuthCard />
      </div>
    </div>
  );
}
