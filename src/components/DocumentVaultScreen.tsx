import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Info,
  Calendar,
  Plane,
  Building2,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Clock,
  Download,
  Check,
  X,
  Globe2,
  AlertCircle,
  FileCheck,
  ChevronDown,
  Eye,
  BellRing,
  HelpCircle,
} from 'lucide-react';
import { TravelDocument, DocumentCategory, DocumentVerificationReport } from '../types';
import { SAMPLE_DOCUMENTS, MOCK_VERIFICATION_REPORT } from '../data/documentVaultData';

interface DocumentVaultScreenProps {
  onNavigateToCanvas: (focusDateConflict?: boolean) => void;
  onNavigateHome: () => void;
}

type VerificationState = 'idle' | 'verifying' | 'completed';

export const DocumentVaultScreen: React.FC<DocumentVaultScreenProps> = ({
  onNavigateToCanvas,
  onNavigateHome,
}) => {
  // Uploaded documents state (Passport, Flights, Hotels)
  const [documents, setDocuments] = useState<Record<DocumentCategory, TravelDocument | null>>({
    passport: SAMPLE_DOCUMENTS.passport,
    flights: SAMPLE_DOCUMENTS.flights,
    hotels: SAMPLE_DOCUMENTS.hotels,
  });

  // Verification state & AI loading stages
  const [verificationState, setVerificationState] = useState<VerificationState>('idle');
  const [loadingStageText, setLoadingStageText] = useState<string>('Extracting dates...');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [report, setReport] = useState<DocumentVerificationReport | null>(null);

  // Form controls inspired by the reference mock
  const [nationality, setNationality] = useState('United States (US)');
  const [destination, setDestination] = useState('Japan (JP)');
  const [purpose, setPurpose] = useState('Tourism & Leisure');

  // Interactive modal for viewing dummy doc details
  const [previewDoc, setPreviewDoc] = useState<TravelDocument | null>(null);
  const [showReminderToast, setShowReminderToast] = useState(false);
  const [hotelExtended, setHotelExtended] = useState(false);

  // File input refs for each category
  const passportInputRef = useRef<HTMLInputElement>(null);
  const flightsInputRef = useRef<HTMLInputElement>(null);
  const hotelsInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop states
  const [dragActiveCategory, setDragActiveCategory] = useState<DocumentCategory | null>(null);

  // Handle custom dummy file upload
  const handleFileUpload = (category: DocumentCategory, file: File) => {
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const sizeFormatted =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

    const newDoc: TravelDocument = {
      id: `doc-${category}-${Date.now()}`,
      category,
      fileName: file.name,
      fileSize: sizeFormatted,
      fileType: isPdf ? 'pdf' : 'image',
      uploadedAt: 'Uploaded just now',
      extractedDetails: SAMPLE_DOCUMENTS[category].extractedDetails,
    };

    setDocuments((prev) => ({
      ...prev,
      [category]: newDoc,
    }));
  };

  const handleInputChange = (category: DocumentCategory, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(category, e.target.files[0]);
    }
  };

  const handleRemoveDoc = (category: DocumentCategory) => {
    setDocuments((prev) => ({
      ...prev,
      [category]: null,
    }));
    if (verificationState === 'completed') {
      setVerificationState('idle');
      setReport(null);
    }
  };

  const handleLoadSample = (category: DocumentCategory) => {
    setDocuments((prev) => ({
      ...prev,
      [category]: SAMPLE_DOCUMENTS[category],
    }));
  };

  const handleLoadAllSamples = () => {
    setDocuments({
      passport: SAMPLE_DOCUMENTS.passport,
      flights: SAMPLE_DOCUMENTS.flights,
      hotels: SAMPLE_DOCUMENTS.hotels,
    });
  };

  // Simulated AI Logic: exactly 3 seconds with the 3 mandated sequential states:
  // "Extracting dates..." -> "Cross-referencing timelines..." -> "Verifying BRN..."
  const handleRunAiVerification = () => {
    setVerificationState('verifying');
    setLoadingProgress(15);
    setLoadingStageText('Extracting dates...');

    // Stage 1: Extracting dates... (0ms - 1000ms)
    setTimeout(() => {
      setLoadingProgress(45);
      setLoadingStageText('Cross-referencing timelines...');
    }, 1000);

    // Stage 2: Cross-referencing timelines... (1000ms - 2000ms)
    setTimeout(() => {
      setLoadingProgress(75);
      setLoadingStageText('Verifying BRN...');
    }, 2000);

    // Stage 3: Verifying BRN... & Complete at 3000ms
    setTimeout(() => {
      setLoadingProgress(100);
      setVerificationState('completed');
      setReport(MOCK_VERIFICATION_REPORT);
    }, 3000);
  };

  // Check if all 3 files are present
  const allDocsUploaded = Boolean(documents.passport && documents.flights && documents.hotels);

  // Quick action: Fix Itinerary (jump directly to Multiplayer Canvas)
  const handleFixItinerary = () => {
    onNavigateToCanvas(true);
  };

  return (
    <div className="w-full min-h-screen pt-20 pb-28 px-4 md:px-8 max-w-5xl mx-auto animate-in fade-in duration-300">
      {/* Top Header & Context Badges */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-2.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#00685F]/10 text-[#00685F] border border-[#00685F]/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Safar Smart Verification Engine</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#F5F1EA] text-[#6D7A77] border border-[#E7DFD5]">
            <Plane className="w-3.5 h-3.5 text-[#00685F]" />
            <span>Kyoto Autumn Journey</span>
          </span>
          <span className="text-[11px] font-bold text-[#D97706] bg-[#D97706]/10 px-2.5 py-0.5 rounded-full">
            Screen 2.5: Document Vault
          </span>
        </div>

        <h1 className="text-2xl md:text-3xl font-extrabold text-[#161C23] tracking-tight font-['Plus_Jakarta_Sans']">
          Check Visa &amp; Travel Requirements
        </h1>
        <p className="text-sm text-[#6D7A77] mt-1 max-w-2xl leading-relaxed">
          Upload your passport, flight e-tickets, and hotel vouchers. Our AI cross-references dates, validates your Booking Reference Numbers (BRN), and alerts you to itinerary gaps before you fly.
        </p>
      </div>

      {/* Global Entry Protocol Selectors (matches reference image) */}
      <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-[#E7DFD5] mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Nationality */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6D7A77] mb-1.5">
              Passport / Nationality
            </label>
            <div className="relative">
              <select
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                className="w-full bg-[#FBF9F5] border border-[#E7DFD5] rounded-2xl py-2.5 pl-3.5 pr-10 text-xs font-bold text-[#161C23] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30 appearance-none cursor-pointer"
              >
                <option value="United States (US)">🇺🇸 United States (US)</option>
                <option value="United Kingdom (UK)">🇬🇧 United Kingdom (UK)</option>
                <option value="Malaysia (MY)">🇲🇾 Malaysia (MY)</option>
                <option value="Singapore (SG)">🇸🇬 Singapore (SG)</option>
                <option value="Indonesia (ID)">🇮🇩 Indonesia (ID)</option>
                <option value="Canada (CA)">🇨🇦 Canada (CA)</option>
                <option value="United Arab Emirates (UAE)">🇦🇪 United Arab Emirates (UAE)</option>
              </select>
              <ChevronDown className="w-4 h-4 text-[#6D7A77] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Destination */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6D7A77] mb-1.5">
              Destination Country
            </label>
            <div className="relative">
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full bg-[#FBF9F5] border border-[#E7DFD5] rounded-2xl py-2.5 pl-3.5 pr-10 text-xs font-bold text-[#161C23] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30 appearance-none cursor-pointer"
              >
                <option value="Japan (JP)">🇯🇵 Japan (JP)</option>
                <option value="Saudi Arabia (KSA)">🇸🇦 Saudi Arabia (KSA - Umrah)</option>
                <option value="South Korea (KR)">🇰🇷 South Korea (KR)</option>
                <option value="Turkey (TR)">🇹🇷 Turkey (TR)</option>
              </select>
              <ChevronDown className="w-4 h-4 text-[#6D7A77] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Purpose of Visit */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6D7A77] mb-1.5">
              Purpose of Visit
            </label>
            <div className="relative">
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full bg-[#FBF9F5] border border-[#E7DFD5] rounded-2xl py-2.5 pl-3.5 pr-10 text-xs font-bold text-[#161C23] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30 appearance-none cursor-pointer"
              >
                <option value="Tourism & Leisure">🧳 Tourism &amp; Leisure</option>
                <option value="Religious Pilgrimage (Umrah)">🕋 Religious Pilgrimage (Umrah)</option>
                <option value="Family Visit">👨‍👩‍👧 Family Visit</option>
                <option value="Business & Conferences">💼 Business &amp; Conferences</option>
              </select>
              <ChevronDown className="w-4 h-4 text-[#6D7A77] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* THREE FILE INPUT FIELDS (Passport, Flights, Hotels) */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base md:text-lg font-bold text-[#161C23] flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#00685F]" />
              <span>Upload Travel Documents</span>
            </h2>
            <p className="text-xs text-[#6D7A77]">
              Provide dummy PDFs or photos to test date extraction and hotel-flight cross-referencing.
            </p>
          </div>

          <button
            type="button"
            onClick={handleLoadAllSamples}
            className="text-xs font-bold text-[#00685F] hover:text-[#008378] bg-[#00685F]/10 hover:bg-[#00685F]/15 px-3 py-1.5 rounded-full transition-colors border border-[#00685F]/20 cursor-pointer flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Load All 3 Sample Docs</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* FIELD 1: PASSPORT */}
          <div
            className={`bg-white rounded-3xl p-5 border transition-all relative flex flex-col justify-between ${
              dragActiveCategory === 'passport'
                ? 'border-[#00685F] ring-2 ring-[#00685F]/20 bg-[#EEF4FE]/50'
                : documents.passport
                ? 'border-[#00685F]/40 shadow-xs'
                : 'border-[#E7DFD5] border-dashed hover:border-[#6D7A77]'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActiveCategory('passport');
            }}
            onDragLeave={() => setDragActiveCategory(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActiveCategory(null);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload('passport', e.dataTransfer.files[0]);
              }
            }}
          >
            <input
              ref={passportInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => handleInputChange('passport', e)}
            />

            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center font-bold">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#161C23] block">1. Passport</span>
                    <span className="text-[10px] text-[#6D7A77]">Biometric / Info Page</span>
                  </div>
                </div>

                {documents.passport ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> Ready
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-[#D97706] bg-[#D97706]/10 px-2 py-0.5 rounded-full">
                    Required
                  </span>
                )}
              </div>

              {documents.passport ? (
                <div className="bg-[#FBF9F5] rounded-2xl p-3 border border-[#E7DFD5] mb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#161C23] truncate">
                        {documents.passport.fileName}
                      </p>
                      <p className="text-[10px] text-[#6D7A77] mt-0.5">
                        {documents.passport.fileSize} · {documents.passport.fileType.toUpperCase()}
                      </p>
                      <div className="mt-2 text-[10px] text-[#00685F] font-semibold bg-[#00685F]/5 p-1.5 rounded-lg">
                        <span>Holder: CHONG, POH YI</span>
                        <br />
                        <span>Expiry: 2031-04-12 (Valid &gt; 6 mo)</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDoc('passport')}
                      className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                      title="Remove file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => passportInputRef.current?.click()}
                  className="py-8 px-4 flex flex-col items-center justify-center text-center cursor-pointer rounded-2xl hover:bg-[#FBF9F5] transition-colors"
                >
                  <Upload className="w-6 h-6 text-[#6D7A77] mb-2" />
                  <p className="text-xs font-bold text-[#161C23]">Drop PDF or click to browse</p>
                  <p className="text-[10px] text-[#6D7A77] mt-0.5">Accepts .pdf, .jpg, .png</p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#E7DFD5]/60 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => passportInputRef.current?.click()}
                className="text-[11px] font-semibold text-[#00685F] hover:underline cursor-pointer"
              >
                {documents.passport ? 'Replace File' : 'Browse Local'}
              </button>

              <button
                type="button"
                onClick={() => handleLoadSample('passport')}
                className="text-[10px] text-[#6D7A77] hover:text-[#161C23] bg-gray-100 px-2 py-0.5 rounded-md cursor-pointer"
              >
                Load Sample
              </button>
            </div>
          </div>

          {/* FIELD 2: FLIGHTS */}
          <div
            className={`bg-white rounded-3xl p-5 border transition-all relative flex flex-col justify-between ${
              dragActiveCategory === 'flights'
                ? 'border-[#00685F] ring-2 ring-[#00685F]/20 bg-[#EEF4FE]/50'
                : documents.flights
                ? 'border-[#00685F]/40 shadow-xs'
                : 'border-[#E7DFD5] border-dashed hover:border-[#6D7A77]'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActiveCategory('flights');
            }}
            onDragLeave={() => setDragActiveCategory(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActiveCategory(null);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload('flights', e.dataTransfer.files[0]);
              }
            }}
          >
            <input
              ref={flightsInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => handleInputChange('flights', e)}
            />

            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center font-bold">
                    <Plane className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#161C23] block">2. Flights</span>
                    <span className="text-[10px] text-[#6D7A77]">E-Ticket / PNR Booking</span>
                  </div>
                </div>

                {documents.flights ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> Ready
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-[#D97706] bg-[#D97706]/10 px-2 py-0.5 rounded-full">
                    Required
                  </span>
                )}
              </div>

              {documents.flights ? (
                <div className="bg-[#FBF9F5] rounded-2xl p-3 border border-[#E7DFD5] mb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#161C23] truncate">
                        {documents.flights.fileName}
                      </p>
                      <p className="text-[10px] text-[#6D7A77] mt-0.5">
                        {documents.flights.fileSize} · {documents.flights.fileType.toUpperCase()}
                      </p>
                      <div className="mt-2 text-[10px] text-[#00685F] font-semibold bg-[#00685F]/5 p-1.5 rounded-lg">
                        <span>Flight: JAL JL7821 (KIX ➔ SFO)</span>
                        <br />
                        <span className="font-bold text-[#D97706]">Departs: Oct 26, 2026 17:45</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDoc('flights')}
                      className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                      title="Remove file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => flightsInputRef.current?.click()}
                  className="py-8 px-4 flex flex-col items-center justify-center text-center cursor-pointer rounded-2xl hover:bg-[#FBF9F5] transition-colors"
                >
                  <Upload className="w-6 h-6 text-[#6D7A77] mb-2" />
                  <p className="text-xs font-bold text-[#161C23]">Drop PDF or click to browse</p>
                  <p className="text-[10px] text-[#6D7A77] mt-0.5">Accepts .pdf, .jpg, .png</p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#E7DFD5]/60 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => flightsInputRef.current?.click()}
                className="text-[11px] font-semibold text-[#00685F] hover:underline cursor-pointer"
              >
                {documents.flights ? 'Replace File' : 'Browse Local'}
              </button>

              <button
                type="button"
                onClick={() => handleLoadSample('flights')}
                className="text-[10px] text-[#6D7A77] hover:text-[#161C23] bg-gray-100 px-2 py-0.5 rounded-md cursor-pointer"
              >
                Load Sample
              </button>
            </div>
          </div>

          {/* FIELD 3: HOTELS */}
          <div
            className={`bg-white rounded-3xl p-5 border transition-all relative flex flex-col justify-between ${
              dragActiveCategory === 'hotels'
                ? 'border-[#00685F] ring-2 ring-[#00685F]/20 bg-[#EEF4FE]/50'
                : documents.hotels
                ? 'border-[#00685F]/40 shadow-xs'
                : 'border-[#E7DFD5] border-dashed hover:border-[#6D7A77]'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActiveCategory('hotels');
            }}
            onDragLeave={() => setDragActiveCategory(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActiveCategory(null);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload('hotels', e.dataTransfer.files[0]);
              }
            }}
          >
            <input
              ref={hotelsInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => handleInputChange('hotels', e)}
            />

            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center font-bold">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#161C23] block">3. Hotels</span>
                    <span className="text-[10px] text-[#6D7A77]">Booking Voucher &amp; BRN</span>
                  </div>
                </div>

                {documents.hotels ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> Ready
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-[#D97706] bg-[#D97706]/10 px-2 py-0.5 rounded-full">
                    Required
                  </span>
                )}
              </div>

              {documents.hotels ? (
                <div className="bg-[#FBF9F5] rounded-2xl p-3 border border-[#E7DFD5] mb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#161C23] truncate">
                        {documents.hotels.fileName}
                      </p>
                      <p className="text-[10px] text-[#6D7A77] mt-0.5">
                        {documents.hotels.fileSize} · {documents.hotels.fileType.toUpperCase()}
                      </p>
                      <div className="mt-2 text-[10px] text-[#00685F] font-semibold bg-[#00685F]/5 p-1.5 rounded-lg">
                        <span>Property: Hotel Granvia Kyoto</span>
                        <br />
                        <span className="font-bold text-rose-600">
                          Check-out: {hotelExtended ? 'Oct 26, 2026 (Extended)' : 'Oct 25, 2026 11:00'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDoc('hotels')}
                      className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                      title="Remove file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => hotelsInputRef.current?.click()}
                  className="py-8 px-4 flex flex-col items-center justify-center text-center cursor-pointer rounded-2xl hover:bg-[#FBF9F5] transition-colors"
                >
                  <Upload className="w-6 h-6 text-[#6D7A77] mb-2" />
                  <p className="text-xs font-bold text-[#161C23]">Drop PDF or click to browse</p>
                  <p className="text-[10px] text-[#6D7A77] mt-0.5">Accepts .pdf, .jpg, .png</p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#E7DFD5]/60 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => hotelsInputRef.current?.click()}
                className="text-[11px] font-semibold text-[#00685F] hover:underline cursor-pointer"
              >
                {documents.hotels ? 'Replace File' : 'Browse Local'}
              </button>

              <button
                type="button"
                onClick={() => handleLoadSample('hotels')}
                className="text-[10px] text-[#6D7A77] hover:text-[#161C23] bg-gray-100 px-2 py-0.5 rounded-md cursor-pointer"
              >
                Load Sample
              </button>
            </div>
          </div>
        </div>

        {/* TURQUOISE GREEN "RUN AI VERIFICATION" BUTTON */}
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-[#E7DFD5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#161C23]">
                {allDocsUploaded
                  ? 'All 3 documents ready for cross-referencing'
                  : 'Please provide Passport, Flight, and Hotel files'}
              </p>
              <p className="text-[11px] text-[#6D7A77]">
                AI engine will check 6-month validity, flight/hotel checkout congruence &amp; IATA PNR registers.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!allDocsUploaded || verificationState === 'verifying'}
            onClick={handleRunAiVerification}
            className={`w-full sm:w-auto px-8 py-3 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-md transition-all cursor-pointer ${
              !allDocsUploaded || verificationState === 'verifying'
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                : 'bg-[#00685F] hover:bg-[#008378] active:scale-[0.98] text-white shadow-[#00685F]/25 hover:shadow-lg'
            }`}
          >
            {verificationState === 'verifying' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Running Verification...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Run AI Verification</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* SIMULATED AI LOGIC (3-SECOND LOADING MODAL / SPINNER) */}
      {verificationState === 'verifying' && (
        <div className="my-8 bg-white rounded-3xl p-8 border border-[#00685F]/30 shadow-lg text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
          {/* Animated Spinner with Turquoise Green rings */}
          <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-[#EEF4FE]"></div>
            <div className="absolute inset-0 rounded-full border-4 border-[#00685F] border-t-transparent animate-spin"></div>
            <Sparkles className="w-8 h-8 text-[#00685F] animate-pulse" />
          </div>

          {/* Sequential Stage Text: "Extracting dates...", "Cross-referencing timelines...", "Verifying BRN..." */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#00685F]/10 text-[#00685F] font-bold text-xs mb-2">
            <span className="w-2 h-2 rounded-full bg-[#00685F] animate-ping"></span>
            <span>AI Neural Verification Pipeline</span>
          </div>

          <h3 className="text-lg md:text-xl font-extrabold text-[#161C23] tracking-tight mb-2 min-h-[32px] transition-all">
            {loadingStageText}
          </h3>

          <p className="text-xs text-[#6D7A77] max-w-md mb-5">
            Cross-referencing Flight JL7821 departure with Hotel Granvia check-out date, checking US passport validity against Japan MOFA consular rules.
          </p>

          {/* Progress bar */}
          <div className="w-full max-w-xs bg-[#EEF4FE] rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-[#00685F] h-full transition-all duration-700 ease-out"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
          <span className="text-[10px] font-bold text-[#6D7A77] mt-2">{loadingProgress}% completed</span>
        </div>
      )}

      {/* THE OUTPUT DASHBOARD: Display summary dashboard that explicitly checks for consistency */}
      {verificationState === 'completed' && report && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Output Overview Card */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#E7DFD5]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E7DFD5]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#D97706] animate-pulse"></span>
                  <h2 className="text-lg md:text-xl font-extrabold text-[#161C23] tracking-tight">
                    Document Consistency Report
                  </h2>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    1 Timeline Discrepancy Detected
                  </span>
                </div>
                <p className="text-xs text-[#6D7A77] mt-1">
                  Verified against official MOFA Japan &amp; IATA Timatic APIs · 4 Passed, 1 Attention Required
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFixItinerary}
                  className="px-4 py-2 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-transform active:scale-95 cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Fix Itinerary</span>
                </button>
              </div>
            </div>

            {/* Quick Summary Metrics Grid (matches image.png style) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="p-3.5 rounded-2xl bg-[#FBF9F5] border border-[#E7DFD5]">
                <span className="text-[10px] font-bold uppercase text-[#6D7A77] tracking-wider block">
                  Visa Status
                </span>
                <span className="text-xs md:text-sm font-extrabold text-[#00685F] mt-0.5 block">
                  Waiver (90 Days)
                </span>
                <span className="text-[10px] text-gray-500">eVisa pre-cleared</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FBF9F5] border border-[#E7DFD5]">
                <span className="text-[10px] font-bold uppercase text-[#6D7A77] tracking-wider block">
                  Processing
                </span>
                <span className="text-xs md:text-sm font-extrabold text-[#161C23] mt-0.5 block">
                  3–5 Days
                </span>
                <span className="text-[10px] text-gray-500">Standard Consular</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FBF9F5] border border-[#E7DFD5]">
                <span className="text-[10px] font-bold uppercase text-[#6D7A77] tracking-wider block">
                  Consular Fee
                </span>
                <span className="text-xs md:text-sm font-extrabold text-[#161C23] mt-0.5 block">
                  $22 USD
                </span>
                <span className="text-[10px] text-gray-500">Paid online (JOD)</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FBF9F5] border border-[#E7DFD5]">
                <span className="text-[10px] font-bold uppercase text-[#6D7A77] tracking-wider block">
                  Passport Buffer
                </span>
                <span className="text-xs md:text-sm font-extrabold text-emerald-700 mt-0.5 block">
                  +4.5 Years
                </span>
                <span className="text-[10px] text-emerald-600">&gt; 6 months required</span>
              </div>
            </div>
          </div>

          {/* CONDITIONAL RENDERING: HIGHLIGHTING SYSTEM VALUE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. RED/YELLOW WARNING CARD (Mandated) */}
            <div className="bg-white rounded-3xl p-5 md:p-6 border-2 border-amber-300 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-400"></div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                      Discrepancy Detected
                    </span>
                    <h3 className="text-sm md:text-base font-extrabold text-[#161C23] leading-snug">
                      Warning: Flight departure date does not match Hotel check-out date
                    </h3>
                  </div>
                </div>

                <div className="my-3 p-3 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-amber-200/50">
                    <span className="font-semibold text-gray-600">Hotel Check-Out:</span>
                    <span className="font-bold text-[#161C23]">Sun, Oct 25, 2026 @ 11:00 AM</span>
                  </div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-amber-200/50">
                    <span className="font-semibold text-gray-600">Flight JL7821 Departure:</span>
                    <span className="font-bold text-[#161C23]">Mon, Oct 26, 2026 @ 17:45 PM</span>
                  </div>
                  <div className="flex items-center justify-between text-amber-950 font-bold pt-0.5">
                    <span>Unsheltered Gap:</span>
                    <span className="text-rose-600">24-hour discrepancy (1 unbooked night)</span>
                  </div>
                </div>

                <p className="text-xs text-[#6D7A77] leading-relaxed">
                  You are currently scheduled to check out of Hotel Granvia Kyoto 24 hours before your flight departs from Kansai Airport (KIX). You have no registered accommodation for Sunday night, Oct 25.
                </p>
              </div>

              {/* Action Buttons inside Warning Card */}
              <div className="mt-4 pt-3 border-t border-amber-200/60 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setHotelExtended(!hotelExtended)}
                  className="text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                >
                  {hotelExtended ? '✓ Hotel Extended to Oct 26' : 'Simulate: Extend Hotel 1 Night'}
                </button>

                {/* Mandated "Fix Itinerary" button */}
                <button
                  type="button"
                  onClick={handleFixItinerary}
                  className="px-4 py-2 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
                >
                  <span>Fix Itinerary</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 2. GREEN SUCCESS CARD (Mandated) */}
            <div className="bg-white rounded-3xl p-5 md:p-6 border-2 border-emerald-300 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500"></div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
                      Passport Immigration Check
                    </span>
                    <h3 className="text-sm md:text-base font-extrabold text-[#161C23] leading-snug">
                      Passport expiry is valid (more than 6 months from travel date)
                    </h3>
                  </div>
                </div>

                <div className="my-3 p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 text-xs text-emerald-900 space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-emerald-200/50">
                    <span className="font-semibold text-gray-600">Passport Holder:</span>
                    <span className="font-bold text-[#161C23]">CHONG, POH YI (Doc #A89412093)</span>
                  </div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-emerald-200/50">
                    <span className="font-semibold text-gray-600">Passport Expiration:</span>
                    <span className="font-bold text-[#161C23]">April 12, 2031</span>
                  </div>
                  <div className="flex items-center justify-between text-emerald-950 font-bold pt-0.5">
                    <span>Buffer Past Return:</span>
                    <span className="text-emerald-700">4 Years, 5 Months (Passes 6-mo rule)</span>
                  </div>
                </div>

                <p className="text-xs text-[#6D7A77] leading-relaxed">
                  Japan Immigration requires passport validity for the duration of stay, while commercial international airlines enforce a 6-month buffer. Your passport comfortably meets all border security standards.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-emerald-200/60 flex items-center justify-between text-xs">
                <span className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1">
                  <FileCheck className="w-3.5 h-3.5" /> Biometric Chip Verified
                </span>
                <span className="text-[10px] text-gray-500">IATA Timatic Passed</span>
              </div>
            </div>
          </div>

          {/* SECONDARY VALUE CHECKS: BRN, CHECKLIST, HALAL & CUSTOMS ADVISORY */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* BRN Verification Card */}
            <div className="bg-white rounded-3xl p-5 border border-[#E7DFD5] shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-[#00685F]/10 text-[#00685F] flex items-center justify-center font-bold">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#161C23]">Provider BRN Verified</h4>
                  <span className="text-[10px] text-[#6D7A77]">Amadeus &amp; Hotel Granvia</span>
                </div>
              </div>

              <div className="space-y-2 text-xs mt-3">
                <div className="p-2 rounded-xl bg-[#FBF9F5] border border-[#E7DFD5]">
                  <p className="text-[10px] font-bold text-gray-500 uppercase">Flight PNR: JL7821</p>
                  <p className="font-bold text-[#161C23]">JAL Kansai ➔ SFO</p>
                  <p className="text-[10px] text-[#00685F] font-semibold">Special Meal: Muslim Meal (MOML) active</p>
                </div>
                <div className="p-2 rounded-xl bg-[#FBF9F5] border border-[#E7DFD5]">
                  <p className="text-[10px] font-bold text-gray-500 uppercase">Hotel BRN: KYO-99214</p>
                  <p className="font-bold text-[#161C23]">Hotel Granvia Kyoto</p>
                  <p className="text-[10px] text-emerald-700 font-semibold">Confirmed: Halal breakfast requested</p>
                </div>
              </div>
            </div>

            {/* Document Checklist (matches reference image.png) */}
            <div className="bg-white rounded-3xl p-5 border border-[#E7DFD5] shadow-xs md:col-span-2">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#E7DFD5]">
                <div>
                  <h4 className="text-xs font-bold text-[#161C23]">Document Compliance Checklist</h4>
                  <p className="text-[10px] text-[#6D7A77]">Ensure all materials are ready prior to consular submission</p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#EEF4FE] text-[#00685F]">
                  4 / 5 Ready
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/50 border border-emerald-100">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-bold text-[#161C23]">Valid Biometric Passport</p>
                      <p className="text-[10px] text-[#6D7A77]">Min. 6 months validity with 2 blank pages</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700">Attached</span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/50 border border-emerald-100">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-bold text-[#161C23]">Digital Passport Photograph</p>
                      <p className="text-[10px] text-[#6D7A77]">Plain white background, 35x45mm, headwear compliant</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700">Validated</span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50/50 border border-amber-200">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="font-bold text-[#161C23]">Confirmed Flights &amp; Hotel Itinerary</p>
                      <p className="text-[10px] text-amber-800">1 night timeline gap between checkout &amp; flight</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleFixItinerary}
                    className="text-[10px] font-extrabold text-[#00685F] underline hover:text-[#008378]"
                  >
                    Resolve in Canvas
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/50 border border-emerald-100">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-bold text-[#161C23]">Proof of Sufficient Funds</p>
                      <p className="text-[10px] text-[#6D7A77]">Recent bank statement / credit ledger attached</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700">Attached</span>
                </div>
              </div>
            </div>
          </div>

          {/* Halal & Customs Advisory Banner (matches reference image.png) */}
          <div className="bg-[#E6F3F2] rounded-3xl p-5 border border-[#00685F]/30 shadow-xs flex flex-col sm:flex-row items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-[#00685F] text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs md:text-sm font-extrabold text-[#00685F]">
                Halal &amp; Japanese Customs Advisory (Kansai &amp; Narita)
              </h4>
              <p className="text-xs text-[#161C23] mt-1 leading-relaxed">
                Strict border regulations apply to meat products entering Kansai (KIX) and Narita (NRT). Homemade or loose beef jerky/rendang without official government veterinary certificates is subject to confiscation. Commercial packaged Halal snacks with recognized halal certs (e.g. JAKIM, MUI, IFANCA) can be declared smoothly at the Red Customs lane.
              </p>
            </div>
          </div>

          {/* Bottom Call to Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowReminderToast(true);
                setTimeout(() => setShowReminderToast(false), 3000);
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-2xl border border-[#E7DFD5] bg-white hover:bg-gray-50 text-[#161C23] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-[#00685F]" />
              <span>Set Submission Reminder</span>
            </button>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  alert('Generating Safar Verified Travel & Visa Compliance Dossier (PDF)...');
                }}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-2xl border border-[#00685F]/30 bg-[#00685F]/10 hover:bg-[#00685F]/15 text-[#00685F] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Application Pack (PDF)</span>
              </button>

              {/* Main Turquoise Fix Itinerary button */}
              <button
                type="button"
                onClick={handleFixItinerary}
                className="flex-1 sm:flex-none px-6 py-2.5 rounded-2xl bg-[#00685F] hover:bg-[#008378] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <span>Fix Itinerary in Canvas</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reminder Toast */}
      {showReminderToast && (
        <div className="fixed bottom-6 right-6 bg-[#161C23] text-white px-4 py-3 rounded-2xl shadow-2xl text-xs font-semibold flex items-center gap-2.5 z-50 animate-in fade-in slide-in-from-bottom-3">
          <BellRing className="w-4 h-4 text-[#62FAE3]" />
          <span>Calendar reminder created: Review October 25 lodging gap 14 days before departure.</span>
        </div>
      )}
    </div>
  );
};
