ALTER TABLE goals ADD COLUMN original_period VARCHAR(20);
UPDATE goals SET original_period = period WHERE original_period IS NULL;