import { Session } from '../models/Session.js';
import { signAccessToken, signRefreshToken } from './token.service.js';

export function deviceLabel(ua = '') {
  const s = String(ua).toLowerCase();
  let os = 'Unknown';
  if (/iphone|ipad|ios/.test(s)) os = 'iPhone/iPad';
  else if (/android/.test(s)) os = 'Android';
  else if (/windows/.test(s)) os = 'Windows';
  else if (/mac os|macintosh/.test(s)) os = 'Mac';
  else if (/linux/.test(s)) os = 'Linux';
  let br = 'Browser';
  if (/edg\//.test(s)) br = 'Edge';
  else if (/chrome|crios/.test(s)) br = 'Chrome';
  else if (/firefox|fxios/.test(s)) br = 'Firefox';
  else if (/safari/.test(s)) br = 'Safari';
  const mobile = /mobile|android|iphone/.test(s);
  return `${br} on ${os}${mobile ? ' (mobile)' : ''}`;
}

export async function issueAuthTokens(user, req) {
  const ua = (req && req.headers && req.headers['user-agent']) || '';
  const ip = (req && (req.headers['x-forwarded-for'] || req.ip)) || '';
  const session = await Session.create({
    user: user._id,
    device: deviceLabel(ua),
    userAgent: String(ua).slice(0, 300),
    ip: String(ip).slice(0, 80),
  });
  const sid = String(session._id);
  return { accessToken: signAccessToken(user, sid), refreshToken: signRefreshToken(user, sid) };
}