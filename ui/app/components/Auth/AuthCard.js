'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import LoginForm from './LoginForm';

export default function AuthCard() {
  const [isFlipped] = useState(false);

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
           <LoginForm />
        </div>
      </motion.div>
    </div>
  );
}
