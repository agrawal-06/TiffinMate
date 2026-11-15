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
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[customerId,planId]);
   const duplicate=await client.query(`SELECT id FROM subscriptions WHERE customer_id=$1 AND plan_id=$2 AND status IN ('active','paused') AND starts_on<=COALESCE($4::date,'infinity'::date) AND COALESCE(ends_on,'infinity'::date)>=$3::date LIMIT 1`,[customerId,planId,startsOn,endsOn||null]);
   if(duplicate.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Subscription dates overlap an existing subscription'})}
   const q=await client.query(`INSERT INTO subscriptions(customer_id,plan_id,starts_on,ends_on,status)
    SELECT c.id,p.id,$3::date,$4::date,'active' FROM customers c CROSS JOIN meal_plans p
    WHERE c.id=$1 AND p.id=$2 AND c.business_id=$5 AND p.business_id=$5
    RETURNING id,customer_id,plan_id,starts_on,ends_on,status`,[customerId,planId,startsOn,endsOn||null,req.user.businessId]);
   if(!q.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Customer or plan not found'})}
   await client.query('COMMIT');
   res.status(201).json({subscription:q.rows[0]});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }));
 r.patch('/subscriptions/:id',safe(async(req,res)=>{
  const {id}=req.params;
  if(!uuid.test(id))return res.status(400).json({error:'Invalid subscription'});
  const {status,planId,startsOn,endsOn}=req.body||{};
  if(status!==undefined&&!['active','paused','cancelled'].includes(status))return res.status(400).json({error:'Invalid status'});
  if(planId!==undefined&&!uuid.test(planId))return res.status(400).json({error:'Invalid plan'});
  if(startsOn!==undefined&&(!date.test(startsOn)||Number.isNaN(Date.parse(startsOn))))return res.status(400).json({error:'Invalid start date'});
  if(endsOn!==undefined&&endsOn!==null&&(!date.test(endsOn)||Number.isNaN(Date.parse(endsOn))))return res.status(400).json({error:'Invalid end date'});
  const current=await pool.query(`SELECT s.*,c.business_id FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id WHERE s.id=$1 AND c.business_id=$2 AND p.business_id=$2`,[id,req.user.businessId]);
  if(!current.rowCount)return res.status(404).json({error:'Subscription not found'});
  const old=current.rows[0];
  if(old.status==='cancelled'&&status&&status!=='cancelled')return res.status(409).json({error:'Cancelled subscriptions cannot be resumed. Create a new subscription.'});
  const nextPlan=planId??old.plan_id,nextStart=startsOn??new Date(old.starts_on).toISOString().slice(0,10),nextEnd=endsOn===undefined?(old.ends_on?new Date(old.ends_on).toISOString().slice(0,10):null):endsOn,nextStatus=status??old.status;
  if(nextEnd&&nextEnd<nextStart)return res.status(400).json({error:'End date must be on or after start date'});
  const plan=await pool.query('SELECT id FROM meal_plans WHERE id=$1 AND business_id=$2',[nextPlan,req.user.businessId]);
  if(!plan.rowCount)return res.status(404).json({error:'Plan not found'});
  if(['active','paused'].includes(nextStatus)){
   const duplicate=await pool.query(`SELECT id FROM subscriptions WHERE customer_id=$1 AND plan_id=$2 AND id<>$3 AND status IN ('active','paused') AND (ends_on IS NULL OR ends_on >= CURRENT_DATE) LIMIT 1`,[old.customer_id,nextPlan,id]);
   if(duplicate.rowCount)return res.status(409).json({error:'Customer already has a subscription to this plan'});
  }
  const q=await pool.query(`UPDATE subscriptions SET plan_id=$1,starts_on=$2::date,ends_on=$3::date,status=$4 WHERE id=$5 RETURNING id,customer_id,plan_id,starts_on,ends_on,status`,[nextPlan,nextStart,nextEnd,nextStatus,id]);
  res.json({subscription:q.rows[0]});
 }));
 r.get('/deliveries',safe(async(req,res)=>{
  const day=req.query.date||new Date().toISOString().slice(0,10);
  if(typeof day!=='string'||!date.test(day)||Number.isNaN(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)return res.status(400).json({error:'Invalid delivery date'});
  const q=await pool.query(`SELECT s.id AS subscription_id,c.name AS customer_name,p.name AS plan_name,p.meal_type,p.price_paise,
  COALESCE(e.status,'pending') AS delivery_status,e.id AS entry_id
  FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id
  LEFT JOIN meal_entries e ON e.subscription_id=s.id AND e.meal_date=$2::date
  WHERE c.business_id=$1 AND p.business_id=$1 AND s.starts_on<=$2::date
  AND (s.ends_on IS NULL OR s.ends_on>=$2::date)
  AND (s.status='active' OR e.id IS NOT NULL)
  AND (e.id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM meal_pauses pause WHERE pause.subscription_id=s.id AND pause.status='approved' AND $2::date BETWEEN pause.start_date AND pause.end_date))
  ORDER BY p.meal_type,c.name,s.id LIMIT 500`,[req.user.businessId,day]);
  const rows=q.rows;res.json({date:day,deliveries:rows,summary:{total:rows.length,delivered:rows.filter(x=>x.delivery_status==='delivered').length,skipped:rows.filter(x=>x.delivery_status==='skipped').length,pending:rows.filter(x=>!['delivered','skipped'].includes(x.delivery_status)).length}});
 }));
 r.put('/deliveries/:subscriptionId',safe(async(req,res)=>{
  const {subscriptionId}=req.params,{date:day,status}=req.body||{};
  if(!uuid.test(subscriptionId)||typeof day!=='string'||!date.test(day)||Number.isNaN(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day||!['pending','delivered','skipped'].includes(status))return res.status(400).json({error:'Invalid delivery details'});
  const q=await pool.query(`SELECT s.id,p.price_paise FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id WHERE s.id=$1 AND c.business_id=$2 AND p.business_id=$2 AND s.starts_on<=$3::date AND (s.ends_on IS NULL OR s.ends_on>=$3::date)`,[subscriptionId,req.user.businessId,day]);
  if(!q.rowCount)return res.status(404).json({error:'Subscription not found for date'});
  const invoiced=await pool.query('SELECT id FROM invoices WHERE subscription_id=$1 AND $2::date BETWEEN period_start AND period_end LIMIT 1',[subscriptionId,day]);
  if(invoiced.rowCount)return res.status(409).json({error:'This delivery is in an invoiced period. Changes are locked to protect billing.'});
  if(status==='delivered'){
   const pause=await pool.query(`SELECT id FROM meal_pauses WHERE subscription_id=$1 AND status='approved' AND $2::date BETWEEN start_date AND end_date LIMIT 1`,[subscriptionId,day]);
   if(pause.rowCount)return res.status(409).json({error:'Cannot mark delivered during an approved pause'});
  }
  const result=await pool.query(`INSERT INTO meal_entries(subscription_id,meal_date,status,price_paise) VALUES($1,$2::date,$3,$4)
  ON CONFLICT(subscription_id,meal_date) DO UPDATE SET status=EXCLUDED.status,price_paise=CASE WHEN meal_entries.status='delivered' THEN meal_entries.price_paise ELSE EXCLUDED.price_paise END
  RETURNING id,subscription_id,meal_date,status,price_paise`,[subscriptionId,day,status,q.rows[0].price_paise]);
  res.json({delivery:result.rows[0]});
 }));
 r.get('/reports/monthly',safe(async(req,res)=>{
  const month=req.query.month;
  if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return res.status(400).json({error:'Use month YYYY-MM'});
  const start=month+'-01';
  const [meals,invoices,payments]=await Promise.all([
   pool.query(`SELECT e.status,COUNT(*)::int AS count,COALESCE(SUM(CASE WHEN e.status='delivered' THEN e.price_paise ELSE 0 END),0)::int AS earned_paise FROM meal_entries e JOIN subscriptions s ON s.id=e.subscription_id JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id WHERE c.business_id=$1 AND p.business_id=$1 AND e.meal_date >=$2::date AND e.meal_date<($2::date+INTERVAL '1 month') GROUP BY e.status`,[req.user.businessId,start]),
   pool.query(`SELECT COUNT(*)::int AS count,COALESCE(SUM(i.total_paise),0)::int AS invoiced_paise,COALESCE(SUM((SELECT COALESCE(SUM(pay.amount_paise),0) FROM payments pay WHERE pay.invoice_id=i.id)),0)::int AS paid_paise FROM invoices i JOIN subscriptions s ON s.id=i.subscription_id JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id WHERE c.business_id=$1 AND p.business_id=$1 AND i.period_start >=$2::date AND i.period_start<($2::date+INTERVAL '1 month')`,[req.user.businessId,start]),
   pool.query(`SELECT COALESCE(SUM(pay.amount_paise),0)::int AS paid_paise FROM payments pay JOIN invoices i ON i.id=pay.invoice_id JOIN subscriptions s ON s.id=i.subscription_id JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id WHERE c.business_id=$1 AND p.business_id=$1 AND pay.paid_at >= $2::date AND pay.paid_at < ($2::date+INTERVAL '1 month')`,[req.user.businessId,start])
  ]);
  const result={month,delivered:0,skipped:0,pending:0,earnedPaise:0,invoices:invoices.rows[0].count,invoicedPaise:invoices.rows[0].invoiced_paise,paidPaise:payments.rows[0].paid_paise};
  for(const row of meals.rows){if(row.status in result)result[row.status]=row.count;result.earnedPaise+=row.earned_paise}
  res.json({report:result});
 }));
 r.get('/customers/:customerId/deliveries',safe(async(req,res)=>{
  if(!uuid.test(req.params.customerId))return res.status(400).json({error:'Invalid customer'});
  const customer=await pool.query('SELECT id,name FROM customers WHERE id=$1 AND business_id=$2',[req.params.customerId,req.user.businessId]);
  if(!customer.rowCount)return res.status(404).json({error:'Customer not found'});
  const q=await pool.query(`SELECT e.meal_date,e.status,e.price_paise,p.name AS plan_name,p.meal_type FROM meal_entries e JOIN subscriptions s ON s.id=e.subscription_id JOIN meal_plans p ON p.id=s.plan_id WHERE s.customer_id=$1 AND p.business_id=$2 ORDER BY e.meal_date DESC LIMIT 100`,[req.params.customerId,req.user.businessId]);
  res.json({customer:customer.rows[0],deliveries:q.rows});
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
