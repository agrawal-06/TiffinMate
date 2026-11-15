import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import rateLimit from 'express-rate-limit';

import {mealRoutes} from './meals.js';
import {paymentRoutes} from './payments.js';
const app=express();
const authLimiter=rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many attempts. Try again in 15 minutes.'}});
const recoveryLimiter=rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many recovery requests. Try again later.'}});
app.use(helmet());app.use(cors({origin:process.env.CORS_ORIGIN?.split(',')||false}));app.use(express.json({limit:'20kb'}));
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true}}):null;
const secret=process.env.JWT_SECRET;
const ready=(req,res,next)=>{if(!pool||!secret)return res.status(503).json({error:'Server configuration incomplete'});next()};
const auth=(req,res,next)=>{try{const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)throw Error();req.user=jwt.verify(token,secret,{algorithms:['HS256']});next()}catch{return res.status(401).json({error:'Unauthorized'})}};
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const validEmail=e=>typeof e==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)&&e.length<=254;
const issue=(id,businessId)=>jwt.sign({sub:id,businessId},secret,{algorithm:'HS256',expiresIn:'7d'});
app.get('/health',asyncRoute(async(req,res)=>{if(pool)await pool.query('SELECT 1');res.json({status:'ok',database:pool?'connected':'not configured'})}));
app.post('/api/auth/register',authLimiter,ready,asyncRoute(async(req,res)=>{
 const {email,password,businessName}=req.body||{};
 if(!validEmail(email)||typeof password!=='string'||password.length<10||password.length>128||typeof businessName!=='string'||!businessName.trim()||businessName.length>100)return res.status(400).json({error:'Valid email, business name and password (10–128 characters) required'});
 const client=await pool.connect();
 try{await client.query('BEGIN');
 const hash=await bcrypt.hash(password,12);
 const u=await client.query('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email',[email.trim().toLowerCase(),hash]);
 const b=await client.query('INSERT INTO businesses(name) VALUES($1) RETURNING id,name',[businessName.trim()]);
 await client.query("INSERT INTO business_members(business_id,user_id,role) VALUES($1,$2,'owner')",[b.rows[0].id,u.rows[0].id]);
 await client.query('COMMIT');res.status(201).json({token:issue(u.rows[0].id,b.rows[0].id),user:u.rows[0],business:b.rows[0]});
 }catch(e){await client.query('ROLLBACK');if(e.code==='23505')return res.status(409).json({error:'Email already registered'});throw e}finally{client.release()}
}));
app.post('/api/auth/login',authLimiter,ready,asyncRoute(async(req,res)=>{
 const {email,password}=req.body||{};
 if(!validEmail(email)||typeof password!=='string')return res.status(400).json({error:'Invalid credentials'});
 const result=await pool.query("SELECT u.id,u.email,u.password_hash,b.id AS business_id,b.name AS business_name FROM users u JOIN business_members m ON m.user_id=u.id JOIN businesses b ON b.id=m.business_id WHERE u.email=$1 ORDER BY b.created_at LIMIT 1",[email.trim().toLowerCase()]);
 const u=result.rows[0];if(!u||!await bcrypt.compare(password,u.password_hash))return res.status(401).json({error:'Invalid credentials'});
 res.json({token:issue(u.id,u.business_id),user:{id:u.id,email:u.email},business:{id:u.business_id,name:u.business_name}});
}));

app.get('/reset-password',(req,res)=>{
 const nonce=crypto.randomBytes(16).toString('base64');
 res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'`);
 const token=typeof req.query.token==='string'&&/^[a-f0-9]{64}$/.test(req.query.token)?req.query.token:'';
 res.type('html').send(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>TiffinMate password reset</title><style>body{font-family:system-ui;background:#f7f2e8;color:#243b30;display:grid;place-items:center;min-height:90vh}main{background:#fff9ef;padding:32px;border-radius:24px;max-width:360px;width:85%}input,button{box-sizing:border-box;width:100%;padding:14px;margin-top:14px;border-radius:12px;border:1px solid #ddd}button{background:#397c59;color:white;font-weight:bold}p{line-height:1.5}</style></head><body><main><h1>Reset your password</h1><p>Choose a new password of at least 10 characters.</p><form id="f"><input type="password" id="p" autocomplete="new-password" minlength="10" maxlength="128" placeholder="New password" required><input type="password" id="c" autocomplete="new-password" minlength="10" maxlength="128" placeholder="Confirm new password" required><button>Reset password</button></form><p id="msg"></p></main><script nonce="${nonce}">const token=${JSON.stringify(token)};if(!token){document.getElementById('f').hidden=true;document.getElementById('msg').textContent='Invalid reset link';}document.getElementById('f').onsubmit=async e=>{e.preventDefault();const p=document.getElementById('p').value;if(p!==document.getElementById('c').value){document.getElementById('msg').textContent='Passwords do not match';return;}try{const r=await fetch('/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password:p})});const data=await r.json();document.getElementById('msg').textContent=data.message||data.error||'Unable to reset';if(r.ok){document.getElementById('f').hidden=true;document.querySelector('h1').textContent='Password changed successfully!';document.querySelector('main > p').textContent='Your new password has been saved. Open TiffinMate and sign in with your new password.';document.getElementById('msg').textContent='You can now return to the app and log in.';}}catch{document.getElementById('msg').textContent='Connection error';}};</script></body></html>`);
});
// Password reset: one-time token, 15-minute expiry, generic response to prevent email enumeration.
app.post('/api/auth/forgot-password',recoveryLimiter,ready,asyncRoute(async(req,res)=>{
 const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
 if(!validEmail(email))return res.status(400).json({error:'Enter a valid email address'});
 if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASS||!process.env.SMTP_FROM)
  return res.status(503).json({error:'Password recovery is not configured yet. Contact support.'});
 const result=await pool.query('SELECT id FROM users WHERE email=$1',[email]);
 if(result.rows[0]){
  const token=crypto.randomBytes(32).toString('hex');
  const hash=crypto.createHash('sha256').update(token).digest('hex');
  const userId=result.rows[0].id;
  await pool.query('INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval \'15 minutes\')',[userId,hash]);
  const resetBase=process.env.PASSWORD_RESET_URL||'https://tiffinmate-api.vercel.app/reset-password';
  const link=resetBase+(resetBase.includes('?')?'&':'?')+'token='+encodeURIComponent(token);
  const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:Number(process.env.SMTP_PORT||465)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
  try{
   await transport.sendMail({from:process.env.SMTP_FROM,to:email,subject:'Reset your TiffinMate password',text:'Reset your TiffinMate password: '+link+'\nThis link expires in 15 minutes. If you did not request it, ignore this message.',html:'<p>Someone requested a password reset for your TiffinMate account.</p><p><a href="'+link+'">Reset password</a></p><p>This link expires in 15 minutes. If this was not you, ignore this message.</p>'});
  }catch(err){console.error('SMTP password reset delivery failed',err.code||err.message);return res.status(503).json({error:'Unable to send recovery email right now'})}
 }
 res.json({message:'If an account exists for this email, a reset link has been sent.'});
}));
app.post('/api/auth/reset-password',authLimiter,ready,asyncRoute(async(req,res)=>{
 const {token,password}=req.body||{};
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||typeof password!=='string'||password.length<10||password.length>128)
  return res.status(400).json({error:'Valid reset token and password (10–128 characters) required'});
 const hash=crypto.createHash('sha256').update(token).digest('hex');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const found=await client.query('SELECT id,user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',[hash]);
  if(!found.rows[0]){await client.query('ROLLBACK');return res.status(400).json({error:'Reset link is invalid or expired'})}
  const passwordHash=await bcrypt.hash(password,12);
  await client.query('UPDATE users SET password_hash=$1 WHERE id=$2',[passwordHash,found.rows[0].user_id]);
  await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[found.rows[0].user_id]);
  await client.query('COMMIT');
  res.json({message:'Password updated. You can now sign in.'});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}));
app.get('/api/customers',ready,auth,asyncRoute(async(req,res)=>{
 const result=await pool.query('SELECT id,name,phone,created_at FROM customers WHERE business_id=$1 ORDER BY created_at DESC LIMIT 200',[req.user.businessId]);res.json({customers:result.rows});
}));
app.post('/api/customers',ready,auth,asyncRoute(async(req,res)=>{
 const {name,phone}=req.body||{};
 if(typeof name!=='string'||!name.trim()||name.length>120||phone!=null&&(typeof phone!=='string'||phone.length>25))return res.status(400).json({error:'Valid name and phone required'});
 const result=await pool.query('INSERT INTO customers(business_id,name,phone) VALUES($1,$2,$3) RETURNING id,name,phone,created_at',[req.user.businessId,name.trim(),phone?.trim()||null]);res.status(201).json({customer:result.rows[0]});
}));
app.patch('/api/customers/:id',ready,auth,asyncRoute(async(req,res)=>{
 const {name,phone}=req.body||{};
 if(typeof name!=='string'||!name.trim()||name.length>120||phone!=null&&(typeof phone!=='string'||phone.length>25))return res.status(400).json({error:'Valid customer name and phone required'});
 const result=await pool.query('UPDATE customers SET name=$1,phone=$2 WHERE id=$3 AND business_id=$4 RETURNING id,name,phone,created_at',[name.trim(),phone?.trim()||null,req.params.id,req.user.businessId]);
 if(!result.rowCount)return res.status(404).json({error:'Customer not found'});
 res.json({customer:result.rows[0]});
}));
app.patch('/api/customers/:id',ready,auth,asyncRoute(async(req,res)=>{
 const {name,phone}=req.body||{};
 if(typeof name!=='string'||!name.trim()||name.length>120||phone!=null&&(typeof phone!=='string'||phone.length>25))return res.status(400).json({error:'Valid name and phone required'});
 const q=await pool.query('UPDATE customers SET name=$1,phone=$2 WHERE id=$3 AND business_id=$4 RETURNING id,name,phone,created_at',[name.trim(),phone?.trim()||null,req.params.id,req.user.businessId]);
 if(!q.rowCount)return res.status(404).json({error:'Customer not found'});
 res.json({customer:q.rows[0]});
}));
app.delete('/api/customers/:id',ready,auth,asyncRoute(async(req,res)=>{
 const result=await pool.query('DELETE FROM customers WHERE id=$1 AND business_id=$2 RETURNING id',[req.params.id,req.user.businessId]);if(!result.rowCount)return res.status(404).json({error:'Customer not found'});res.status(204).end();
}));
app.get('/api/dashboard',ready,auth,asyncRoute(async(req,res)=>{
 const result=await pool.query('SELECT COUNT(*)::int AS customers FROM customers WHERE business_id=$1',[req.user.businessId]);res.json({customers:result.rows[0].customers});
}));
if(pool){app.use('/api',ready,auth,mealRoutes(pool));app.use('/api',ready,auth,paymentRoutes(pool));}
app.use((err,req,res,next)=>{console.error(err);res.status(err.code==='22P02'?400:500).json({error:err.code==='22P02'?'Invalid identifier':'Internal server error'})});
if(process.env.VERCEL!=='1')app.listen(process.env.PORT||4000,()=>console.log('TiffinMate API listening'));
export default app;
