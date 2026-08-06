export const LOCAL_TIMEZONE = 'Asia/Tokyo';
export const API_SERVER_BASE_URL = import.meta.env.VITE_API_SERVER_BASE_URL;
export const ENABLE_DEBUG_MODE =
  import.meta.env.VITE_ENABLE_DEBUG_MODE === 'true';
export const CLIENT_VERSION = import.meta.env.VITE_BUILD_VERSION || 'dynamic';
