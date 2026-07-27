ALTER TABLE goals ADD COLUMN parent_goal_id UUID REFERENCES goals(id) ON DELETE CASCADE;
CREATE INDEX idx_goals_parent_goal_id ON goals(parent_goal_id);