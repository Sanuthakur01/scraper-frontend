// A short, fixed fingerprint of a sign-in email ("k3x9…"), so the website's code can recognise a person
// without writing their email out (the built site is public). Letter case and spaces around it don't
// matter. cyrb53, a small public-domain 53-bit hash: two different emails practically never share one.
// To get someone's key: node -e "import('./lib/emailKey.ts').then((m) => console.log(m.emailKey(process.argv[1])))" their@email
export function emailKey(email: string) {
  const text = email.trim().toLowerCase();
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
