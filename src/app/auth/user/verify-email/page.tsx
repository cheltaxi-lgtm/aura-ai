"use client";
import { useEffect, useState } from "react";
export default function VerifyEmailPage() {
  const [token,setToken]=useState("");
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    const readToken=()=>setToken(new URLSearchParams(window.location.hash.slice(1)).get("token")??"");
    readToken();window.addEventListener("hashchange",readToken);
    return()=>window.removeEventListener("hashchange",readToken);
  },[]);
  async function confirm() {
    setBusy(true);setMessage("");
    try {
      const response=await fetch("/api/auth/user/verify-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error);
      setDone(true);setMessage(data.granted>0?`Почта подтверждена. Начислено ${data.granted} рун.`:"Почта подтверждена.");
      window.history.replaceState(null,"",window.location.pathname);
    } catch(error){setMessage(error instanceof Error?error.message:"Ошибка соединения");}
    finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-lg space-y-6 px-5 py-20 text-white">
    <h1 className="text-2xl font-semibold">Подтверждение почты</h1>
    <p>Подтвердите адрес только если вы сами зарегистрировали этот аккаунт Zovus.</p>
    {!token&&!done&&<p>В ссылке нет кода подтверждения. <a className="underline" href="/cabinet#daily-bonus">Запросить новое письмо в кабинете</a>.</p>}
    {!done&&<button className="rounded-xl bg-amber-300 px-5 py-3 text-black disabled:opacity-50" disabled={!token||busy} onClick={()=>void confirm()}>{busy?"Подтверждаем…":"Подтвердить почту"}</button>}
    <p role="status">{message}</p><a className="underline" href="/cabinet">Перейти в кабинет</a>
    {!done&&<p><a className="underline" href="/auth/user/login">Войти в свой аккаунт</a></p>}
  </main>;
}
