-- +goose Up
CREATE TABLE vehicles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year SMALLINT NOT NULL,
  make varchar(255) NOT NULL,
  model varchar(255) NOT NULL,
  trim varchar(255),
  vin varchar(17),
  nickname varchar(255),
  mileage INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON vehicles (user_id);

-- +goose Down
DROP TABLE vehicles;