-- +goose Up
CREATE TABLE maintenance_records (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  type varchar(32) NOT NULL,
  description varchar(255) NOT NULL,
  performed_at DATE NOT NULL,
  mileage INT,
  cost NUMERIC(10, 2) CHECK (cost >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON maintenance_records (vehicle_id, performed_at DESC, id DESC);

-- +goose Down
DROP TABLE maintenance_records;
