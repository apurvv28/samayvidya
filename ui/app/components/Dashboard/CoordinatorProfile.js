'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  User,
  Clock,
  Save,
  Loader2,
  CheckCircle2,
  Building2,
  Shield,
  Mail,
  KeyRound,
  ArrowRight,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import PasswordReset from './PasswordReset';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

function authHeaders(json = false) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') || '' : '';
  const h = { Authorization: `Bearer ${token}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export default function CoordinatorProfile() {
  const { showToast } = useToast();
  const { profile, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState(null);
  const [departmentName, setDepartmentName] = useState('');
  const [formData, setFormData] = useState({ name: '', phone: '' });

  const [transferStep, setTransferStep] = useState(1);
  const [oldOtp, setOldOtp] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCoordinatorOtp, setNewCoordinatorOtp] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/auth/me`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load profile');
      const row = data.data || {};
      setMe(row);
      setFormData({
        name: row.name || '',
        phone: row.phone || '',
      });
      const deptId = row.department_id;
      if (deptId) {
        const dRes = await fetch(`${API_BASE_URL}/departments`, { headers: authHeaders() });
        const dJson = await dRes.json();
        if (dRes.ok) {
          const d = (dJson.data || []).find((x) => x.department_id === deptId);
          setDepartmentName(d?.department_name || deptId);
        }
      } else {
        setDepartmentName('');
      }
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Failed to load profile', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const handleAccountSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me/profile`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Update failed');
      showToast('Profile updated', 'success');
      await loadMe();
    } catch (err) {
      showToast(err.message || 'Failed to update', 'error');
    } finally {
      setSaving(false);
    }
  };

  const requestOldOtp = async () => {
    setTransferBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/coordinator-transfer/request-old-otp`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Request failed');
      showToast(data.message || 'OTP sent', 'success');
      setTransferStep(2);
    } catch (e) {
      showToast(e.message || 'Failed to send OTP', 'error');
    } finally {
      setTransferBusy(false);
    }
  };

  const verifyOldOtp = async () => {
    setTransferBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/coordinator-transfer/verify-old-otp`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ otp: oldOtp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Verification failed');
      showToast(data.message || 'Verified', 'success');
      setTransferStep(3);
    } catch (e) {
      showToast(e.message || 'Invalid OTP', 'error');
    } finally {
      setTransferBusy(false);
    }
  };

  const sendNewCoordinatorOtp = async () => {
    setTransferBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/coordinator-transfer/send-new-coordinator-otp`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          new_name: newName.trim(),
          new_email: newEmail.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to send');
      showToast(data.message || 'OTP sent to new coordinator', 'success');
      setTransferStep(4);
    } catch (e) {
      showToast(e.message || 'Failed', 'error');
    } finally {
      setTransferBusy(false);
    }
  };

  const completeTransfer = async () => {
    setTransferBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/coordinator-transfer/complete`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ new_coordinator_otp: newCoordinatorOtp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Transfer failed');
      showToast(data.message || 'Transfer complete', 'success');
      signOut();
      window.location.href = '/';
    } catch (e) {
      showToast(e.message || 'Transfer failed', 'error');
    } finally {
      setTransferBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-teal-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  const displayName = me?.name || me?.email || 'Coordinator';
  const isCoordinatorOnly = profile?.role === 'COORDINATOR';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gradient-to-r from-teal-50 to-indigo-50 border-2 border-teal-200 rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-teal-100 rounded-xl flex items-center justify-center border border-teal-200">
            <User className="w-8 h-8 text-teal-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{displayName}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                {me?.email}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs">
                {me?.role || profile?.role}
              </span>
              {departmentName ? (
                <span className="flex items-center gap-1 text-gray-700">
                  <Building2 className="w-3.5 h-3.5" />
                  {departmentName}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border-2 border-gray-100 rounded-2xl p-8">
        <div className="mb-6 flex items-center gap-3">
          <Clock className="w-6 h-6 text-teal-600" />
          <div>
            <h3 className="text-xl font-bold text-gray-900">Account details</h3>
            <p className="text-gray-600 text-sm">
              Same as faculty/HOD profile: keep your name and phone up to date.
            </p>
          </div>
        </div>
        <form onSubmit={handleAccountSave} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Full name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              className="mt-1 w-full border-2 border-gray-300 rounded-lg py-3 px-4 focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Phone</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
              className="mt-1 w-full border-2 border-gray-300 rounded-lg py-3 px-4 focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Save details
          </button>
        </form>
      </div>

      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex gap-3">
        <Clock className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
        <div className="text-sm text-teal-800">
          <p className="font-semibold mb-1">Coordinator role</p>
          <p className="text-teal-700">
            You manage semester data, divisions, faculty load, resources, and timetables for your department.
            Use password management below to change or reset your password.
          </p>
        </div>
      </div>

      <div className="bg-white border-2 border-gray-100 rounded-2xl p-8">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Password management</h3>
        <p className="text-gray-600 text-sm mb-4">
          Change your password or reset it if you&apos;ve forgotten it (same as faculty / HOD).
        </p>
        <PasswordReset userEmail={me?.email} />
      </div>

      {isCoordinatorOnly ? (
        <div className="bg-white border-2 border-amber-200 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-7 h-7 text-amber-600" />
            <h3 className="text-xl font-bold text-gray-900">Transfer department ownership</h3>
          </div>
          <p className="text-gray-600 text-sm mb-6">
            Hand off timetable coordinator access to someone else in a secure, two-step email OTP flow. After
            completion, your account is removed and the new coordinator receives an email with an 8-digit login
            password.
          </p>

          <div className="flex flex-wrap gap-2 mb-6 text-xs">
            {[1, 2, 3, 4].map((s) => (
              <span
                key={s}
                className={`px-3 py-1 rounded-full border ${
                  transferStep === s
                    ? 'bg-amber-100 border-amber-400 text-amber-900'
                    : 'bg-gray-50 border-gray-200 text-gray-600'
                }`}
              >
                Step {s}
              </span>
            ))}
          </div>

          {transferStep === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                We will send a 6-digit OTP to <strong>{me?.email}</strong> to confirm it is you.
              </p>
              <button
                type="button"
                onClick={requestOldOtp}
                disabled={transferBusy}
                className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-4 rounded-lg disabled:opacity-50"
              >
                {transferBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Send OTP to my email
              </button>
            </div>
          )}

          {transferStep === 2 && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">OTP from your email</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={oldOtp}
                onChange={(e) => setOldOtp(e.target.value)}
                className="w-full max-w-xs border-2 border-gray-300 rounded-lg py-3 px-4 tracking-widest"
                placeholder="000000"
              />
              <button
                type="button"
                onClick={verifyOldOtp}
                disabled={transferBusy || oldOtp.length < 4}
                className="inline-flex items-center gap-2 bg-gray-900 text-white font-semibold py-2.5 px-4 rounded-lg disabled:opacity-50"
              >
                {transferBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Verify &amp; continue
              </button>
            </div>
          )}

          {transferStep === 3 && (
            <div className="space-y-4 max-w-md">
              <p className="text-sm text-gray-700">
                Enter the new coordinator&apos;s details. We will email them an OTP; they share it with you so you
                can complete the transfer.
              </p>
              <div>
                <label className="text-sm font-medium text-gray-700">New coordinator full name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full border-2 border-gray-300 rounded-lg py-2.5 px-3"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">New coordinator email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="mt-1 w-full border-2 border-gray-300 rounded-lg py-2.5 px-3"
                />
              </div>
              <button
                type="button"
                onClick={sendNewCoordinatorOtp}
                disabled={transferBusy || !newName.trim() || !newEmail.trim()}
                className="inline-flex items-center gap-2 bg-gray-900 text-white font-semibold py-2.5 px-4 rounded-lg disabled:opacity-50"
              >
                {transferBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Send OTP to new coordinator
              </button>
            </div>
          )}

          {transferStep === 4 && (
            <div className="space-y-4 max-w-md">
              <p className="text-sm text-gray-700">
                Ask the new coordinator for the OTP from their email, then enter it here to finish. They will
                receive their login password by email immediately after.
              </p>
              <input
                type="text"
                inputMode="numeric"
                value={newCoordinatorOtp}
                onChange={(e) => setNewCoordinatorOtp(e.target.value)}
                className="w-full border-2 border-gray-300 rounded-lg py-3 px-4 tracking-widest"
                placeholder="OTP from new coordinator"
              />
              <button
                type="button"
                onClick={completeTransfer}
                disabled={transferBusy || newCoordinatorOtp.length < 4}
                className="inline-flex items-center gap-2 bg-red-700 hover:bg-red-800 text-white font-semibold py-2.5 px-4 rounded-lg disabled:opacity-50"
              >
                {transferBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                Complete transfer &amp; sign out
              </button>
            </div>
          )}

          {transferStep > 1 && (
            <button
              type="button"
              className="mt-6 text-sm text-gray-500 underline"
              onClick={() => {
                setTransferStep(1);
                setOldOtp('');
                setNewName('');
                setNewEmail('');
                setNewCoordinatorOtp('');
              }}
            >
              Cancel and restart
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
