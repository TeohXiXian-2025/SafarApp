// Service usage (app owner only, via OWNER_EMAILS): free allowances this month,
// AI requests, automatic halal checks. Reached from the account menu.
import { Link } from 'react-router';
import { AppHeader } from '../components/live/AppHeader';
import { UsageCard } from '../components/live/UsageCard';

export function UsagePage() {
  return (
    <div className="min-h-dvh bg-[#FAF8F5]">
      <AppHeader />
      <main className="max-w-xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-2xl font-extrabold text-[#161C23]">Service usage</h1>
        <p className="text-sm text-[#6D7A77]">How much of each free allowance Safar has used. Each service switches to its fallback by itself when its limit is reached.</p>
        <UsageCard fallback={<p className="text-sm text-[#6D7A77]">Only the app owner can see this. <Link to="/trips" className="font-semibold text-[#00685F]">Back to my trips</Link></p>} />
      </main>
    </div>
  );
}
