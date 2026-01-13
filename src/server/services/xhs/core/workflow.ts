export const TOPIC_STATES = [
  'captured',
  'generating',
  'reviewing',
  'approved',
  'published',
  'analyzed',
  'failed',
];

const transitions: Record<string, string[]> = {
  captured: ['generating'],
  generating: ['reviewing', 'failed'],
  reviewing: ['approved', 'failed'],
  approved: ['published'],
  published: ['analyzed'],
  analyzed: [],
  failed: ['captured'],
};

export function getAllowedTransitions(state: string) {
  return transitions[state] || [];
}

export function canTransition(current: string, next: string) {
  return getAllowedTransitions(current).includes(next);
}
