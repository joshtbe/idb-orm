# IDB-ORM

## Roadmap

-   [x] "Include" query field
    -   [x] Enforce that either "include" xor "select" is in the query object
    -   [x] modify the query object so that on relations it is recursive
-   [ ] Complete update action
    -   [ ] Finish `updateSingleton` action
-   [ ] Unique model fields: Use "unique" indexes to enforce this.
-   [ ] Optimize batch `add` editing with cursor functionality
-   [ ] Make sure non-optional and non-array relations do not have the `SetNull` onDelete action
-   [ ] Dump database to different formats:
    -   [ ] JSON
    -   [ ] CSV
    -   [ ] YAML
-   [ ] Add extra object syntax to "where" object (i.e. `in`/`ne`/`gt`/...)
-   [ ] Convert internal string unions to enums

### Roadmap - Maybe

-   [ ] Discriminated union models: Be able to differentiate subtypes of a model by a discriminator key
-   [ ] Error Handling: Instead of needing to type `tx.abort(...)` just use the `throw new ...` syntax and catch the error and automatically abort the transaction. This will require actions to be wrapped in some kind of try-catch block.
