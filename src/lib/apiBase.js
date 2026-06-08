// Single source of truth for the backend API base URL.
// Override with VITE_API_URL (e.g. when the backend runs on a non-default port,
// such as when macOS AirPlay occupies :5000). Defaults to the conventional :5000.
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
