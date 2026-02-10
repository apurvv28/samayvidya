import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { BackgroundBeams } from '../components/ui/BackgroundBeams';
import AuthCard from '../components/Auth/AuthCard';

export default function AuthPage() {
  return (
    <div className="min-h-screen w-full bg-gray-900 relative flex flex-col items-center justify-center p-4 overflow-hidden">
      <Link 
        href="/" 
        className="absolute top-8 left-8 z-20 flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
      >
        <div className="p-2 rounded-full bg-white/5 group-hover:bg-white/10 ring-1 ring-white/10 transition-all">
            <ChevronLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
        </div>
        <span className="font-medium">Back to Home</span>
      </Link>

      <BackgroundBeams />
      
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/20 blur-[100px] rounded-full pointer-events-none" />

      <div className="z-10 w-full max-w-md relative">
         <AuthCard />
      </div>
    </div>
  );
}
