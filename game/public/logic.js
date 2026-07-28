// Rail Rush is a solo, client-side game: the platform still requires a rules
// module at the archive root, so this is the documented single-seat stub.
export const meta = { game: "rail-rush", minPlayers: 1, maxPlayers: 1 };
export function setup() { return {}; }
export function validateAction() { return { ok: true }; }
export function applyAction(state) { return state; }
export function isGameOver() { return { over: false }; }
export function viewFor(state) { return state; }
