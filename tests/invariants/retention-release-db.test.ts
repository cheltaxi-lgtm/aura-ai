import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { query, getPool } from "@/lib/db";
import { getProductSectionStats } from "@/lib/admin-product-stats";
import { getFirstExperienceAnalytics } from "@/lib/first-experience-analytics";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser } from "./db/fixtures";

describe.skipIf(!hasTestDb)("retention release in isolated PostgreSQL",()=>{
  installDbLifecycle();
  it("includes Telegram accounts without email and waits for full 48h/8d observation windows",async()=>{
    for(const [age,internal] of [[1.5,false],[3,false],[7.5,false],[9,false],[9,true]] as const){
      const user=await createTestUser();
      await query("INSERT INTO user_accounts(profile_user_id,name,created_at,is_internal,email) VALUES($1,'Retention fixture',NOW()-($2||' days')::interval,$3,$4)",[user.id,String(age),internal,`${user.id}@telegram.zovus.local`]);
      await query("INSERT INTO spread_metrics(user_id,event,spread_id,source,created_at) SELECT $1,'daily_open','daily','product_activity',created_at+INTERVAL '30 hours' FROM user_accounts WHERE profile_user_id=$1",[user.id]);
    }
    expect((await getProductSectionStats()).retention).toMatchObject({registered30d:4,d1Eligible:3,d1Returned:3,r7Eligible:1,r7Returned:1});
  });
  it("changes only legacy package prices and preserves custom prices, quantities and popular badges",async()=>{
    const client=await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE TEMP TABLE rune_packages (LIKE public.rune_packages INCLUDING ALL) ON COMMIT DROP");
      await client.query("SET LOCAL search_path TO pg_temp,public");
      await client.query("INSERT INTO rune_packages(id,name,runes,bonus_runes,price_rub,is_popular) VALUES('adept','A',150,15,825,TRUE),('keeper','K',500,75,2700,FALSE),('chosen','C',1500,300,9000,FALSE),('starter','S',50,0,250,FALSE)");
      const migration=fs.readFileSync(path.resolve(__dirname,"../../scripts/migrations/163_rune_package_value.sql"),"utf8");
      await client.query(migration);await client.query(migration);
      const {rows}=await client.query("SELECT id,runes,bonus_runes,price_rub,is_popular FROM rune_packages ORDER BY id");
      expect(rows.map(row=>({...row,price_rub:Number(row.price_rub)}))).toEqual([
        {id:"adept",runes:150,bonus_runes:15,price_rub:750,is_popular:true},
        {id:"chosen",runes:1500,bonus_runes:300,price_rub:7500,is_popular:false},
        {id:"keeper",runes:500,bonus_runes:75,price_rub:2700,is_popular:false},
        {id:"starter",runes:50,bonus_runes:0,price_rub:250,is_popular:false},
      ]);
    } finally { await client.query("ROLLBACK");client.release(); }
  });
  it("counts payment diagnostics for all external accounts independently of gift-cohort stages",async()=>{
    vi.stubEnv("FIRST_EXPERIENCE_ENABLED","true");
    try {
      for(const internal of [false,true]){
        const user=await createTestUser();
        await query("INSERT INTO user_accounts(profile_user_id,name,created_at,is_internal,email) VALUES($1,'Checkout fixture',NOW()-INTERVAL '100 days',$2,$3)",[user.id,internal,`${user.id}@telegram.zovus.local`]);
        await query("INSERT INTO spread_metrics(user_id,event,spread_id,source,metadata) VALUES($1,'payment_attempted','journey','first_experience','{}'),($1,'payment_attempted','journey','first_experience','{}'),($1,'payment_failed','journey','first_experience','{\"errorCode\":\"captcha_rejected\"}')",[user.id]);
      }
      const data=await getFirstExperienceAnalytics();
      expect(data?.checkout.stages).toContainEqual({event:"payment_attempted",code:"",requests:2,users:1});
      expect(data?.checkout.stages).toContainEqual({event:"payment_failed",code:"captcha_rejected",requests:1,users:1});
    } finally { vi.unstubAllEnvs(); }
  });
});
