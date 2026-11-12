import { medicationNextAt } from './public/medication-schedule.js';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { planMethods } from './public/feeding-options.js';
import { abnormalCategories } from './public/abnormal-options.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 18744);
const dataDir = process.env.DATA_DIR || join(__dirname, 'data');
const publicDir = join(__dirname, 'public');
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, 'babycare.sqlite'));
const hadCommonMedicines=Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='common_medicines'").get());
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    interval_hours REAL NOT NULL DEFAULT 3,
    amount_ml INTEGER NOT NULL DEFAULT 120,
    feeding_type TEXT NOT NULL DEFAULT 'formula',
    formula_brand TEXT NOT NULL DEFAULT '',
    formula_stage INTEGER NOT NULL DEFAULT 1
  );
  INSERT OR IGNORE INTO settings (id, interval_hours) VALUES (1, 3);
  CREATE TABLE IF NOT EXISTS feedings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fed_at TEXT NOT NULL,
    amount_ml INTEGER CHECK (amount_ml > 0 AND amount_ml <= 2000),
    feeding_method TEXT NOT NULL DEFAULT 'unknown',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((feeding_method = 'direct' AND amount_ml IS NULL) OR (feeding_method IN ('formula','breast_bottle','unknown') AND amount_ml IS NOT NULL))
  );
  CREATE INDEX IF NOT EXISTS idx_feedings_fed_at ON feedings (fed_at DESC);
  CREATE TABLE IF NOT EXISTS baby_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '',
    birthday TEXT
  );
  INSERT OR IGNORE INTO baby_profile (id, name) VALUES (1, '');
  CREATE TABLE IF NOT EXISTS weights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    measured_on TEXT NOT NULL UNIQUE,
    weight_grams INTEGER NOT NULL CHECK (weight_grams BETWEEN 100 AND 100000),
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS lengths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    measured_on TEXT NOT NULL UNIQUE,
    length_mm INTEGER NOT NULL CHECK (length_mm BETWEEN 100 AND 2500),
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS stools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    photo BLOB NOT NULL,
    photo_type TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_stools_time ON stools (occurred_at DESC);
  CREATE TABLE IF NOT EXISTS diapers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_diapers_time ON diapers (occurred_at DESC);
  CREATE TABLE IF NOT EXISTS abnormalities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at TEXT NOT NULL,
    observations TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    photo BLOB,
    photo_type TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_abnormalities_time ON abnormalities (occurred_at DESC);
  CREATE TABLE IF NOT EXISTS common_medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    unit TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS medication_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medicine_id INTEGER NOT NULL,
    dose TEXT NOT NULL,
    unit TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('daily','interval')),
    daily_time TEXT,
    timezone_offset INTEGER NOT NULL DEFAULT -480,
    interval_hours REAL,
    start_at TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at TEXT NOT NULL,
    medicines TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    photo BLOB,
    photo_type TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_medications_time ON medications (occurred_at DESC);
`);
// Seed names only on first creation; units depend on the family's actual formulation.
if(!hadCommonMedicines)db.prepare("INSERT INTO common_medicines (name) VALUES ('维生素AD'),('维生素D3')").run();
try { db.exec('ALTER TABLE settings ADD COLUMN amount_ml INTEGER NOT NULL DEFAULT 120'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec("ALTER TABLE settings ADD COLUMN feeding_type TEXT NOT NULL DEFAULT 'formula'"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec("ALTER TABLE settings ADD COLUMN formula_brand TEXT NOT NULL DEFAULT ''"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec('ALTER TABLE settings ADD COLUMN formula_stage INTEGER NOT NULL DEFAULT 1'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try {
  db.exec('ALTER TABLE weights ADD COLUMN recorded_at TEXT');
  db.exec("UPDATE weights SET recorded_at = measured_on || 'T12:00:00.000Z' WHERE recorded_at IS NULL");
} catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec('ALTER TABLE abnormalities ADD COLUMN photo BLOB'); } catch (error) { if (!String(error.message).includes('duplicate column name')) throw error; }
try { db.exec('ALTER TABLE abnormalities ADD COLUMN photo_type TEXT'); } catch (error) { if (!String(error.message).includes('duplicate column name')) throw error; }

// Rebuild only the old feedings schema, preserving records, IDs, timestamps and sequence.
if (db.prepare('PRAGMA table_info(feedings)').all().find(column=>column.name==='amount_ml').notnull) {
  const sequence=Number(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='feedings'").get()?.seq||0);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`ALTER TABLE feedings RENAME TO feedings_legacy;
      CREATE TABLE feedings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fed_at TEXT NOT NULL,
        amount_ml INTEGER CHECK (amount_ml > 0 AND amount_ml <= 2000),
        feeding_method TEXT NOT NULL DEFAULT 'unknown',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK ((feeding_method = 'direct' AND amount_ml IS NULL) OR (feeding_method IN ('formula','breast_bottle','unknown') AND amount_ml IS NOT NULL))
      );
      INSERT INTO feedings (id,fed_at,amount_ml,feeding_method,note,created_at)
        SELECT id,fed_at,amount_ml,'unknown',note,created_at FROM feedings_legacy;
      DROP TABLE feedings_legacy;
      CREATE INDEX idx_feedings_fed_at ON feedings (fed_at DESC);`);
    db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='feedings'").run(sequence);
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
}
try { db.exec("ALTER TABLE settings ADD COLUMN breast_method TEXT NOT NULL DEFAULT 'direct'"); } catch(error) {if(!String(error.message).includes('duplicate column name'))throw error;}

for(const column of ['birth_weight_grams','birth_length_mm']){
  if(!db.prepare('PRAGMA table_info(baby_profile)').all().some(item=>item.name===column))db.exec(`ALTER TABLE baby_profile ADD COLUMN ${column} INTEGER`);
}

const statements = {
  list: db.prepare('SELECT id, fed_at, amount_ml, feeding_method, note, created_at FROM feedings ORDER BY fed_at DESC LIMIT ?'),
  countToday: db.prepare('SELECT COUNT(*) AS count FROM feedings WHERE fed_at >= ? AND fed_at < ?'),
  amountToday: db.prepare('SELECT COALESCE(SUM(amount_ml), 0) AS amount FROM feedings WHERE fed_at >= ? AND fed_at < ?'),
  feedingWindow: db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(amount_ml), 0) AS amount, SUM(CASE WHEN feeding_method='direct' THEN 1 ELSE 0 END) AS direct_count FROM feedings WHERE fed_at > ? AND fed_at <= ?"),
  todayFeedingTimes: db.prepare('SELECT fed_at FROM feedings WHERE fed_at >= ? AND fed_at < ? ORDER BY fed_at ASC'),
  stoolCountToday: db.prepare('SELECT COUNT(*) AS count FROM stools WHERE occurred_at >= ? AND occurred_at < ?'),
  diaperCountToday: db.prepare('SELECT COUNT(*) AS count FROM diapers WHERE occurred_at >= ? AND occurred_at < ?'),
  latest: db.prepare('SELECT id, fed_at, amount_ml, feeding_method, note, created_at FROM feedings ORDER BY fed_at DESC LIMIT 1'),
  create: db.prepare('INSERT INTO feedings (fed_at, amount_ml, feeding_method, note) VALUES (?, ?, ?, ?)'),
  remove: db.prepare('DELETE FROM feedings WHERE id = ?'),
  settings: db.prepare('SELECT interval_hours, amount_ml, feeding_type, breast_method, formula_brand, formula_stage FROM settings WHERE id = 1'),
  updateSettings: db.prepare('UPDATE settings SET interval_hours = ?, amount_ml = ?, feeding_type = ?, formula_brand = ?, formula_stage = ?, breast_method = ? WHERE id = 1'),
  profile: db.prepare('SELECT name, birthday, birth_weight_grams, birth_length_mm FROM baby_profile WHERE id = 1'),
  updateProfile: db.prepare('UPDATE baby_profile SET name = ?, birthday = ?, birth_weight_grams = ?, birth_length_mm = ? WHERE id = 1'),
  weights: db.prepare('SELECT id, measured_on, weight_grams, recorded_at FROM weights ORDER BY measured_on DESC LIMIT 30'),
  saveWeight: db.prepare("INSERT INTO weights (measured_on, weight_grams, recorded_at) VALUES (?, ?, datetime('now')) ON CONFLICT(measured_on) DO UPDATE SET weight_grams = excluded.weight_grams, recorded_at = excluded.recorded_at"),
  removeWeight: db.prepare('DELETE FROM weights WHERE id = ?'),
  lengths: db.prepare('SELECT id, measured_on, length_mm, recorded_at FROM lengths ORDER BY measured_on DESC LIMIT 30'),
  saveLength: db.prepare("INSERT INTO lengths (measured_on, length_mm, recorded_at) VALUES (?, ?, datetime('now')) ON CONFLICT(measured_on) DO UPDATE SET length_mm = excluded.length_mm, recorded_at = excluded.recorded_at"),
  removeLength: db.prepare('DELETE FROM lengths WHERE id = ?'),
  abnormalities: db.prepare('SELECT id, occurred_at, observations, note, photo IS NOT NULL AS has_photo FROM abnormalities ORDER BY occurred_at DESC LIMIT 50'),
  saveAbnormality: db.prepare('INSERT INTO abnormalities (occurred_at, observations, note, photo, photo_type) VALUES (?, ?, ?, ?, ?)'),
  abnormalPhoto: db.prepare('SELECT photo, photo_type FROM abnormalities WHERE id = ?'),
  removeAbnormality: db.prepare('DELETE FROM abnormalities WHERE id = ?'),
  medications: db.prepare('SELECT id, occurred_at, medicines, note, photo IS NOT NULL AS has_photo FROM medications ORDER BY occurred_at DESC LIMIT 50'),
  saveMedication: db.prepare('INSERT INTO medications (occurred_at, medicines, note, photo, photo_type) VALUES (?, ?, ?, ?, ?)'),
  medicationPhoto: db.prepare('SELECT photo, photo_type FROM medications WHERE id = ?'),
  removeMedication: db.prepare('DELETE FROM medications WHERE id = ?'),
  stools: db.prepare('SELECT id, occurred_at, note, length(photo) > 0 AS has_photo FROM stools ORDER BY occurred_at DESC LIMIT 50'),
  saveStool: db.prepare('INSERT INTO stools (occurred_at, note, photo, photo_type) VALUES (?, ?, ?, ?)'),
  stoolPhoto: db.prepare('SELECT photo, photo_type FROM stools WHERE id = ?'),
  removeStool: db.prepare('DELETE FROM stools WHERE id = ?')
  ,diapers: db.prepare('SELECT id, occurred_at, note FROM diapers ORDER BY occurred_at DESC LIMIT 50')
  ,saveDiaper: db.prepare('INSERT INTO diapers (occurred_at, note) VALUES (?, ?)')
  ,removeDiaper: db.prepare('DELETE FROM diapers WHERE id = ?')
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    if (!req.headers['content-type']?.startsWith('application/json')) {
      req.resume(); return reject(Object.assign(new Error('请求格式不正确'), { status: 415 }));
    }
    req.setEncoding('utf8');
    let raw = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      raw += chunk;
      if (Buffer.byteLength(raw) > 3_000_000) { tooLarge = true; raw = ''; reject(Object.assign(new Error('照片过大，请选择更小的照片'), { status: 413 })); }
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        const body = raw ? JSON.parse(raw) : {};
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
        resolveBody(body);
      } catch { reject(Object.assign(new Error('请求格式不正确'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && validDate(`${value}T00:00:00.000Z`);
}

function today(req) {
  return validDay(req.headers['x-today']) ? req.headers['x-today'] : new Date().toISOString().slice(0, 10);
}

function readAbnormality(row) { return {...row, has_photo:Boolean(row.has_photo), observations:JSON.parse(row.observations)}; }
function readMedication(row) { return {...row, has_photo:Boolean(row.has_photo), medicines:JSON.parse(row.medicines)}; }
function photoFromData(value) {
  const match=typeof value==='string'&&value.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return value ? null : {photo:null,type:null};
  const photo=Buffer.from(match[2],'base64');
  const validImage=match[1]==='jpeg' ? photo.subarray(0,3).equals(Buffer.from([255,216,255]))&&photo.subarray(-2).equals(Buffer.from([255,217])) : photo.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  return validImage&&photo.length<=2_000_000 ? {photo,type:`image/${match[1]}`} : null;
}
function finiteOptionalNumber(value,min,max,integer=false) { return value===undefined || (typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max&&(!integer||Number.isInteger(value))); }
function validateObservations(observations) {
  if (!Array.isArray(observations) || !observations.length || observations.length !== 1) return null;
  const seen=new Set(), result=[];
  for (const item of observations) {
    if (!item || typeof item!=='object') return null;
    const category=abnormalCategories.find(category=>category.id===item.category);
    if (!category) return null;
    const allowedSymptoms=[...category.symptoms,...(category.legacySymptoms||[])];
    if (seen.has(item.category) || !Array.isArray(item.symptoms) || item.symptoms.length > allowedSymptoms.length || item.symptoms.some(symptom=>!allowedSymptoms.includes(symptom))) return null;
    seen.add(item.category);
    const symptoms=[...new Set(item.symptoms)];
    if (category.symptoms.length && !symptoms.length && !['temperature','jaundice'].includes(category.id)) return null;
    const normalized={category:category.id,symptoms};
    const copyString=(key,max=100)=>{if(item[key]!==undefined){if(typeof item[key]!=='string'||item[key].trim().length>max)return false;normalized[key]=item[key].trim();}return true;};
    if (category.id==='temperature') {
      if (symptoms.length>1 || (symptoms.length===1&&!['体温偏高','体温偏低'].includes(symptoms[0])) || typeof item.temperatureC!=='number' || !Number.isFinite(item.temperatureC) || item.temperatureC<20 || item.temperatureC>45 || Math.abs(item.temperatureC*10-Math.round(item.temperatureC*10))>1e-8 || typeof item.measurementSite!=='string' || !item.measurementSite.trim() || !['腋下','额头','耳内','肛门'].includes(item.measurementSite.trim()) && !(item.measurementSite.trim().length<=60)) return null;
      normalized.temperatureC=item.temperatureC;normalized.measurementSite=item.measurementSite.trim();normalized.symptoms=[item.temperatureC<36.5?'体温偏低':item.temperatureC>37.5?'体温偏高':'体温在参考范围内'];
    }
    if (category.id==='jaundice') {
      if (item.jaundiceSites!==undefined && (!Array.isArray(item.jaundiceSites)||item.jaundiceSites.some(site=>!['眼白','脸部','躯干','手臂或腿','手掌或脚底'].includes(site)))) return null;
      if (item.discoveredAt!==undefined && (typeof item.discoveredAt!=='string'||item.discoveredAt.length>16)) return null;
      if (!finiteOptionalNumber(item.bilirubinValue,0,2000)||item.bilirubinValue!==undefined&&Math.abs(item.bilirubinValue*10-Math.round(item.bilirubinValue*10))>1e-8 || item.bilirubinValue!==undefined&&!['mg','umol'].includes(item.bilirubinUnit) || typeof item.phototherapy!=='boolean') return null;
      if(item.jaundiceSites) normalized.jaundiceSites=[...new Set(item.jaundiceSites)]; if(item.discoveredAt) normalized.discoveredAt=item.discoveredAt; if(item.bilirubinValue!==undefined){normalized.bilirubinValue=item.bilirubinValue;normalized.bilirubinUnit=item.bilirubinUnit;} normalized.phototherapy=item.phototherapy;
    }
    if (category.id==='vomiting' && (!copyString('vomitingAppearance',20)||!finiteOptionalNumber(item.occurrenceCount,1,99,true)||!finiteOptionalNumber(item.minutesSinceFeeding,0,1440,true))) return null;
    if (category.id==='skin' && !copyString('bodyPart')) return null;
    if (category.id==='eyes' && (!copyString('eyeSide',10)||item.eyeSide!==undefined&&!['左眼','右眼','双眼'].includes(item.eyeSide)||!copyString('mouthLocation'))) return null;
    if (category.id==='activity' && (!finiteOptionalNumber(item.durationMinutes,0,10080,true)||!finiteOptionalNumber(item.occurrenceCount,1,99,true))) return null;
    if (category.id==='breathing' && (!copyString('breathingState',10)||item.breathingState!==undefined&&!['吃奶','睡觉','清醒'].includes(item.breathingState)||!finiteOptionalNumber(item.durationMinutes,0,10080,true))) return null;
    if (category.id==='other') {
      if (typeof item.description!=='string' || !item.description.trim() || item.description.trim().length>1000) return null;
      normalized.description=item.description.trim();
    }
    result.push(normalized);
  }
  return result;
}

function summary(req) {
  const latest = statements.latest.get() || null;
  const intervalHours = Number(statements.settings.get().interval_hours);
  const amountMl = Number(statements.settings.get().amount_ml);
  const settings = statements.settings.get();
  const dayStart = req.headers['x-day-start'];
  const dayEnd = req.headers['x-day-end'];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const validRange = validDate(dayStart) && validDate(dayEnd) && Date.parse(dayEnd) > Date.parse(dayStart) && Date.parse(dayEnd) - Date.parse(dayStart) <= 27 * 3600000;
  const rangeStart = validRange ? dayStart : start.toISOString();
  const rangeEnd = validRange ? dayEnd : end.toISOString();
  const feedingTimes = statements.todayFeedingTimes.all(rangeStart, rangeEnd).map(row => Date.parse(row.fed_at));
  const averageIntervalHours = feedingTimes.length > 1 ? Number((feedingTimes.slice(1).reduce((total, time, index) => total + time - feedingTimes[index], 0) / (feedingTimes.length - 1) / 3600000).toFixed(1)) : null;
  const rollingEnd=now.toISOString(),rollingStart=new Date(now.getTime()-24*3600000).toISOString();
  const rolling=statements.feedingWindow.get(rollingStart,rollingEnd);
  const todayThroughNow=statements.feedingWindow.get(new Date(Date.parse(rangeStart)-1).toISOString(),[rangeEnd,rollingEnd].sort()[0]);
  return {
    latest,
    intervalHours,
    amountMl,
    feedingType: settings.feeding_type,
    breastMethod:settings.breast_method,
    formulaBrand: settings.formula_brand,
    formulaStage: Number(settings.formula_stage),
    todayCount: Number(statements.countToday.get(rangeStart, rangeEnd).count),
    todayAmount: Number(statements.amountToday.get(rangeStart, rangeEnd).amount),
    todayRecordedAmount:Number(todayThroughNow.amount),
    todayRecordedCount:Number(todayThroughNow.count),
    todayDirectCount:Number(todayThroughNow.direct_count||0),
    last24HoursAmount:Number(rolling.amount),
    last24HoursCount:Number(rolling.count),
    last24HoursDirectCount:Number(rolling.direct_count||0),
    last24HoursStart:rollingStart,
    last24HoursEnd:rollingEnd,
    todayAverageIntervalHours: averageIntervalHours,
    todayStoolCount: Number(statements.stoolCountToday.get(rangeStart, rangeEnd).count),
    todayDiaperCount: Number(statements.diaperCountToday.get(rangeStart, rangeEnd).count),
    nextAt: latest ? new Date(new Date(latest.fed_at).getTime() + intervalHours * 60 * 60 * 1000).toISOString() : null
  };
}

function medicationPlans() {
  const now=new Date();
  const records=db.prepare('SELECT occurred_at,medicines FROM medications WHERE occurred_at<=? ORDER BY occurred_at DESC').all(now.toISOString()).map(row=>({...row,medicines:JSON.parse(row.medicines)}));
  return db.prepare('SELECT p.*,m.name FROM medication_plans p JOIN common_medicines m ON m.id=p.medicine_id ORDER BY p.id').all().map(plan=>({...plan,enabled:Boolean(plan.enabled),nextAt:medicationNextAt(plan,records,now)}));
}

async function handleApi(req, res, url) {
  if(url.pathname==='/api/medication-plans'&&req.method==='GET')return json(res,200,{plans:medicationPlans()});
  const planMatch=url.pathname.match(/^\/api\/medication-plans\/(\d+)$/);
  if((url.pathname==='/api/medication-plans'&&req.method==='POST')||(planMatch&&req.method==='PUT')){
    const body=await readBody(req),id=Number(planMatch?.[1]);
    if(planMatch&&!db.prepare('SELECT id FROM medication_plans WHERE id=?').get(id))return json(res,404,{error:'用药计划不存在'});
    const medicine=Number.isInteger(body.medicineId)?db.prepare('SELECT * FROM common_medicines WHERE id=?').get(body.medicineId):null;
    const dose=typeof body.dose==='string'?body.dose.trim():'';
    const validTime=typeof body.dailyTime==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(body.dailyTime);
    if(!medicine?.unit||!/^\d+(\.\d+)?$/.test(dose)||dose.length>20||Number(dose)<=0||!['daily','interval'].includes(body.mode)||!validDate(body.startAt)||typeof body.enabled!=='boolean'||!Number.isInteger(body.timezoneOffset)||body.timezoneOffset< -840||body.timezoneOffset>720||(body.mode==='daily'&&!validTime)||(body.mode==='interval'&&(!Number.isFinite(body.intervalHours)||body.intervalHours<0.5||body.intervalHours>720||!Number.isInteger(body.intervalHours*2))))return json(res,400,{error:'请选择已配置单位的药品，填写有效剂量、首次参考时间及用药时间方式'});
    if(body.mode==='daily'&&new Date(Date.parse(body.startAt)-body.timezoneOffset*60000).toISOString().slice(11,16)!==body.dailyTime)return json(res,400,{error:'每日时刻应与首次参考时间一致'});
    const existing=db.prepare('SELECT id FROM medication_plans WHERE medicine_id=? AND enabled=1 AND id!=?').get(body.medicineId,id||0);
    if(body.enabled&&existing)return json(res,409,{error:'该药品已有启用中的计划，请修改原计划或先暂停原计划'});
    const args=[body.medicineId,dose,medicine.unit,body.mode,body.mode==='daily'?body.dailyTime:null,body.timezoneOffset,body.mode==='interval'?body.intervalHours:null,body.startAt,Number(body.enabled)];
    if(planMatch)db.prepare('UPDATE medication_plans SET medicine_id=?,dose=?,unit=?,mode=?,daily_time=?,timezone_offset=?,interval_hours=?,start_at=?,enabled=? WHERE id=?').run(...args,id);
    else db.prepare('INSERT INTO medication_plans (medicine_id,dose,unit,mode,daily_time,timezone_offset,interval_hours,start_at,enabled) VALUES (?,?,?,?,?,?,?,?,?)').run(...args);
    return json(res,planMatch?200:201,{plans:medicationPlans()});
  }
  if(planMatch&&req.method==='PATCH'){
    const body=await readBody(req),id=Number(planMatch[1]);
    const plan=db.prepare('SELECT * FROM medication_plans WHERE id=?').get(id);
    if(!plan)return json(res,404,{error:'用药计划不存在'});
    if(typeof body.enabled!=='boolean')return json(res,400,{error:'请指定启用或暂停状态'});
    if(body.enabled&&db.prepare('SELECT id FROM medication_plans WHERE medicine_id=? AND enabled=1 AND id!=?').get(plan.medicine_id,id))return json(res,409,{error:'该药品已有启用中的计划'});
    db.prepare('UPDATE medication_plans SET enabled=? WHERE id=?').run(Number(body.enabled),id);
    return json(res,200,{plans:medicationPlans()});
  }
  if(url.pathname==='/api/common-medicines'&&req.method==='GET')return json(res,200,{medicines:db.prepare('SELECT * FROM common_medicines ORDER BY id').all()});
  const commonMatch=url.pathname.match(/^\/api\/common-medicines\/(\d+)$/);
  if((url.pathname==='/api/common-medicines'&&req.method==='POST')||(commonMatch&&req.method==='PUT')){
    const body=await readBody(req);
    const name=typeof body.name==='string'?body.name.trim():'',unit=typeof body.unit==='string'?body.unit.trim():'';
    if(!name||name.length>50||!unit||unit.length>12)return json(res,400,{error:'请填写药品名称（最多50字）和计量单位（最多12字）'});
    if(commonMatch&&!db.prepare('SELECT id FROM common_medicines WHERE id=?').get(Number(commonMatch[1])))return json(res,404,{error:'常用药品不存在'});
    const duplicate=db.prepare('SELECT id FROM common_medicines WHERE name=? COLLATE NOCASE').get(name);
    if(duplicate&&duplicate.id!==Number(commonMatch?.[1]))return json(res,409,{error:'该药品已在常用药品中，请修改已有药品'});
    if(commonMatch)db.prepare('UPDATE common_medicines SET name=?,unit=? WHERE id=?').run(name,unit,Number(commonMatch[1]));
    else db.prepare('INSERT INTO common_medicines (name,unit) VALUES (?,?)').run(name,unit);
    return json(res,commonMatch?200:201,{medicines:db.prepare('SELECT * FROM common_medicines ORDER BY id').all()});
  }
  if (url.pathname === '/api/logs' && req.method === 'GET') {
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    const fromDay = url.searchParams.get('fromDay');
    const toDay = url.searchParams.get('toDay');
    if (!validDate(start) || !validDate(end) || start >= end || !validDay(fromDay) || !validDay(toDay) || fromDay > toDay) {
      return json(res, 400, { error: '请选择有效的开始和结束日期' });
    }
    return json(res, 200, {
      records: db.prepare('SELECT id, fed_at, amount_ml, feeding_method, note FROM feedings WHERE fed_at >= ? AND fed_at < ? ORDER BY fed_at DESC').all(start, end),
      weights: db.prepare('SELECT id, measured_on, weight_grams, recorded_at FROM weights WHERE measured_on >= ? AND measured_on <= ? ORDER BY measured_on DESC').all(fromDay, toDay),
      lengths: db.prepare('SELECT id, measured_on, length_mm, recorded_at FROM lengths WHERE measured_on >= ? AND measured_on <= ? ORDER BY measured_on DESC').all(fromDay, toDay),
      abnormalities: db.prepare('SELECT id, occurred_at, observations, note, photo IS NOT NULL AS has_photo FROM abnormalities WHERE occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at DESC').all(start, end).map(readAbnormality),
      medications: db.prepare('SELECT id, occurred_at, medicines, note, photo IS NOT NULL AS has_photo FROM medications WHERE occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at DESC').all(start, end).map(readMedication),
      stools: db.prepare('SELECT id, occurred_at, note, length(photo) > 0 AS has_photo FROM stools WHERE occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at DESC').all(start, end),
      diapers: db.prepare('SELECT id, occurred_at, note FROM diapers WHERE occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at DESC').all(start, end)
    });
  }
  if (url.pathname === '/api/abnormalities' && req.method === 'GET') return json(res, 200, {abnormalities:statements.abnormalities.all().map(readAbnormality)});
  if (url.pathname === '/api/abnormalities' && req.method === 'POST') {
    const body=await readBody(req),observations=validateObservations(body.observations),photo=photoFromData(body.photo);
    if (!validDate(body.occurredAt) || !observations || photo===null || (body.note!==undefined && typeof body.note!=='string') || (body.note?.trim().length||0)>1000) return json(res,400,{error:'请填写有效发现时间和具体异常表现；体温需填写实测值及测量部位；照片格式需为清晰的图片'});
    const result=statements.saveAbnormality.run(body.occurredAt,JSON.stringify(observations),body.note?.trim()||'',photo.photo,photo.type);
    return json(res,201,{id:Number(result.lastInsertRowid)});
  }
  const abnormalPhotoMatch=url.pathname.match(/^\/api\/abnormalities\/(\d+)\/photo$/);
  if (abnormalPhotoMatch && req.method === 'GET') {
    const row=statements.abnormalPhoto.get(Number(abnormalPhotoMatch[1]));
    if(!row?.photo)return json(res,404,{error:'照片不存在'});
    res.writeHead(200,{'Content-Type':row.photo_type,'Content-Length':row.photo.length,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(Buffer.from(row.photo));
  }
  const abnormalMatch=url.pathname.match(/^\/api\/abnormalities\/(\d+)$/);
  if (abnormalMatch && req.method==='DELETE') {
    statements.removeAbnormality.run(Number(abnormalMatch[1]));return json(res,200,{abnormalities:statements.abnormalities.all().map(readAbnormality)});
  }
  if (url.pathname === '/api/medications' && req.method === 'GET') return json(res, 200, {medications:statements.medications.all().map(readMedication)});
  if (url.pathname === '/api/medications' && req.method === 'POST') {
    const body=await readBody(req),photo=photoFromData(body.photo);
    const medicines=Array.isArray(body.medicines)&&body.medicines.length>0&&body.medicines.length<=20?body.medicines.map(item=>({name:typeof item?.name==='string'?item.name.trim():'',dose:typeof item?.dose==='string'?item.dose.trim():'',...(item?.medicineId!==undefined?{medicineId:item.medicineId}:{}),...(item?.unit!==undefined?{unit:typeof item.unit==='string'?item.unit.trim():''}:{})})):null;
    const validMedicines=medicines&&medicines.every((item,index)=>item.name.length>0&&item.name.length<=50&&(item.medicineId===undefined||(Number.isInteger(item.medicineId)&&Boolean(db.prepare('SELECT id FROM common_medicines WHERE id=?').get(item.medicineId))))&&item.dose.length<=50&&(body.medicines[index]?.unit===undefined||(typeof body.medicines[index].unit==='string'&&body.medicines[index].unit.trim().length<=12))&&(body.medicines[index]?.dose===undefined||typeof body.medicines[index]?.dose==='string'));
    const note=typeof body.note==='string'?body.note.trim().slice(0,1000):'';
    if(!validDate(body.occurredAt)||!validMedicines||photo===null||(body.note!==undefined&&typeof body.note!=='string')||(body.note?.trim().length||0)>1000) return json(res,400,{error:'请填写有效用药时间和药品名称，剂量为选填文字，备注不超过1000字，照片格式需为清晰的图片'});
    const result=statements.saveMedication.run(body.occurredAt,JSON.stringify(medicines),note,photo.photo,photo.type);
    return json(res,201,{id:Number(result.lastInsertRowid)});
  }
  const medicationPhotoMatch=url.pathname.match(/^\/api\/medications\/(\d+)\/photo$/);
  if(medicationPhotoMatch&&req.method==='GET'){
    const row=statements.medicationPhoto.get(Number(medicationPhotoMatch[1]));
    if(!row?.photo)return json(res,404,{error:'照片不存在'});
    res.writeHead(200,{'Content-Type':row.photo_type,'Content-Length':row.photo.length,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(Buffer.from(row.photo));
  }
  const medicationMatch=url.pathname.match(/^\/api\/medications\/(\d+)$/);
  if(medicationMatch&&req.method==='DELETE'){
    statements.removeMedication.run(Number(medicationMatch[1]));return json(res,200,{medications:statements.medications.all().map(readMedication)});
  }
  if (url.pathname === '/api/diapers' && req.method === 'GET') return json(res, 200, { diapers: statements.diapers.all() });
  if (url.pathname === '/api/diapers' && req.method === 'POST') {
    const body = await readBody(req);
    if (!validDate(body.occurredAt)) return json(res, 400, { error: '请填写换尿布时间' });
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 160) : '';
    const result = statements.saveDiaper.run(body.occurredAt, note);
    return json(res, 201, { id: Number(result.lastInsertRowid) });
  }
  const diaperMatch = url.pathname.match(/^\/api\/diapers\/(\d+)$/);
  if (diaperMatch && req.method === 'DELETE') { statements.removeDiaper.run(Number(diaperMatch[1])); return json(res, 200, { diapers: statements.diapers.all() }); }
  if (url.pathname === '/api/stools' && req.method === 'GET') {
    return json(res, 200, { stools: statements.stools.all() });
  }
  if (url.pathname === '/api/stools' && req.method === 'POST') {
    const body = await readBody(req);
    if (!validDate(body.occurredAt)) return json(res, 400, { error: '请填写有效的排便时间' });
    const photo = photoFromData(body.photo);
    if (!photo) return json(res, 400, { error: '照片格式不支持或过大，请重新拍照或选择照片' });
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 160) : '';
    // Empty bytes represent an optional photo and keep existing database constraints intact.
    const result = statements.saveStool.run(body.occurredAt, note, photo.photo || Buffer.alloc(0), photo.type || '');
    return json(res, 201, { id: Number(result.lastInsertRowid) });
  }
  const photoMatch = url.pathname.match(/^\/api\/stools\/(\d+)\/photo$/);
  if (photoMatch && req.method === 'GET') {
    const row = statements.stoolPhoto.get(Number(photoMatch[1]));
    if (!row?.photo?.length) return json(res, 404, { error: '照片不存在' });
    res.writeHead(200, { 'Content-Type': row.photo_type, 'Content-Length': row.photo.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(Buffer.from(row.photo));
  }
  const stoolMatch = url.pathname.match(/^\/api\/stools\/(\d+)$/);
  if (stoolMatch && req.method === 'DELETE') {
    statements.removeStool.run(Number(stoolMatch[1]));
    return json(res, 200, { stools: statements.stools.all() });
  }
  if (url.pathname === '/api/baby' && req.method === 'GET') {
    return json(res, 200, { baby: statements.profile.get() });
  }
  if (url.pathname === '/api/baby' && req.method === 'PUT') {
    const body = await readBody(req);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 30 || !validDay(body.birthday) || body.birthday > today(req)) {
      return json(res, 400, { error: '请填写 1-30 字的名字和有效生日，生日不能晚于今天' });
    }
    const previous=statements.profile.get();
    const birthWeight=body.birthWeightGrams===undefined?previous.birth_weight_grams:body.birthWeightGrams;
    const birthLength=body.birthLengthCm===undefined?previous.birth_length_mm:body.birthLengthCm===null?null:typeof body.birthLengthCm==='number'?Math.round(body.birthLengthCm*10):NaN;
    if((birthWeight!==null&&(!Number.isInteger(birthWeight)||birthWeight<100||birthWeight>100000))||(birthLength!==null&&(!Number.isInteger(birthLength)||birthLength<100||birthLength>2500))||(body.birthLengthCm!==undefined&&body.birthLengthCm!==null&&(typeof body.birthLengthCm!=='number'||Math.abs(body.birthLengthCm*10-birthLength)>1e-8)))return json(res,400,{error:'出生体重请填写100～100000克的整数，出生身长请填写10～250厘米，最多一位小数；两项均可留空'});
    statements.updateProfile.run(name, body.birthday,birthWeight,birthLength);
    return json(res, 200, { baby: statements.profile.get() });
  }
  if (url.pathname === '/api/lengths' && req.method === 'GET') return json(res, 200, { lengths: statements.lengths.all() });
  if (url.pathname === '/api/lengths' && req.method === 'PUT') {
    const body = await readBody(req);
    const millimeters = Math.round(body.lengthCm * 10);
    if (!validDay(body.measuredOn) || body.measuredOn > today(req) || typeof body.lengthCm !== 'number' || !Number.isFinite(body.lengthCm) || body.lengthCm < 10 || body.lengthCm > 250 || Math.abs(body.lengthCm * 10 - millimeters) > 1e-8) {
      return json(res, 400, { error: '请填写有效测量日期和 10-250 厘米的身长，最多一位小数，日期不能晚于今天' });
    }
    statements.saveLength.run(body.measuredOn, millimeters);
    return json(res, 200, { lengths: statements.lengths.all() });
  }
  const lengthMatch = url.pathname.match(/^\/api\/lengths\/(\d+)$/);
  if (lengthMatch && req.method === 'DELETE') {
    statements.removeLength.run(Number(lengthMatch[1]));
    return json(res, 200, { lengths: statements.lengths.all() });
  }
  if (url.pathname === '/api/weights' && req.method === 'GET') {
    return json(res, 200, { weights: statements.weights.all() });
  }
  if (url.pathname === '/api/weights' && req.method === 'PUT') {
    const body = await readBody(req);
    if (!validDay(body.measuredOn) || body.measuredOn > today(req) || !Number.isInteger(body.weightGrams) || body.weightGrams < 100 || body.weightGrams > 100000) {
      return json(res, 400, { error: '请填写有效称重日期和 100-100000 克 的体重，日期不能晚于今天' });
    }
    statements.saveWeight.run(body.measuredOn, body.weightGrams);
    return json(res, 200, { weights: statements.weights.all() });
  }
  const weightMatch = url.pathname.match(/^\/api\/weights\/(\d+)$/);
  if (weightMatch && req.method === 'DELETE') {
    statements.removeWeight.run(Number(weightMatch[1]));
    return json(res, 200, { weights: statements.weights.all() });
  }
  if (url.pathname === '/api/records' && req.method === 'GET') {
    return json(res, 200, { records: statements.list.all(50), summary: summary(req) });
  }
  if (url.pathname === '/api/records' && req.method === 'POST') {
    const body = await readBody(req);
    const settings=statements.settings.get();
    const allowed=planMethods(settings.feeding_type,settings.breast_method);
    if(body.feedingMethod===undefined && settings.feeding_type==='mixed')return json(res,400,{error:'混合喂养请先选择本次喂法'});
    const method=body.feedingMethod===undefined?allowed[0]:body.feedingMethod;
    const amount=method==='direct'?null:body.amountMl;
    if (!validDate(body.fedAt) || !['direct','breast_bottle','formula'].includes(method) || method==='direct'&&body.amountMl!==undefined&&body.amountMl!==null || method!=='direct'&&(typeof amount!=='number'||!Number.isInteger(amount)||amount<1||amount>2000)) {
      return json(res,400,{error:'请填写有效喂奶时间；亲喂不填写毫升数，瓶喂请填写 1～2000 毫升的实际奶量'});
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0,160) : '';
    const result=statements.create.run(body.fedAt,amount,method,note);
    const record = db.prepare('SELECT id, fed_at, amount_ml, feeding_method, note, created_at FROM feedings WHERE id = ?').get(Number(result.lastInsertRowid));
    return json(res, 201, { record, summary: summary(req) });
  }
  const recordMatch = url.pathname.match(/^\/api\/records\/(\d+)$/);
  if (recordMatch && req.method === 'DELETE') {
    statements.remove.run(Number(recordMatch[1]));
    return json(res, 200, { summary: summary(req) });
  }
  if (url.pathname === '/api/settings' && req.method === 'GET') {
    const settings = statements.settings.get();
    return json(res, 200, { intervalHours: Number(settings.interval_hours), amountMl: Number(settings.amount_ml), feedingType: settings.feeding_type, breastMethod:settings.breast_method, formulaBrand: settings.formula_brand, formulaStage: Number(settings.formula_stage) });
  }
  if (url.pathname === '/api/settings' && req.method === 'PUT') {
    const body = await readBody(req);
    const intervalHours = Number(body.intervalHours);
    const feedingType=['formula','breast','mixed'].includes(body.feedingType)?body.feedingType:'';
    const breastMethod=body.breastMethod??statements.settings.get().breast_method;
    const directOnly=feedingType==='breast'&&breastMethod==='direct';
    const amountMl=directOnly?Number(statements.settings.get().amount_ml):body.amountMl;
    const formulaBrand = typeof body.formulaBrand === 'string' ? body.formulaBrand.trim().slice(0, 60) : '';
    const formulaStage = Number(body.formulaStage);
    if (!Number.isFinite(intervalHours) || intervalHours < 0.5 || intervalHours > 24 || !Number.isInteger(intervalHours * 2) || !Number.isInteger(amountMl) || amountMl < 1 || amountMl > 2000 || !feedingType || !['direct','bottle'].includes(breastMethod) || ![1,2,3].includes(formulaStage)) {
      return json(res, 400, { error: '请填写有效的喂奶间隔和一次喂奶量' });
    }
    statements.updateSettings.run(intervalHours, amountMl, feedingType, formulaBrand, feedingType !== 'breast' ? formulaStage : 1,breastMethod);
    const settings = statements.settings.get();
    return json(res, 200, { intervalHours: Number(settings.interval_hours), amountMl: Number(settings.amount_ml), feedingType: settings.feeding_type, breastMethod:settings.breast_method, formulaBrand: settings.formula_brand, formulaStage: Number(settings.formula_stage), summary: summary(req) });
  }
  json(res, 404, { error: '接口不存在' });
}

function serveStatic(req, res, url) {
  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  pathname = normalize(pathname).replace(/^([.][.][/\\])+/, '');
  const filePath = resolve(publicDir, `.${pathname}`);
  if (!filePath.startsWith(`${publicDir}/`) || !existsSync(filePath) || !statSync(filePath).isFile()) return json(res, 404, { error: '页面不存在' });
  const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
  res.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
    else json(res, 405, { error: '请求方法不支持' });
  } catch (error) {
    console.error(error);
    json(res, error.status || 500, { error: error.status ? error.message : '服务器出错了，请稍后重试' });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`BabyCare running on http://localhost:${server.address().port}`));

function shutdown() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
