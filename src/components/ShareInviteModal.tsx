import React, { useState } from 'react';
import {
  X,
  Mail,
  Copy,
  Check,
  Share2,
  Users,
  Shield,
  Send,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import { Collaborator } from '../types';

interface ShareInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  collaborators?: Collaborator[];
  tripTitle?: string;
}

export const ShareInviteModal: React.FC<ShareInviteModalProps> = ({
  isOpen,
  onClose,
  collaborators = [],
  tripTitle = 'Japan Autumn Odyssey 2026',
}) => {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [inviteSentToast, setInviteSentToast] = useState<string | null>(null);
  const [permission, setPermission] = useState<'edit' | 'view'>('edit');

  if (!isOpen) return null;

  const shareUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/join-trip?ref=safar-invite&p=${permission}`
    : 'https://safar-app.com/join-trip';

  const inviteSubject = `Join our Japan Trip: ${tripTitle} on Safar OS`;
  const inviteBody = `Assalamu alaikum / Hello!

I'd love to invite you to collaborate on our Japan travel itinerary: "${tripTitle}" using Safar OS.

Click the link below to view the daily schedule, prayer breaks, and suggest activities:
${shareUrl}

Looking forward to traveling together!`;

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleOpenGmail = () => {
    const toParam = recipientEmail.trim() ? encodeURIComponent(recipientEmail.trim()) : '';
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${toParam}&su=${encodeURIComponent(
      inviteSubject
    )}&body=${encodeURIComponent(inviteBody)}`;

    // Open Gmail web client in a new tab
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');

    setInviteSentToast('Opening Gmail with your invitation ready to send!');
    setTimeout(() => setInviteSentToast(null), 3500);
  };

  const handleSendMailto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail.trim()) {
      handleOpenGmail();
      return;
    }

    const mailtoUrl = `mailto:${encodeURIComponent(
      recipientEmail.trim()
    )}?subject=${encodeURIComponent(inviteSubject)}&body=${encodeURIComponent(inviteBody)}`;
    window.location.href = mailtoUrl;

    setInviteSentToast(`Invite prepared for ${recipientEmail.trim()}!`);
    setTimeout(() => setInviteSentToast(null), 3500);
  };

  const handleWhatsAppShare = () => {
    const waText = encodeURIComponent(
      `Join our Japan Trip "${tripTitle}" on Safar OS! Plan activities, halal dining & prayer times together: ${shareUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${waText}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-[#E7DFD5] overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E7DFD5] flex items-center justify-between bg-[#FAF8F5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0D6955]/10 text-[#0D6955] flex items-center justify-center font-bold shadow-xs">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#161C23]">
                Invite Tripmates to Safar
              </h3>
              <p className="text-xs text-[#526360]">
                Share your itinerary and plan together in real-time
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-200/70 text-[#8A9592] hover:text-[#161C23] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 font-sans">
          {/* Permission selector */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5]">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#0D6955]" />
              <span className="text-xs font-bold text-[#161C23]">Access Level:</span>
            </div>
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#E7DFD5]">
              <button
                type="button"
                onClick={() => setPermission('edit')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  permission === 'edit'
                    ? 'bg-[#0D6955] text-white shadow-xs'
                    : 'text-[#526360] hover:text-[#161C23]'
                }`}
              >
                Can Suggest &amp; Edit
              </button>
              <button
                type="button"
                onClick={() => setPermission('view')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  permission === 'view'
                    ? 'bg-[#0D6955] text-white shadow-xs'
                    : 'text-[#526360] hover:text-[#161C23]'
                }`}
              >
                View Only
              </button>
            </div>
          </div>

          {/* 1. Invite Through Gmail Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-[#161C23] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Invite Through Gmail
              </label>
              <span className="text-[11px] text-[#8A9592]">Quick email dispatch</span>
            </div>

            <form onSubmit={handleSendMailto} className="space-y-2">
              <div className="relative">
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="Enter tripmate's email (e.g. tariq@gmail.com)"
                  className="w-full h-11 pl-10 pr-24 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-[#161C23] placeholder:text-[#8A9592] focus:outline-none focus:bg-white focus:border-[#0D6955] transition-all"
                />
                <Mail className="w-4 h-4 text-[#8A9592] absolute left-3.5 top-3.5" />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1.5 bottom-1.5 px-3 rounded-xl bg-[#0D6955] hover:bg-[#095040] text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                >
                  <Send className="w-3 h-3" />
                  <span>Send</span>
                </button>
              </div>

              {/* Direct "Open in Gmail" Action Button with Gmail Branding */}
              <button
                type="button"
                onClick={handleOpenGmail}
                className="w-full h-11 rounded-2xl border-2 border-red-500/20 bg-red-50/60 hover:bg-red-50 hover:border-red-500/40 text-red-700 text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs group"
              >
                <div className="w-5 h-5 rounded-md bg-white border border-red-200 flex items-center justify-center text-xs shadow-xs group-hover:scale-110 transition-transform">
                  ✉️
                </div>
                <span>Invite Directly via Gmail Web App</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70 ml-0.5" />
              </button>
            </form>
          </div>

          {/* 2. Copy Link Section */}
          <div className="space-y-2 pt-2 border-t border-[#F3EFEA]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-[#161C23] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#0D6955]" />
                Or Share Direct Link
              </label>
              <span className="text-[11px] text-[#8A9592]">Anyone with link</span>
            </div>

            <div className="flex items-center gap-2 p-1.5 pl-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5]">
              <span className="text-xs font-mono text-[#526360] truncate flex-1 select-all">
                {shareUrl}
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className={`px-4 py-2.5 rounded-xl text-xs font-black shrink-0 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#161C23] hover:bg-black text-white'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied! ✓' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          {/* 3. Fast Messaging Quick-Share (WhatsApp) */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="flex-1 py-2 px-3 rounded-xl border border-[#E7DFD5] hover:bg-emerald-50 hover:border-emerald-300 text-emerald-800 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <span>Share to WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex-1 py-2 px-3 rounded-xl border border-[#E7DFD5] hover:bg-[#FAF8F5] text-[#526360] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Itinerary URL</span>
            </button>
          </div>

          {/* 4. Active Collaborators on This Trip */}
          {collaborators.length > 0 && (
            <div className="pt-3 border-t border-[#F3EFEA]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#8A9592] uppercase tracking-wider flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> Current Tripmates ({collaborators.length})
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                  Live Sync Active
                </span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto py-1">
                {collaborators.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] shrink-0"
                  >
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                    <span className="text-xs font-bold text-[#161C23]">{c.name}</span>
                    {c.isLead && (
                      <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-black">
                        Lead
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toast feedback */}
          {inviteSentToast && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold text-center animate-in fade-in">
              {inviteSentToast}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#E7DFD5] bg-[#FAF8F5] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#161C23] hover:bg-black text-white text-xs font-black transition-colors cursor-pointer shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareInviteModal;
