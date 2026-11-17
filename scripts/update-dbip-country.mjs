import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const manifestPath=path.join(root,"payments","geo-data","dbip-country-lite.manifest.json");
const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
if(new URL(manifest.downloadUrl).origin!=="https://download.db-ip.com")throw Error("DB-IP download host is not approved.");
const response=await fetch(manifest.downloadUrl,{redirect:"error"});if(!response.ok)throw Error(`DB-IP download failed: ${response.status}`);
const compressed=Buffer.from(await response.arrayBuffer()),compressedHash=crypto.createHash("sha256").update(compressed).digest("hex");
if(compressedHash!==manifest.compressedSha256)throw Error("DB-IP compressed checksum mismatch.");
const database=zlib.gunzipSync(compressed),databaseHash=crypto.createHash("sha256").update(database).digest("hex");
if(databaseHash!==manifest.mmdbSha256)throw Error("DB-IP database checksum mismatch.");
const destination=path.join(root,"payments","geo-data","dbip-country-lite.mmdb"),temporary=`${destination}.tmp`;
fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(temporary,database,{mode:0o644});fs.renameSync(temporary,destination);
console.log(`${manifest.product} ${manifest.release}: ${databaseHash}`);
