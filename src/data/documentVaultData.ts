import { TravelDocument, DocumentVerificationReport } from '../types';

export const SAMPLE_DOCUMENTS: Record<'passport' | 'flights' | 'hotels', TravelDocument> = {
  passport: {
    id: 'doc-passport-sample',
    category: 'passport',
    fileName: 'US_Passport_Biometric_Chong.pdf',
    fileSize: '1.4 MB',
    fileType: 'pdf',
    uploadedAt: 'Uploaded 5 mins ago',
    extractedDetails: {
      holderName: 'CHONG, POH YI',
      documentNumber: 'A89412093',
      issueDate: '2021-04-13',
      expiryDate: '2031-04-12',
      issuingCountry: 'United States of America (USA)',
    },
  },
  flights: {
    id: 'doc-flights-sample',
    category: 'flights',
    fileName: 'JAL_Flight_Booking_JL7821.pdf',
    fileSize: '840 KB',
    fileType: 'pdf',
    uploadedAt: 'Uploaded 4 mins ago',
    extractedDetails: {
      carrier: 'Japan Airlines (JAL)',
      flightNumber: 'JL7821',
      pnr: 'JL7821',
      departureDate: '2026-10-26 17:45',
      returnDate: '2026-10-26 17:45',
    },
  },
  hotels: {
    id: 'doc-hotels-sample',
    category: 'hotels',
    fileName: 'HotelGranvia_Kyoto_Booking_KYO99214.pdf',
    fileSize: '620 KB',
    fileType: 'pdf',
    uploadedAt: 'Uploaded 3 mins ago',
    extractedDetails: {
      hotelName: 'Hotel Granvia Kyoto (JR Kyoto Station)',
      bookingReference: 'KYO-99214',
      checkInDate: '2026-10-21 15:00',
      checkOutDate: '2026-10-25 11:00',
      nights: 4,
    },
  },
};

export const MOCK_VERIFICATION_REPORT: DocumentVerificationReport = {
  timestamp: 'Verified just now via Safar AI Engine v2.5',
  overallStatus: 'passed_with_warnings',
  totalChecks: 5,
  passedCount: 4,
  warningCount: 1,
  summary: {
    passportValid: true,
    timelineMatched: false,
    brnVerified: true,
    visaEligible: true,
  },
  checks: [
    {
      id: 'check-timeline',
      title: 'Warning: Flight departure date does not match Hotel check-out date',
      status: 'warning',
      category: 'Timeline Consistency',
      summary: '1-night gap detected between lodging and departure flight.',
      details:
        'Hotel Granvia Kyoto reservation check-out is Sunday, October 25, 2026 at 11:00 AM, but your Japan Airlines return flight JL7821 departs on Monday, October 26, 2026 at 5:45 PM (KIX). You currently have no accommodation booked for Sunday night, Oct 25.',
      sourceDoc: 'Flights (JL7821) vs Hotels (KYO-99214)',
      recommendedAction: 'Extend hotel stay by 1 night in Kyoto or add an airport transit hotel in Osaka.',
    },
    {
      id: 'check-passport',
      title: 'Passport expiry is valid (more than 6 months from travel date)',
      status: 'success',
      category: 'Identity & Immigration',
      summary: 'Biometric chip verified. Expiry is April 12, 2031 (>4.5 years buffer).',
      details:
        'Document holder CHONG, POH YI. Passport expires April 12, 2031, providing 4 years and 5 months of validity beyond your intended departure date (Oct 26, 2026). Complies with MOFA Japan and airline international boarding standards.',
      sourceDoc: 'Passport (A89412093)',
    },
    {
      id: 'check-brn',
      title: 'Booking Reference Numbers (BRN & PNR) Verified with Providers',
      status: 'success',
      category: 'Provider Cross-Check',
      summary: 'JAL Flight PNR JL7821 and Hotel Granvia voucher KYO-99214 confirmed active.',
      details:
        'Airline PNR JL7821 matches active reservation on flight JL7821 (KIX -> SFO) with Muslim Meal (MOML) confirmed. Hotel reservation KYO-99214 confirmed with non-smoking room and Halal breakfast request on file.',
      sourceDoc: 'JAL Amadeus Registry & Granvia Central System',
    },
    {
      id: 'check-visa',
      title: 'Visa & Entry Protocol: 90-Day Visa Waiver / eVisa Eligible',
      status: 'success',
      category: 'Consular Entry Protocol',
      summary: 'US passport holder traveling to Japan for Tourism & Leisure.',
      details:
        'United States passport holders qualify for visa-exempt entry up to 90 days for temporary visitor tourism. Visit Japan Web (VJW) digital customs & immigration QR codes are pre-fillable.',
      sourceDoc: 'IATA Timatic & MOFA Japan API',
    },
    {
      id: 'check-customs',
      title: 'Halal & Customs Advisory: Kansai / Narita Meat Import Restrictions',
      status: 'info',
      category: 'Halal Food Customs Compliance',
      summary: 'Japanese Animal Quarantine Service (AQS) requires pre-cleared snack certification.',
      details:
        'Strict border regulations on non-certified meat products entering Kansai (KIX) & Narita (NRT). Packaged Halal snacks with recognized Halal seal (JAKIM, MUI, IFANCA) must be declared at the customs red inspection lane if containing animal by-products.',
      sourceDoc: 'Japan Animal Quarantine Service (AQS)',
      recommendedAction: 'Keep original manufacturer seals and Halal certification labels intact for inspection.',
    },
  ],
};
