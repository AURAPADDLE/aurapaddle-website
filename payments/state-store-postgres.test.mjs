import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {createStateStore} from './state-store.mjs';

const testUrl=process.env.AURA_TEST_POSTGRES_URL;
test('real PostgreSQL state integrity and explicit bootstrap', {skip:!testUrl}, async t=>{
  const url=new URL(testUrl);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Only a loopback test database is allowed');
  assert.match(url.pathname,/^\/aura_test_[a-z0-9_]+$/,'Database name must start aura_test_');
  const schema=`aura_test_${crypto.randomBytes(10).toString('hex')}`;
  const control=new pg.Pool({connectionString:testUrl,ssl:false});
  const stores=[];
  await control.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options',`-c search_path=${schema}`);
  const databaseUrl=url.toString();
  const sql=new pg.Pool({connectionString:databaseUrl,ssl:false});
  const make=bootstrapPostgres=>{const store=createStateStore({databaseUrl,bootstrapPostgres});stores.push(store);return store};
  const error=err=>err.code==='AURA_STATE_INTEGRITY';
  const normal=make(false);
  try{
    await t.test('missing table fails by default without creating data',async()=>{
      await assert.rejects(normal.init(),error);
      assert.equal((await sql.query("SELECT to_regclass('aura_state') AS relation")).rows[0].relation,null);
    });
    await t.test('concurrent explicit provisioning creates one state row',async()=>{
      await Promise.all(Array.from({length:8},()=>make(true).init()));
      assert.equal((await sql.query('SELECT count(*)::int AS count FROM aura_state')).rows[0].count,1);
      await normal.mutate(state=>{state.orders.fixture={id:'fixture',synthetic:true};state.counter=0});
    });
    await t.test('ordinary and explicit init preserve existing data',async()=>{
      const before=await sql.query('SELECT * FROM aura_state');
      await Promise.all([normal.init(),make(true).init()]);
      assert.deepEqual((await sql.query('SELECT * FROM aura_state')).rows,before.rows);
    });
    await t.test('independent transactions retain all concurrent increments and rollback failures',async()=>{
      const peers=Array.from({length:8},()=>make(false));
      await Promise.all(Array.from({length:160},(_,i)=>peers[i%8].mutate(async state=>{const n=state.counter;await new Promise(r=>setTimeout(r,1));state.counter=n+1})));
      assert.equal((await normal.read()).counter,160);
      await assert.rejects(normal.mutate(state=>{state.orders={};throw new Error('synthetic rollback')}),/synthetic rollback/);
      assert.equal((await normal.read()).orders.fixture.synthetic,true);
    });
    await t.test('legacy optional absence is accepted without rewriting or dropping unknown fields',async()=>{
      const legacy={orders:{fixture:{synthetic:true}},events:{},extension:{preserved:true}};
      await sql.query('UPDATE aura_state SET data=$1::jsonb',[JSON.stringify(legacy)]);
      await normal.init();await normal.read();
      assert.deepEqual((await sql.query('SELECT data FROM aura_state')).rows[0].data,legacy);
      await normal.mutate(state=>{state.counter=1});
      assert.deepEqual((await normal.read()).extension,legacy.extension);
    });
    await t.test('invalid core and optional container types fail without rewriting data',async()=>{
      const optional=['reservations','checkoutRequests','analyticsOutbox','abandonedCheckouts','recoveryEmailOutbox','recoverySuppressions','transactionalEmailOutbox','reviews','reviewNotificationOutbox','analyticsAmountIssues','metaPurchaseReceipts','newsletter','inventory'];
      const invalid=[{}, {orders:{}}, {events:{}}];
      for(const key of ['orders','events',...optional])for(const value of [[],null,'invalid',0,true])invalid.push({orders:{},events:{},[key]:value});
      for(const key of ['contacts','events','drafts'])for(const value of [[],null,'invalid'])invalid.push({orders:{},events:{},newsletter:{contacts:{},events:{},drafts:{},[key]:value}});
      invalid.push({orders:{},events:{},newsletter:{}});
      for(const key of ['products','balances','allocations'])invalid.push({orders:{},events:{},inventory:{[key]:[]}});
      for(const key of ['movements','sourceHistory'])invalid.push({orders:{},events:{},inventory:{[key]:{}}});
      for(const bad of invalid){
        await sql.query('UPDATE aura_state SET data=$1::jsonb',[JSON.stringify(bad)]);
        let called=false;
        await assert.rejects(normal.read(),error);await assert.rejects(normal.init(),error);
        await assert.rejects(normal.mutate(()=>{called=true}),error);assert.equal(called,false);
        assert.deepEqual((await sql.query('SELECT data FROM aura_state')).rows[0].data,bad);
      }
    });
    await t.test('callback cannot replace core maps with arrays or remove them',async()=>{
      const valid={orders:{fixture:{synthetic:true}},events:{}};
      await sql.query('UPDATE aura_state SET data=$1::jsonb',[JSON.stringify(valid)]);
      await assert.rejects(normal.mutate(state=>{state.orders=[];state.orders.fixture={lost:true}}),error);
      await assert.rejects(normal.mutate(state=>{delete state.events}),error);
      assert.deepEqual((await sql.query('SELECT data FROM aura_state')).rows[0].data,valid);
    });
    await t.test('missing row fails read/init/mutate, never invokes callback or creates empty state',async()=>{
      await sql.query('DELETE FROM aura_state WHERE id=1');
      let called=false;
      await assert.rejects(normal.read(),error);
      await assert.rejects(normal.mutate(()=>{called=true}),error);
      await assert.rejects(normal.init(),error);
      await assert.rejects(make(true).init(),error);
      assert.equal(called,false);
      assert.equal((await sql.query('SELECT count(*)::int AS count FROM aura_state')).rows[0].count,0);
    });
    await t.test('invalid existing state is rejected and not overwritten',async()=>{
      await sql.query("INSERT INTO aura_state(id,data) VALUES(1,'[]'::jsonb)");
      await assert.rejects(normal.read(),error);
      await assert.rejects(normal.init(),error);
      await assert.rejects(normal.mutate(()=>{}),error);
      assert.deepEqual((await sql.query('SELECT data FROM aura_state')).rows[0].data,[]);
    });
    await t.test('update affecting zero rows fails instead of reporting success',async()=>{
      await sql.query('UPDATE aura_state SET data=$1::jsonb',[JSON.stringify({orders:{},events:{}})]);
      await sql.query('CREATE FUNCTION suppress_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END; $$');
      await sql.query('CREATE TRIGGER suppress_update BEFORE UPDATE ON aura_state FOR EACH ROW EXECUTE FUNCTION suppress_update()');
      await assert.rejects(normal.mutate(state=>{state.shouldNotPersist=true}),error);
      assert.deepEqual((await sql.query('SELECT data FROM aura_state')).rows[0].data,{orders:{},events:{}});
    });
  }finally{
    await Promise.all(stores.map(store=>store.close()));
    await sql.end();
    await control.query(`DROP SCHEMA ${schema} CASCADE`);
    await control.end();
  }
});
