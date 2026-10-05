-- بعد از demo-data.mjs، یک بار، با اتصال مالک (DATABASE_URL، نقش dofixo) — RLS را دور می‌زند
-- و فقط روی پایگاه‌داده‌ی محلی اجرا شود. تاریخ ایجاد ردیف‌ها را با تاریخ ورود دستگاه و فاکتور هم‌سو
-- می‌کند (وگرنه همه «امروز» ساخته شده‌اند) و تاریخچه‌ی کیف پول پیامکی را می‌سازد.
-- همان docs/showcase/source/demo-data/fix-dates.sql است.
BEGIN;
UPDATE devices SET created_at = entry_date, updated_at = COALESCE(exit_date, entry_date + interval '1 day');
UPDATE customers c SET created_at = COALESCE((SELECT min(entry_date) - interval '10 minutes' FROM devices d WHERE d.customer_id = c.id), now() - interval '20 days');
UPDATE purchase_invoices SET created_at = invoice_date;
UPDATE sale_invoices SET created_at = invoice_date;
UPDATE repair_invoices SET created_at = invoice_date;
UPDATE repair_invoice_payments p SET payment_date = r.invoice_date + interval '2 hours', created_at = r.invoice_date + interval '2 hours'
  FROM repair_invoices r WHERE r.id = p.invoice_id;
UPDATE inventory_transactions t SET created_at = x.invoice_date FROM purchase_invoices x WHERE t.reference_type='purchase_invoice' AND t.reference_id = x.id;
UPDATE inventory_transactions t SET created_at = x.invoice_date FROM sale_invoices x WHERE t.reference_type='sale_invoice' AND t.reference_id = x.id;
UPDATE inventory_transactions t SET created_at = x.invoice_date FROM repair_invoices x WHERE t.reference_type='repair_invoice' AND t.reference_id = x.id;
UPDATE users SET created_at = now() - interval '120 days' WHERE workspace_id = 1;

-- SMS wallet: one 2,000,000-toman top-up, then customer notifications for recent devices.
UPDATE settings SET sms_customer_notifications_enabled = true WHERE workspace_id = 1;
INSERT INTO sms_topups (workspace_id, order_id, track_id, status, amount_rials, ref_number, card_number, paid_at, verified_at, created_by, created_at, updated_at)
VALUES (1, 'DFXS-1-0001', 3714418621, 'verified', 20000000, '201845', '603799******4521', now() - interval '35 days', now() - interval '35 days', 1, now() - interval '35 days', now() - interval '35 days');
INSERT INTO sms_wallet_transactions (workspace_id, type, amount_rials, balance_before_rials, balance_after_rials, topup_id, description, created_by, created_at)
VALUES (1, 'topup', 20000000, 0, 20000000, 1, 'شارژ کیف پول از درگاه زیبال', 1, now() - interval '35 days');

DO $$
DECLARE d record; bal numeric := 20000000; mid int; k sms_message_kind;
BEGIN
  FOR d IN SELECT dv.id, dv.customer_id, dv.entry_date, dv.exit_date, dv.status, c.phone
           FROM devices dv JOIN customers c ON c.id = dv.customer_id
           WHERE dv.entry_date > now() - interval '34 days' ORDER BY dv.entry_date LOOP
    FOREACH k IN ARRAY (CASE WHEN d.status = 'delivered' THEN ARRAY['device_accepted','device_ready','device_delivered']::sms_message_kind[]
                             WHEN d.status = 'ready_for_pickup' THEN ARRAY['device_accepted','device_ready']::sms_message_kind[]
                             ELSE ARRAY['device_accepted']::sms_message_kind[] END) LOOP
      INSERT INTO sms_messages (workspace_id, customer_id, device_id, phone, kind, segments, unit_price_rials, cost_rials, status, provider_message_id, created_by, created_at, sent_at)
      VALUES (1, d.customer_id, d.id, d.phone, k, 2, 1750, 3500, 'sent', (100000000 + d.id * 10 + 1)::text, 1,
              CASE k WHEN 'device_accepted' THEN d.entry_date ELSE COALESCE(d.exit_date, d.entry_date + interval '3 days') END,
              CASE k WHEN 'device_accepted' THEN d.entry_date ELSE COALESCE(d.exit_date, d.entry_date + interval '3 days') END)
      RETURNING id INTO mid;
      INSERT INTO sms_wallet_transactions (workspace_id, type, amount_rials, balance_before_rials, balance_after_rials, sms_message_id, description, created_by, created_at)
      VALUES (1, 'send', -3500, bal, bal - 3500, mid, 'ارسال پیامک به مشتری', 1, (SELECT created_at FROM sms_messages WHERE id = mid));
      bal := bal - 3500;
    END LOOP;
  END LOOP;
  UPDATE sms_wallets SET balance_rials = bal, updated_at = now() WHERE workspace_id = 1;
END $$;
COMMIT;
SELECT balance_rials, (SELECT sum(amount_rials) FROM sms_wallet_transactions) FROM sms_wallets;
