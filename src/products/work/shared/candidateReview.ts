/** Manual observations about one frozen candidate, never an execution or publication grant. */
export interface CandidateReviewTarget {
  bindingDigest: string;
  members: Array<{ member: 'platform' | 'runtime'; commitId: string }>;
}
export interface CandidateReviewRequest {
  artifactId: string;
  requestId: string;
  bindingDigest: string;
  verdict: 'accepted' | 'changes_requested';
  checks: string;
}
export interface CandidateReviewReceipt {
  artifactId: string;
  bindingDigest: string;
  reviewerActorId: string;
  reviewedAt: string;
  verdict: CandidateReviewRequest['verdict'];
  checks: string;
}
