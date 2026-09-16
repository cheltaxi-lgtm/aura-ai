import { expect, test, type Page } from "@playwright/test";
import { SignJWT } from "jose";
test.beforeEach(()=>test.skip(process.env.FIRST_EXPERIENCE_E2E_LOCAL!=="1","Run the guarded local first-experience launcher"));
const readingId="11111111-1111-4111-8111-111111111111";
const paymentId="22222222-2222-4222-8222-222222222222";
async function fixture(page:Page) {
  const token=await new SignJWT({role:"user",tv:0}).setSubject("33333333-3333-4333-8333-333333333333").setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  await page.context().addCookies([{name:"aura_auth",value:token,url:"http://127.0.0.1:3417",httpOnly:true,sameSite:"Lax"}]);
  let saved=false;let confirmed=false;let cancelled=false;const calls:string[]=[];const orders:string[]=[];
  await page.route("**/api/**",async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;calls.push(`${req.method()} ${path}`);
    if(path==="/api/auth/me")return route.fulfill({json:{authenticated:true,user:{sub:"fixture-account",role:"user",profileUserId:"fixture-profile",name:"Проверка",ageConfirmed:true}}});
    if(path==="/api/platform/features")return route.fulfill({json:{firstExperienceEnabled:true,recaptcha:{configured:false,masterEnabled:false,scopes:{}}}});
    if(path==="/api/cabinet")return route.fulfill({json:{profile:{id:"fixture-profile",name:"Проверка",email:"fixture@example.invalid",birthDate:"1990-01-01",birthCity:"Москва",runeBalance:20},stats:{totalSessions:1,daysWithUs:2,totalCards:3,favoriteMaster:null},achievements:{earned:[],locked:[]},sessions:[],sessionsTotal:0,sessionsHasMore:false,runes:{enabled:true,balance:20,transactions:[]},legacyAccess:null,photoSpreads:[],auraReadings:[],palmReadings:[],dailyReadings:[]}});
    if(path==="/api/profile")return route.fulfill({json:{profile:{id:"fixture-profile",name:"Проверка",gender:"female",birthDate:"1990-01-01",birthCity:"Москва",tarotCards:[]},needsOnboarding:false}});
    if(path==="/api/diary/journey"){
      if(req.method()==="POST"){const body=req.postDataJSON();if(body.insight!==undefined)saved=true;return route.fulfill({json:{ok:true}});}
      return route.fulfill({json:{channels:["email","telegram"],journey:{reading:{id:readingId,title:"Ваш портрет ауры",kind:"aura",date:"2026-09-08T10:00:00Z",href:`/cabinet/readings/${readingId}/print`},note:saved?{entry_text:"Выделить время для отдыха",weekly_step:"Одна прогулка",reflection:"",reminder_consent_at:null,reminder_channel:null}:null,continuation:{id:"matrix",product:"matrix",title:"Матрица судьбы",href:"/numerology/destiny-matrix",benefit:"Посмотрите на свои сильные стороны.",cost:100,rubPerRune:5}}}});
    }
    if(path==="/api/runes/config")return route.fulfill({json:{enabled:true,starterRunes:100,rubPerRune:5,costs:{READING:100,NUMEROLOGY_SESSION:100},packages:[{id:"small",name:"Для выбранного разбора",runes:100,bonus_runes:0,price_rub:500,is_popular:false}]}});
    if(path==="/api/runes/balance")return route.fulfill({json:{balance:confirmed?120:20,pending:false}});
    if(path==="/api/runes/daily/status")return route.fulfill({json:{available:false}});
    if(path==="/api/runes/purchase"){orders.push(req.postDataJSON().requestId);return route.fulfill({json:{paymentId,paymentUrl:`http://127.0.0.1:3417/runes/success?paymentId=${paymentId}`}});}
    if(path==="/api/runes/confirm")return route.fulfill({json:cancelled?{status:"cancelled",paymentId}:confirmed?{status:"credited",credited:true,balance:120,paymentId,amountRub:500,packageId:"small"}:{status:"pending",balance:120}});
    return route.fulfill({json:{}});
  });
  await page.route(/https:\/\/(?!127\.0\.0\.1|localhost).*/,route=>route.abort());
  return {calls,orders,cancel:()=>{cancelled=true;},confirm:()=>{confirmed=true;cancelled=false;}};
}

test("public landing and registration show the server-authoritative 100-rune gift",async({page})=>{
  await page.route("**/api/auth/me",route=>route.fulfill({json:{authenticated:false}}));
  await page.route("**/api/auth/oauth/providers",route=>route.fulfill({json:{providers:[]}}));
  await page.route("**/api/platform/features",route=>route.fulfill({json:{firstExperienceEnabled:true,recaptcha:{configured:false,masterEnabled:false,scopes:{}}}}));
  await page.route("**/api/runes/config",route=>route.fulfill({json:{enabled:true,starterRunes:100,rubPerRune:5,freeQuestions:2,costs:{READING:15,VISION_ANALYSIS:30,NUMEROLOGY_SESSION:100,HD_REPORT:300,NATAL_READING:300}}}));
  await page.goto("/");
  await expect(page.getByText("При первой регистрации — стартовые 100 ᚢ",{exact:false}).first()).toBeVisible();
  await expect(page.locator(".editorial-starter-gift__amount")).toHaveText("При первой регистрации — 100 ᚢ");
  await page.goto("/auth/user/register");
  await expect(page.getByText("При первой регистрации — стартовые 100 ᚢ",{exact:false}).first()).toBeVisible();
});

for(const width of [360,390,430])test(`free note and explicit topup return at ${width}px`,async({page},info)=>{
  test.setTimeout(120_000);await page.setViewportSize({width,height:844});const f=await fixture(page);
  await page.goto("/cabinet");
  const journey=page.getByRole("region",{name:"Что хочется взять с собой?"});await expect(journey).toBeVisible();
  await journey.locator("summary").click();
  await journey.getByLabel("Мой главный вывод").fill("Выделить время для отдыха");
  await journey.getByLabel("Небольшой шаг на неделю").fill("Одна прогулка");
  await expect(journey.getByRole("checkbox")).not.toBeChecked();
  await journey.getByRole("button",{name:"Сохранить бесплатно"}).click();await expect(journey.getByRole("status")).toHaveText("Сохранено в вашем дневнике.");
  expect(f.calls.filter(c=>c.includes("/api/reading") || c.includes("/api/runes/purchase"))).toHaveLength(0);
  await page.screenshot({path:info.outputPath(`journey-${width}.png`),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.goto("/cabinet?shop=1");
  const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:/Для выбранного разбора/}).click();
  await expect(page).toHaveURL(/runes\/success/);
  // A higher balance with a pending payment must never be treated as confirmation.
  await expect(page.getByRole("heading",{name:"Подтверждаем оплату"})).toBeVisible();
  f.confirm();await expect(page.getByRole("heading",{name:"Руны на вашем балансе"})).toBeVisible({timeout:15_000});
  await expect(page).toHaveURL(/runes\/success/);
  expect(f.calls.filter(c=>c.startsWith("POST /api/runes/purchase"))).toHaveLength(1);
  expect(f.calls.some(c=>c==="POST /api/reading")).toBe(false);
  await page.screenshot({path:info.outputPath(`confirmed-${width}.png`)});
  await page.getByRole("link",{name:"Вернуться к выбору разбора"}).click();await expect(page).toHaveURL(/cabinet/);
  await expect(page.getByRole("paragraph").filter({hasText:"Выделить время для отдыха"})).toBeVisible();
});

for(const width of [390,1280])test(`saved palm intent and exact package quote at ${width}px`,async({page},info)=>{
  test.setTimeout(120_000);await page.setViewportSize({width,height:900});const f=await fixture(page);
  await page.goto("/cabinet");
  await page.evaluate((id)=>sessionStorage.setItem("aura_rune_selected_destination",JSON.stringify({path:`/gadanie-po-ladoni?reading=${id}`,requiredRunes:100,at:Date.now()})),readingId);
  await page.goto("/cabinet?shop=1");const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/cabinet$/);
  await expect(dialog.getByText(/Баланс: 20 ᚢ. Не хватает 80/)).toBeVisible();
  await expect(dialog.getByText(/после выбранного разбора — 20/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`quote-${width}.png`)});
  f.confirm();await dialog.getByRole("button",{name:/Для выбранного разбора/}).click();
  await expect(page.getByRole("heading",{name:"Руны на вашем балансе"})).toBeVisible();
  const back=page.getByRole("link",{name:"Вернуться к выбору разбора"});await expect(back).toHaveAttribute("href",`/gadanie-po-ladoni?reading=${readingId}`);
  await back.click();await expect(page).toHaveURL(new RegExp(`/gadanie-po-ladoni\\?reading=${readingId}`));
  expect(f.calls.some(call=>call==="POST /api/palm/interpret")).toBe(false);
});

test("Mini App retains pending attempt and permits retry after confirmed cancellation",async({page})=>{
  test.setTimeout(120_000);await page.setViewportSize({width:390,height:900});const f=await fixture(page);
  await page.goto("/cabinet?shop=1");const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
  await page.evaluate(()=>{
    (window as typeof window & {checkoutGoals:string[]}).checkoutGoals=[];
    window.ym=(_id,_method,goal,_params,callback)=>{
      if(goal==="rune_checkout_started")(window as typeof window & {checkoutGoals:string[]}).checkoutGoals.push(goal as string);
      if(typeof callback==="function")callback();
    };
  });
  // Simulate the existing native openLink contract without opening any external URL.
  await page.evaluate(()=>{window.Telegram={WebApp:{initData:"local-fixture",openLink:()=>undefined}};});
  const buy=dialog.getByRole("button",{name:/Для выбранного разбора/});
  await buy.click();await expect.poll(()=>f.orders.length).toBe(1);await expect(buy).toBeEnabled();
  await expect.poll(()=>page.evaluate(()=>(window as typeof window & {checkoutGoals:string[]}).checkoutGoals.length)).toBe(1);
  await buy.click();await expect.poll(()=>f.orders.length).toBe(2);expect(f.orders[1]).toBe(f.orders[0]);
  expect(await page.evaluate(()=>(window as typeof window & {checkoutGoals:string[]}).checkoutGoals.length)).toBe(1);
  f.cancel();await expect(buy).toBeEnabled();await buy.click();await expect.poll(()=>f.orders.length).toBe(3);
  expect(f.orders[2]).not.toBe(f.orders[0]);
  f.confirm();await expect(buy).toBeEnabled();await buy.click();await expect.poll(()=>f.orders.length).toBe(4);expect(f.orders[3]).not.toBe(f.orders[2]);
  await expect(page).toHaveURL(/cabinet/);
  expect(f.calls.some(c=>c==="POST /api/reading")).toBe(false);
});
