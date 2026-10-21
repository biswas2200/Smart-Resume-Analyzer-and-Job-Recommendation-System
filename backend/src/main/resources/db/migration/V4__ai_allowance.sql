-- Tiers v2: recommendations are gated on depth and volume, not on domain.
-- A free (USER) account may spend a small monthly allowance of AI
-- extractions on fields the local engine does not cover; the counter and
-- the month it belongs to live on the account (lazily reset by
-- AiAllowanceService when the month changes). Premium never consumes it.
ALTER TABLE users
    ADD COLUMN ai_period        VARCHAR(7) NOT NULL DEFAULT '',
    ADD COLUMN ai_analyses_used INTEGER    NOT NULL DEFAULT 0;

-- The lock reason "premium_domain" no longer exists: a locked result now
-- says why the AI engine could not be used for that request.
UPDATE parsed_profiles SET lock_reason = 'ai_engine_required' WHERE lock_reason = 'premium_domain';
