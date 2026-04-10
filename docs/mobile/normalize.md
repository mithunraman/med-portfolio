this is the normalized state + selective denormalization pattern, which is the canonical Redux approach. Let me explain the key practices and how they apply here.

1. Single Source of Truth (Normalized Entities)
   Your pdpGoals slice already uses createEntityAdapter — it's a normalized store keyed by ID. The problem is that the dashboard slice holds its own copy of PDP goal objects in data.pdpGoalsDue.items[].

This violates the core Redux principle: every entity should live in exactly one slice. When the same PDP goal exists in both state.pdpGoals.entities["abc"] and state.dashboard.data.pdpGoalsDue.items[0], updating one doesn't update the other.

Best practice: The dashboard should store only references (IDs + minimal sort/filter metadata), not full entity copies:

// Dashboard slice stores:
pdpGoalsDue: { ids: ["goal-1", "goal-2"], total: 5 }

// PDP goals slice is the single source of truth:
pdpGoals.entities: { "goal-1": { ...fullGoalData }, "goal-2": { ...fullGoalData } } 2. Derived Data via Selectors (Not Duplicated State)
Instead of the dashboard endpoint returning full PDP goal objects that get stashed in the dashboard slice, you compose selectors to join the references with entity data:

// Selector that combines dashboard IDs with pdpGoals entity data
const selectPdpGoalsDueSoon = createSelector(
[(state: RootState) => state.dashboard.pdpGoalsDueIds,
(state: RootState) => state.pdpGoals.entities],
(ids, entities) => ids.map(id => entities[id]).filter(Boolean)
);
This is how SQL-style joins work in Redux — the dashboard "table" has a foreign key, the pdpGoals "table" has the data. The selector is the join. Any screen that updates the entity automatically updates every view that selects it.

3. Hydrate Entities on Fetch, Store References in the Consumer
   When fetchInit (the dashboard endpoint) returns full PDP goal objects, you split the response across slices:

// Dashboard thunk fulfilled handler:
// 1. Upsert full goals into pdpGoals entity slice
// 2. Store only IDs in dashboard slice

// pdpGoals slice:
.addCase(fetchInit.fulfilled, (state, action) => {
pdpGoalsAdapter.upsertMany(state, action.payload.dashboard.pdpGoalsDue.items);
})

// dashboard slice:
.addCase(fetchInit.fulfilled, (state, action) => {
state.pdpGoalsDueIds = action.payload.dashboard.pdpGoalsDue.items.map(g => g.id);
state.pdpGoalsDueTotal = action.payload.dashboard.pdpGoalsDue.total;
})
This is sometimes called cross-slice hydration — one API response populates multiple slices. RTK supports this naturally since any slice can listen to any thunk via extraReducers.

4. Why This Fixes Your Bug
   With normalized state, the fix is structural rather than mechanical:

Detail screen dispatches updatePdpGoal → pdpGoals.entities["goal-1"] updates
Home tab selects selectPdpGoalsDueSoon → reads from pdpGoals.entities → automatically sees the new date
No staleness flag needed, no refetch needed, no timing race — Redux reactivity handles it
Compare this to the current design where the dashboard holds its own copy and needs an invalidation + refetch cycle just to stay in sync.

5. Same Pattern Applies to Other Entities
   This same issue likely affects recentEntries and activeReviewPeriod in the dashboard. The general rule:

Slice Stores Does NOT store
pdpGoals Full entity data Which screen needs it
artefacts Full entity data Which screen needs it
reviewPeriods Full entity data Which screen needs it
dashboard IDs + layout metadata (order, totals) Full entity copies
Summary
The pattern you described is exactly right — it's the normalized entity store + referential selectors approach from the Redux Style Guide. The current architecture duplicates entity data across slices, which forces an invalidation/refetch dance that's inherently racy. Normalizing eliminates the entire class of stale-data bugs.
