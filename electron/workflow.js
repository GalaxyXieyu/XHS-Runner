const TOPIC_STATES = [
  'captured',
  'generating',
  'reviewing',
  'approved',
  'published',
  'analyzed',
  'failed',
];

const transitions = {
  captured: ['generating'],
  generating: ['reviewing', 'failed'],
  reviewing: ['approved', 'failed'],
  approved: ['published'],
  published: ['analyzed'],
  analyzed: [],
  failed: ['captured'],
};

function getAllowedTransitions(state) {
  return transitions[state] || [];
}

function canTransition(current, next) {
  return getAllowedTransitions(current).includes(next);
}

module.exports = {
  TOPIC_STATES,
  canTransition,
  getAllowedTransitions,
};
