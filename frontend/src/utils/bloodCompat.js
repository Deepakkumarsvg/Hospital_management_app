// Mirrors backend/src/utils/bloodCompat.js — lets the Issue modal warn
// instantly, before the round-trip to the server (which enforces the same
// rule). Basic ABO/Rh sanity check only, not a substitute for a lab
// cross-match.
const RECIPIENT_CAN_RECEIVE = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

export function isCompatible(unitBloodGroup, recipientBloodGroup) {
  const allowed = RECIPIENT_CAN_RECEIVE[recipientBloodGroup];
  if (!allowed) return true; // unknown/unset recipient group — can't evaluate, don't block
  return allowed.includes(unitBloodGroup);
}
