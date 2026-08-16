// Standard ABO/Rh whole-blood & red-cell compatibility matrix: which donor
// (unit) blood groups a given recipient (patient) blood group can safely
// receive. This is a basic sanity check, not a substitute for a lab
// cross-match — plasma/platelet compatibility rules differ and are not
// modeled here.
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

export { RECIPIENT_CAN_RECEIVE };
