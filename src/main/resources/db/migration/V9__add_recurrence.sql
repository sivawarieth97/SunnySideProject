ALTER TABLE goals
    ADD COLUMN is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN recurrence_end VARCHAR(20);

CREATE TABLE goal_completions (
                                  goal_id      UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
                                  period       VARCHAR(20) NOT NULL,
                                  completed_at TIMESTAMP NOT NULL DEFAULT NOW(),
                                  PRIMARY KEY (goal_id, period)
);