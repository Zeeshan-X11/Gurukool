# ADR-0005: Enforce booking invariants with database constraints

**Status:** Accepted

## Context
Two students can request the same mentor slot at the same moment, and a mentor can click "Accept" on two requests for one slot in two tabs. A "check, then insert" in application code has a race window between the check and the write.

## Decision
- Slots are defined as Saturday/Sunday wall-clock times in **Asia/Kolkata**, expanded into concrete **UTC instants** for the next 28 days (at least 2 h ahead). Storing instants avoids DST and timezone ambiguity, and IST has no DST, which keeps the expansion exact.
- **Unique partial indexes** turn the invariants into database constraints:
  - `activeKey`: at most one *live* (pending or accepted) request per student + mentor + slot.
  - `slotLock`: at most one *accepted* session per mentor + slot, so double-booking is impossible.
  - `(studentId, courseId)` on training enrollments.
- State transitions (`PENDING→ACCEPTED|REJECTED`, `ACCEPTED→COMPLETED|CANCELLED`) are **conditional atomic updates** (`findOneAndUpdate({ _id, status: "PENDING" }, …)`). A stale tab can't move a session out of a state it is no longer in.
- A duplicate-key error (`11000`) is mapped to a `409 Conflict` with a clear message.

## Consequences
- Correct under concurrency without transactions or locks.
- Accepting a slot also closes the other pending requests for it, with a note to those students.
