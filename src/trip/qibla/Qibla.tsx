// Qibla on Home. Honest by design:
//  • Phone: a live compass only when the phone reports a real compass heading;
//    otherwise it says so and shows the bearing.
//  • Laptop: no compass sensor, so never a turning needle — the qibla drawn as a
//    line on a map at your location, a live "use the sun / your shadow" guide,
//    and a QR code that opens the phone compass.
// Position comes from the browser (asked only on a tap) or, clearly labelled,
// from the trip city.
import qrcode from 'qrcode-generator';
import { Compass, Info, LocateFixed, MapPin, Sun, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { compassPoint, distanceToKaabaKm, qiblaBearing, sunGuide, turnBetween } from '../../domain/qibla';
import { prefs } from '../../pwa/pwa';
import { Button, cx, Sheet } from '../../ui';

export interface QiblaPlace {
  name: string;
  lat: number;
  lng: number;
}

type Fix = { lat: number; lng: number; accuracy: number; at: number };
const GEO_KEY = 'safar:qibla-geo-ok';

/** Browser location — requested only after the user asks (or once they've allowed it before). */
function useGeo() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [state, setState] = useState<'idle' | 'asking' | 'denied' | 'unavailable'>('idle');
  const request = () => {
    if (!('geolocation' in navigator)) return setState('unavailable');
    setState('asking');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        prefs.set(GEO_KEY, '1');
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), at: Date.now() });
        setState('idle');
      },
      (e) => setState(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };
  // Allowed before on this device → refresh quietly.
  useEffect(() => {
    if (prefs.get(GEO_KEY) === '1') request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { fix, state, request };
}

type OrientationEvt = DeviceOrientationEvent & { webkitCompassHeading?: number };
type PermissionCapable = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

/** The phone's real compass heading (degrees from north), or null if the device doesn't give one. */
function useHeading(active: boolean) {
  const [heading, setHeading] = useState<number | null>(null);
  const needsTap = typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as PermissionCapable).requestPermission === 'function';
  const [allowed, setAllowed] = useState(!needsTap);
  useEffect(() => {
    if (!active || !allowed) return;
    const on = (e: Event) => {
      const o = e as OrientationEvt;
      if (typeof o.webkitCompassHeading === 'number') setHeading(o.webkitCompassHeading); // iOS: true heading
      else if (o.absolute && o.alpha !== null) setHeading((360 - o.alpha) % 360); // Android: absolute orientation
    };
    window.addEventListener('deviceorientationabsolute', on);
    window.addEventListener('deviceorientation', on);
    return () => {
      window.removeEventListener('deviceorientationabsolute', on);
      window.removeEventListener('deviceorientation', on);
    };
  }, [active, allowed]);
  const ask = async () => {
    try {
      const r = await (DeviceOrientationEvent as PermissionCapable).requestPermission?.();
      setAllowed(r === 'granted');
    } catch {
      setAllowed(false);
    }
  };
  return { heading, needsTap: needsTap && !allowed, ask };
}

function useMedia(q: string) {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setOn(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return on;
}

/** A dial: N at the top, the Kaaba marker at `bearing`, rotated by the phone's heading when known. */
function Dial({ bearing, heading, size = 64, dark }: { bearing: number; heading?: number | null; size?: number; dark?: boolean }) {
  const rot = heading == null ? 0 : -heading;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="shrink-0">
      <circle cx="50" cy="50" r="48" fill={dark ? 'rgba(255,255,255,.05)' : '#F4F1EC'} />
      <g style={{ transform: `rotate(${rot}deg)`, transformOrigin: '50px 50px', transition: 'transform .25s ease-out' }}>
        <circle cx="50" cy="50" r="40" fill="none" stroke={dark ? 'rgba(255,255,255,.18)' : '#DDD5CA'} strokeWidth="1.5" />
        <text x="50" y="21" textAnchor="middle" fontSize="11" fontWeight="700" fill={dark ? '#fff' : '#45524F'}>
          N
        </text>
        <g transform={`rotate(${bearing} 50 50)`}>
          <path d="M50 50 L50 17" stroke={dark ? '#E2C27E' : '#0B3B36'} strokeWidth="3" strokeLinecap="round" />
          <rect x="44" y="5" width="12" height="12" rx="2" fill="#161C23" stroke="#E2C27E" strokeWidth="1.2" />
          <rect x="44" y="8" width="12" height="2" fill="#C8A15A" />
        </g>
      </g>
      {heading != null && <path d="M50 1 L55 9 L45 9 Z" fill="#E2C27E" />}
      <circle cx="50" cy="50" r="4" fill={dark ? '#E2C27E' : '#0B3B36'} />
    </svg>
  );
}

/** The Home card: bearing + where it's measured from + a button into the full view. */
export function QiblaCard({ fallback, className }: { fallback: QiblaPlace | null; className?: string }) {
  const geo = useGeo();
  const [open, setOpen] = useState(false);
  const from = geo.fix ? { name: 'your location', lat: geo.fix.lat, lng: geo.fix.lng } : fallback;
  const bearing = from ? qiblaBearing(from.lat, from.lng) : null;
  return (
    <section className={cx('bg-white border border-[#E7DFD5] rounded-2xl p-4 flex items-center gap-4 shadow-[0_1px_2px_rgba(22,28,35,.04)]', className)}>
      {bearing != null ? <Dial bearing={bearing} size={72} /> : <span className="w-[72px] h-[72px] rounded-full bg-[#F4F1EC] flex items-center justify-center text-[#6D7A77]"><Compass className="w-7 h-7" /></span>}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6D7A77]">Qibla</p>
        {bearing != null && from ? (
          <>
            <p className="font-display text-2xl font-semibold text-[#161C23] tabular-nums leading-tight">
              {Math.round(bearing)}° <span className="font-sans text-sm font-semibold text-[#6D7A77]">{compassPoint(bearing)}</span>
            </p>
            <p className="text-xs text-[#6D7A77] truncate">From {geo.fix ? `your location (±${geo.fix.accuracy} m)` : `${from.name} (trip city)`}</p>
          </>
        ) : (
          <p className="text-sm text-[#6D7A77]">Find the direction from where you are.</p>
        )}
        <div className="flex flex-wrap gap-2 mt-2">
          <Button className="!min-h-9 !px-3 text-xs" onClick={() => setOpen(true)}>
            <Compass className="w-4 h-4" /> Find the qibla
          </Button>
          {!geo.fix && (
            <Button variant="ghost" className="!min-h-9 !px-2.5 text-xs" onClick={geo.request} loading={geo.state === 'asking'}>
              <LocateFixed className="w-4 h-4" /> Use my location
            </Button>
          )}
        </div>
        {geo.state === 'denied' && <p className="text-[11px] text-[#9B1C15] mt-1">Location is blocked in the browser — showing the trip city instead.</p>}
      </div>
      {open && <QiblaView fix={geo.fix} fallback={fallback} geo={geo} onClose={() => setOpen(false)} />}
    </section>
  );
}

function QiblaView({ fix, fallback, geo, onClose }: { fix: Fix | null; fallback: QiblaPlace | null; geo: ReturnType<typeof useGeo>; onClose: () => void }) {
  const wide = useMedia('(min-width: 768px)');
  const from = fix ? { name: 'your location', lat: fix.lat, lng: fix.lng } : fallback;
  if (!wide) return <PhoneCompass from={from} fix={fix} geo={geo} onClose={onClose} />;
  return (
    <Sheet open onClose={onClose} title="Find the qibla" wide>
      <LaptopQibla from={from} fix={fix} geo={geo} />
    </Sheet>
  );
}

/** Phone: full-screen compass. Turns with the phone only when a real heading is available. */
function PhoneCompass({ from, fix, geo, onClose }: { from: QiblaPlace | null; fix: Fix | null; geo: ReturnType<typeof useGeo>; onClose: () => void }) {
  const { heading, needsTap, ask } = useHeading(true);
  const bearing = from ? qiblaBearing(from.lat, from.lng) : null;
  const off = bearing != null && heading != null ? turnBetween(heading, bearing) : null;
  const facing = off != null && Math.abs(off) <= 5;
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Qibla compass" className="fixed inset-0 z-50 bg-night text-white flex flex-col animate-[safar-fade_.25s_both] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="absolute inset-0 star-lattice opacity-40 pointer-events-none" aria-hidden />
      <div className="relative flex items-center justify-between px-4 h-14">
        <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-xl bg-white/10 inline-flex items-center justify-center">
          <X className="w-5 h-5" />
        </button>
        <p className="font-bold">Qibla</p>
        <span className="w-11" />
      </div>
      {bearing == null || !from ? (
        <div className="relative flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-white/80">Safar needs your location to point to the qibla.</p>
          <Button variant="gold" onClick={geo.request} loading={geo.state === 'asking'}>
            <LocateFixed className="w-4 h-4" /> Use my location
          </Button>
        </div>
      ) : (
        <div className="relative flex-1 flex flex-col items-center px-6">
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[.1em] text-gold-soft">From {fix ? `your location · ±${fix.accuracy} m` : `${from.name} (trip city)`}</p>
          <p className="font-display text-6xl font-semibold tabular-nums mt-1">{Math.round(bearing)}°</p>
          <p className="text-sm text-white/70">
            {compassPoint(bearing)} · {Math.round(distanceToKaabaKm(from.lat, from.lng)).toLocaleString()} km to Makkah
          </p>
          <div className={cx('mt-8 rounded-full p-2 transition-shadow duration-300', facing && 'shadow-[0_0_0_3px_#E2C27E,0_0_40px_rgba(226,194,126,.45)]')}>
            <Dial bearing={bearing} heading={heading} size={270} dark />
          </div>
          <div className="mt-6 min-h-16 text-center">
            {needsTap ? (
              <Button variant="gold" onClick={() => void ask()}>
                <Compass className="w-4 h-4" /> Turn on the live compass
              </Button>
            ) : heading == null ? (
              <p className="text-sm text-white/75 max-w-xs">
                This phone isn't giving a compass reading, so the dial can't turn. Face {Math.round(bearing)}° ({compassPoint(bearing)}) using a map or the sun.
              </p>
            ) : facing ? (
              <p className="text-lg font-bold text-gold-soft">You're facing the qibla</p>
            ) : (
              <p className="text-lg font-bold">
                Turn {Math.abs(Math.round(off!))}° to your {off! > 0 ? 'right' : 'left'}
              </p>
            )}
            {heading != null && <p className="text-xs text-white/55 mt-1">Hold the phone flat, away from metal and magnets.</p>}
          </div>
          {!fix && (
            <button type="button" onClick={geo.request} className="mt-auto mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gold-soft underline underline-offset-4">
              <LocateFixed className="w-4 h-4" /> Use my exact location
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

// ---- Laptop: map line + sun + QR ------------------------------------------------

const Z = 16;
function tileXY(lat: number, lng: number) {
  const n = 2 ** Z;
  const x = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x, y };
}

/** OpenStreetMap tiles around a point with the qibla drawn from it (north up). */
function QiblaMap({ lat, lng, bearing, accuracy }: { lat: number; lng: number; bearing: number; accuracy?: number }) {
  const { x, y } = tileXY(lat, lng);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const tiles: { key: string; left: number; top: number; src: string }[] = [];
  for (let dx = -3; dx <= 3; dx++)
    for (let dy = -2; dy <= 2; dy++)
      tiles.push({ key: `${dx}:${dy}`, left: (tx + dx - x) * 256, top: (ty + dy - y) * 256, src: `https://tile.openstreetmap.org/${Z}/${tx + dx}/${ty + dy}.png` });
  // metres per pixel at this zoom → the accuracy ring's size.
  const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** Z;
  const ring = accuracy ? Math.min(160, Math.max(10, accuracy / mpp)) : 0;
  return (
    <div className="relative h-[360px] rounded-2xl overflow-hidden border border-[#E7DFD5] bg-[#EDEAE3]">
      {tiles.map((t) => (
        <img key={t.key} src={t.src} alt="" draggable={false} className="absolute w-64 h-64 max-w-none select-none" style={{ left: `calc(50% + ${t.left}px)`, top: `calc(50% + ${t.top}px)` }} />
      ))}
      <div
        className="absolute left-1/2 top-1/2 w-[6px] -ml-[3px] h-[600px] origin-top rounded-full bg-gold shadow-[0_0_0_2px_#0B3B36,0_2px_8px_rgba(11,59,54,.4)]"
        style={{ transform: `rotate(${bearing + 180}deg)` }}
        aria-hidden
      />
      {ring > 0 && <span className="absolute left-1/2 top-1/2 rounded-full bg-[#1D4E89]/10 border border-[#1D4E89]/30" style={{ width: ring * 2, height: ring * 2, marginLeft: -ring, marginTop: -ring }} aria-hidden />}
      <span className="absolute left-1/2 top-1/2 -ml-2.5 -mt-2.5 w-5 h-5 rounded-full bg-[#1D4E89] border-[3px] border-white shadow" aria-hidden />
      <span className="absolute top-3 right-3 w-10 py-1.5 rounded-xl bg-white shadow text-center text-[11px] font-extrabold text-[#161C23]">
        <span className="block text-[#B3261E] leading-none">▲</span>N
      </span>
      <span className="absolute left-3 bottom-3 inline-flex items-center gap-2 h-7 px-3 rounded-full bg-night text-white text-xs font-bold">
        <span className="w-3 h-3 rounded-sm bg-[#161C23] border border-gold-soft" /> To Makkah · {Math.round(bearing)}°
      </span>
      <span className="absolute right-2 bottom-1 text-[10px] text-[#45524F] bg-white/80 px-1 rounded">© OpenStreetMap contributors</span>
    </div>
  );
}

function Qr({ text }: { text: string }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const out: string[] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) out.push(`M${c} ${r}h1v1h-1z`);
    return { n, d: out.join('') };
  }, [text]);
  return (
    <svg viewBox={`-2 -2 ${cells.n + 4} ${cells.n + 4}`} className="w-28 h-28 shrink-0 rounded-xl bg-white border border-[#E7DFD5]" role="img" aria-label="QR code that opens Safar's compass on your phone">
      <path d={cells.d} fill="#161C23" />
    </svg>
  );
}

function LaptopQibla({ from, fix, geo }: { from: QiblaPlace | null; fix: Fix | null; geo: ReturnType<typeof useGeo> }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!from) {
    return (
      <div className="py-10 text-center space-y-3">
        <p className="text-[#6D7A77]">Safar needs your location to draw the qibla.</p>
        <Button onClick={geo.request} loading={geo.state === 'asking'}>
          <LocateFixed className="w-4 h-4" /> Use my location
        </Button>
      </div>
    );
  }
  const bearing = qiblaBearing(from.lat, from.lng);
  const sun = sunGuide(now, from.lat, from.lng);
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#6D7A77]">
        <MapPin className="w-4 h-4 text-[#1D4E89]" />
        {fix ? (
          <>
            From <b className="text-[#161C23]">your location</b> · your browser's position, accurate to about {fix.accuracy} m
          </>
        ) : (
          <>
            From <b className="text-[#161C23]">{from.name}</b> — the trip city, not your live location.
            <button type="button" onClick={geo.request} className="font-bold text-[#00685F] underline underline-offset-2">
              Use my location
            </button>
          </>
        )}
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <QiblaMap lat={from.lat} lng={from.lng} bearing={bearing} accuracy={fix?.accuracy} />
          <p className="text-sm">
            <b>Face along the gold line.</b> <span className="text-[#6D7A77]">Pick something you can see on it — a street, a building — and face that way. North is up.</span>
          </p>
        </div>
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl bg-night text-white p-4 flex items-center gap-4">
            <div className="absolute inset-0 star-lattice opacity-50" aria-hidden />
            <div className="relative flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[.08em] text-gold-soft">Qibla from here</p>
              <p className="font-display text-4xl font-semibold tabular-nums">
                {Math.round(bearing)}° <span className="font-sans text-sm font-semibold text-white/70">{compassPoint(bearing)}</span>
              </p>
              <p className="text-xs text-white/65">{Math.round(distanceToKaabaKm(from.lat, from.lng)).toLocaleString()} km to Makkah</p>
            </div>
            <span className="relative">
              <Dial bearing={bearing} size={72} dark />
            </span>
          </div>
          <div className="rounded-2xl border border-[#E7DFD5] bg-white p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-[#161C23]">
              <Sun className="w-4 h-4 text-gold" /> Using the sun
              {sun && <span className="inline-flex items-center h-5 px-2 rounded-full bg-[#00685F] text-white text-[10px] font-bold">Live</span>}
            </p>
            {sun ? (
              <p className="text-sm mt-1.5 leading-relaxed">
                Right now ({now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}) the sun is in the {compassPoint(sun.sunAzimuth)}.{' '}
                <b>
                  {sun.ref === 'sun' ? 'Face the sun' : 'Face along your shadow'}, then turn {Math.abs(Math.round(sun.turn))}° to your {sun.turn >= 0 ? 'right' : 'left'}.
                </b>
              </p>
            ) : (
              <p className="text-sm text-[#6D7A77] mt-1.5">The sun is too low to use right now — use the map or your phone.</p>
            )}
            <p className="text-[11px] text-[#8A9592] mt-1">Worked out from the time and your position. Updates every minute.</p>
          </div>
          <div className="rounded-2xl border border-[#E7DFD5] bg-white p-4 flex items-center gap-4">
            <Qr text={window.location.href} />
            <div>
              <p className="text-sm font-bold text-[#161C23]">Live compass on your phone</p>
              <p className="text-sm text-[#6D7A77] mt-1">Scan with the phone camera, then tap “Find the qibla” — it turns as you turn.</p>
            </div>
          </div>
        </div>
      </div>
      <p className="flex items-start gap-2 text-xs text-[#6D7A77]">
        <Info className="w-4 h-4 shrink-0" /> A laptop can't sense which way it faces, so Safar never shows a turning needle here — only the map, the sun and your phone.
      </p>
    </div>
  );
}
