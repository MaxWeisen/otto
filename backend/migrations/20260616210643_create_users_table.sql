-- +goose Up
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  google_sub varchar(255) NOT NULL UNIQUE,
  email varchar(255) NOT NULL,
  name varchar(255),
  avatar_url varchar(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- +goose Down
DROP TABLE users;