import { imageUrl } from '../api/client';
import type { Profile } from '../api/types';
import { t } from '../i18n';
import { useFocusable } from '../nav/useFocusable';
import { navigate, routes, useRoute } from '../router';
import { SearchIcon } from './Icons';

interface Props {
  profile: Profile | null;
}

const LINKS = [
  { path: routes.home(), labelKey: 'nav.home' },
  { path: routes.browse('movie'), labelKey: 'nav.movies' },
  { path: routes.browse('tv'), labelKey: 'nav.series' },
  { path: routes.library(), labelKey: 'nav.library' },
  { path: routes.watchlist(), labelKey: 'nav.watchlist' },
];

function NavLink({ path, label, active }: { path: string; label: string; active: boolean }) {
  const { props } = useFocusable<HTMLButtonElement>({
    group: 'header',
    onSelect: () => navigate(path),
  });
  return (
    <button {...props} className={`header__link${active ? ' header__link--active' : ''}`}>
      {label}
    </button>
  );
}

export function Header({ profile }: Props) {
  const route = useRoute();

  const search = useFocusable<HTMLButtonElement>({
    group: 'header',
    onSelect: () => navigate(routes.search()),
  });
  const settings = useFocusable<HTMLButtonElement>({
    group: 'header',
    onSelect: () => navigate(routes.settings()),
  });

  const isActive = (path: string) =>
    path === '/' ? route.path === '/' : route.path.startsWith(path);

  return (
    <header className="header">
      <div className="header__brand">
        Кино<b>тека</b>
      </div>

      <nav className="header__nav">
        {LINKS.map((link) => (
          <NavLink
            key={link.path}
            path={link.path}
            label={t(link.labelKey)}
            active={isActive(link.path)}
          />
        ))}
      </nav>

      <div className="header__right">
        <button {...search.props} className="btn btn--icon btn--ghost" title={t('nav.search')}>
          <SearchIcon />
        </button>
        <button
          {...settings.props}
          className="avatar"
          style={{ background: profile?.colour || 'var(--accent)' }}
          title={profile?.name || t('nav.settings')}
        >
          {(profile?.name || '?').slice(0, 1).toUpperCase()}
        </button>
      </div>
    </header>
  );
}

/** Small helper reused by pages that show a provider logo. */
export function providerLogo(path: string | null): string | null {
  return imageUrl(path, 'w92');
}
