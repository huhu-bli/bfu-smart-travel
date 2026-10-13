export interface AMapPoiLocation {
  lng?: number;
  lat?: number;
  getLng?: () => number;
  getLat?: () => number;
}

export interface AMapLngLatInstance {
  lng?: number;
  lat?: number;
  getLng?: () => number;
  getLat?: () => number;
}

export interface AMapWalkRoute {
  time?: number | string;
  duration?: number | string;
  distance?: number | string;
  steps?: Array<{ path?: AMapLngLatInstance[] }>;
}

export interface AMapWalkingResult {
  routes?: AMapWalkRoute[];
}

export interface AMapTransferPlan {
  time?: number | string;
  duration?: number | string;
  distance?: number | string;
  walking_distance?: number | string;
  segments?: Array<{
    transit_mode?: string;
    transit?: { path?: AMapLngLatInstance[] };
  }>;
}

export interface AMapTransferResult {
  plans?: AMapTransferPlan[];
}

export type AMapRouteResult = AMapWalkingResult | AMapTransferResult | string;

export interface AMapPoi {
  id?: string;
  name?: string;
  address?: string | string[];
  adname?: string;
  type?: string;
  location?: AMapPoiLocation | string;
}

interface AMapPlaceSearchResult {
  poiList?: {
    pois?: AMapPoi[];
  };
}

export interface AMapMarkerInstance {
  on: (event: string, handler: () => void) => void;
}

export interface AMapPolylineInstance {}

export interface AMapInfoWindowInstance {
  open: (map: AMapMapInstance, position: [number, number]) => void;
  setContent: (content: string) => void;
}

export interface AMapMapInstance {
  add: (items: unknown | unknown[]) => void;
  remove: (items: unknown | unknown[]) => void;
  addControl: (control: unknown) => void;
  setFitView: (overlays?: unknown[], immediately?: boolean, avoid?: number[]) => void;
  setZoomAndCenter: (zoom: number, center: [number, number]) => void;
  destroy: () => void;
}

export interface AMapNamespace {
  Map: new (
    container: HTMLElement,
    options: { center: [number, number]; zoom: number; viewMode: string },
  ) => AMapMapInstance;
  Marker: new (options: {
    position: [number, number];
    title?: string;
    label?: { content: string; direction: string; offset?: unknown };
  }) => AMapMarkerInstance;
  Polyline: new (options: {
    path: Array<[number, number]>;
    strokeColor: string;
    strokeWeight: number;
    strokeOpacity: number;
    showDir?: boolean;
  }) => AMapPolylineInstance;
  InfoWindow: new (options: { content: string; offset?: unknown }) => AMapInfoWindowInstance;
  Pixel: new (x: number, y: number) => unknown;
  Scale: new () => unknown;
  ToolBar: new (options?: Record<string, unknown>) => unknown;
  Walking: new (options?: Record<string, unknown>) => {
    search: (
      origin: [number, number],
      destination: [number, number],
      callback: (status: string, result: AMapRouteResult) => void,
    ) => void;
  };
  Transfer: new (options?: Record<string, unknown>) => {
    search: (
      origin: [number, number],
      destination: [number, number],
      callback: (status: string, result: AMapRouteResult) => void,
    ) => void;
  };
  TransferPolicy?: { LEAST_TIME?: number };
  PlaceSearch: new (options: {
    city: string;
    citylimit: boolean;
    pageSize: number;
    pageIndex: number;
    extensions: string;
  }) => {
    search: (
      keyword: string,
      callback: (status: string, result: AMapPlaceSearchResult | string) => void,
    ) => void;
  };
}

let amapPromise: Promise<AMapNamespace> | null = null;

type AmapEnvKey = 'VITE_AMAP_KEY' | 'VITE_AMAP_SECURITY_CODE';

function readBuildEnv(key: AmapEnvKey): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const value = env?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function readAmapRuntimeConfig(): { key: string; securityCode: string } {
  return {
    key: readBuildEnv('VITE_AMAP_KEY'),
    securityCode: readBuildEnv('VITE_AMAP_SECURITY_CODE'),
  };
}

export function loadAMap(key: string, securityCode: string): Promise<AMapNamespace> {
  const existing = (globalThis as { AMap?: AMapNamespace }).AMap;
  if (existing) return Promise.resolve(existing);
  if (amapPromise) return amapPromise;

  if (!key) {
    return Promise.reject(new Error('北京地图尚未配置高德地图 JS API Key。'));
  }

  if (securityCode) {
    (globalThis as { _AMapSecurityConfig?: { securityJsCode: string } })._AMapSecurityConfig = {
      securityJsCode: securityCode,
    };
  }

  const pending = new Promise<AMapNamespace>((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    let loaded = false;
    const startedAt = Date.now();
    const finish = (result: AMapNamespace | Error) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      if (result instanceof Error) {
        script.remove();
        reject(result);
      } else resolve(result);
    };
    const checkReady = () => {
      if (settled) return;
      const api = (globalThis as { AMap?: AMapNamespace }).AMap;
      if (api?.Map) {
        finish(api);
      } else if (Date.now() - startedAt >= 8000) {
        finish(new Error(loaded
          ? '高德地图脚本已加载，但 API 未初始化。请检查 JS API Key、域名白名单和安全密钥。'
          : '高德地图连接超时，请检查网络或 Key 配置。'));
      } else {
        timer = globalThis.setTimeout(checkReady, 100);
      }
    };
    let timer = globalThis.setTimeout(checkReady, 100);
    const params = new URLSearchParams({
      v: '2.0',
      key,
      plugin: 'AMap.PlaceSearch,AMap.Scale,AMap.ToolBar,AMap.Walking,AMap.Transfer',
    });
    script.src = 'https://webapi.amap.com/maps?' + params.toString();
    script.async = true;
    script.onload = () => { loaded = true; };
    script.onerror = () => finish(new Error('高德地图资源加载失败，请检查网络或 Key 配置。'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    amapPromise = null;
    throw error;
  });

  amapPromise = pending;
  return pending;
}
