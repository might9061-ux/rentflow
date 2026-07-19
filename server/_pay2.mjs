import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
const API='https://rentloja.onrender.com'
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const anon=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}})
const mk=async(pfx,isAdmin)=>{const email=`${pfx}_${Date.now()}@rentloja.test`,password='Pl12345!'
  const c=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role:'manager',first_name:pfx,last_name:'T',country:'ZW'}})
  await new Promise(r=>setTimeout(r,700))
  if(isAdmin) await admin.from('managers').update({platform_admin:true}).eq('id',c.data.user.id)
  const s=await anon.auth.signInWithPassword({email,password})
  return {id:c.data.user.id, tok:s.data.session.access_token}}
let A,V
try{
  A=await mk('padm',true); V=await mk('vic',false)
  const H=(t)=>({Authorization:`Bearer ${t}`,'Content-Type':'application/json'})
  const post=(t,b)=>fetch(`${API}/api/platform/workspaces/${V.id}/payment`,{method:'POST',headers:H(t),body:JSON.stringify(b)})
  // wait for deploy
  for(let i=1;i<=12;i++){
    const r=await post(A.tok,{amount:20,method:'EcoCash',reference:'MP250718.1234'})
    if(r.status!==404){ console.log('deployed ✓ record $20 →', r.status); break }
    console.log(`waiting for deploy… (${i})`); await new Promise(r=>setTimeout(r,20000))
  }
  const subsOf=async()=>{const {data}=await admin.from('subscription_payments').select('amount,period,method,reference').eq('manager_id',V.id)
    return {count:data.length,total:data.reduce((s,r)=>s+Number(r.amount),0),rows:data}}
  console.log('subs recorded:', JSON.stringify(await subsOf()))
  let r=await post(V.tok,{amount:999}); console.log('non-admin        →', r.status, r.status===403?'✓ blocked':'*** LEAK ***')
  r=await post(A.tok,{amount:-5});      console.log('negative amount  →', r.status, r.status===400?'✓ rejected':'?')
  r=await post(A.tok,{amount:'abc'});   console.log('non-numeric      →', r.status, r.status===400?'✓ rejected':'?')
  console.log('final:', JSON.stringify(await subsOf()))
}finally{ for(const u of [A,V]) if(u?.id){try{await admin.from('subscription_payments').delete().eq('manager_id',u.id)}catch{};try{await admin.from('managers').delete().eq('id',u.id)}catch{};try{await admin.auth.admin.deleteUser(u.id)}catch{}} }
