-- Run after server/sql/schema.sql. Safe to rerun.
ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS meal_type text NOT NULL DEFAULT 'lunch';
ALTER TABLE meal_plans DROP CONSTRAINT IF EXISTS meal_plans_meal_type_check;
ALTER TABLE meal_plans ADD CONSTRAINT meal_plans_meal_type_check CHECK(meal_type IN ('lunch','dinner'));
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_plans_business ON meal_plans(business_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_customer_plan_active ON subscriptions(customer_id,plan_id) WHERE status='active' AND ends_on IS NULL;
