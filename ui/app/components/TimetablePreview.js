'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const subjectsPool = [
  'Data Structures', 'Operating Systems', 'DBMS', 'Computer Networks',
  'Artificial Intelligence', 'Machine Learning', 'Web Development', 'Cloud Computing',
  'Cyber Seccurity', 'Blockchain', 'IoT', 'Software Engineering',
  'Graph Theory', 'Linear Algebra', 'Discrete Math', 'Statistics'
];

const initialGrid = [
  ['Mon', 'ML', 'CS', 'Break', 'CN', 'OS'],
  ['Tue', 'AI', 'DBMS', 'Break', 'DS', 'SE'],
  ['Wed', 'Web', 'Cloud', 'Break', 'IoT', 'Math'],
  ['Thu', 'OS', 'CN', 'Break', 'ML', 'AI'],
  ['Fri', 'SE', 'DS', 'Break', 'DBMS', 'Web']
];

export default function TimetablePreview() {
  const [grid, setGrid] = useState(initialGrid);

  useEffect(() => {
    const interval = setInterval(() => {
      setGrid(prevGrid => {
        const newGrid = prevGrid.map(row => [...row]);
        // Randomly swap 2-3 subjects in random rows
        const numSwaps = Math.floor(Math.random() * 2) + 2;
        
        for (let i = 0; i < numSwaps; i++) {
          const rowIdx = Math.floor(Math.random() * 5);
          // Columns 1, 2, 4, 5 are subjects (0 is Day, 3 is Break)
          const colIdx = [1, 2, 4, 5][Math.floor(Math.random() * 4)];
          const randomSubject = subjectsPool[Math.floor(Math.random() * subjectsPool.length)];
          newGrid[rowIdx][colIdx] = randomSubject;
        }
        return newGrid;
      });
    }, 5500); // Shuffle every 5.5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full max-w-2xl mx-auto perspective-1000">
      <motion.div
        initial={{ rotateX: 10, rotateY: -10, opacity: 0 }}
        animate={{ rotateX: 5, rotateY: -5, opacity: 1 }}
        transition={{ duration: 1 }}
        className="w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-400/80"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-400/80"></div>
            <div className="w-3 h-3 rounded-full bg-green-400/80"></div>
          </div>
          <div className="text-xs font-mono text-indigo-200/80">DEMO TIMETABLE</div>
        </div>

        {/* Grid */}
        <div className="p-6 grid grid-cols-6 gap-3">
          {/* Headers */}
          {['Day', '09:00', '10:00', '11:00', '11:30', '12:30'].map((h, i) => (
            <div key={i} className="text-xs font-semibold text-indigo-200/60 uppercase tracking-wider text-center pb-2">
              {h}
            </div>
          ))}

          {/* Rows */}
          {grid.map((row, rowIndex) => (
            row.map((cell, colIndex) => (
              <motion.div
                key={`${rowIndex}-${colIndex}`}
                layout
                className={`
                  relative h-12 rounded-lg flex items-center justify-center text-xs font-medium border border-white/5
                  ${colIndex === 0 ? 'bg-indigo-900/40 text-indigo-200 font-bold' : ''}
                  ${colIndex === 3 ? 'bg-gray-800/20 text-gray-400' : ''}
                  ${colIndex !== 0 && colIndex !== 3 ? 'bg-indigo-500/10 text-white shadow-inner' : ''}
                `}
              >
                <AnimatePresence mode='popLayout'>
                  <motion.span
                    key={cell}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.3 }}
                    className="truncate px-1"
                  >
                    {cell}
                  </motion.span>
                </AnimatePresence>
                
                {colIndex !== 0 && colIndex !== 3 && (
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none rounded-lg" />
                )}
              </motion.div>
            ))
          ))}
        </div>
        
        {/* Status Bar */}
        <div className="px-6 py-3 bg-indigo-950/30 border-t border-white/10 flex justify-between items-center text-[10px] text-indigo-300">
           <div className="flex items-center space-x-2">
             <span className="relative flex h-2 w-2">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
             </span>
             <span>Powering up Agents...</span>
           </div>
           <div className="font-mono">v1.0.1-stable</div>
        </div>
      </motion.div>
      
      {/* Decorative blurred blobs behind */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/30 rounded-full blur-3xl -z-10 animate-pulse"></div>
      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-indigo-500/30 rounded-full blur-3xl -z-10 animate-pulse delay-700"></div>
    </div>
  );
}
