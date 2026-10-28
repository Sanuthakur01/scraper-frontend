'use client';

import RolePage from './RolePage';

// The "ServiceNow Openings" page (/servicenow): every opening with ServiceNow in the job title, opened
// from its box on Hiring partners (with that box's period).
export default function ServiceNowOpenings() {
  return (
    <RolePage
      role="servicenow"
      path="/servicenow"
      eyebrow="Hiring partners"
      title="ServiceNow Openings"
      subtitle="Every opening with ServiceNow in the job title, in the Filtered or Non-filtered jobs (the switch at the top). Add each one's HR contact and students right in the list with the pencil."
      noun="ServiceNow openings"
    />
  );
}
