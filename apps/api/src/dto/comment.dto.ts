import { tags } from 'typia';
import type { Links, LocalizedString, PageEnvelope } from '@/dto/common.dto';

export type CommentKind = 'public_quote' | 'team_note';

export interface Comment {
  id: string;
  company_id: string;
  company_slug?: string | null;
  kind: CommentKind;
  body: LocalizedString;
  author_handle?: string | null;
  /**
   * Required when `kind=public_quote` (enforced in service layer).
   */
  source_url?: (string & tags.Format<'uri'> & tags.Pattern<'^https?://'>) | null;
  posted_at: string & tags.Format<'date-time'>;
  links?: Links;
}

export interface CommentList extends PageEnvelope {
  data: Comment[];
}
