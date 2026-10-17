import { createOwnerTicket } from './owner-auth.js';

// Convenience entry for the explicitly started, separate localhost preview only.
// Production owner authentication and API mutation checks are unchanged.
export function createPreviewEntry({ db, origin, enabled = false }) {
  const canonical = new URL(origin);
  if (enabled && canonical.hostname !== '127.0.0.1') throw new Error('Preview entry requires a loopback origin');
  return (req,res) => {
    if (!enabled || req.method !== 'GET') return false;
    const url = new URL(req.url, origin);
    if (!['/admin','/admin/'].includes(url.pathname)) return false;
    const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const knownHost = [canonical.host, `localhost:${canonical.port}`].includes(req.headers.host);
    const sameOrigin = !req.headers.origin || req.headers.origin === canonical.origin;
    if (!local || !knownHost || !sameOrigin || req.headers['sec-fetch-site'] === 'cross-site') {
      res.writeHead(403); res.end('Local preview entry only'); return true;
    }
    if (req.headers.host !== canonical.host) {
      res.writeHead(302, { Location: `${canonical.origin}${url.pathname}` }); res.end(); return true;
    }
    // The query marker breaks the redirect loop while the frontend redeems the
    // single-use fragment ticket. The frontend removes both after login.
    if (url.searchParams.get('preview-entry') === '1') return false;
    const ticket = createOwnerTicket(db);
    res.writeHead(302, { Location: `${url.pathname}?preview-entry=1#ticket=${ticket}`, 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' });
    res.end(); return true;
  };
}
