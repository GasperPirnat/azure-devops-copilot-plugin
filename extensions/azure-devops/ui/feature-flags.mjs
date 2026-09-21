// Agency authentication is available in the playground build. Distribution sync
// disables it for the standalone marketplace package.
export const AGENCY_AUTH_ENABLED = false;

// Review voting remains separately gated from the read-only PR files viewer.
export const PULL_REQUEST_REVIEW_VOTING_ENABLED = false;
