# Per-Tag RBAC: Visibility Mode "tags"

The `tags` visibility mode restricts a non-admin user so they can only see and manage
hosts that share at least one of their assigned tags.

## How it works

Each tag can be assigned to hosts and to users. A user with visibility `tags` sees only
hosts whose tag set intersects with the user's own tag set. Hosts with **no tags** are
invisible to all tag-scoped users.

```
visibility = "all"   → see everything
visibility = "user"  → see only hosts you created
visibility = "tags"  → see only hosts sharing ≥1 of your assigned tags
```

## Setting up a tag-scoped user (admin only)

1. Create tags (**Tags** menu).
2. Apply tags to hosts via the host edit modal.
3. Open **Users** → **Permissions** for the target user.
4. Select **Restricted by Tags** for Visibility.
5. In the **Tags** multiselect that appears, choose the tags to assign to the user.
6. Save.

## Tag-scoped write rules

When a user has `visibility = "tags"`:
- **Create host**: must include at least one of their own tags.
- **Update host**: if changing `tag_ids`, the new set must still contain at least one of their own tags.
- **Delete / enable / disable**: only possible on hosts they can already see (returns 404 on miss).

## API keys and MCP

API keys inherit the owning user's `visibility` setting through `effectiveAccess()`.
A scoped key for a tag-restricted user cannot see untagged hosts.

## Migration

Table `user_tag` (migration `20260712100000_user_tags.js`) stores user ↔ tag assignments:

| column     | type    |
|-----------|---------|
| id         | int PK  |
| user_id    | int     |
| tag_id     | int     |
| created_on | datetime |

The admin assigns tags to users via `PUT /api/users/:id/tags` with body `{ "tag_ids": [1, 2] }`.

## Visibility matrix

| visibility | list | get | create | update | delete |
|-----------|------|-----|--------|--------|--------|
| all        | all hosts | any | any | any | any |
| user       | own hosts | own | any | own | own |
| tags       | tagged hosts (own tags) | tagged | must include ≥1 own tag | must retain ≥1 own tag | tagged |

Unmatched single-object access returns **404** (not 403) to avoid leaking existence.
