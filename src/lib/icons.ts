/**
 * Reaction emoji list and lookup set.
 * Used by ReactionPicker and ActionSidebar.
 */
export const REACTIONS: string[] = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

/** Quick membership check — same API (.has) as before */
export const REACTION_MAP = new Set(REACTIONS);
