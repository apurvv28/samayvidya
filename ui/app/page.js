// app/page.js
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import Trust from './components/Trust';
import ScrollingMarquee from './components/ScrollingMarquee';
import CTA from './components/CTA';
import Footer from './components/Footer';

export default function Home() {
  return (
    <div className="min-h-screen bg-white relative">
      {/* Global background pattern - consistent across all sections */}
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808020_1px,transparent_1px),linear-gradient(to_bottom,#80808020_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      
      <div className="relative z-[1]">
        <Navbar />
        <main>
          <Hero />
          <Features />
          <HowItWorks />
          <Trust />
          <ScrollingMarquee />
          <CTA />
        </main>
        <Footer />
      </div>
    </div>
  );
}
