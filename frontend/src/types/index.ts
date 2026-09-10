export type Profile = {
  id: string;
  nickname?: string;
  email?: string | null;
  display_name?: string | null;
  role: "user" | "admin";
  // points = กระเป๋าเงินที่เติมค้างไว้ด้วยอั่งเปา (1 บาท = 1 พอยท์)
  // hearts = ยอดหัวใจที่ใช้สั่งงานฟาร์มได้จริง
  points: number;
  hearts: number;
  total_spent_baht?: number;
  total_jobs?: number;
  is_banned?: boolean;
};

export type Package = {
  id: number;
  name: string;
  slug: string;
  // จำนวนหัวใจที่ได้ (ชื่อคอลัมน์ยังเป็น points ด้วยเหตุผลทางประวัติศาสตร์)
  points: number;
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
  payment_method?: "heart" | "point" | "angpao";
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
  package_id?: number | null;
  quantity: number;
  amount_baht?: number | null;
  status: string;
  credit_status?: string | null;
  credit_target?: "points" | "hearts";
  points_credited: number;
  hearts_credited?: number;
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

// คำขอเป็นเพื่อนใช้การ์ดหน้าตาเดียวกับเพื่อน แค่มีเวลาที่ขอเพิ่มเข้ามา
export type GameFriendRequest = GameFriend & {
  request_time?: string | null;
};

export type FriendListResult = {
  email: string;
  mid?: string | null;
  level?: number | null;
  friend_cap?: number | null;
  friend_count: number;
  friends: GameFriend[];
  request_count: number;
  requests: GameFriendRequest[];
};

export type FriendRejectResult = {
  ok: boolean;
  requested: number;
  rejected: number;
  failed: { player_id: string; error: string }[];
  skipped_not_pending: number;
  friend_cap?: number | null;
  friend_count: number;
  request_count: number;
  requests: GameFriendRequest[];
};

export type FriendAcceptResult = {
  ok: boolean;
  requested: number;
  accepted: number;
  failed: { player_id: string; error: string }[];
  skipped_not_pending: number;
  // ตัดออกเพราะเพื่อนเต็ม 300 แล้ว ไม่ใช่เพราะคำขอหาย
  skipped_cap: number;
  friend_cap?: number | null;
  friend_count: number;
  request_count: number;
  requests: GameFriendRequest[];
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

// ── เครื่องมือฟรีที่ยืมจาก ngmx (ปั๊มผง / เปิดกล่อง / ตี + สมบัติ) ──────────
// รูปร่างตามที่ ngmx ตอบกลับมาตรง ๆ — backend เราส่งต่อโดยไม่แปลง
// (ดู backend/services/ngmx_service.py)

export type PowderScan = {
  mid: string;
  nickname?: string | null;
  coin: number;
  powder: number;
  box_price: number;
};

export type GiftBoxScan = {
  mid: string;
  nickname?: string | null;
  boxes: number;
};

export type TreasureItem = {
  uuid: string;
  group_seq: number;
  name: string;
  grade: string;
  upgrade_group: string;
  image_tag: string;
  has_icon: boolean;
  plus: number;
  maxed: boolean;
  upgradeable: boolean;
  next_price: number;
  next_percent: number | null;
};

// บันไดราคาอัปเกรดของแต่ละเกรด: ขั้น +plus ใช้กี่เหรียญ และโอกาสสำเร็จกี่ %
export type TreasureLadderStep = {
  plus: number;
  price: number;
  money_type: number;
  percent: number | null;
};

export type TreasureScan = {
  mid: string;
  nickname?: string | null;
  coin: number;
  gem: number;
  max_plus: number;
  max_picks: number;
  ladders: Record<string, TreasureLadderStep[]>;
  treasures: TreasureItem[];
};

export type ToolSummaryRow = { label: string; value: string; sub?: string };

export type ToolJobResult = {
  title?: string;
  delivered?: number;
  requested?: number;
  target?: string;
  summary?: ToolSummaryRow[];
  next_step?: string;
};

export type ToolJob = {
  id: string;
  status: string;
  progress: number;
  step: string;
  units: number;
  delivered: number;
  queue_position: number;
  result: ToolJobResult | null;
  error: { message?: string } | null;
};
