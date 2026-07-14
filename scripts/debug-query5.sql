\pset border 2
\x on
SELECT id, type, amount, balance_after, description, action_type, payment_id, created_at
FROM rune_transactions
WHERE user_id = '2383df09-bb04-444d-9672-b9f3afd8c34c' AND created_at::date = CURRENT_DATE
ORDER BY created_at DESC
LIMIT 10;
