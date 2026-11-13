const BASE=(process.env.EXPO_PUBLIC_API_URL || 'https://tiffinmate-api.vercel.app').replace(/\/$/,'');
export async function api(path,options={}){
 const response=await fetch(BASE+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(body.error||'Request failed ('+response.status+')');
 return body;
}
