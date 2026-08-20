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

// ── บัญชีเกมที่ save ไว้ (ไม่มีรหัสผ่านส่งกลับมา) ──────────────────────────
export type SavedAccount = {
  id: string;
  label: string;
  email: string;
  mid?: string | null;
  nickname?: string | null;
  created_at?: string | null;
};

// ── เช็คข้อมูลไอดี (proxy จาก ngmx) ──────────────────────────────────────
// ตัว item ในคลัง: image เป็น "tag" ที่เอาไปต่อเป็น URL รูปผ่าน backend เรา
// (materials/tickets/others จะ image เป็น "" เพราะ ngmx ไม่ได้ map รูปให้)
export type AccountItem = {
  name: string;
  image: string;
  count: number;
  level: number;
};

export type AccountWallet = {
  coin: number;
  gem: number;
  life: number;
  key: number;
  powder: number;
  medal: number;
  shard: number;
  party_ticket: number;
};

export type AccountOwned = {
  cookies: AccountItem[];
  pets: AccountItem[];
  treasures: AccountItem[];
  materials: AccountItem[];
  tickets: AccountItem[];
  others: AccountItem[];
  unknown: number;
};

export type AccountInspectResult = {
  mid: string;
  nickname?: string | null;
  level: number;
  exp: number;
  member_seq?: number | string | null;
  wallet: AccountWallet;
  refill?: { life: number; key: number; party_ticket: number } | null;
  equipped?: {
    cookies: AccountItem[];
    pets: AccountItem[];
    treasures: AccountItem[];
  } | null;
  owned: AccountOwned;
  episodes: number[];
  current_episode?: number | null;
  mails: number;
  friend_invites: number;
  party_tier: number;
  trophies: number;
  points?: { today: number; current: number; gift_count: number } | null;
};
