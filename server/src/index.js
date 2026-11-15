import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

import {mealRoutes} from './meals.js';
import {paymentRoutes} from './payments.js';
const app=express();
app.use(helmet());app.use(cors({origin:process.env.CORS_ORIGIN?.split(',')||false}));app.use(express.json({limit:'20kb'}));
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true}}):null;
const secret=process.env.JWT_SECRET;
const ready=(req,res,next)=>{if(!pool||!secret)return res.status(503).json({error:'Server configuration incomplete'});next()};
const auth=(req,res,next)=>{try{const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)throw Error();req.user=jwt.verify(token,secret,{algorithms:['HS256']});next()}catch{return res.status(401).json({error:'Unauthorized'})}};
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const validEmail=e=>typeof e==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)&&e.length<=254;
const issue=(id,businessId)=>jwt.sign({sub:id,businessId},secret,{algorithm:'HS256',expiresIn:'7d'});
app.get('/health',asyncRoute(async(req,res)=>{if(pool)await pool.query('SELECT 1');res.json({status:'ok',database:pool?'connected':'not configured'})}));
app.post('/api/auth/register',ready,asyncRoute(async(req,res)=>{
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
app.post('/api/auth/login',ready,asyncRoute(async(req,res)=>{
 const {email,password}=req.body||{};
 if(!validEmail(email)||typeof password!=='string')return res.status(400).json({error:'Invalid credentials'});
 const result=await pool.query("SELECT u.id,u.email,u.password_hash,b.id AS business_id,b.name AS business_name FROM users u JOIN business_members m ON m.user_id=u.id JOIN businesses b ON b.id=m.business_id WHERE u.email=$1 ORDER BY b.created_at LIMIT 1",[email.trim().toLowerCase()]);
 const u=result.rows[0];if(!u||!await bcrypt.compare(password,u.password_hash))return res.status(401).json({error:'Invalid credentials'});
 res.json({token:issue(u.id,u.business_id),user:{id:u.id,email:u.email},business:{id:u.business_id,name:u.business_name}});
}));

// Password reset: one-time token, 15-minute expiry, generic response to prevent email enumeration.
app.post('/api/auth/forgot-password',ready,asyncRoute(async(req,res)=>{
 const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
 if(!validEmail(email))return res.status(400).json({error:'Enter a valid email address'});
 if(!process.env.RESEND_API_KEY||!process.env.PASSWORD_RESET_FROM||!process.env.PASSWORD_RESET_URL)
  return res.status(503).json({error:'Password recovery is not configured yet. Contact support.'});
 const result=await pool.query('SELECT id FROM users WHERE email=$1',[email]);
 if(result.rows[0]){
  const token=crypto.randomBytes(32).toString('hex');
  const hash=crypto.createHash('sha256').update(token).digest('hex');
  const userId=result.rows[0].id;
  await pool.query('INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval \'15 minutes\')',[userId,hash]);
  const link=process.env.PASSWORD_RESET_URL+(process.env.PASSWORD_RESET_URL.includes('?')?'&':'?')+'token='+encodeURIComponent(token);
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.PASSWORD_RESET_FROM,to:[email],subject:'Reset your TiffinMate password',html:'<p>Someone requested a password reset for your TiffinMate account.</p><p><a href="'+link+'">Reset password</a></p><p>This link expires in 15 minutes. If this was not you, ignore this message.</p>'})});
  if(!sent.ok){console.error('Password reset email delivery failed',sent.status);return res.status(503).json({error:'Unable to send recovery email right now'})}
 }
 res.json({message:'If an account exists for this email, a reset link has been sent.'});
}));
app.post('/api/auth/reset-password',ready,asyncRoute(async(req,res)=>{
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
