import { readFile, stat, writeFile } from 'node:fs/promises';
import { openScriptDatabase } from './scriptDatabase.mjs';
import { PlaceValidationError, validateImport } from '../server/placeValidation.mjs';
import { checkDataQuality, exportPlaces, importPlaces, placeHistory, setPlaceStatus } from '../server/placeMaintenance.mjs';

const [command, ...args] = process.argv.slice(2);
const optionNames = { validate: [], import: ['apply', 'actor'], export: ['id'], history: [],
  archive: ['version', 'apply', 'actor'], restore: ['version', 'apply', 'actor'], check: [] };
let db;
try {
  if (!Object.hasOwn(optionNames, command)) throw new PlaceValidationError('请选择 validate/import/export/history/archive/restore/check。');
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const key = arg.slice(2);
    if (!optionNames[command].includes(key) || Object.hasOwn(options, key)) throw new PlaceValidationError(`不支持或重复的参数：${arg}`);
    if (key === 'apply') options[key] = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new PlaceValidationError(`${arg} 缺少值。`);
      options[key] = args[++i];
    }
  }
  const count = command === 'check' ? 0 : 1;
  if (positional.length !== count) throw new PlaceValidationError('请提供一个 JSON 文件路径；history/archive/restore 提供地点 id；check 不接受额外参数。');
  let document;
  if (['validate', 'import'].includes(command)) {
    if ((await stat(positional[0])).size > 2 * 1024 * 1024) throw new PlaceValidationError('导入文件最多 2 MB。');
    try { document = JSON.parse(await readFile(positional[0], 'utf8')); }
    catch { throw new PlaceValidationError('无法解析 JSON，请检查逗号、双引号和文件编码。'); }
    const records = validateImport(document);
    if (command === 'validate') {
      console.log(JSON.stringify({ valid: true, records: records.length, note: '格式校验通过；入库预览还会校验数据库编号和版本。' }));
      process.exitCode = 0;
    }
  }
  if (command !== 'validate') {
    db = await openScriptDatabase();
    let result;
    if (command === 'import') result = await importPlaces(db, document, options);
    if (command === 'export') {
      result = await exportPlaces(db, options.id);
      await writeFile(positional[0], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
      result = { file: positional[0], records: result.places.length, note: '有效地点的可编辑导出，不包含归档和历史，不代替数据库备份。' };
    }
    if (command === 'history') result = await placeHistory(db, positional[0]);
    if (['archive', 'restore'].includes(command)) result = await setPlaceStatus(db, positional[0], Number(options.version), command === 'archive' ? 'archived' : 'active', options);
    if (command === 'check') result = await checkDataQuality(db);
    console.log(JSON.stringify(result, null, 2));
    if (['import', 'archive', 'restore'].includes(command) && !options.apply) console.log('当前为预览，全部已回滚；确认后添加 --apply 才保存。');
  }
} catch (error) {
  console.error(error instanceof PlaceValidationError ? error.message
    : error.code === 'EEXIST' ? '目标文件已存在，请换一个文件名，避免覆盖。'
    : error.code === 'ENOENT' ? '找不到输入文件，请核对路径。'
    : '维护失败。请检查数据库连接、迁移状态与权限；不会输出连接密码。');
  process.exitCode = 1;
} finally { if (db) await db.close(); }
