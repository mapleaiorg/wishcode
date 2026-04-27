# Cell-5 — Cell Groups + Internal Bus

Date: 2026-04-27

## What landed

`electron/native/cells/groups.ts` (~180 LoC) — `CellGroup<TEvent>` is
the typed pub/sub generalisation of C-0's CoAgent bus. Any set of
Cells can form a group with a frozen list of event kinds, a member
registry, and Tel-0-namespaced telemetry.

## Surface

```typescript
const g = defineGroup<'demo.opened'|'demo.closed'>('wish.demo', [...])
g.join({ memberId, subscribes }, handler)         // returns JoinResult
joinResult.publish({ kind, payload })
joinResult.leave()
g.publish(source, { kind, payload })              // host-level
g.membership() / g.has(id) / g.subscribersFor(kind)
```

## Invariants

- Group id matches the same reverse-DNS grammar as Cell ids.
- Unknown kinds rejected at both `join().subscribes` and `publish()`.
- Last-writer-wins on rejoin (matches Cell-2 deactivate→activate).
- Thrown subscribers caught + emitted as `{groupId}.subscriber_threw`;
  other subscribers continue.
- Telemetry namespacing: `{groupId}.{joined|left|event_delivered|subscriber_threw}` so
  multiple groups don't collide.

## Tests (14)

- Invalid id rejection (1)
- knownKinds rejection at join + publish (2)
- empty memberId rejection (1)
- JoinResult.publish stamps source = memberId (1)
- JoinResult.leave removes member; leave on unknown returns false (2)
- membership() deep-copy (1)
- subscribersFor by kind (1)
- thrown subscriber doesn't block others; emits subscriber_threw (1)
- event_delivered telemetry (1)
- joined / left telemetry (1)
- rejoin replaces handler (1)
- single-event filter through join (1)

## Pending

- **Cell-5.1** Hermon-mirroring `RemoteGroup` that wraps a local
  `CellGroup` with bidirectional sync to H-10's CoAgent backend.
