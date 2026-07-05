export const EXPERIENCE_CHAT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

export type ExperienceChatEmoji = (typeof EXPERIENCE_CHAT_EMOJIS)[number];

export type ExperienceMessageReaction = {
  user_id: string;
  emoji: string;
  created_at: string;
};

export type ExperienceMessage = {
  id: string;
  experience_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  reactions: ExperienceMessageReaction[];
};
