import { useState } from 'react';
import { api, storeToken } from '../api/client';
import type { Profile } from '../api/types';
import { Button } from '../components/Button';
import { device, setDeviceOverride } from '../device';
import type { DeviceKind } from '../device';
import { getLocale, setLocale, t } from '../i18n';
import type { Locale } from '../i18n';
import { useFocusable } from '../nav/useFocusable';

const DEVICE_OPTIONS: { value: DeviceKind | 'auto'; labelKey: string }[] = [
  { value: 'auto', labelKey: 'settings.device.auto' },
  { value: 'tv', labelKey: 'settings.device.tv' },
  { value: 'tablet', labelKey: 'settings.device.tablet' },
  { value: 'phone', labelKey: 'settings.device.phone' },
  { value: 'desktop', labelKey: 'settings.device.desktop' },
];

const REDUCED_MOTION_KEY = 'kt.reducedMotion';

export function Settings({ profile }: { profile: Profile | null }) {
  const [reducedMotion, setReducedMotion] = useState(
    () => document.documentElement.getAttribute('data-reduced-motion') === 'true',
  );

  const toggleMotion = () => {
    const next = !reducedMotion;
    setReducedMotion(next);
    document.documentElement.setAttribute('data-reduced-motion', String(next));
    try {
      localStorage.setItem(REDUCED_MOTION_KEY, String(next));
    } catch {
      /* private mode */
    }
  };

  const logout = async () => {
    await api.logout().catch(() => undefined);
    storeToken(null);
    location.hash = '/';
    location.reload();
  };

  return (
    <div className="page">
      <div className="row__head">
        <h2 className="row__title">{t('settings.title')}</h2>
      </div>

      <div className="settings">
        <section className="settings__group">
          <h3>{t('settings.language')}</h3>
          <div className="settings__options">
            {(['ru', 'en'] as Locale[]).map((code) => (
              <Option
                key={code}
                label={code === 'ru' ? 'Русский' : 'English'}
                active={getLocale() === code}
                autoFocus={code === 'ru'}
                onSelect={() => setLocale(code)}
              />
            ))}
          </div>
        </section>

        <section className="settings__group">
          <h3>{t('settings.device')}</h3>
          <p className="settings__hint">
            {t('settings.deviceHint', { kind: t(`settings.device.${device.detectedKind}`) })}
          </p>
          <div className="settings__options">
            {DEVICE_OPTIONS.map((option) => (
              <Option
                key={option.value}
                label={t(option.labelKey)}
                active={
                  option.value === 'auto'
                    ? device.kind === device.detectedKind
                    : device.kind === option.value
                }
                onSelect={() => setDeviceOverride(option.value === 'auto' ? null : option.value)}
              />
            ))}
          </div>
        </section>

        <section className="settings__group">
          <h3>{t('settings.reducedMotion')}</h3>
          <p className="settings__hint">{t('settings.reducedMotionHint')}</p>
          <div className="settings__options">
            <Option
              label={reducedMotion ? 'ON' : 'OFF'}
              active={reducedMotion}
              onSelect={toggleMotion}
            />
          </div>
        </section>

        {profile && (
          <section className="settings__group">
            <h3>{t('settings.profile')}</h3>
            <p className="settings__hint">{profile.name}</p>
            <div className="settings__options">
              <Button group="settings" onSelect={logout}>
                {t('settings.logout')}
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Option({
  label,
  active,
  onSelect,
  autoFocus,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
  autoFocus?: boolean;
}) {
  const { props } = useFocusable<HTMLButtonElement>({ group: 'settings', onSelect, autoFocus });
  return (
    <button {...props} className={`filter${active ? ' filter--active' : ''}`}>
      {label}
    </button>
  );
}

/** Applied at boot, before React renders. */
export function restoreReducedMotion() {
  try {
    const stored = localStorage.getItem(REDUCED_MOTION_KEY);
    if (stored === 'true') document.documentElement.setAttribute('data-reduced-motion', 'true');
  } catch {
    /* private mode */
  }
}
