-- Real volume benefit at the 5 RUB/rune base rate. Preserve custom administrator
-- prices, package contents, balances and the popular badge.
UPDATE rune_packages SET price_rub = 750
WHERE id = 'adept' AND runes = 150 AND bonus_runes = 15 AND price_rub = 825;
UPDATE rune_packages SET price_rub = 2500
WHERE id = 'keeper' AND runes = 500 AND bonus_runes = 75 AND price_rub = 2875;
UPDATE rune_packages SET price_rub = 7500
WHERE id = 'chosen' AND runes = 1500 AND bonus_runes = 300 AND price_rub = 9000;
