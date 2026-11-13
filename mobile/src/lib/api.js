const BASE=process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
export async function api(path,options={}){const response=await fetch(BASE+path,{headers:{'Content-Type':'application/json',...options.headers},...options});const body=await response.json();if(!response.ok)throw new Error(body.error||'Request failed');return body;}
