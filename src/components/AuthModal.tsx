import React, { useState } from 'react';
import { Collaborator } from '../types';
import { X, Check, ShieldCheck, UserCheck, LogOut, Sparkles } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: Collaborator;
  collaborators: Collaborator[];
  onSelectUser: (user: Collaborator) => void;
  onCustomLogin: (name: string, email: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  collaborators,
  onSelectUser,
  onCustomLogin,
}) => {
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');

  if (!isOpen) return null;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;
    onCustomLogin(
      customName.trim(),
      customEmail.trim() || `${customName.toLowerCase().replace(/\s+/g, '')}@gmail.com`
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[#E7DFD5] p-6 space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#E7DFD5]">
          <div className="flex items-center gap-2">
            {/* Google G Logo */}
            <div className="w-8 h-8 rounded-full bg-white shadow-xs border border-gray-200 flex items-center justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-base text-[#161C23]">Google Authentication</h3>
              <p className="text-[11px] text-[#6D7A77]">Sign in to collaborate on Safar OS</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#EEF4FE] flex items-center justify-center text-[#6D7A77] hover:text-[#161C23]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current logged in status */}
        <div className="bg-[#EEF4FE] p-3.5 rounded-2xl flex items-center gap-3 border border-[#E7DFD5]">
          <img
            src={currentUser.avatar}
            alt={currentUser.name}
            referrerPolicy="no-referrer"
            className="w-11 h-11 rounded-full object-cover ring-2 ring-[#00685F]"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-[#161C23] truncate">{currentUser.name}</span>
              <span className="text-[10px] font-bold bg-[#00685F] text-white px-2 py-0.5 rounded-full">
                Active
              </span>
            </div>
            <p className="text-xs text-[#6D7A77] truncate">
              {currentUser.role} · {currentUser.name.toLowerCase().replace(/\s+/g, '')}@gmail.com
            </p>
          </div>
        </div>

        {/* Quick Family Account Switcher */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#6D7A77] uppercase tracking-wider block">
            Switch Family Profile
          </label>
          <div className="space-y-1.5">
            {collaborators.map((user) => (
              <button
                key={user.id}
                onClick={() => {
                  onSelectUser(user);
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all border ${
                  user.id === currentUser.id
                    ? 'bg-[#00685F]/10 border-[#00685F] text-[#00685F] font-bold shadow-xs'
                    : 'bg-white hover:bg-gray-50 border-[#E7DFD5] text-[#161C23]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src={user.avatar}
                    alt={user.name}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <div className="text-left">
                    <p className="text-xs font-bold">{user.name}</p>
                    <p className="text-[11px] text-[#6D7A77]">{user.role}</p>
                  </div>
                </div>
                {user.id === currentUser.id ? (
                  <Check className="w-4 h-4 text-[#00685F]" />
                ) : (
                  <span className="text-[11px] text-[#00685F] font-semibold">Switch</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Login Form */}
        <form onSubmit={handleCustomSubmit} className="pt-2 border-t border-[#E7DFD5] space-y-2.5">
          <label className="text-xs font-bold text-[#6D7A77] uppercase tracking-wider block">
            Or Sign in with another Google account
          </label>
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Enter your name (e.g. Zayd)"
            className="w-full h-10 px-3 rounded-xl bg-[#EEF4FE] text-xs font-medium text-[#161C23] border border-[#E7DFD5] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30"
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Connect &amp; Sync</span>
          </button>
        </form>

        <div className="flex items-center gap-1.5 text-[11px] text-[#6D7A77] justify-center">
          <ShieldCheck className="w-3.5 h-3.5 text-[#00685F]" />
          <span>Real-time multiplayer state synced across tabs</span>
        </div>
      </div>
    </div>
  );
};
