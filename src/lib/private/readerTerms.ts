/**
 * What a person read in the reading service's own terms (docs/features/snap-incognito.md §1). It ships empty:
 * no figure is pre-filled, so none can be approved by default, and the live reader cannot start until it is complete.
 * `readOn` is printed in S7 as written here.
 */
export type ReaderTerms = {
  provider: string;
  service: string;
  retentionDays: number | null;
  trains: boolean | null;
  staffMayReview: boolean | null;
  url: string;
  readOn: string;
  goLiveApprovedOn: string;
};

export const READER_TERMS: ReaderTerms = { provider: "", service: "", retentionDays: null, trains: null, staffMayReview: null, url: "", readOn: "", goLiveApprovedOn: "" };

/** Every field filled in, and the terms say the service does not train its models on the pictures. */
export function readerTermsComplete(t: ReaderTerms = READER_TERMS): boolean {
  return t.trains === false && Object.values(t).every((v) => (typeof v === "string" ? v.trim() !== "" : v !== null));
}
