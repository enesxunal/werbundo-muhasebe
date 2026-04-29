export type CorrespondenceCategory =
  | "official_letter"
  | "fine"
  | "payment_notice"
  | "compliance"
  | "other";

export type AiCorrespondenceExtract = {
  category: CorrespondenceCategory;
  issuer_name: string | null;
  summary: string | null;
  deadline_date: string | null;
  response_deadline_date: string | null;
  amount: number | null;
  reference_no: string | null;
  suggested_parent_id: string | null;
  append_note_for_parent: string | null;
};
