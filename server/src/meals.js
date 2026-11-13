import { Router } from 'express';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date=/^\d{4}-\d{2}-\d{2}$/;
const safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
export function mealRoutes(pool){
 const r=Router();
 r.get('/plans',safe(async(req,res)=>{const q=await pool.query('SELECT id,name,meal_type,price_paise FROM meal_plans WHERE business_id=$1 ORDER BY name',[req.user.businessId]);res.json({plans:q.rows})}));
 r.post('/plans',safe(async(req,res)=>{
  const {name,mealType,pricePaise}=req.body||{};
  if(typeof name!=='string'||!name.trim()||name.length>80||!['lunch','dinner'].includes(mealType)||!Number.isSafeInteger(pricePaise)||pricePaise<0||pricePaise>1000000)return res.status(400).json({error:'Invalid meal plan'});
  const q=await pool.query('INSERT INTO meal_plans(business_id,name,meal_type,price_paise) VALUES($1,$2,$3,$4) RETURNING id,name,meal_type,price_paise',[req.user.businessId,name.trim(),mealType,pricePaise]);res.status(201).json({plan:q.rows[0]});
 }));
 r.get('/subscriptions',safe(async(req,res)=>{
  const q=await pool.query(`SELECT s.id,s.customer_id,s.plan_id,s.starts_on,s.ends_on,s.status,c.name AS customer_name,p.name AS plan_name,p.meal_type,p.price_paise
    FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id
    WHERE c.business_id=$1 AND p.business_id=$1 ORDER BY s.starts_on DESC LIMIT 300`,[req.user.businessId]);res.json({subscriptions:q.rows});
 }));
 r.post('/subscriptions',safe(async(req,res)=>{
  const {customerId,planId,startsOn,endsOn}=req.body||{};
  if(!uuid.test(customerId)||!uuid.test(planId)||!date.test(startsOn)||Number.isNaN(Date.parse(startsOn))||(endsOn!=null&&(!date.test(endsOn)||Number.isNaN(Date.parse(endsOn))||endsOn<startsOn)))return res.status(400).json({error:'Invalid subscription fields'});
  const q=await pool.query(`INSERT INTO subscriptions(customer_id,plan_id,starts_on,ends_on,status)
    SELECT c.id,p.id,$3::date,$4::date,'active' FROM customers c CROSS JOIN meal_plans p
    WHERE c.id=$1 AND p.id=$2 AND c.business_id=$5 AND p.business_id=$5
    RETURNING id,customer_id,plan_id,starts_on,ends_on,status`,[customerId,planId,startsOn,endsOn||null,req.user.businessId]);
  if(!q.rowCount)return res.status(404).json({error:'Customer or plan not found'});
  res.status(201).json({subscription:q.rows[0]});
 }));
 r.get('/kitchen',safe(async(req,res)=>{
  const day=req.query.date||new Date().toISOString().slice(0,10);
  if(typeof day!=='string'||!date.test(day)||Number.isNaN(Date.parse(day)))return res.status(400).json({error:'Invalid date'});
  const q=await pool.query(`SELECT p.meal_type,COUNT(*)::int AS portions
   FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id
   WHERE c.business_id=$1 AND p.business_id=$1 AND s.status='active'
   AND s.starts_on<=$2::date AND (s.ends_on IS NULL OR s.ends_on >=$2::date)
   AND NOT EXISTS(SELECT 1 FROM meal_pauses pause WHERE pause.subscription_id=s.id AND pause.status='approved' AND $2::date BETWEEN pause.start_date AND pause.end_date)
   GROUP BY p.meal_type`,[req.user.businessId,day]);
  const portions={lunch:0,dinner:0};for(const row of q.rows)portions[row.meal_type]=row.portions;
  res.json({date:day,portions,total:portions.lunch+portions.dinner,kind:'scheduled_estimate'});
 }));
 return r;
}
