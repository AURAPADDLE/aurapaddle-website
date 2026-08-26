import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const {Pool}=pg;
const emptyState=()=>({events:{},orders:{},reservations:{},checkoutRequests:{},analyticsOutbox:{},abandonedCheckouts:{},recoveryEmailOutbox:{},recoverySuppressions:{}});

function normaliseState(value){
  const state=value&&typeof value==="object"?value:emptyState();
  state.events??={};state.orders??={};state.reservations??={};state.checkoutRequests??={};state.analyticsOutbox??={};state.abandonedCheckouts??={};state.recoveryEmailOutbox??={};state.recoverySuppressions??={};
  return state;
}

function jsonStore(statePath){
  const readSync=()=>{try{return normaliseState(JSON.parse(fs.readFileSync(statePath,"utf8")))}catch{return emptyState()}};
  const writeSync=state=>{fs.mkdirSync(path.dirname(statePath),{recursive:true});const tmp=`${statePath}.tmp`;fs.writeFileSync(tmp,`${JSON.stringify(normaliseState(state),null,2)}\n`);fs.renameSync(tmp,statePath)};
  return {
    kind:"json",
    async init(){},
    async read(){return readSync()},
    async mutate(mutator){const state=readSync(),result=await mutator(state);writeSync(state);return result},
    async close(){}
  };
}

function postgresStore(databaseUrl){
  const local=/localhost|127\.0\.0\.1/.test(databaseUrl);
  const pool=new Pool({connectionString:databaseUrl,ssl:local?false:{rejectUnauthorized:false},max:5});
  return {
    kind:"postgres",
    async init(){
      await pool.query("CREATE TABLE IF NOT EXISTS aura_state (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
      await pool.query("INSERT INTO aura_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING",[JSON.stringify(emptyState())]);
    },
    async read(){const result=await pool.query("SELECT data FROM aura_state WHERE id = 1");return normaliseState(result.rows[0]?.data)},
    async mutate(mutator){
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        const current=await client.query("SELECT data FROM aura_state WHERE id = 1 FOR UPDATE");
        const state=normaliseState(current.rows[0]?.data),result=await mutator(state);
        await client.query("UPDATE aura_state SET data = $1::jsonb, updated_at = now() WHERE id = 1",[JSON.stringify(state)]);
        await client.query("COMMIT");
        return result;
      }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
    },
    async close(){await pool.end()}
  };
}

export function createStateStore({databaseUrl,statePath}){
  return databaseUrl?postgresStore(databaseUrl):jsonStore(statePath);
}
