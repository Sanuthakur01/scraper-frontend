// The team's photos, shown in place of initials (the leaderboard, the performance report, the activity
// record). assets/team/ holds square, face-centred 256px copies of the photos in assets/ (the originals
// are kept as they are). Each photo belongs to one sign-in email, never to a name: two people can share
// a first name (Shubhangi Sharma and Shubhangi Tamrakar). The emails appear here only as their
// emailKey (see lib/emailKey.ts for how to get one), because this code is part of the public website.
// Anyone not listed keeps their initials.
import { emailKey } from './emailKey';
import purnima from '../assets/team/purnima.jpg';
import shubhangi from '../assets/team/shubhangi.jpg';
import vanshika from '../assets/team/vanshika.jpg';

const PHOTOS: Record<string, string> = {
  '1ex1vu8a9aj': purnima.src, // Purnima Raikwar
  tjs9uwswi4: shubhangi.src, // Shubhangi Sharma
  '1yrrf77qdqc': vanshika.src, // Vanshika Tiwari
};

export const photoOf = (email: string): string | null => PHOTOS[emailKey(email)] ?? null;
