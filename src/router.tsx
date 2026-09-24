import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { JoinPage } from './pages/JoinPage';
import { LoginPage } from './pages/LoginPage';
import { NewTripPage } from './pages/NewTripPage';
import { TripsPage } from './pages/TripsPage';
import { BookingsPage } from './trip/bookings/BookingsPage';
import { MembersPage } from './trip/MembersPage';
import { PreferencesPage } from './trip/PreferencesPage';
import { OverviewPage } from './trip/OverviewPage';
import { SettingsPage } from './trip/SettingsPage';
import { TripLayout } from './trip/TripLayout';
import { GlobalBanners } from './pwa/GlobalBanners';

function Root() {
  return (
    <>
      <GlobalBanners />
      <Outlet />
    </>
  );
}

// URL map (see docs/BUILD_PLAN.md). Later phases add tabs under /t/:tripId:
//   ideas (4) · timeline (5) · food, hotels (8) · vault, expenses (9)
// /pitch is a separate HTML entry served by Vercel, not a route here.
export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Navigate to="/trips" replace /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/trips', element: <RequireAuth><TripsPage /></RequireAuth> },
      { path: '/trips/new', element: <RequireAuth><NewTripPage /></RequireAuth> },
      { path: '/join/:token', element: <RequireAuth><JoinPage /></RequireAuth> },
      {
        path: '/t/:tripId',
        element: <RequireAuth><TripLayout /></RequireAuth>,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'bookings', element: <BookingsPage /> },
          { path: 'members', element: <MembersPage /> },
          { path: 'preferences', element: <PreferencesPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      // The original hackathon prototype (hardcoded demo data), kept for the pitch.
      // Loaded on demand so the live app doesn't ship the prototype's code.
      { path: '/demo/*', lazy: async () => ({ Component: (await import('./App')).default }) },
      { path: '*', element: <Navigate to="/trips" replace /> },
    ],
  },
]);
