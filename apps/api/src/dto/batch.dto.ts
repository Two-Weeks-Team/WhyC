import { tags } from 'typia';
import type { Links, PageEnvelope } from '@/dto/common.dto';

export interface Batch {
  id: string;
  /**
   * YC batch label, e.g. W25, S25, W26.
   */
  label: string & tags.Pattern<'^[WS][0-9]{2}$'>;
  demo_day_at: string & tags.Format<'date'>;
  source_url?: string & tags.Format<'uri'>;
  company_count?: number & tags.Type<'int64'> & tags.Minimum<0>;
  created_at?: string & tags.Format<'date-time'>;
  updated_at?: string & tags.Format<'date-time'>;
  links?: Links;
}

export interface BatchList extends PageEnvelope {
  data: Batch[];
}
