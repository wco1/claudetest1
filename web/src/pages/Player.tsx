import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, withToken } from '../api/client';
import type { Source, SubtitleTrack, TitleDetails } from '../api/types';
import {
  AudioIcon, BackIcon, ForwardIcon, PauseIcon, PlayIcon, RewindIcon, SettingsIcon, SubtitlesIcon,
} from '../components/Icons';
import { Loading } from '../components/States';
import { device } from '../device';
import { useAsync } from '../hooks/useAsync';
import { formatTime, t } from '../i18n';
import { useKeyHandler } from '../nav/NavProvider';
import { useFocusable } from '../nav/useFocusable';
import { back } from '../router';

const HIDE_DELAY_MS = 4000;
const SEEK_STEP_S = 10;
const SAVE_EVERY_MS = 15_000;

interface Props {
  id: string;
  sourceId?: string;
  season?: number;
  episode?: number;
}

/** Browsers expose audio tracks inconsistently; this is the shape we rely on. */
interface AudioTrackList {
  length: number;
  [index: number]: { enabled: boolean; language: string; label: string };
}

export function Player({ id, sourceId, season, episode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { data, loading } = useAsync(() => api.title(id), [id]);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [failed, setFailed] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [menu, setMenu] = useState<'none' | 'audio' | 'subs'>('none');
  const [seekHint, setSeekHint] = useState<number | null>(null);
  const [activeSub, setActiveSub] = useState(-1);
  const [activeAudio, setActiveAudio] = useState(0);

  const hideTimer = useRef<number | null>(null);
  const seekTimer = useRef<number | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const resumed = useRef(false);

  const source: Source | null = useMemo(() => {
    if (!data?.sources?.length) return null;
    if (sourceId) return data.sources.find((s) => s.id === sourceId) ?? data.sources[0];
    if (season != null && episode != null) {
      return (
        data.sources.find((s) => s.season === season && s.episode === episode) ?? data.sources[0]
      );
    }
    return data.sources[0];
  }, [data, sourceId, season, episode]);

  const externalSubs = useMemo(
    () => (source?.subtitles || []).filter((sub): sub is SubtitleTrack & { url: string } =>
      Boolean(sub.external && sub.url),
    ),
    [source],
  );

  // --- UI visibility -------------------------------------------------------
  const revealUi = useCallback(() => {
    setUiVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setUiVisible(false);
      setMenu('none');
    }, HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    revealUi();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [revealUi]);

  // --- Progress ------------------------------------------------------------
  const saveProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video || !data || !video.duration || video.currentTime < 5) return;
    void api
      .saveProgress({
        titleId: data.id,
        season: source?.season ?? null,
        episode: source?.episode ?? null,
        position: video.currentTime,
        duration: video.duration,
        card: {
          id: data.id,
          mediaType: data.mediaType,
          tmdbId: data.tmdbId,
          title: data.title,
          originalTitle: data.originalTitle,
          year: data.year,
          poster: data.poster,
          backdrop: data.backdrop,
          overview: data.overview,
          rating: data.rating,
          votes: data.votes,
        },
      })
      .catch(() => undefined);
  }, [data, source]);

  useEffect(() => {
    saveTimer.current = window.setInterval(saveProgress, SAVE_EVERY_MS);
    // A TV can be switched off mid-film; `pagehide` is the only event that fires.
    const onHide = () => saveProgress();
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      if (saveTimer.current) window.clearInterval(saveTimer.current);
      saveProgress();
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, [saveProgress]);

  // --- Playback control ----------------------------------------------------
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setFailed(true));
    else video.pause();
    revealUi();
  }, [revealUi]);

  /**
   * Seeking is coalesced: pressing right five times should jump fifty seconds
   * once, not fire five separate range requests that each stall the buffer.
   */
  const seekBy = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video || !video.duration) return;

      const base = pendingSeek.current ?? video.currentTime;
      const target = Math.max(0, Math.min(video.duration - 1, base + delta));
      pendingSeek.current = target;
      setSeekHint(target);
      revealUi();

      if (seekTimer.current) window.clearTimeout(seekTimer.current);
      seekTimer.current = window.setTimeout(() => {
        if (pendingSeek.current != null) {
          video.currentTime = pendingSeek.current;
          pendingSeek.current = null;
        }
        setSeekHint(null);
      }, 420);
    },
    [revealUi],
  );

  // --- Remote keys ---------------------------------------------------------
  useKeyHandler((action) => {
    if (menu !== 'none' && action === 'back') {
      setMenu('none');
      return true;
    }

    switch (action) {
      case 'playpause':
      case 'play':
      case 'pause':
        togglePlay();
        return true;
      case 'left':
      case 'rewind':
        if (!uiVisible || action === 'rewind') {
          seekBy(-SEEK_STEP_S);
          return true;
        }
        return false;
      case 'right':
      case 'forward':
        if (!uiVisible || action === 'forward') {
          seekBy(SEEK_STEP_S);
          return true;
        }
        return false;
      case 'up':
      case 'down':
        if (!uiVisible) {
          revealUi();
          return true;
        }
        return false;
      case 'select':
        if (!uiVisible) {
          revealUi();
          return true;
        }
        return false;
      case 'stop':
        back();
        return true;
      case 'back':
        saveProgress();
        back();
        return true;
      default:
        return false;
    }
  });

  // --- Track handling ------------------------------------------------------
  const audioTracks = useMemo(() => source?.audioTracks ?? [], [source]);

  const selectAudio = useCallback((index: number) => {
    const video = videoRef.current as (HTMLVideoElement & { audioTracks?: AudioTrackList }) | null;
    setActiveAudio(index);
    const list = video?.audioTracks;
    if (!list) return;
    for (let i = 0; i < list.length; i += 1) list[i].enabled = i === index;
  }, []);

  const selectSubtitle = useCallback((index: number) => {
    const video = videoRef.current;
    setActiveSub(index);
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i += 1) {
      tracks[i].mode = i === index ? 'showing' : 'disabled';
    }
  }, []);

  if (loading && !data) return <Loading />;

  if (!source) {
    return (
      <div className="player">
        <div className="player__centre">
          <div className="player__error">
            <h3>{t('sources.none')}</h3>
            <PlayerButton onSelect={back} autoFocus>
              <BackIcon />
              {t('action.back')}
            </PlayerButton>
          </div>
        </div>
      </div>
    );
  }

  const percent = duration > 0 ? (current / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;
  const subtitle =
    source.season != null && source.episode != null
      ? `S${String(source.season).padStart(2, '0')}E${String(source.episode).padStart(2, '0')}`
      : source.label;

  return (
    <div className="player" onMouseMove={device.pointerless ? undefined : revealUi}>
      <video
        ref={videoRef}
        className="player__video"
        src={withToken(source.playUrl)}
        autoPlay
        playsInline
        preload="auto"
        crossOrigin="use-credentials"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => {
          setWaiting(false);
          setFailed(false);
        }}
        onCanPlay={() => setWaiting(false)}
        onError={() => setFailed(true)}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(video.duration || 0);

          // Resume where the viewer stopped, unless they had nearly finished.
          if (!resumed.current && data?.progress?.position) {
            const position = data.progress.position;
            if (position > 30 && position < (video.duration || Infinity) - 60) {
              video.currentTime = position;
            }
            resumed.current = true;
          }
        }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          if (pendingSeek.current == null) setCurrent(video.currentTime);
          if (video.buffered.length) {
            setBuffered(video.buffered.end(video.buffered.length - 1));
          }
        }}
      >
        {externalSubs.map((sub, index) => (
          <track
            key={sub.url}
            kind="subtitles"
            src={withToken(sub.url)}
            srcLang={sub.language || 'ru'}
            label={sub.label}
            default={index === 0 && activeSub === index}
          />
        ))}
      </video>

      {(waiting || (loading && !failed)) && !failed && (
        <div className="player__centre">
          <div className="spinner" />
        </div>
      )}

      {failed && (
        <div className="player__centre">
          <div className="player__error">
            <h3>{t('player.error')}</h3>
            <p>{t('player.errorHint')}</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <PlayerButton
                autoFocus
                onSelect={() => {
                  setFailed(false);
                  videoRef.current?.load();
                }}
              >
                {t('action.retry')}
              </PlayerButton>
              <PlayerButton onSelect={back}>
                <BackIcon />
                {t('action.back')}
              </PlayerButton>
            </div>
          </div>
        </div>
      )}

      {seekHint != null && (
        <div className="player__seekhint">
          {formatTime(seekHint)} / {formatTime(duration)}
        </div>
      )}

      <div className="player__ui" data-hidden={!uiVisible || failed ? 'true' : 'false'}>
        <div className="player__top">
          <PlayerButton
            onSelect={() => {
              saveProgress();
              back();
            }}
            title={t('action.back')}
          >
            <BackIcon />
          </PlayerButton>
          <div className="player__titles">
            <div className="player__title truncate">{data?.title || source.filename}</div>
            <div className="player__subtitle truncate">{subtitle}</div>
          </div>
        </div>

        <div className="player__bottom">
          <Scrubber
            percent={percent}
            bufferedPercent={bufferedPercent}
            current={pendingSeek.current ?? current}
            duration={duration}
            onSeek={(fraction) => {
              const video = videoRef.current;
              if (video?.duration) video.currentTime = fraction * video.duration;
              revealUi();
            }}
            onStep={seekBy}
          />

          <div className="controls">
            <PlayerButton onSelect={() => seekBy(-SEEK_STEP_S)} title="-10s">
              <RewindIcon />
            </PlayerButton>

            <PlayerButton variant="play" autoFocus onSelect={togglePlay}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </PlayerButton>

            <PlayerButton onSelect={() => seekBy(SEEK_STEP_S)} title="+10s">
              <ForwardIcon />
            </PlayerButton>

            <div className="controls__spacer" />

            {audioTracks.length > 1 && (
              <PlayerButton
                onSelect={() => setMenu((m) => (m === 'audio' ? 'none' : 'audio'))}
                active={menu === 'audio'}
                title={t('player.audio')}
              >
                <AudioIcon />
                {device.kind !== 'phone' && t('player.audio')}
              </PlayerButton>
            )}

            {source.subtitles.length > 0 && (
              <PlayerButton
                onSelect={() => setMenu((m) => (m === 'subs' ? 'none' : 'subs'))}
                active={menu === 'subs'}
                title={t('player.subtitles')}
              >
                <SubtitlesIcon />
                {device.kind !== 'phone' && t('player.subtitles')}
              </PlayerButton>
            )}

            <PlayerButton
              onSelect={() => setMenu((m) => (m === 'none' ? 'audio' : 'none'))}
              title={t('player.settings')}
            >
              <SettingsIcon />
            </PlayerButton>
          </div>
        </div>

        {menu === 'audio' && (
          <TrackMenu
            heading={t('player.audio')}
            options={audioTracks.map((track, index) => ({
              key: String(index),
              label: track.label,
              active: activeAudio === index,
              onSelect: () => selectAudio(index),
            }))}
            note={audioTracksNote(source)}
          />
        )}

        {menu === 'subs' && (
          <TrackMenu
            heading={t('player.subtitles')}
            options={[
              {
                key: 'off',
                label: t('player.subtitlesOff'),
                active: activeSub === -1,
                onSelect: () => selectSubtitle(-1),
              },
              ...externalSubs.map((sub, index) => ({
                key: sub.url,
                label: sub.label,
                active: activeSub === index,
                onSelect: () => selectSubtitle(index),
              })),
            ]}
            note={
              source.subtitles.some((sub) => !sub.external)
                ? 'Встроенные дорожки контейнера доступны не на всех устройствах.'
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

/**
 * Container-embedded audio tracks can only be switched when the browser exposes
 * `HTMLMediaElement.audioTracks`. Chrome on desktop does not; most TV browsers
 * do. Saying so beats a control that silently does nothing.
 */
function audioTracksNote(source: Source): string | undefined {
  const supported = typeof document !== 'undefined' && 'audioTracks' in HTMLMediaElement.prototype;
  if (supported) return undefined;
  return source.audioTracks.length > 1
    ? 'Этот браузер не умеет переключать дорожки внутри контейнера — играет дорожка по умолчанию.'
    : undefined;
}

function PlayerButton({
  children, onSelect, variant, active, autoFocus, title,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  variant?: 'play';
  active?: boolean;
  autoFocus?: boolean;
  title?: string;
}) {
  const { props } = useFocusable<HTMLButtonElement>({ group: 'player', onSelect, autoFocus });
  const classes = ['pbtn', variant === 'play' ? 'pbtn--play' : '', active ? 'pbtn--active' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button {...props} className={classes} title={title}>
      {children}
    </button>
  );
}

function Scrubber({
  percent, bufferedPercent, current, duration, onSeek, onStep,
}: {
  percent: number;
  bufferedPercent: number;
  current: number;
  duration: number;
  onSeek: (fraction: number) => void;
  onStep: (delta: number) => void;
}) {
  const { props, focused } = useFocusable<HTMLDivElement>({
    group: 'player',
    noScroll: true,
    onSelect: () => onStep(0),
  });

  // While the bar holds focus, left/right scrub instead of moving focus.
  useKeyHandler((action) => {
    if (action === 'left') {
      onStep(-SEEK_STEP_S);
      return true;
    }
    if (action === 'right') {
      onStep(SEEK_STEP_S);
      return true;
    }
    return false;
  }, focused);

  return (
    <div className="scrub">
      <span>{formatTime(current)}</span>
      <div
        {...props}
        className="scrub__bar"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onSeek(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)));
        }}
      >
        <div className="scrub__buffered" style={{ width: `${bufferedPercent}%` }} />
        <div className="scrub__played" style={{ width: `${percent}%` }} />
        <div className="scrub__handle" style={{ left: `${percent}%` }} />
      </div>
      <span>{formatTime(duration)}</span>
    </div>
  );
}

function TrackMenu({
  heading, options, note,
}: {
  heading: string;
  options: { key: string; label: string; active: boolean; onSelect: () => void }[];
  note?: string;
}) {
  return (
    <div className="player__menu">
      <div>
        <h4>{heading}</h4>
        {options.map(({ key, ...option }) => (
          <MenuOption key={key} {...option} />
        ))}
        {note && (
          <p className="settings__hint" style={{ marginTop: 10 }}>
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

function MenuOption({
  label, active, onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  const { props } = useFocusable<HTMLButtonElement>({ group: 'player-menu', onSelect });
  return (
    <button {...props} className={`menu-option${active ? ' menu-option--active' : ''}`}>
      <span className="truncate">{label}</span>
      {active && <span className="menu-option__tick">✓</span>}
    </button>
  );
}

export type { TitleDetails };
