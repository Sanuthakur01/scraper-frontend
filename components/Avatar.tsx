import { initials } from '@/lib/performance';
import { photoOf } from '@/lib/team';

// A person's round picture: their own photo when the team has one for their sign-in email (lib/team.ts),
// else their initials. Hidden from screen readers: the name is always written beside it.
export default function Avatar({ name, email, className }: { name: string; email: string; className: string }) {
  const photo = photoOf(email);
  return (
    <span className={`${className}${photo ? ' has-photo' : ''}`} aria-hidden="true">
      {/* A plain img: the site is static files, and the photo is already a small square. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo ? <img className="avatar-photo" src={photo} alt="" decoding="async" /> : initials(name, email)}
    </span>
  );
}
