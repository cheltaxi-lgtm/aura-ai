-- Rune platform settings + starter grant flag
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS starter_runes_granted BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO platform_settings (key, value)
VALUES (
  'runes',
  '{
    "enabled": true,
    "rubPerRune": 2,
    "starterRunes": 30,
    "freeQuestions": 2,
    "costs": {
      "QUESTION": 10,
      "VISION_ANALYSIS": 15,
      "READING": 15,
      "DESTINY_CARD": 20,
      "JOINT_READING": 25,
      "DAILY_AMULET": 5,
      "FINAL_REPORT": 30
    }
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
