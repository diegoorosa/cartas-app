-- ============================================
-- SCRIPT PARA CRIAR TABELAS DE TESTE
-- Rode no SQL Editor do Supabase (app.supabase.com)
-- ============================================

-- 1. Tabela de checkout_intents2 (teste, com colunas de cupom)
CREATE TABLE IF NOT EXISTS public.checkout_intents2 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    utm JSONB DEFAULT '{}',
    coupon TEXT,
    discount NUMERIC(5,2) DEFAULT 0,
    final_price NUMERIC(10,2),
    payment_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkout_intents2_order_id ON public.checkout_intents2(order_id);
CREATE INDEX IF NOT EXISTS idx_checkout_intents2_payment_id ON public.checkout_intents2(payment_id);

-- 2. Tabela webhook_processed (para idempotencia do webhook)
CREATE TABLE IF NOT EXISTS public.webhook_processed (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    payment_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_processed_payment_id ON public.webhook_processed(payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_processed_order_id ON public.webhook_processed(order_id);

-- 3. Colunas de recuperacao na tabela leads
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS recovery_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recovery_coupon TEXT,
    ADD COLUMN IF NOT EXISTS recovery_order_id TEXT,
    ADD COLUMN IF NOT EXISTS recovery_checkout_url TEXT;

-- 4. RLS (obrigatorio para tabelas novas no Supabase)
ALTER TABLE public.checkout_intents2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_processed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.checkout_intents2
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON public.webhook_processed
    FOR ALL USING (true) WITH CHECK (true);