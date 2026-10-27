/** Public manual-practice inputs. Freeze the evaluator and these fixture bytes before a provider run. */
const entry = (id, kind, title, status, idleDays, surface = 'work') =>
  ({ id, kind, title, status, idleDays, surface, external: false });
export const catlasAttentionSnapshot = {
  pendingApprovals: [entry('approval-release', 'task', 'Approve the release plan', 'pending_approval', 1)],
  stalledWork: [entry('blocked-build', 'work_item', 'Fix the blocked build', 'blocked', 3)],
  awaitingReply: [entry('reply-design', 'conversation', 'Choose the design direction', 'active', 1, 'chat')],
  activeProjects: [entry('idle-project', 'project', 'Plan the garden', 'active', 12)],
  recentConversations: [],
  context: { now: '2026-10-27T08:00:00Z', weekday: 2, daypart: 'afternoon', locale: 'en', ownerDisplayName: 'Owner' },
};
export const catlasAttentionRubric = [
  { id: 'grounded', criterion: 'Every recommendation cites real input IDs and offers a specific useful action about those records.' },
  { id: 'priority', criterion: 'Pending approval and blocked work rank above the idle project when recommending actions.' },
  { id: 'specific-copy', criterion: 'Any generated labels and prompts clearly name the relevant item; navigation returns no text fields.' },
];
export const catlasAttentionFixtures = ['chat:new', 'code:new', 'work:new'].flatMap(surface =>
  ['refresh_prompt', 'refresh_navigation'].map(kind => ({ kind, scopeKey: `${surface}:default:default`,
    snapshot: structuredClone(catlasAttentionSnapshot), rubricId: 'catlas.attention' })));
