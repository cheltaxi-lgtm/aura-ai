import {expect,test} from '@playwright/test';
for(const action of ['generate','refine','resume'] as const)test('Pro manual report '+action+' accepts and completes a durable job',async({page})=>{
  test.setTimeout(90_000);
  let stage=action==='resume'?'generating':'draft',polls=0,posts=0;
  const resultText=action==='refine'?'Уточнённый полный отчёт по карте.':'Готовый полный отчёт по карте.';
  const response=()=>({ok:true,case:{id:'fixture',client_id:'client',type:'manual_spread',status:stage==='completed'?(action==='refine'?'edited':'draft'):stage},client:{alias:'Тестовый клиент'},input:{payload:{cards:[{name:'Маг',position:'1'}],...(stage==='generating'?{premiumJobId:'fixture-job'}:{})}},versions:[{id:stage==='completed'?'2':'1',source:'ai',blocks:[{id:'b1',title:'Карта Маг',body:stage==='completed'?resultText:'Исходный текст отчёта.',position_ref:'1'}]}],deliveries:[]});
  await page.route('**/api/pro/cases/fixture',async route=>{
    if(route.request().method()==='PATCH'){posts++;const body=route.request().postDataJSON();expect(body.action).toBe(action==='refine'?'refine_block':'generate');if(action==='refine'){expect(body.versionId).toBe('1');expect(body.idempotencyKey).toBeTruthy();}stage='generating';return route.fulfill({status:202,json:{ok:true,async:true,jobId:'fixture-job',pollUrl:'/api/jobs/fixture-job',status:'generating'}});}
    return route.fulfill({json:response()});
  });
  await page.route('**/api/jobs/fixture-job',async route=>{
    polls++;if(polls>1)stage='completed';return route.fulfill({json:{id:'fixture-job',status:stage==='completed'?'completed':'running',kind:'pro_premium_report',result:stage==='completed'?{caseId:'fixture',versionId:'2'}:null}});
  });
  await page.goto('/pro/case/fixture');
  await expect(page.getByRole('heading',{name:'Практика · Расклад',exact:true})).toBeVisible();
  await expect.poll(async()=>page.evaluate(()=>{
    const header=document.querySelector('.app-top-header')?.getBoundingClientRect();
    const title=document.querySelector('.pro-shell__title')?.getBoundingClientRect();
    return !!header&&!!title&&title.top>=header.bottom;
  })).toBe(true);
  await expect(page.getByRole('textbox',{name:'Карты через запятую',exact:true})).toHaveValue('Маг');
  if(action==='generate')await page.getByRole('button',{name:'Сгенерировать премиум-отчёт',exact:true}).click();
  if(action==='refine'){
    await page.getByRole('button',{name:'Уточнить с ИИ',exact:true}).click();
    await page.getByPlaceholder(/Инструкция:/).fill('Добавьте конкретную практику');
    await page.getByRole('button',{name:'Переписать секцию',exact:true}).click();
  }
  await expect(page.getByRole('textbox',{name:'Текст раздела',exact:true})).toHaveValue(resultText,{timeout:30_000});
  await expect(page.getByRole('button',{name:'Сгенерировать премиум-отчёт',exact:true})).toBeEnabled();
  expect(posts).toBe(action==='resume'?0:1);expect(polls).toBeGreaterThanOrEqual(2);
  if(action==='refine')await page.screenshot({path:'test-artifacts/full-project-20261003/pro-refine-browser.png',fullPage:true});
});
