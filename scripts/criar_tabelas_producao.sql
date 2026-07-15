-- ============================================
-- SCRIPT DE PRODUÇÃO — SISTEMA DE RECUPERAÇÃO
-- Rode no SQL Editor do Supabase (app.supabase.com)
-- ============================================

-- 1. Adicionar colunas de cupom na checkout_intents (produção)
ALTER TABLE public.checkout_intents
    ADD COLUMN IF NOT EXISTS coupon TEXT,
    ADD COLUMN IF NOT EXISTS discount NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS final_price NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_checkout_intents_payment_id ON public.checkout_intents(payment_id);

-- 2. Tabela webhook_processed (para idempotência do webhook)
CREATE TABLE IF NOT EXISTS public.webhook_processed (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    payment_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_processed_payment_id ON public.webhook_processed(payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_processed_order_id ON public.webhook_processed(order_id);

-- 3. RLS (obrigatório para tabelas novas no Supabase)
ALTER TABLE public.webhook_processed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.webhook_processed
    FOR ALL USING (true) WITH CHECK (true);