import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({resolve:vi.fn(),user:vi.fn(),daily:vi.fn()}));
vi.mock("@/lib/telegram/bot-resolve",()=>({resolveBotUser:mocks.resolve,botRunesShopUrl:()=>"/tariffs"}));
vi.mock("@/lib/users",async original=>({...await original<typeof import("@/lib/users")>(),getUserById:mocks.user}));
vi.mock("@/lib/daily-energy",async original=>({...await original<typeof import("@/lib/daily-energy")>(),getOrCreateDailyReading:mocks.daily}));
import { botDailyEnergy } from "@/lib/telegram/bot-product-service";
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({linked:true,accountId:"account",profileUserId:"profile",needsOnboarding:true,linkUrl:"/cabinet"});
  mocks.user.mockResolvedValue({name:"Fixture",birth_date:null,zodiac:"",astro_meta:{ageConfirmed:true,genderUnspecified:true}});
  mocks.daily.mockResolvedValue({text:"Saved daily reading",cards:[],cached:true});
});
describe("Telegram daily uses the same birth-optional consumer contract as web",()=>{
  it("opens the canonical free daily reading without inventing zodiac or a date of birth",async()=>{
    expect(await botDailyEnergy({telegramUserId:12345})).toMatchObject({ok:true,text:"Saved daily reading",cached:true});
    expect(mocks.daily).toHaveBeenCalledWith(expect.objectContaining({userId:"profile",birthDate:"",zodiac:""}));
  });
  it("still rejects missing authoritative adult confirmation before generation",async()=>{
    mocks.user.mockResolvedValue({name:"Fixture",birth_date:null,astro_meta:{}});
    expect(await botDailyEnergy({telegramUserId:12345})).toMatchObject({ok:false,error:"needs_onboarding"});
    expect(mocks.daily).not.toHaveBeenCalled();
  });
});
