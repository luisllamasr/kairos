/**
 * Lightweight runtime checks for relationship status parsing.
 * Run: node scripts/test-relationship-status.mjs
 */
import assert from 'node:assert/strict';

function parseRelationshipStatus(value) {
  if (
    value === 'none' ||
    value === 'pending_outgoing' ||
    value === 'pending_incoming' ||
    value === 'friends'
  ) {
    return value;
  }
  return 'none';
}

assert.equal(parseRelationshipStatus('none'), 'none');
assert.equal(parseRelationshipStatus('pending_outgoing'), 'pending_outgoing');
assert.equal(parseRelationshipStatus('pending_incoming'), 'pending_incoming');
assert.equal(parseRelationshipStatus('friends'), 'friends');
assert.equal(parseRelationshipStatus('follow'), 'none');
assert.equal(parseRelationshipStatus(undefined), 'none');

console.log('relationship status parsing: ok');
