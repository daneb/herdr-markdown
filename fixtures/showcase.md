# Login service: plan

The agent's plan for moving sign-in to the new token service. Read it formatted
in Herdr's file panel, diagram and all.

```mermaid
flowchart LR
  User([Person]) --> App[Web app]
  App -->|password| Auth{Token service}
  Auth -->|ok| Session[(Sessions)]
  Auth -->|fail| Lock[Lockout after 5]
  Session --> App
```

| Step | Owner | Status |
|---|---|:---:|
| Token service behind a flag | agent | done |
| Migrate sessions | agent | in progress |
| Remove old login | person | waiting |

- [x] Write the token service
- [x] Add lockout after five failures
- [ ] Migrate existing sessions
- [ ] Delete `legacy_login.py`

> Rollback: turn the flag off; old sessions keep working.
