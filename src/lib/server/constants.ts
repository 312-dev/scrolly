/** Valid retention period options (days). null = no retention policy. */
export const VALID_RETENTION_DAYS = [null, 7, 14, 30, 60, 90] as const;

/** Valid max file size options (MB). null = no limit. */
export const VALID_MAX_FILE_SIZES = [25, 50, 100, 200, 500, 750, 1000, null] as const;

/** Allowed reaction emojis. */
export const ALLOWED_EMOJIS = ['❤️', '👍', '👎', '😂', '‼️', '❓'] as const;
