import { createBrowserRouter, Navigate } from 'react-router';
import App from './App';
import { RequireAuth } from './auth/RequireAuth';
import { JoinPage } from './pages/JoinPage';
import { LoginPage } from './pages/LoginPage';
import { NewTripPage } from './pages/NewTripPage';
import { TripsPage } from './pages/TripsPage';
import { MembersPage } from './trip/MembersPage';
import { OverviewPage } from './trip/OverviewPage';
import { SettingsPage } from './trip/SettingsPage';
import { TripLayout } from './trip/TripLayout';

// URL map (see docs/BUILD_PLAN.md). Later phases add tabs under /t/:tripId:
//   ideas (4) · timeline (5) · food, hotels (8) · vault, expenses (9)
// /pitch is a separate HTML entry served by Vercel, not a route here.
export const router = createBrowserRouter([
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
      { path: 'members', element: <MembersPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  // The original hackathon prototype (hardcoded demo data), kept for the pitch.
  { path: '/demo/*', element: <App /> },
  { path: '*', element: <Navigate to="/trips" replace /> },
]);
