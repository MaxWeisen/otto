-- name: CreateMaintenanceRecord :one
INSERT INTO maintenance_records (
  vehicle_id, type, description, performed_at, mileage, cost, notes
)
SELECT v.id, @type, @description, @performed_at, @mileage, @cost, @notes
FROM vehicles v
WHERE v.id = @vehicle_id AND v.user_id = @user_id
RETURNING *;

-- name: ListMaintenanceRecordsByVehicle :many
SELECT m.*
FROM maintenance_records m
JOIN vehicles v ON v.id = m.vehicle_id
WHERE m.vehicle_id = @vehicle_id AND v.user_id = @user_id
ORDER BY m.performed_at DESC, m.id DESC;

-- name: GetMaintenanceRecord :one
SELECT m.*
FROM maintenance_records m
JOIN vehicles v ON v.id = m.vehicle_id
WHERE m.id = @id AND m.vehicle_id = @vehicle_id AND v.user_id = @user_id;

-- name: UpdateMaintenanceRecord :one
UPDATE maintenance_records m
SET type = @type, description = @description, performed_at = @performed_at,
  mileage = @mileage, cost = @cost, notes = @notes
FROM vehicles v
WHERE m.id = @id AND m.vehicle_id = @vehicle_id
  AND v.id = m.vehicle_id AND v.user_id = @user_id
RETURNING m.*;

-- name: DeleteMaintenanceRecord :execrows
DELETE FROM maintenance_records m
USING vehicles v
WHERE m.id = @id AND m.vehicle_id = @vehicle_id
  AND v.id = m.vehicle_id AND v.user_id = @user_id;
