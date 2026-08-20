export type Profile = {
  id: string;
  nickname?: string;
  email?: string | null;
  display_name?: string | null;
  role: "user" | "admin";
  credits: number;
  total_spent_baht?: number;
  total_jobs?: number;
  is_banned?: boolean;
};

export type Package = {
  id: number;
  name: string;
  slug: string;
  hearts: number;
  price_baht: number;
  description?: string | null;
  badge?: string | null;
  is_active?: boolean;
  sort_order?: number;
};

export type Job = {
  id: string;
  user_id: string;
  package_id?: number | null;
  devplay_email: string;
  target_hearts: number;
  queue_position?: number | null;
  status: string;
  hearts_collected: number;
  current_session?: number;
  total_sessions?: number;
  progress_percent: number;
  progress_message?: string | null;
  estimated_duration_minutes?: number | null;
  estimated_wait_minutes?: number | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
};

export type Topup = {
  id: string;
  package_id: number;
  quantity: number;
  amount_baht?: number | null;
  status: string;
  credit_status?: string | null;
  hearts_credited: number;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: string | null;
};

export type GameFriend = {
  player_id: string;
  nickname: string;
  level: number;
  last_seen_at?: string | null;
  favorite: boolean;
  gift_count: number;
  trophy_count: number;
  looks_like_guest: boolean;
};

export type FriendListResult = {
  email: string;
  mid?: string | null;
  level?: number | null;
  friend_cap?: number | null;
  friend_count: number;
  friends: GameFriend[];
};

export type FriendDeleteResult = {
  ok: boolean;
  requested: number;
  removed: number;
  failed: { player_id: string; error: string }[];
  skipped_not_friend: number;
  friend_count: number;
  friends: GameFriend[];
};
