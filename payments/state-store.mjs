import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const {Pool}=pg;
const emptyState=()=>({events:{},orders:{},reservations:{},checkoutRequests:{},analyticsOutbox:{},abandonedCheckouts:{},recoveryEmailOutbox:{},recoverySuppressions:{},transactionalEmailOutbox:{},reviews:{},reviewNotificationOutbox:{}});

function normaliseState(value){
  const state=value&&typeof value==="object"?value:emptyState();
  state.events??={};state.orders??={};state.reservations??={};state.checkoutRequests??={};state.analyticsOutbox??={};state.abandonedCheckouts??={};state.recoveryEmailOutbox??={};state.recoverySuppressions??={};state.transactionalEmailOutbox??={};state.reviews??={};state.reviewNotificationOutbox??={};
  return state;
}

function jsonStore(statePath){
  let pending=Promise.resolve();
  const readSync=()=>{try{return normaliseState(JSON.parse(fs.readFileSync(statePath,"utf8")))}catch{return emptyState()}};
  const writeSync=state=>{fs.mkdirSync(path.dirname(statePath),{recursive:true});const tmp=`${statePath}.tmp`;fs.writeFileSync(tmp,`${JSON.stringify(normaliseState(state),null,2)}\n`);fs.renameSync(tmp,statePath)};
  return {
    kind:"json",
    async init(){},
    async read(){return readSync()},
    mutate(mutator){const operation=pending.then(async()=>{const state=readSync(),result=await mutator(state);writeSync(state);return result});pending=operation.catch(()=>{});return operation},
    async close(){}
  };
}

function postgresState(row){
  const object=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
  const invalid=()=>{const error=new Error("PostgreSQL state is missing or invalid; restore the verified database backup before restarting.");error.code="AURA_STATE_INTEGRITY";throw error;};
  const state=row?.data;
  if(!object(state))invalid();
  // Orders and Stripe event deduplication are core, not optional migrations.
  for(const key of ["orders","events"])if(!Object.hasOwn(state,key)||!object(state[key]))invalid();
  const optional=["reservations","checkoutRequests","analyticsOutbox","abandonedCheckouts","recoveryEmailOutbox","recoverySuppressions","transactionalEmailOutbox","reviews","reviewNotificationOutbox","analyticsAmountIssues","metaPurchaseReceipts","newsletter","inventory"];
  for(const key of optional)if(Object.hasOwn(state,key)&&!object(state[key]))invalid();
  if(Object.hasOwn(state,"newsletter"))for(const key of ["contacts","events","drafts"])if(!Object.hasOwn(state.newsletter,key)||!object(state.newsletter[key]))invalid();
  if(Object.hasOwn(state,"inventory")){
    for(const key of ["products","balances","allocations"])if(Object.hasOwn(state.inventory,key)&&!object(state.inventory[key]))invalid();
    for(const key of ["movements","sourceHistory"])if(Object.hasOwn(state.inventory,key)&&!Array.isArray(state.inventory[key]))invalid();
  }
  // Missing optional namespaces are normal for earlier releases; retain unknown keys.
  return normaliseState(state);
}

function postgresStore(databaseUrl,{bootstrap=false}={}){
  const local=/localhost|127\.0\.0\.1/.test(databaseUrl);
  const pool=new Pool({connectionString:databaseUrl,ssl:local?false:{rejectUnauthorized:false},max:5});
  return {
    kind:"postgres",
    async init(){
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        // Serialize explicit first-time provisioning across independent instances.
        await client.query("SELECT pg_advisory_xact_lock(192837462, 1)");
        const table=await client.query("SELECT to_regclass('aura_state') AS relation");
        if(!table.rows[0]?.relation){
          if(bootstrap!==true){const error=new Error("PostgreSQL state table is missing; restore a verified backup or explicitly provision a new empty database.");error.code="AURA_STATE_INTEGRITY";throw error;}
          await client.query("CREATE TABLE aura_state (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
          await client.query("INSERT INTO aura_state (id, data) VALUES (1, $1::jsonb)",[JSON.stringify(emptyState())]);
        }
        const current=await client.query("SELECT data FROM aura_state WHERE id = 1 FOR UPDATE");
        postgresState(current.rows[0]);
        await client.query("COMMIT");
      }catch(error){try{await client.query("ROLLBACK")}catch{}throw error}finally{client.release()}
    },
    async read(){const result=await pool.query("SELECT data FROM aura_state WHERE id = 1");return postgresState(result.rows[0])},
    async mutate(mutator){
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        const current=await client.query("SELECT data FROM aura_state WHERE id = 1 FOR UPDATE");
        const state=postgresState(current.rows[0]),result=await mutator(state);
        postgresState({data:state});
        const updated=await client.query("UPDATE aura_state SET data = $1::jsonb, updated_at = now() WHERE id = 1",[JSON.stringify(state)]);
        if(updated.rowCount!==1){const error=new Error("PostgreSQL state update did not persist exactly one row.");error.code="AURA_STATE_INTEGRITY";throw error;}
        await client.query("COMMIT");
        return result;
      }catch(error){try{await client.query("ROLLBACK")}catch{}throw error}finally{client.release()}
    },
    async close(){await pool.end()}
  };
}

export function createStateStore({databaseUrl,statePath,bootstrapPostgres=false}){
  return databaseUrl?postgresStore(databaseUrl,{bootstrap:bootstrapPostgres}):jsonStore(statePath);
}
