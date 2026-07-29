CREATE TABLE goal_rollovers (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id         UUID        NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    from_period     VARCHAR(20) NOT NULL,
    to_period       VARCHAR(20) NOT NULL,
    rolled_over_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT goal_rollovers_period_changed CHECK (from_period <> to_period),
    CONSTRAINT uq_goal_rollover UNIQUE (goal_id, from_period, to_period)
);

CREATE INDEX idx_goal_rollovers_goal_time
    ON goal_rollovers(goal_id, rolled_over_at DESC);

CREATE INDEX idx_goals_rollover_candidates
    ON goals(user_id, level, period)
    WHERE status = 'PENDING'
      AND is_recurring = FALSE
      AND period IS NOT NULL;
