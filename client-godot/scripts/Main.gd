extends Node2D

const TILE_SIZE := 48
const GRID_WIDTH := 27
const GRID_HEIGHT := 15

var traveler := Vector2i(13, 8)
var shimmer := 0.0

func _ready() -> void:
	queue_redraw()

func _process(delta: float) -> void:
	shimmer = fmod(shimmer + delta, 3.0)
	queue_redraw()

func _unhandled_input(event: InputEvent) -> void:
	if not event.is_action_pressed("move_up") and not event.is_action_pressed("move_down") and not event.is_action_pressed("move_left") and not event.is_action_pressed("move_right"):
		return
	var direction := Vector2i.ZERO
	if event.is_action_pressed("move_up"):
		direction = Vector2i.UP
	elif event.is_action_pressed("move_down"):
		direction = Vector2i.DOWN
	elif event.is_action_pressed("move_left"):
		direction = Vector2i.LEFT
	elif event.is_action_pressed("move_right"):
		direction = Vector2i.RIGHT
	var destination := traveler + direction
	if destination.x >= 0 and destination.x < GRID_WIDTH and destination.y >= 0 and destination.y < GRID_HEIGHT and not _is_water(destination):
		traveler = destination
		queue_redraw()

func lab_snapshot() -> Dictionary:
	return {
		"project": "living-world-lab-client",
		"authority": "fixture-only",
		"renderer": "gl_compatibility",
		"protocol": "not-connected",
		"traveler": traveler,
	}

func _is_water(cell: Vector2i) -> bool:
	return cell.y == 5 and cell.x > 2 and cell.x < 22 or cell.x == 20 and cell.y > 5

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, Vector2(GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE)), Color("101c1b"))
	for y in GRID_HEIGHT:
		for x in GRID_WIDTH:
			var cell := Vector2i(x, y)
			var origin := Vector2(cell.x * TILE_SIZE, cell.y * TILE_SIZE)
			var grass := Color("243c30") if (x + y) % 2 == 0 else Color("294734")
			draw_rect(Rect2(origin, Vector2(TILE_SIZE, TILE_SIZE)), Color("1c4b56") if _is_water(cell) else grass)
			if not _is_water(cell):
				draw_circle(origin + Vector2(12 + (x * 7) % 22, 15 + (y * 11) % 18), 2.0, Color("5b7f4d"))
			if (x * 5 + y * 3) % 17 == 0 and not _is_water(cell):
				draw_circle(origin + Vector2(29, 27), 7.0, Color("42613d"))

	for x in range(3, 22):
		var wave_y := 5 * TILE_SIZE + 19.0 + sin(shimmer * 2.0 + x) * 2.0
		draw_line(Vector2(x * TILE_SIZE + 8, wave_y), Vector2(x * TILE_SIZE + 34, wave_y), Color("8bb6a7"), 2.0)

	var camp := Vector2(7 * TILE_SIZE + 24, 10 * TILE_SIZE + 24)
	draw_circle(camp, 19.0, Color("2d2720"))
	draw_circle(camp, 11.0 + sin(shimmer * 4.0), Color("d88c50"))
	draw_circle(camp, 5.0, Color("f1d69a"))

	var traveler_center := Vector2(traveler.x * TILE_SIZE + 24, traveler.y * TILE_SIZE + 24)
	draw_circle(traveler_center + Vector2(0, 12), 14.0, Color(0.02, 0.08, 0.07, 0.45))
	draw_circle(traveler_center, 13.0, Color("d5bd80"))
	draw_circle(traveler_center + Vector2(0, -4), 7.0, Color("efe6c9"))
	draw_line(traveler_center + Vector2(-11, 18), traveler_center + Vector2(11, 18), Color("b0d785"), 2.0)
