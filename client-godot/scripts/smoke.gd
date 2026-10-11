extends SceneTree

func _initialize() -> void:
	var packed := load("res://scenes/Main.tscn") as PackedScene
	if packed == null:
		push_error("Living World Lab main scene did not load.")
		quit(1)
		return
	var instance := packed.instantiate()
	if not instance.has_method("lab_snapshot"):
		push_error("Living World Lab client does not expose its fixture contract.")
		quit(1)
		return
	var snapshot: Dictionary = instance.call("lab_snapshot")
	if snapshot.get("authority") != "fixture-only" or snapshot.get("protocol") != "not-connected":
		push_error("Lab client fixture crossed its authority boundary.")
		quit(1)
		return
	print("LW_GODOT_SMOKE_OK ", JSON.stringify(snapshot))
	instance.queue_free()
	quit(0)
