import { useCallback, useEffect, useState } from 'react';
import { api } from './api/client';
import type { AuthState } from './api/types';
import { Header } from './components/Header';
import { ErrorState, Loading } from './components/States';
import { t } from './i18n';
import { NavProvider } from './nav/NavProvider';
import { clearFocusMemory } from './nav/focus';
import { Auth } from './pages/Auth';
import { Browse } from './pages/Browse';
import { Home } from './pages/Home';
import { Library, Watchlist } from './pages/Library';
import { Player } from './pages/Player';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { TitlePage } from './pages/Title';
import { match, useRoute } from './router';

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [failed, setFailed] = useState(false);

  const loadAuth = useCallback(() => {
    setFailed(false);
    api.authState().then(setAuth, () => setFailed(true));
  }, []);

  useEffect(loadAuth, [loadAuth]);

  if (failed) {
    return <ErrorState title={t('error.offline')} onRetry={loadAuth} />;
  }
  if (!auth) return <Loading />;

  if (!auth.authenticated) {
    return (
      <NavProvider>
        <Auth state={auth} onAuthenticated={loadAuth} />
      </NavProvider>
    );
  }

  return (
    <NavProvider>
      <Routes profile={auth.profile} />
    </NavProvider>
  );
}

function Routes({ profile }: { profile: AuthState['profile'] }) {
  const route = useRoute();

  // Each route starts with a clean focus map; remembering a row from the
  // previous screen would drop the cursor somewhere unrelated.
  useEffect(() => {
    clearFocusMemory();
    window.scrollTo(0, 0);
  }, [route.path]);

  const watch = match('/watch/:id', route.path);
  if (watch) {
    const season = route.query.get('season');
    const episodeNumber = route.query.get('episode');
    return (
      <Player
        id={watch.id}
        sourceId={route.query.get('source') || undefined}
        season={season ? Number(season) : undefined}
        episode={episodeNumber ? Number(episodeNumber) : undefined}
      />
    );
  }

  const title = match('/title/:id', route.path);

  return (
    <>
      <Header profile={profile} />
      {title ? (
        <TitlePage id={title.id} />
      ) : route.path === '/browse/movie' ? (
        <Browse type="movie" />
      ) : route.path === '/browse/tv' ? (
        <Browse type="tv" />
      ) : route.path === '/search' ? (
        <Search />
      ) : route.path === '/library' ? (
        <Library />
      ) : route.path === '/watchlist' ? (
        <Watchlist />
      ) : route.path === '/settings' ? (
        <Settings profile={profile} />
      ) : (
        <Home />
      )}
    </>
  );
}
