-- name: CreateVehicle :one
INSERT INTO vehicles (
  user_id, year, make, model, trim, vin, nickname, mileage
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8
)
RETURNING *;

-- name: ListVehiclesByUser :many
SELECT * FROM vehicles WHERE user_id = $1 ORDER BY created_at DESC;

-- name: GetVehicle :one
SELECT * FROM vehicles WHERE id = $1 AND user_id = $2;

-- name: UpdateVehicle :one
UPDATE vehicles
SET year = @year, make = @make, model = @model, trim = @trim, vin = @vin, nickname = @nickname, mileage = @mileage
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: DeleteVehicle :execrows
DELETE FROM vehicles WHERE id = $1 AND user_id = $2;
