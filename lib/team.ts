// The team's photos, shown in place of initials (the leaderboard, the performance report, the activity
// record). assets/team/ holds square, face-centred 256px copies of the photos in assets/ (the originals
// are kept as they are). A photo is matched by first name, or else by the start of the sign-in email
// ("vanshika…@" → Vanshika's), so no email is written into the website's code. Someone new with the
// same first name would need a longer key here.
import purnima from '../assets/team/purnima.jpg';
import shubhangi from '../assets/team/shubhangi.jpg';
import vanshika from '../assets/team/vanshika.jpg';

const PHOTOS: Record<string, string> = {
  purnima: purnima.src,
  shubhangi: shubhangi.src,
  vanshika: vanshika.src,
};

export function photoOf(name: string, email: string): string | null {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (PHOTOS[first]) return PHOTOS[first];
  const local = email.trim().toLowerCase().split('@')[0];
  const key = Object.keys(PHOTOS).find((k) => local.startsWith(k));
  return key ? PHOTOS[key] : null;
}
