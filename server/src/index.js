import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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
app.use((err,req,res,next)=>{console.error(err);res.status(err.code==='22P02'?400:500).json({error:err.code==='22P02'?'Invalid identifier':'Internal server error'})});
app.listen(process.env.PORT||4000,()=>console.log('TiffinMate API listening'));
