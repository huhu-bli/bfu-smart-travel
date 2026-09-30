export interface AMapPoiLocation {
  lng?: number;
  lat?: number;
  getLng?: () => number;
  getLat?: () => number;
}

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
  InfoWindow: new (options: { content: string; offset?: unknown }) => AMapInfoWindowInstance;
  Pixel: new (x: number, y: number) => unknown;
  Scale: new () => unknown;
  ToolBar: new (options?: Record<string, unknown>) => unknown;
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

function readSiteEnv(key: string): string {
  const bag = (globalThis as { __BFU_ENV__?: Record<string, unknown> }).__BFU_ENV__;
  const runtimeValue = bag?.[key];
  if (typeof runtimeValue === 'string' && !runtimeValue.startsWith('%')) {
    return runtimeValue.trim();
  }
  return '';
}

export function readAmapRuntimeConfig(): { key: string; securityCode: string } {
  return {
    key: readSiteEnv('VITE_AMAP_KEY'),
    securityCode: readSiteEnv('VITE_AMAP_SECURITY_CODE'),
  };
}

export function loadAMap(key: string, securityCode: string): Promise<AMapNamespace> {
  const existing = (globalThis as { AMap?: AMapNamespace }).AMap;
  if (existing) return Promise.resolve(existing);
  if (amapPromise) return amapPromise;

  if (!key) {
    return Promise.reject(new Error('海淀地图尚未配置高德地图 JS API Key。'));
  }

  if (securityCode) {
    (globalThis as { _AMapSecurityConfig?: { securityJsCode: string } })._AMapSecurityConfig = {
      securityJsCode: securityCode,
    };
  }

  const pending = new Promise<AMapNamespace>((resolve, reject) => {
    const script = document.createElement('script');
    const params = new URLSearchParams({
      v: '2.0',
      key,
      plugin: 'AMap.PlaceSearch,AMap.Scale,AMap.ToolBar',
    });
    script.src = `https://webapi.amap.com/maps?${params.toString()}`;
    script.async = true;
    script.onload = () => {
      const loaded = (globalThis as { AMap?: AMapNamespace }).AMap;
      if (loaded) resolve(loaded);
      else reject(new Error('高德地图脚本已加载，但 API 没有初始化。'));
    };
    script.onerror = () => reject(new Error('高德地图资源加载失败，请检查网络或 Key 配置。'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    amapPromise = null;
    throw error;
  });

  amapPromise = pending;
  return pending;
}
