// Whether the user has proved themselves during THIS run of the app.
//
// Module-level on purpose: it resets whenever the page/app is freshly loaded,
// so a cold start always begins locked. Coming back from the background locks
// it again (see AppLock). Unlike the session token this never touches the
// network — the user stays signed in the whole time, we just cover the screen.
let unlocked = false

export const isUnlocked = () => unlocked
export const markUnlocked = () => { unlocked = true }
export const markLocked = () => { unlocked = false }
