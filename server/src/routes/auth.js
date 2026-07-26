import crypto from 'node:crypto';
import express from 'express';
import { config } from '../config.js';
import { clearSessionCookie, createToken, readSession, setSessionCookie } from '../lib/session.js';

const AVATARS = ['#e11d48', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

/** Constant-time comparison that tolerates different lengths. */
function codeMatches(input, expected) {
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

export function createAuthRouter({ users }) {
  const router = express.Router();
  const gated = () => config.auth.accessCode.length > 0;

  router.get('/state', (req, res) => {
    const session = readSession(req);
    const profile = session ? users.data.profiles[session.u] : null;
    res.json({
      gated: gated(),
      authenticated: Boolean(profile) || !gated(),
      profile: profile || null,
      profiles: Object.values(users.data.profiles).map(({ id, name, colour }) => ({ id, name, colour })),
    });
  });

  router.post('/login', (req, res) => {
    const { code, name, profileId } = req.body || {};

    if (gated() && !codeMatches(code ?? '', config.auth.accessCode)) {
      // Slow down brute force without holding a connection open for long.
      return setTimeout(() => res.status(401).json({ error: 'invalid_code' }), 600);
    }

    let profile = profileId ? users.data.profiles[profileId] : null;

    if (!profile) {
      const displayName = String(name || '').trim().slice(0, 32) || 'Гость';
      const existing = Object.values(users.data.profiles).find(
        (p) => p.name.toLowerCase() === displayName.toLowerCase(),
      );
      if (existing) {
        profile = existing;
      } else {
        profile = {
          id: crypto.randomUUID(),
          name: displayName,
          colour: AVATARS[Object.keys(users.data.profiles).length % AVATARS.length],
          createdAt: new Date().toISOString(),
        };
        users.update((data) => {
          data.profiles[profile.id] = profile;
        });
      }
    }

    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const token = setSessionCookie(res, { u: profile.id }, { secure });
    res.json({ ok: true, profile, token });
  });

  router.post('/logout', (req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  /**
   * Short-lived token for <video src>, which cannot send an Authorization
   * header. Scoped to playback only and refreshed by the player.
   */
  router.get('/playback-token', requireAuth, (req, res) => {
    res.json({ token: createToken({ u: req.profile.id, scope: 'playback' }) });
  });

  return router;
}

export function createAuthMiddleware({ users }) {
  return function attachProfile(req, res, next) {
    const session = readSession(req);
    req.profile = session ? users.data.profiles[session.u] || null : null;
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!config.auth.accessCode) {
    // Open site: synthesise a shared profile so history still works.
    req.profile ||= { id: 'public', name: 'Гость', colour: AVATARS[0] };
    return next();
  }
  if (!req.profile) return res.status(401).json({ error: 'unauthorised' });
  next();
}
