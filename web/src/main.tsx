import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyDeviceClasses, device } from './device';
import { getLocale } from './i18n';
import { restoreReducedMotion } from './pages/Settings';
import './styles/base.css';
import './styles/components.css';
import './styles/player.css';

applyDeviceClasses();
restoreReducedMotion();
document.documentElement.lang = getLocale();

// Televisions are the only devices that reliably need the low-power path;
// give the CSS a chance to switch off blur before the first paint.
if (device.perf === 'low') {
  document.documentElement.setAttribute('data-reduced-motion', 'true');
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  document.getElementById('boot')?.remove();
}

// Offline shell + artwork cache. Skipped in dev so hot reload is not intercepted.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is optional */
    });
  });
}
