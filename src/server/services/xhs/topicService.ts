import { supabase } from '../../supabase';
import { canTransition, getAllowedTransitions } from './workflow';

export async function listTopics(limit = 100) {
  const { data } = await supabase
    .from('topics')
    .select('id, title, source, source_id, status, created_at')
    .order('id', { ascending: false })
    .limit(limit);

  return (data || []).map((row: any) => ({
    ...row,
    allowedStatuses: getAllowedTransitions(row.status),
  }));
}

export async function listTopicsByTheme(themeId: number, limit = 50) {
  const { data } = await supabase
    .from('topics')
    .select(`
      id, title, url, author_name, author_avatar_url,
      like_count, collect_count, comment_count, cover_url,
      published_at, status,
      keywords!left(value)
    `)
    .eq('theme_id', themeId)
    .order('like_count', { ascending: false })
    .limit(limit);

  return (data || []).map((row: any) => ({
    ...row,
    keyword: row.keywords?.value || null,
    keywords: undefined
  }));
}

export async function listTopicsByKeyword(keywordId: number, limit = 50) {
  const { data } = await supabase
    .from('topics')
    .select(`
      id, title, url, author_name, author_avatar_url,
      like_count, collect_count, comment_count, cover_url,
      published_at, status
    `)
    .eq('keyword_id', keywordId)
    .order('like_count', { ascending: false })
    .limit(limit);

  return data || [];
}

export async function updateTopicStatus(id: number, nextStatus: string) {
  const { data: current } = await supabase
    .from('topics')
    .select('status')
    .eq('id', id)
    .single();

  if (!current) {
    throw new Error('Topic not found');
  }
  if (!canTransition(current.status, nextStatus)) {
    throw new Error(`Invalid transition from ${current.status} to ${nextStatus}`);
  }

  const { data } = await supabase
    .from('topics')
    .update({ status: nextStatus })
    .eq('id', id)
    .select('id, status')
    .single();

  return data;
}

export async function forceUpdateTopicStatus(id: number, nextStatus: string) {
  const { data } = await supabase
    .from('topics')
    .update({ status: nextStatus })
    .eq('id', id)
    .select('id, status')
    .single();

  return data;
}
