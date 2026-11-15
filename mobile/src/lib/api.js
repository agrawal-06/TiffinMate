const BASE=(process.env.EXPO_PUBLIC_API_URL || 'https://tiffinmate-api.vercel.app').replace(/\/$/,'');
let unauthorizedHandler=null;
export function setUnauthorizedHandler(handler){unauthorizedHandler=handler}
export async function api(path,options={}){
 const response=await fetch(BASE+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
 const body=await response.json().catch(()=>({}));
 if(response.status===401&&options.headers?.Authorization&&unauthorizedHandler)unauthorizedHandler();
 if(!response.ok)throw new Error(body.error||'Request failed ('+response.status+')');
 return body;
}
