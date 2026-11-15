import {Router} from 'express';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
export function paymentRoutes(pool){
 const r=Router();
 const invoicesSql=`SELECT i.id,i.subscription_id,i.period_start,i.period_end,i.total_paise,
 c.name AS customer_name,p.name AS plan_name,
 COALESCE(SUM(pay.amount_paise),0)::int AS paid_paise,
 (i.total_paise-COALESCE(SUM(pay.amount_paise),0))::int AS due_paise
 FROM invoices i JOIN subscriptions s ON s.id=i.subscription_id
 JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id
 LEFT JOIN payments pay ON pay.invoice_id=i.id
 WHERE c.business_id=$1 AND p.business_id=$1
 GROUP BY i.id,c.name,p.name ORDER BY i.period_start DESC,i.id DESC LIMIT 300`;
 r.get('/invoices',safe(async(req,res)=>{
  const [q,h]=await Promise.all([pool.query(invoicesSql,[req.user.businessId]),pool.query(`SELECT pay.id,pay.invoice_id,pay.amount_paise,pay.paid_at,c.name AS customer_name FROM payments pay JOIN invoices i ON i.id=pay.invoice_id JOIN subscriptions s ON s.id=i.subscription_id JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id WHERE c.business_id=$1 AND p.business_id=$1 ORDER BY pay.paid_at DESC LIMIT 100`,[req.user.businessId])]);
  const invoices=q.rows;
  res.json({invoices,payments:h.rows,summary:{invoicedPaise:invoices.reduce((a,x)=>a+x.total_paise,0),paidPaise:invoices.reduce((a,x)=>a+x.paid_paise,0),duePaise:invoices.reduce((a,x)=>a+x.due_paise,0)},summaryScope:'latest 300 invoices'});
 }));
 r.post('/invoices',safe(async(req,res)=>{
  const {subscriptionId,periodStart,periodEnd,totalPaise}=req.body||{};
  if(!uuid.test(subscriptionId)||!validDate(periodStart)||!validDate(periodEnd)||periodEnd<periodStart||!Number.isSafeInteger(totalPaise)||totalPaise<=0||totalPaise>100000000)return res.status(400).json({error:'Invalid invoice details'});
  const q=await pool.query(`INSERT INTO invoices(subscription_id,period_start,period_end,total_paise)
 SELECT s.id,$2::date,$3::date,$4 FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id WHERE s.id=$1 AND c.business_id=$5 AND p.business_id=$5 RETURNING id,subscription_id,period_start,period_end,total_paise`,[subscriptionId,periodStart,periodEnd,totalPaise,req.user.businessId]);
  if(!q.rowCount)return res.status(404).json({error:'Subscription not found'});
  res.status(201).json({invoice:q.rows[0]});
 }));
 // Only confirmed delivered meal entries are billable; scheduled meals are not treated as deliveries.
 const billingQuery=`SELECT COUNT(*)::int AS meals,COALESCE(SUM(e.price_paise),0)::int AS total_paise
 FROM meal_entries e JOIN subscriptions s ON s.id=e.subscription_id
 JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id
 WHERE e.subscription_id=$1 AND c.business_id=$2 AND p.business_id=$2
 AND e.meal_date BETWEEN $3::date AND $4::date AND e.status='delivered'`;
 r.post('/invoices/auto-preview',safe(async(req,res)=>{
  const {subscriptionId,periodStart,periodEnd}=req.body||{};
  if(!uuid.test(subscriptionId)||!validDate(periodStart)||!validDate(periodEnd)||periodEnd<periodStart)return res.status(400).json({error:'Invalid billing period'});
  const q=await pool.query(billingQuery,[subscriptionId,req.user.businessId,periodStart,periodEnd]);
  const existing=await pool.query(`SELECT id FROM invoices WHERE subscription_id=$1 AND period_start<=$3::date AND period_end>=$2::date LIMIT 1`,[subscriptionId,periodStart,periodEnd]);
  res.json({meals:q.rows[0].meals,totalPaise:q.rows[0].total_paise,hasOverlappingInvoice:!!existing.rowCount,basis:'confirmed delivered meals only'});
 }));
 r.post('/invoices/auto-generate',safe(async(req,res)=>{
  const {subscriptionId,periodStart,periodEnd}=req.body||{};
  if(!uuid.test(subscriptionId)||!validDate(periodStart)||!validDate(periodEnd)||periodEnd<periodStart)return res.status(400).json({error:'Invalid billing period'});
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const sub=await client.query(`SELECT s.id FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id WHERE s.id=$1 AND c.business_id=$2 AND p.business_id=$2 FOR UPDATE OF s`,[subscriptionId,req.user.businessId]);
   if(!sub.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Subscription not found'})}
   const existing=await client.query(`SELECT id FROM invoices WHERE subscription_id=$1 AND period_start<=$3::date AND period_end>=$2::date LIMIT 1`,[subscriptionId,periodStart,periodEnd]);
   if(existing.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'An invoice already covers part of this billing period'})}
   const q=await client.query(billingQuery,[subscriptionId,req.user.businessId,periodStart,periodEnd]);
   if(!q.rows[0].meals){await client.query('ROLLBACK');return res.status(409).json({error:'No confirmed delivered meals in this period'})}
   const i=await client.query('INSERT INTO invoices(subscription_id,period_start,period_end,total_paise) VALUES($1,$2::date,$3::date,$4) RETURNING id,subscription_id,period_start,period_end,total_paise',[subscriptionId,periodStart,periodEnd,q.rows[0].total_paise]);
   await client.query('COMMIT');res.status(201).json({invoice:i.rows[0],meals:q.rows[0].meals});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }));
 r.post('/invoices/:id/payments',safe(async(req,res)=>{
  if(!uuid.test(req.params.id)||!Number.isSafeInteger(req.body?.amountPaise)||req.body.amountPaise<=0||req.body.amountPaise>100000000)return res.status(400).json({error:'Invalid payment amount'});
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const q=await client.query(`SELECT i.id,i.total_paise FROM invoices i JOIN subscriptions s ON s.id=i.subscription_id JOIN customers c ON c.id=s.customer_id JOIN meal_plans p ON p.id=s.plan_id WHERE i.id=$1 AND c.business_id=$2 AND p.business_id=$2 FOR UPDATE OF i`,[req.params.id,req.user.businessId]);
   if(!q.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Invoice not found'})}
   const paid=await client.query('SELECT COALESCE(SUM(amount_paise),0)::int AS paid FROM payments WHERE invoice_id=$1',[req.params.id]);
   if(req.body.amountPaise>q.rows[0].total_paise-paid.rows[0].paid){await client.query('ROLLBACK');return res.status(409).json({error:'Payment exceeds outstanding balance'})}
   const p=await client.query('INSERT INTO payments(invoice_id,amount_paise) VALUES($1,$2) RETURNING id,invoice_id,amount_paise,paid_at',[req.params.id,req.body.amountPaise]);
   await client.query('COMMIT');res.status(201).json({payment:p.rows[0]});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }));
 return r;
}
