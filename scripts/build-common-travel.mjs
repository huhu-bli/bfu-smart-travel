import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateImport } from '../server/placeValidation.mjs';
import { wgs84ToGcj02 } from './support/wgs84-gcj02.mjs';

export function buildCommonTravelImport(manifest) {
  const places = manifest.places.map(({ coordinate, reviewNote, ...place }) => {
    if (coordinate.system !== 'wgs84' || coordinate.globe !== 'Q2' ||
        (coordinate.precision != null && coordinate.precision > 0.001) ||
        coordinate.lng < 115.4 || coordinate.lng > 117.6 || coordinate.lat < 39.4 || coordinate.lat > 41.1) {
      throw new Error(`请核对北京地点坐标：${place.id}`);
    }
    const [lng, lat] = wgs84ToGcj02(coordinate.lng, coordinate.lat);
    return { ...place, operation: 'create', scope: 'city', coordinateSystem: 'gcj02',
      lng: Number(lng.toFixed(6)), lat: Number(lat.toFixed(6)),
      tips: `${place.tips} 坐标为地点参考位置，不代表已核实的开放入口；到达时请按官方入场指引导航。`,
      sources: [...place.sources, { kind: 'manual', reference: coordinate.source,
        verificationStatus: 'unverified', verifiedAt: null }],
    };
  });
  validateImport({ schemaVersion: 1, places });
  return { schemaVersion: 1, places };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(await readFile(new URL('../database/catalogs/beijing-common-travel.provenance.json', import.meta.url), 'utf8'));
  const document = buildCommonTravelImport(manifest);
  await writeFile(new URL('../database/catalogs/beijing-common-travel.json', import.meta.url), JSON.stringify(document, null, 2) + '\n');
  console.log(`已生成 ${document.places.length} 条待审核导入记录，尚未连接或修改数据库。`);
}
