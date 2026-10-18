// My saved loadouts: { "<build id>": { ship, name, notes?, created, updated, picks } }.
// picks maps a slot path (port names joined by "/") to the item id fitted there, or "" for empty.
// Slots not listed keep the ship's stock part. The planner saves to the browser right away; click
// "Save builds.js" in the viewer and replace this file to make changes permanent.
window.BUILDS = {};
