// ═══════════════════════════════════════════════════════════════════════════
// Suggested Copilot questions, grouped by topic.
//
// Every question here is deliberately one the assistant can answer from the
// facts it is given (see tenantFacts / managerFacts in ai.js). Offering a chip
// the Copilot has to decline teaches people it doesn't work, so this list is
// tied to the data — if you add a question, add the fact behind it first.
//
// Anything outside these groups is a job for a human, which is what the
// "message your manager" escalation is for.
// ═══════════════════════════════════════════════════════════════════════════

export const TENANT_GROUPS = [
  {
    id: 'rent',
    label: 'Rent & balance',
    icon: '🏠',
    questions: [
      'What is my rent?',
      'How much do I owe right now?',
      'Have I paid this month?',
      'What period am I paying for?',
    ],
  },
  {
    id: 'arrears',
    label: 'Falling behind',
    icon: '⏳',
    questions: [
      'Am I behind on rent?',
      'How many months am I behind?',
      'How much is carried over from before?',
      'What is my total outstanding balance?',
    ],
  },
  {
    id: 'credit',
    label: 'Paying ahead',
    icon: '💰',
    questions: [
      'Do I have any credit?',
      'How many months does my credit cover?',
      'Until when am I paid up?',
      // Deliberately not "if I pay $200, how far does that take me?" — that
      // needs arithmetic on a number in the question, which the rule-based
      // assistant cannot do. Only offer chips it can actually answer.
      'What happens if I pay extra?',
    ],
  },
  {
    id: 'paying',
    label: 'How to pay',
    icon: '📲',
    questions: [
      'How do I pay my rent?',
      'Which payment methods are accepted?',
      'Where do I send an EcoCash payment?',
      'Can I pay in bank transfer?',
    ],
  },
]

export const MANAGER_GROUPS = [
  {
    id: 'owing',
    label: 'Who owes me',
    icon: '⏳',
    questions: [
      'Who is behind on rent?',
      'How much is outstanding in total?',
      'Who owes the most?',
      'How many months behind is my worst tenant?',
    ],
  },
  {
    id: 'money',
    label: 'Money in',
    icon: '💵',
    questions: [
      'How much have I collected?',
      'How many payments are waiting for approval?',
      'How much is sitting in pending payments?',
    ],
  },
  {
    id: 'ahead',
    label: 'Paid ahead',
    icon: '✅',
    questions: [
      'Who has paid in advance?',
      'How long is their credit good for?',
    ],
  },
  {
    id: 'portfolio',
    label: 'Properties',
    icon: '🏢',
    questions: [
      'How many units do I have?',
      'What is my occupancy?',
      'How many active tenants do I have?',
    ],
  },
]

export function groupsFor(role) {
  return role === 'manager' ? MANAGER_GROUPS : TENANT_GROUPS
}
