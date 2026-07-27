ALTER TABLE goals
    ADD COLUMN period           VARCHAR(20),
  ADD COLUMN rolled_over_from UUID REFERENCES goals(id),
  ADD COLUMN status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE goals SET status = 'ROLLED_OVER' WHERE false;