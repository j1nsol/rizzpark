import { useState } from 'react';
import { useFCM } from '../hooks/useFCM';
import { isMobile, isIOS, ONBOARDING_KEY } from '../utils/parking';

// ── Shared header ─────────────────────────────────────────────────────────────
function ObHeader({ stepLabel }) {
  return (
    <div className="ob-header">
      <div className="ob-brand">
        <div className="ob-brand-name">Rizz<em>.</em>Park</div>
        <div className="ob-brand-tag">Smart Parking</div>
      </div>
      <div className="ob-step-label">
        <span className="ob-step-dot" />
        {stepLabel}
      </div>
    </div>
  );
}

// ── Desktop flow ──────────────────────────────────────────────────────────────
function DesktopCard({ onDismiss }) {
  const fcm = useFCM();
  const [phase, setPhase] = useState('idle'); // idle | requesting | granted | denied

  async function handleAllow() {
    setPhase('requesting');
    try {
      // Use FCM for push notifications if supported
      if (fcm.isSupported) {
        await fcm.requestPermission();
        localStorage.setItem('rizzpark_notif', 'granted');
        setPhase('granted');
      } else {
        // Fallback to browser notifications
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          localStorage.setItem('rizzpark_notif', 'granted');
          setPhase('granted');
        } else {
          setPhase('denied');
        }
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      setPhase('idle');
    }
  }

  return (
    <div className="ob-card">
      <ObHeader stepLabel="Welcome" />
      <div className="ob-body">
        <div className="ob-icon-wrap">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <path
              d="M13 2.5a6.5 6.5 0 0 1 6.5 6.5c0 3.8 1.3 5.2 2.3 6.5H4.2C5.2 14.2 6.5 12.8 6.5 9A6.5 6.5 0 0 1 13 2.5Z"
              stroke="#F5A623" strokeWidth="1.5"
            />
            <path d="M10.5 15.5a2.5 2.5 0 0 0 5 0" stroke="#F5A623" strokeWidth="1.5" />
            <circle cx="19" cy="5.5" r="3" fill="#22A06B" />
          </svg>
        </div>

        <div className="ob-title">Stay ahead with real-time alerts</div>
        <div className="ob-desc">
          Get instant desktop notifications the moment a parking slot opens up — no need to keep checking the map.
        </div>

        {/* Result feedback */}
        {phase === 'granted' && (
          <div className="ob-result granted">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="6.5" stroke="#22A06B" strokeWidth="1.3" />
              <path d="M4.5 7.5l2 2 4-4" stroke="#22A06B" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            Notifications enabled — you&apos;re all set!
          </div>
        )}
        {phase === 'denied' && (
          <div className="ob-result denied">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="6.5" stroke="#C03030" strokeWidth="1.3" />
              <path d="M5 5l5 5M10 5l-5 5" stroke="#C03030" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            Blocked — you can enable later in browser settings.
          </div>
        )}

        <div className="ob-actions">
          {phase === 'granted' ? (
            <button className="ob-btn ob-accent" onClick={onDismiss}>
              Enter Dashboard →
            </button>
          ) : phase === 'denied' ? (
            <button className="ob-btn secondary" onClick={onDismiss}>
              Continue anyway
            </button>
          ) : (
            <>
              <button
                className="ob-btn primary"
                onClick={handleAllow}
                disabled={phase === 'requesting'}
              >
                {phase === 'requesting' ? (
                  <>
                    <span className="ob-spinner" />
                    Requesting…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M7 1a4.5 4.5 0 0 1 4.5 4.5c0 2.5.8 3.5 1.5 4.5H1c.7-1 1.5-2 1.5-4.5A4.5 4.5 0 0 1 7 1Z"
                        stroke="white" strokeWidth="1.3"
                      />
                      <path d="M5.5 10a1.5 1.5 0 0 0 3 0" stroke="white" strokeWidth="1.3" />
                    </svg>
                    Allow Notifications
                  </>
                )}
              </button>
              <button className="ob-btn secondary" onClick={onDismiss}>
                Skip for now
              </button>
            </>
          )}
        </div>

        <div className="ob-skip">
          <a onClick={onDismiss}>Already a user? Go to dashboard →</a>
        </div>
      </div>
    </div>
  );
}

// ── Mobile flow ───────────────────────────────────────────────────────────────
const IOS_STEPS = [
  <>Tap the <strong>Share</strong> button at the bottom of Safari</>,
  <>Scroll down and tap <strong>"Add to Home Screen"</strong></>,
  <>Keep the name <strong>Rizz Park</strong> and tap <strong>Add</strong></>,
  <>The app icon will appear on your <strong>home screen</strong></>,
];

const ANDROID_STEPS = [
  <>Tap the <strong>three-dot menu</strong> in the top-right of Chrome</>,
  <>Tap <strong>"Add to Home screen"</strong></>,
  <>Confirm the name and tap <strong>Add</strong></>,
  <>Rizz Park will launch like a <strong>native app</strong></>,
];

function MobileCard({ onDismiss }) {
  const osLabel = isIOS ? 'iOS · Safari' : 'Android · Chrome';
  const steps   = isIOS ? IOS_STEPS : ANDROID_STEPS;

  return (
    <div className="ob-card">
      <ObHeader stepLabel="Get the App" />
      <div className="ob-body">
        <div className="ob-os-badge">
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <circle cx="4.5" cy="4.5" r="4" stroke="#999" strokeWidth="1" />
          </svg>
          {osLabel}
        </div>

        <div className="ob-title">Add Rizz Park to your Home Screen</div>
        <div className="ob-desc">
          Get full-screen access and faster loading by adding this app to your home screen.
        </div>

        <div className="ob-steps">
          {steps.map((text, i) => (
            <div key={i} className="ob-step">
              <div className="ob-step-num">{i + 1}</div>
              <div className="ob-step-text">{text}</div>
            </div>
          ))}
        </div>

        <div className="ob-divider" />

        <div className="ob-actions">
          <button className="ob-btn ob-accent" onClick={onDismiss}>
            Continue to Dashboard →
          </button>
        </div>
        <div className="ob-skip">
          <a onClick={onDismiss}>Don&apos;t show this again</a>
        </div>
      </div>
    </div>
  );
}

// ── Overlay wrapper ───────────────────────────────────────────────────────────
/**
 * @param {{ onDismiss: () => void }} props
 */
export default function OnboardingOverlay({ onDismiss }) {
  function handleDismiss() {
    localStorage.setItem(ONBOARDING_KEY, '1');
    onDismiss();
  }

  return (
    <div className="onboarding-overlay">
      {isMobile
        ? <MobileCard onDismiss={handleDismiss} />
        : <DesktopCard onDismiss={handleDismiss} />
      }
    </div>
  );
}
