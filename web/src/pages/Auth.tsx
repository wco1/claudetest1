import { useRef, useState } from 'react';
import { api, storeToken } from '../api/client';
import type { AuthState } from '../api/types';
import { Button } from '../components/Button';
import { t } from '../i18n';
import { useFocusable } from '../nav/useFocusable';

interface Props {
  state: AuthState;
  onAuthenticated: () => void;
}

export function Auth({ state, onAuthenticated }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const codeField = useFocusable<HTMLDivElement>({
    group: 'auth',
    autoFocus: true,
    onSelect: () => codeRef.current?.focus(),
  });
  const nameField = useFocusable<HTMLDivElement>({
    group: 'auth',
    onSelect: () => nameRef.current?.focus(),
  });

  const submit = async (profileId?: string) => {
    setBusy(true);
    setError('');
    try {
      const result = await api.login({ code, name: name || undefined, profileId });
      storeToken(result.token);
      onAuthenticated();
    } catch {
      setError(t('auth.error'));
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__box">
        <h1 className="auth__title">{t('auth.title')}</h1>
        <p className="muted">{t('auth.subtitle')}</p>

        <div {...codeField.props} className="auth__input" style={{ padding: 0 }}>
          <input
            ref={codeRef}
            className="auth__input"
            style={{ background: 'none', border: 0 }}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
            placeholder={t('auth.code')}
            type="password"
            inputMode="text"
            autoComplete="one-time-code"
          />
        </div>

        <div {...nameField.props} className="auth__input" style={{ padding: 0 }}>
          <input
            ref={nameRef}
            className="auth__input"
            style={{ background: 'none', border: 0, letterSpacing: 0 }}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
            placeholder={t('auth.namePlaceholder')}
            autoComplete="nickname"
          />
        </div>

        <div className="auth__error">{error}</div>

        <Button variant="primary" group="auth" disabled={busy} onSelect={() => submit()}>
          {t('action.enter')}
        </Button>

        {state.profiles.length > 0 && (
          <>
            <p className="dim" style={{ marginTop: 18 }}>
              {t('auth.pickProfile')}
            </p>
            <div className="settings__options" style={{ justifyContent: 'center' }}>
              {state.profiles.map((profile) => (
                <Button key={profile.id} group="auth" onSelect={() => submit(profile.id)}>
                  {profile.name}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
