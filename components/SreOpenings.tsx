'use client';

import RolePage from './RolePage';

// The "SRE Openings" page (/sre): every Site Reliability Engineer opening of the chosen period.
export default function SreOpenings() {
  return (
    <RolePage
      role="sre"
      path="/sre"
      eyebrow="Production Support"
      title="SRE Openings"
      subtitle="Every Site Reliability Engineer opening we found, in the Filtered or Non-filtered jobs (the switch at the top). Add each one's HR contact and students right in the list with the pencil."
      noun="SRE openings"
    />
  );
}
