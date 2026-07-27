CREATE TABLE goals (
                       id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                       title       VARCHAR(500) NOT NULL,
                       description TEXT,
                       status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                       created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);