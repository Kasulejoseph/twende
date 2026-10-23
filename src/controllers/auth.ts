export interface AuthOverride {
  readonly token?: string;
  readonly candidateKey?: string;
  readonly sendCandidateKey?: boolean;
  readonly sendAuthorization?: boolean;
}
