# IDB-ORM

> THIS PROJECT IS STILL A (ROUGH) WORK IN PROGRESS. I HOPE TO HAVE A GOOD WORKING VERSION SOON.
>
> PLEASE CHECK BACK IN A FEW WEEKS/MONTHS

## Roadmap

-   [x] "Include" query field
    -   [x] Enforce that either "include" xor "select" is in the query object
    -   [x] modify the query object so that on relations it is recursive
-   [x] Complete update action
-   [ ] Redo Mutation type. It should provide structurally no change:
    -   [ ] Split `add` and `update` mutation until completely separate interfaces
    -   [ ] -Many or -All are only present on `ArrayRelation`'s,
    -   [ ] Make MutType a string union
    -   [ ] Update actions only appear when `MutType` is update
    -   [ ] Cannot use `delete` or `disconnect` on non-nullable (1-1) relations
-   [ ] Build Extension System
-   [ ] Wrap all calls in tx.wrap()
-   [ ] Make sure non-optional and non-array relations do not have the `SetNull` onDelete action
-   [ ] Dump database to different formats:
    -   [ ] JSON
    -   [ ] CSV
    -   [ ] YAML
-   [ ] Add extra object syntax to "where" object (i.e. `in`/`ne`/`gt`/...)
-   [ ] On bulk add/puts/deletes, only wait for the last IDBRequest object
    -   [ ] addMany
    -   [ ] deleteMany
    -   [ ] findMany
    -   [ ] updateMany
-   [ ] Convert internal string unions to enums
-   [ ] Make subpackages for adapters for different validation languages
    -   [ ] Zod
    -   [ ] Yup
    -   [ ] Joi
    -   [ ] schema.js

### Roadmap - Maybe

-   [ ] Optimize batch `add` editing with cursor functionality
-   [ ] Optimize vanilla property validation by stringifying function bodies and constructing functions instead of wrapping
-   [ ] Discriminated union models: Be able to differentiate subtypes of a model by a discriminator key
-   [ ] Error Handling: Instead of needing to type `tx.abort(...)` just use the `throw new ...` syntax and catch the error and automatically abort the transaction. This will require actions to be wrapped in some kind of try-catch block.
