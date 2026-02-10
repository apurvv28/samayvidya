'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';

export default function AuthCard() {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="relative w-full h-[720px]" style={{ perspective: '1000px' }}>
      <motion.div
        className="relative w-full h-full"
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Front Face - Login */}
        <div style={{ backfaceVisibility: 'hidden', position: 'absolute', width: '100%', height: '90%', marginTop: '30px' }}>
           <LoginForm onFlip={() => setIsFlipped(true)} />
        </div>

        {/* Back Face - Signup */}
        <div 
            style={{ 
                backfaceVisibility: 'hidden', 
                position: 'absolute', 
                width: '100%', 
                height: '90%',
                marginTop: '30px',
                transform: 'rotateY(180deg)' 
            }}
        >
           <SignupForm onFlip={() => setIsFlipped(false)} />
        </div>
      </motion.div>
    </div>
  );
}
