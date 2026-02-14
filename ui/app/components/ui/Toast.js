import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { useEffect } from 'react';

const toastTypes = {
  success: {
    icon: CheckCircle,
    className: 'bg-green-50 text-green-800 border-green-200',
    iconClass: 'text-green-500'
  },
  error: {
    icon: AlertCircle,
    className: 'bg-red-50 text-red-800 border-red-200',
    iconClass: 'text-red-500'
  },
  info: {
    icon: Info,
    className: 'bg-blue-50 text-blue-800 border-blue-200',
    iconClass: 'text-blue-500'
  }
};

const Toast = ({ message, type = 'info', onClose, duration = 3000 }) => {
  const { icon: Icon, className, iconClass } = toastTypes[type] || toastTypes.info;

  useEffect(() => {
    if (duration) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      layout
      className={`flex items-center w-full max-w-sm p-4 rounded-lg shadow-lg border ${className} mb-3`}
      role="alert"
    >
      <div className={`flex-shrink-0 ${iconClass}`}>
        <Icon size={20} />
      </div>
      <div className="ml-3 text-sm font-medium flex-1">
        {message}
      </div>
      <button
        onClick={onClose}
        className="ml-auto -mx-1.5 -my-1.5 rounded-lg focus:ring-2 p-1.5 inline-flex h-8 w-8 hover:bg-black/5 transition-colors"
        aria-label="Close"
      >
        <span className="sr-only">Close</span>
        <X size={16} />
      </button>
    </motion.div>
  );
};

export default Toast;
