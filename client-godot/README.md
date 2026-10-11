# Living World Lab Client

This is the first repository-native Godot client shell for the World Lab. It has no live Realm connection and no authority over gameplay. Its purpose is to give the autonomous studio an engine project it can inspect, edit, import, test, export and capture without a person using the editor.

The project uses the Compatibility renderer for the browser-capable baseline. A future native quality profile may use Godot's Forward+ renderer, but it must render the same authoritative world protocol and obey the same asset manifest.

Run `npm run godot:check` from the repository root to import the project headlessly and execute its authority-boundary smoke test. Set `GODOT_BIN` when the Godot console executable is not discoverable on the machine.
