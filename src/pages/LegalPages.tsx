// Public legal pages (no sign-in needed) — linked from the login page and the
// Google OAuth consent screen. Keep them in step with what the app really does.
import { Compass } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { APP_NAME, CONTACT_EMAIL, LEGAL_UPDATED, PUBLIC_ORIGIN } from '../config';

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#FAF8F5]">
      <header className="border-b border-[#E7DFD5] pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto h-14 px-4 flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-[#00685F] text-white flex items-center justify-center">
              <Compass className="w-4 h-4" />
            </span>
            <span className="font-extrabold text-[#161C23]">{APP_NAME}</span>
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 pb-16">
        <article className="space-y-5 text-[15px] leading-7 text-[#161C23] [&_h2]:text-lg [&_h2]:font-bold [&_h2]:pt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-[#00685F] [&_a]:underline">
          <div>
            <h1 className="text-2xl font-extrabold">{title}</h1>
            <p className="text-sm text-[#6D7A77]">Last updated: {LEGAL_UPDATED}</p>
          </div>
          {children}
        </article>
        <LegalFooter />
      </main>
    </div>
  );
}

export function LegalFooter({ className = 'mt-10' }: { className?: string }) {
  return (
    <p className={`${className} text-center text-xs text-[#6D7A77] space-x-3`}>
      <Link to="/privacy" className="hover:underline">
        Privacy Policy
      </Link>
      <span aria-hidden>·</span>
      <Link to="/terms" className="hover:underline">
        Terms of Service
      </Link>
      <span aria-hidden>·</span>
      <a href={`mailto:${CONTACT_EMAIL}`} className="hover:underline">
        Contact
      </a>
    </p>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        {APP_NAME} ("we", "us") is a group travel planner that helps friends and families plan trips around halal food and prayer
        times. This policy explains what we collect when you use {APP_NAME} at <a href={PUBLIC_ORIGIN}>{PUBLIC_ORIGIN.replace('https://', '')}</a>,
        why, and the choices you have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <b>Account details</b> — your name, email address and profile photo. If you sign in with Google we receive only these basic
          profile details (the "openid", "email" and "profile" scopes); we never see your Google password and cannot access your Gmail,
          Drive or other Google data.
        </li>
        <li>
          <b>Trip information you add</b> — trip names, destinations, dates, the people in your group, bookings (flight, train, bus,
          ferry and hotel details such as times, booking references and passenger names), ideas, votes and activity in the trip.
        </li>
        <li>
          <b>Travel preferences</b> — budget ranges, pace, interests, hotel priorities and, if you choose to share them, whether you
          need halal food and prayer breaks. These can indicate religious practice, so they are optional, used only to plan your trip,
          and visible only to members of trips you belong to.
        </li>
        <li>
          <b>Files you upload</b> — tickets, boarding passes, screenshots or confirmation emails you choose to give us so we can read
          the booking details. Uploaded files are private to you; other trip members only see the booking details you confirm.
        </li>
        <li>
          <b>Document Vault (optional)</b> — if you agree on the vault's consent screen, your passport, visa and travel insurance details
          (name, document number, nationality, date of birth, validity dates, insurer) and, if you choose to keep it, the photo or PDF.
          Only you can open them — not the trip admin and not other members. We use them only to check your trip readiness (for example
          passport expiry and the names on your tickets). If you share your status, the group sees only lines like "Passport ✓", never
          the documents, numbers or dates. You can keep just the details and have the image deleted immediately.
        </li>
        <li>
          <b>Expenses and receipts</b> — amounts, who paid and how costs are split, visible to members of the trip. Receipt photos are
          stored in your private folder; trip members can open them through short-lived links to check a shared cost.
        </li>
        <li>
          <b>Halal reports</b> — reports and certificate or menu photos you submit about a restaurant are shared (without your name)
          with every {APP_NAME} user, to build a community view. How often your reports match the consensus is used to weight them.
        </li>
        <li>
          <b>Technical data</b> — basic device, browser and error information used to keep the service secure and fix problems. We do
          not use advertising trackers and we do not sell your data.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run your account and the trips you create or join, and to show your group the plans you share.</li>
        <li>To read bookings from files or text you submit, find places on maps, and work out local times and timezones.</li>
        <li>To suggest plans, restaurants and hotels that fit your group's preferences.</li>
        <li>To protect the service against abuse (for example rate limiting) and to fix errors.</li>
      </ul>

      <h2>Service providers we share data with</h2>
      <p>We use trusted providers to run {APP_NAME}. They process data on our behalf and only for these purposes:</p>
      <ul>
        <li>
          <b>Google Firebase</b> (sign-in, database and file storage) and <b>Vercel</b> (hosting and server functions).
        </li>
        <li>
          <b>Google Gemini API</b> — reads the tickets, receipts, travel documents, screenshots, captions or text you submit to extract
          their details, and summarises public reviews.
        </li>
        <li>
          <b>Groq</b> — a backup AI provider used for the same tasks when Gemini is unavailable.
        </li>
        <li>
          <b>Google Maps Platform</b> — place search, maps, travel times and timezones.
        </li>
        <li>
          <b>Sentry</b> (error reports) and <b>Upstash</b> (rate limiting).
        </li>
        <li>
          Travel data providers for hotel prices, exchange rates, flight status and place information (LiteAPI, SerpApi, Frankfurter,
          ExchangeRate-API, AviationStack and Foursquare) receive only search details like destination, dates, currencies or a flight
          number — not your account information or documents.
        </li>
      </ul>
      <p>
        We may also disclose information if required by law. Your data may be processed in countries other than your own, including
        Singapore and the United States, where our providers operate.
      </p>

      <h2>Who can see your information</h2>
      <p>
        Members of a trip can see that trip's details, member names and photos, the bookings they are included in, ideas, votes and
        activity, expenses, and the hotel options and votes. The trip admin can manage members. Your uploaded files remain visible
        only to you (receipts can be opened by members through a short-lived link), and your Document Vault is visible only to you.
      </p>

      <h2>Retention and deletion</h2>
      <ul>
        <li>We keep your information while your account is active.</li>
        <li>A trip admin can delete a trip at any time, which permanently removes its bookings, ideas and activity.</li>
        <li>You can delete any booking or expense you added, and leave any trip.</li>
        <li>
          You can delete any vault document, or your whole vault for a trip, at any time. Leaving a trip deletes your vault for it, and
          deleting a trip deletes every file uploaded to it.
        </li>
        <li>
          To delete your account and all personal data, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>; we will do so
          within 30 days.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit (HTTPS). Access is restricted by security rules so that only trip members can read a trip and
        only you can read your uploads. No system is perfectly secure, but we work to protect your information.
      </p>

      <h2>Your rights</h2>
      <p>
        You can access and correct your information in the app, and ask us for a copy or deletion of your data by contacting us.
        Depending on where you live (for example under Malaysia's Personal Data Protection Act 2010 or the EU GDPR) you may have
        additional rights, which we will respect.
      </p>

      <h2>Children</h2>
      <p>
        {APP_NAME} is not intended for children under 13, and we do not knowingly collect their information. Children can travel in a
        group, but an adult should manage their details.
      </p>

      <h2>Changes</h2>
      <p>We will update this page if our practices change and revise the "last updated" date above.</p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <p>
        By using {APP_NAME} you agree to these terms. If you don't agree, please don't use the service.
      </p>

      <h2>The service</h2>
      <p>
        {APP_NAME} helps groups plan trips together. Features are provided "as is" and may change as the product develops. It is a
        student project and may be interrupted or changed without notice.
      </p>

      <h2>Your account and content</h2>
      <ul>
        <li>Keep your sign-in details secure; you are responsible for activity on your account.</li>
        <li>Only upload content you have the right to share, and only add people to trips who have agreed to join.</li>
        <li>You keep ownership of what you add. You allow us to store and process it to provide the service to you and your group.</li>
        <li>Don't misuse the service — no unlawful content, spam, attempts to break security, or scraping.</li>
      </ul>

      <h2>Travel information is guidance only</h2>
      <p>
        Bookings read by AI, times, routes, prices, halal status, prayer times and other suggestions can be incomplete or wrong. Always
        check them with the airline, hotel, venue or relevant authority before relying on them. Halal information is not a
        certification unless it states the certifying body, and even then please confirm with the venue. {APP_NAME} is not a travel
        agent and is not responsible for bookings you make with third parties.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent allowed by law, {APP_NAME} is not liable for indirect or consequential losses, or for missed connections,
        bookings or other travel disruption arising from use of the service.
      </p>

      <h2>Ending use</h2>
      <p>
        You can stop using {APP_NAME} at any time and ask us to delete your account. We may suspend accounts that misuse the service.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </LegalShell>
  );
}
