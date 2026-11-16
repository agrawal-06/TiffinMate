import {Router} from 'express';
const safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const validMonth=s=>typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function operationsRoutes(pool){
 const r=Router();
 r.get('/operations/today',safe(async(req,res)=>{
  const day=req.query.date||new Date().toISOString().slice(0,10);
  if(!validDay(day))return res.status(400).json({error:'Invalid date (YYYY-MM-DD)'});
  const q=await pool.query(`SELECT p.meal_type,s.id AS subscription_id,c.name AS customer_name,
    COALESCE(e.status,'pending') AS delivery_status,
    EXISTS(SELECT 1 FROM meal_pauses mp WHERE mp.subscription_id=s.id AND mp.status='approved' AND $2::date BETWEEN mp.start_date AND mp.end_date) AS paused
    FROM subscriptions s JOIN customers c ON c.id=s.customer_id
    JOIN meal_plans p ON p.id=s.plan_id
    LEFT JOIN meal_entries e ON e.subscription_id=s.id AND e.meal_date=$2::date
    WHERE c.business_id=$1 AND p.business_id=$1
    AND s.starts_on<=$2::date AND (s.ends_on IS NULL OR s.ends_on>=$2::date)
    AND (s.status='active' OR e.id IS NOT NULL)
    ORDER BY p.meal_type,c.name LIMIT 500`,[req.user.businessId,day]);
  const summary={date:day,lunch:{scheduled:0,paused:0,delivered:0,skipped:0,pending:0},dinner:{scheduled:0,paused:0,delivered:0,skipped:0,pending:0}};
  for(const x of q.rows){const item=summary[x.meal_type];if(!item)continue;
   if(x.paused&&x.delivery_status!=='delivered'){item.paused++;continue}
   item.scheduled++;if(x.delivery_status in item)item[x.delivery_status]++;
  }
  res.json({summary,meals:q.rows});
 }));
 r.get('/operations/calendar/:subscriptionId',safe(async(req,res)=>{
  if(!uuid.test(req.params.subscriptionId))return res.status(400).json({error:'Invalid subscription'});
  const month=req.query.month||new Date().toISOString().slice(0,7);
  if(!validMonth(month))return res.status(400).json({error:'Invalid month'});
  const sub=await pool.query(`SELECT s.id,s.starts_on,s.ends_on,s.status,p.meal_type,c.name AS customer_name
   FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id
   WHERE s.id=$1 AND c.business_id=$2 AND p.business_id=$2`,[req.params.subscriptionId,req.user.businessId]);
  if(!sub.rowCount)return res.status(404).json({error:'Subscription not found'});
  const [entries,pauses]=await Promise.all([
   pool.query(`SELECT meal_date,status,price_paise FROM meal_entries WHERE subscription_id=$1 AND meal_date >=$2::date AND meal_date<($2::date+interval '1 month') ORDER BY meal_date`,[req.params.subscriptionId,month+'-01']),
   pool.query(`SELECT id,start_date,end_date,status FROM meal_pauses WHERE subscription_id=$1 AND start_date<($2::date+interval '1 month') AND end_date >=$2::date ORDER BY start_date`,[req.params.subscriptionId,month+'-01'])
  ]);
  res.json({month,subscription:sub.rows[0],entries:entries.rows,pauses:pauses.rows});
 }));
 r.get('/operations/reminders',safe(async(req,res)=>{
  const q=await pool.query(`SELECT i.id AS invoice_id,c.name AS customer_name,c.phone,i.total_paise,
   COALESCE(SUM(pay.amount_paise),0)::int AS paid_paise,
   (i.total_paise-COALESCE(SUM(pay.amount_paise),0))::int AS due_paise
   FROM invoices i JOIN subscriptions s ON s.id=i.subscription_id
   JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id
   LEFT JOIN payments pay ON pay.invoice_id=i.id
   WHERE c.business_id=$1 AND p.business_id=$1
   GROUP BY i.id,c.name,c.phone HAVING i.total_paise>COALESCE(SUM(pay.amount_paise),0)
   ORDER BY due_paise DESC LIMIT 200`,[req.user.businessId]);
  // Only return a draft; WhatsApp must be opened explicitly by the operator.
  res.json({reminders:q.rows.map(x=>({...x,message:`Hello ${x.customer_name}, this is a friendly reminder from your tiffin service that ₹${(x.due_paise/100).toFixed(2)} is pending. Please contact us if you have already paid. Thank you!`}))});
 }));
 return r;
}
