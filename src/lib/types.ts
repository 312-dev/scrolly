export interface FeedClip {
	id: string;
	originalUrl: string;
	videoPath: string | null;
	audioPath: string | null;
	thumbnailPath: string | null;
	title: string | null;
	artist: string | null;
	albumArt: string | null;
	spotifyUrl: string | null;
	appleMusicUrl: string | null;
	youtubeMusicUrl: string | null;
	addedBy: string;
	addedByUsername: string;
	addedByAvatar: string | null;
	platform: string;
	creatorName: string | null;
	creatorUrl: string | null;
	status: string;
	contentType: string;
	durationSeconds: number | null;
	watched: boolean;
	favorited: boolean;
	favoriteCount: number;
	commentCount: number;
	unreadCommentCount: number;
	viewCount: number;
	reactions: Record<string, { count: number; reacted: boolean }>;
	seenByOthers: boolean;
	createdAt: string;
}

export interface GroupMember {
	id: string;
	username: string;
	avatarPath: string | null;
}

export interface ClipSummary {
	id: string;
	title: string | null;
	platform: string;
	contentType: string;
	addedBy: string;
	addedByUsername: string;
	createdAt: string;
	sizeMb: number;
	thumbnailPath: string | null;
	status: string;
}
