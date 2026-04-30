'use client';

import { useState } from 'react';
import { Lock, Mail, Key, Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function PasswordReset({ userEmail }) {
  const { showToast } = useToast();
  
  // Tab state
  const [activeTab, setActiveTab] = useState('change'); // 'change' or 'reset'
  
  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Reset password state
  const [resetEmail, setResetEmail] = useState(userEmail || '');
  const [otp, setOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      showToast('New password and confirmation do not match', 'error');
      return;
    }
    
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters long', 'error');
      return;
    }
    
    try {
      setChangingPassword(true);
      const token = localStorage.getItem('authToken') || '';
      
      const response = await fetch(`${API_BASE_URL}/password/change`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || 'Failed to change password');
      }
      
      showToast('Password changed successfully!', 'success');
      
      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
    } catch (error) {
      console.error('Change password error:', error);
      showToast(error.message || 'Failed to change password', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleRequestOTP = async () => {
    if (!resetEmail) {
      showToast('Please enter your email', 'error');
      return;
    }
    
    try {
      setSendingOtp(true);
      
      const response = await fetch(`${API_BASE_URL}/password/request-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: resetEmail,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || 'Failed to send OTP');
      }
      
      showToast('OTP sent to your email. Valid for 10 minutes.', 'success');
      setOtpSent(true);
      setOtpTimer(600); // 10 minutes in seconds
      
      // Start countdown
      const interval = setInterval(() => {
        setOtpTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
    } catch (error) {
      console.error('Request OTP error:', error);
      showToast(error.message || 'Failed to send OTP', 'error');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (!otp) {
      showToast('Please enter the OTP', 'error');
      return;
    }
    
    if (resetNewPassword !== resetConfirmPassword) {
      showToast('New password and confirmation do not match', 'error');
      return;
    }
    
    if (resetNewPassword.length < 6) {
      showToast('Password must be at least 6 characters long', 'error');
      return;
    }
    
    try {
      setResettingPassword(true);
      
      const response = await fetch(`${API_BASE_URL}/password/reset-with-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: resetEmail,
          otp: otp,
          new_password: resetNewPassword,
          confirm_password: resetConfirmPassword,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || 'Failed to reset password');
      }
      
      showToast('Password reset successfully! You can now login with your new password.', 'success');
      
      // Clear form
      setOtp('');
      setResetNewPassword('');
      setResetConfirmPassword('');
      setOtpSent(false);
      setOtpTimer(0);
      
    } catch (error) {
      console.error('Reset password error:', error);
      showToast(error.message || 'Failed to reset password', 'error');
    } finally {
      setResettingPassword(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Tab Selector */}
      <div className="flex gap-2 p-1 bg-gray-900/50 rounded-lg border border-white/10">
        <button
          onClick={() => setActiveTab('change')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            activeTab === 'change'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <Lock className="w-4 h-4 inline mr-2" />
          Change Password
        </button>
        <button
          onClick={() => setActiveTab('reset')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            activeTab === 'reset'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <Key className="w-4 h-4 inline mr-2" />
          Reset Password
        </button>
      </div>

      {/* Change Password Tab */}
      {activeTab === 'change' && (
        <div className="bg-gray-900/50 border border-white/10 rounded-xl p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">Change Password</h3>
            <p className="text-sm text-gray-400">
              Enter your current password and choose a new password
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            {/* Current Password */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 pr-10 bg-gray-800 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2 pr-10 bg-gray-800 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  placeholder="Enter new password (min 6 characters)"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2 pr-10 bg-gray-800 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  placeholder="Confirm new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Password Match Indicator */}
            {newPassword && confirmPassword && (
              <div className={`flex items-center gap-2 text-sm ${
                newPassword === confirmPassword ? 'text-green-400' : 'text-red-400'
              }`}>
                {newPassword === confirmPassword ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Passwords match
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    Passwords do not match
                  </>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
              className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {changingPassword ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Changing Password...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Change Password
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Reset Password Tab */}
      {activeTab === 'reset' && (
        <div className="bg-gray-900/50 border border-white/10 rounded-xl p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">Reset Password</h3>
            <p className="text-sm text-gray-400">
              Forgot your password? We'll send you an OTP to reset it
            </p>
          </div>

          {!otpSent ? (
            /* Step 1: Request OTP */
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-gray-800 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                  placeholder="Enter your email"
                />
              </div>

              <button
                onClick={handleRequestOTP}
                disabled={sendingOtp || !resetEmail}
                className="w-full px-4 py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {sendingOtp ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending OTP...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Send OTP
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Step 2: Enter OTP and New Password */
            <form onSubmit={handleResetPassword} className="space-y-4">
              {/* OTP Timer */}
              {otpTimer > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-center">
                  <p className="text-sm text-blue-300">
                    OTP expires in: <span className="font-bold">{formatTime(otpTimer)}</span>
                  </p>
                </div>
              )}

              {/* OTP Input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Enter OTP
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  maxLength={6}
                  className="w-full px-4 py-2 bg-gray-800 border border-white/10 rounded-lg text-white text-center text-2xl tracking-widest placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                  placeholder="000000"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Check your email for the 6-digit OTP
                </p>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showResetNewPassword ? 'text' : 'password'}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-2 pr-10 bg-gray-800 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    placeholder="Enter new password (min 6 characters)"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetNewPassword(!showResetNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  >
                    {showResetNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showResetConfirmPassword ? 'text' : 'password'}
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-2 pr-10 bg-gray-800 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetConfirmPassword(!showResetConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  >
                    {showResetConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password Match Indicator */}
              {resetNewPassword && resetConfirmPassword && (
                <div className={`flex items-center gap-2 text-sm ${
                  resetNewPassword === resetConfirmPassword ? 'text-green-400' : 'text-red-400'
                }`}>
                  {resetNewPassword === resetConfirmPassword ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Passwords match
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      Passwords do not match
                    </>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={resettingPassword || !otp || !resetNewPassword || !resetConfirmPassword || resetNewPassword !== resetConfirmPassword}
                className="w-full px-4 py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {resettingPassword ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Resetting Password...
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    Reset Password
                  </>
                )}
              </button>

              {/* Resend OTP */}
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtp('');
                  setResetNewPassword('');
                  setResetConfirmPassword('');
                }}
                className="w-full text-sm text-gray-400 hover:text-gray-300 transition-colors"
              >
                Didn't receive OTP? Send again
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
