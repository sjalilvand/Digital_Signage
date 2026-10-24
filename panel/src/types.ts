// انواع داده مطابق قرارداد API_CONTRACT.md — منبع واحد حقیقت

export type Role = 'admin' | 'content_manager' | 'publisher' | 'viewer';

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  roles: Role[];
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
}

export type ContentType = 'video' | 'audio' | 'image' | 'pdf' | 'html' | 'text';
export type ContentStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface TextData {
  title: string;
  body: string;
  bg_color: string;
  fg_color: string;
  image_url?: string | null;
}

export interface Content {
  id: string;
  name: string;
  description: string;
  type: ContentType;
  status: ContentStatus;
  error_message: string | null;
  size_bytes: number;
  duration_sec: number | null;
  pdf_pages: number | null;
  width: number | null;
  height: number | null;
  sha256: string;
  thumbnail_url: string | null;
  tags: string[];
  uploaded_by: { id: number; username: string } | null;
  created_at: string;
  expiry_date: string | null;
  html_entry: string | null;
  text_data: TextData | null;
  original_url: string | null;
  superseded_by: string | null;
}

export interface ContentListResponse {
  count: number;
  results: Content[];
}

export interface RenderedAsset {
  id: string;
  kind: string;
  page_number: number | null;
  url: string;
  width: number | null;
  height: number | null;
  size_bytes: number;
}

export interface ContentUsage {
  playlists: { id: string; name: string }[];
  active_deployments: number;
}

export type FitMode = 'contain' | 'cover' | 'stretch';

export interface PlaylistItem {
  id: string;
  order: number;
  content_id: string;
  content_name: string;
  duration_sec: number | null;
  mute: boolean;
  volume: number;
  fit_mode: FitMode;
  background_color: string;
  pdf_pages: number[] | null;
  pdf_seconds_per_page: number;
  repeat_count: number | null;
  audio_bg_content_id: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  created_by: { id: number; username: string } | null;
  created_at: string;
  updated_at: string;
  items: PlaylistItem[];
}

export interface PlaylistItemInput {
  content_id: string;
  duration_sec: number | null;
  mute: boolean;
  volume: number;
  fit_mode: FitMode;
  background_color: string;
  pdf_pages: number[] | null;
  pdf_seconds_per_page: number;
  repeat_count: number | null;
  audio_bg_content_id: string | null;
}

export type ScheduleType = 'immediate' | 'scheduled' | 'recurring' | 'expiry';
export type Recurrence = 'none' | 'daily' | 'weekly';
export type Priority = 'normal' | 'high';

export interface Schedule {
  type: ScheduleType;
  start_at: string | null;
  end_at: string | null;
  recurrence: Recurrence;
  days_of_week: number[];
  time_of_day: string | null;
}

export type DeploymentStatus =
  | 'pending_connection'
  | 'downloading'
  | 'ready'
  | 'active'
  | 'playing'
  | 'failed'
  | 'cancelled'
  | 'replaced';

export interface Deployment {
  id: string;
  version_id: string;
  device_id: string;
  priority: Priority;
  schedule: Schedule;
  status: DeploymentStatus;
  progress: number;
  error: string | null;
  created_by: { id: number; username: string } | null;
  created_at: string;
  activated_at: string | null;
}

export interface PublishResponse {
  version: PublishVersion;
  deployments: Deployment[];
}

export interface PublishVersion {
  id: string;
  playlist_id: string;
  playlist_name: string;
  version_no: number;
  created_by: { id: number; username: string } | null;
  created_at: string;
  snapshot: { items: unknown[] };
}

export type DeviceStatus = 'online' | 'offline';

export interface Device {
  id: string;
  name: string;
  pairing_code: string | null;
  pairing_code_expires_at: string | null;
  model: string | null;
  android_version: string | null;
  app_version: string | null;
  status: DeviceStatus;
  last_seen_at: string | null;
  free_space_mb: number | null;
  active_version_id: string | null;
  active_version_no: number | null;
  playing_item: string | null;
  download_version_id: string | null;
  download_progress: number;
  last_error: string | null;
  is_blocked: boolean;
  created_at: string;
}

export interface DashboardResponse {
  devices: Device[];
  counts: { online: number; offline: number; deploying: number };
}

export type CommandAction =
  | 'refresh_status'
  | 'cancel_pending'
  | 'rollback'
  | 'set_volume'
  | 'pause_playback'
  | 'resume_playback'
  | 'cleanup_files';

export interface DeviceCommand {
  id: number;
  device_id: string;
  action: CommandAction;
  params: Record<string, unknown>;
  status: 'pending' | 'sent' | 'acknowledged' | 'failed';
  created_at: string;
  acknowledged_at: string | null;
  result: string | null;
}

export interface DeviceStatusReport {
  id: number | string;
  device_id: string;
  created_at: string;
  app_version: string | null;
  android_version: string | null;
  model: string | null;
  free_space_mb: number | null;
  network: 'wifi' | 'disconnected' | string | null;
  deployments: { deployment_id: string; status: DeploymentStatus; progress: number | null; error: string | null }[];
  playing: { version_id: string; item_order: number; content_id: string; started_at: string } | null;
}

export interface PlaybackReport {
  id: number | string;
  device_id: string;
  device_name?: string;
  content_id: string;
  content_name?: string;
  version_id: string;
  version_no?: number;
  deployment_id: string | null;
  started_at: string;
  duration_sec: number;
  completed: boolean;
  error: string | null;
}

export interface AuditReport {
  id: number | string;
  user: string | null;
  action: string;
  object: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  results: T[];
}

export interface Settings {
  online_threshold_sec: number;
  pdf_dpi: number;
  pdf_jpeg_quality: number;
  max_upload_gb: number;
  default_poll_interval_sec: number;
}

export interface WsEvent {
  type: 'device.updated' | 'deployment.updated';
  payload: Device | Deployment;
}
