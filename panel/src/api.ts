import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { useAuth } from './store/auth';

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// نمونه جدا برای refresh تا interceptor روی آن اجرا نشود
const rawApi = axios.create({ baseURL: API_BASE });

interface RetryConfig extends AxiosRequestConfig {
  _retry?: boolean;
}

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refresh = useAuth.getState().refresh;
  if (!refresh) return null;
  try {
    const { data } = await rawApi.post<{ access: string }>('/api/v1/auth/refresh/', { refresh });
    useAuth.getState().setAccess(data.access);
    return data.access;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const access = useAuth.getState().access;
  if (access && config.headers) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    // صفحات عمومی (login) را دوباره تلاش نکن
    if (original && status === 401 && !original._retry && !original.url?.includes('/auth/login')) {
      original._retry = true;
      if (!refreshing) refreshing = doRefresh();
      const access = await refreshing;
      refreshing = null;
      if (access) {
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${access}` };
        return api.request(original);
      }
      // refresh هم نامعتبر بود → خروج
      useAuth.getState().logout();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

/** استخراج پیام فارسی خطا از پاسخ سرور */
export function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as unknown;
    if (typeof data === 'string') return data;
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (typeof d.detail === 'string') return d.detail;
      const parts: string[] = [];
      for (const [k, v] of Object.entries(d)) {
        const val = Array.isArray(v) ? v.join('، ') : String(v);
        parts.push(k === 'non_field_errors' ? val : `${k}: ${val}`);
      }
      if (parts.length) return parts.join(' | ');
    }
    if (err.code === 'ERR_NETWORK') return 'خطا در ارتباط با سرور';
  }
  return 'خطای نامشخص رخ داد';
}

// ---------------------------------------------------------------- Auth
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ access: string; refresh: string; user: import('./types').User }>('/api/v1/auth/login/', {
      username,
      password,
    }),
  refresh: (refresh: string) => api.post<{ access: string }>('/api/v1/auth/refresh/', { refresh }),
};

// ---------------------------------------------------------------- Users
export const usersApi = {
  list: () => api.get<import('./types').User[] | import('./types').PaginatedResponse<import('./types').User>>('/api/v1/users/'),
  create: (body: Partial<import('./types').User> & { password?: string }) => api.post('/api/v1/users/', body),
  update: (id: number, body: Partial<import('./types').User> & { password?: string }) =>
    api.patch(`/api/v1/users/${id}/`, body),
  remove: (id: number) => api.delete(`/api/v1/users/${id}/`),
};

// ---------------------------------------------------------------- Contents
export interface ContentQuery {
  type?: string;
  status?: string;
  search?: string;
  tag?: string;
  page?: number;
  page_size?: number;
}

export const contentsApi = {
  list: (params: ContentQuery = {}) =>
    api.get<import('./types').ContentListResponse | import('./types').Content[]>('/api/v1/contents/', { params }),
  get: (id: string) => api.get<import('./types').Content>(`/api/v1/contents/${id}/`),
  create: (formData: FormData, onProgress?: (pct: number) => void) =>
    api.post('/api/v1/contents/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    }),
  update: (id: string, body: Record<string, unknown>) => api.patch<import('./types').Content>(`/api/v1/contents/${id}/`, body),
  remove: (id: string) => api.delete(`/api/v1/contents/${id}/`),
  replace: (id: string, formData: FormData, onProgress?: (pct: number) => void) =>
    api.post<import('./types').Content>(`/api/v1/contents/${id}/replace/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    }),
  usage: (id: string) => api.get<import('./types').ContentUsage>(`/api/v1/contents/${id}/usage/`),
  assets: (id: string) => api.get<import('./types').RenderedAsset[]>(`/api/v1/contents/${id}/assets/`),
};

// ---------------------------------------------------------------- Playlists
export const playlistsApi = {
  list: () =>
    api.get<import('./types').Playlist[] | import('./types').PaginatedResponse<import('./types').Playlist>>('/api/v1/playlists/'),
  get: (id: string) => api.get<import('./types').Playlist>(`/api/v1/playlists/${id}/`),
  create: (body: Record<string, unknown>) => api.post<import('./types').Playlist>('/api/v1/playlists/', body),
  update: (id: string, body: Record<string, unknown>) => api.patch<import('./types').Playlist>(`/api/v1/playlists/${id}/`, body),
  remove: (id: string) => api.delete(`/api/v1/playlists/${id}/`),
  setItems: (id: string, items: import('./types').PlaylistItemInput[]) =>
    api.put<import('./types').Playlist>(`/api/v1/playlists/${id}/items/`, items),
};

// ---------------------------------------------------------------- Publish
export const publishApi = {
  versions: () => api.get<import('./types').PaginatedResponse<import('./types').PublishVersion> | import('./types').PublishVersion[]>('/api/v1/publish-versions/'),
  version: (id: string) => api.get<import('./types').PublishVersion>(`/api/v1/publish-versions/${id}/`),
  publish: (body: { playlist_id: string; device_ids: string[]; priority: string; schedule: import('./types').Schedule }) =>
    api.post<import('./types').PublishResponse>('/api/v1/publish/', body),
  deployments: (params: { device?: string; status?: string; version?: string } = {}) =>
    api.get<
      import('./types').Deployment[] | import('./types').PaginatedResponse<import('./types').Deployment>
    >('/api/v1/deployments/', { params }),
  cancelDeployment: (id: string) => api.post(`/api/v1/deployments/${id}/cancel/`),
};

// ---------------------------------------------------------------- Devices
export const devicesApi = {
  list: () =>
    api.get<import('./types').Device[] | import('./types').PaginatedResponse<import('./types').Device>>('/api/v1/devices/'),
  create: (body: { name: string; description?: string }) => api.post<import('./types').Device>('/api/v1/devices/', body),
  get: (id: string) => api.get<import('./types').Device>(`/api/v1/devices/${id}/`),
  update: (id: string, body: Record<string, unknown>) => api.patch<import('./types').Device>(`/api/v1/devices/${id}/`, body),
  regenerateToken: (id: string) => api.post<import('./types').Device>(`/api/v1/devices/${id}/regenerate-token/`),
  commands: (id: string, body: { action: string; params?: Record<string, unknown> }) =>
    api.post<import('./types').DeviceCommand>(`/api/v1/devices/${id}/commands/`, body),
  statusHistory: (id: string, limit = 50) =>
    api.get<
      import('./types').DeviceStatusReport[] | import('./types').PaginatedResponse<import('./types').DeviceStatusReport>
    >(`/api/v1/devices/${id}/status-history/`, { params: { limit } }),
  rollback: (id: string) => api.post(`/api/v1/devices/${id}/rollback/`),
};

// ---------------------------------------------------------------- Dashboard
export const dashboardApi = {
  get: () => api.get<import('./types').DashboardResponse>('/api/v1/dashboard/'),
};

// ---------------------------------------------------------------- Reports
export const reportsApi = {
  playback: (params: { device?: string; from?: string; to?: string; page?: number } = {}) =>
    api.get<import('./types').PaginatedResponse<import('./types').PlaybackReport>>('/api/v1/reports/playback/', { params }),
  audit: (params: { page?: number } = {}) =>
    api.get<import('./types').PaginatedResponse<import('./types').AuditReport>>('/api/v1/reports/audit/', { params }),
};

// ---------------------------------------------------------------- Settings
export const settingsApi = {
  get: () => api.get<import('./types').Settings>('/api/v1/settings/'),
  update: (body: Partial<import('./types').Settings>) => api.patch<import('./types').Settings>('/api/v1/settings/', body),
};

export default api;
