# IDB-ORM Core

> # IMPORTANT: THIS PROJECT IS STILL IN THE VERY EARLY STAGES. USE AT YOUR OWN RISK

A simple object relational mapper for the [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API). IndexedDB (IDB) is a NoSQL database built into modern web browsers. This package wraps around that API and turns it into a pseudo-relational database. This allows features like:

-   Defining relations between documents
-   Querying on these relations (and the relations of the related document)
-   Performing actions when the corresponding item of the relation changes
-   Updating items based on nested relation querying

## Installation

The minimum you need to get started is the `core` package. Although there are other supplemental packages that add extra features.

```
npm install @idb-orm/core
```

## Getting Started

First thing you'll need to do is create a `builder` object. This will create the IDB object stores. The constructor takes in the name of the database and a list of object store names.

```ts
import { Builder, Property as P } from "@idb-orm/core";

const builder = new Builder("test_db", ["users", "posts", "comments"]);
```

## Understanding the Different Components

Before you can define a model, you need to understand the different components of one. A model is made up of three different components.

-   One primary key
-   Zero or more Properties
-   Zero or more Relations

Each component is slightly different in how it is instantiated and used when defining a model.

### Primary Key

A primary key is a **unique** identifier used to store your document in the database. A primary key can be a `string`, `number`, or `Date` type (I may include support for more types down the line):

```ts
// A number primary key (default)
P.primaryKey();

// A string primary key
P.primaryKey("string");

// A date primary key
P.primaryKey("date");
```

In their base states, when creating a document the primary key must be supplied. However you can attach generators which will automatically generate the primary key when a document is created.

```ts
// Creates a auto-incrementing number primary key
P.primaryKey().autoIncrement();

// Creates a string primary key that is a UUIDv4
P.primaryKey().uuid();

// Or, define your own generator
P.primaryKey("string").generator(
    () => `${new Date()}-${Math.round(Math.random() * 10000)}`
);
```

> **Note:** If the given primary key of a document is not unique, the creation of that document will fail. It's recommended to use either the `.autoIncrement()` utility for number primary keys or `.uuid()` for string primary keys.

### Property

This is the basic building block for a model. It lets you define static fields of the document. They are used for validating model input and providing the proper typescript interface for later queries/mutations.

-   `P.string()`: Defines a string field
-   `P.number()`: Defines a number field
-   `P.boolean()`: Defines a boolean field
-   `P.date()`: Defines a date field
-   `P.literal([value])`: Defines a literal type. Meaning that the field will always consist of `[value]`
-   `P.array([Property])`: Defines an array field where the array's elements are defined by `[Property]`
-   `P.set([Property])`: Defines a set field where the set's elements are defined by `[Property]`
-   `P.union([Property1, Property2, ...])`: Defines a union type where any value that matches the given `[PropertyX]` will satisfy the validation.
-   `P.custom<T>((test: unknown) => boolean)`: Defines a field for a custom type that is validated by a function passed in as the first argument.

    For this type of field, if you plan on dumping your database to other formats, it's also recommended you populate the second `options` argument with these functions:

    -   `serialize: (value: T) -> unknown`: Serializes the type to JSON.
    -   `deserialize: (value: unknown) -> T`: De-serializes the type to JSON.

    If these functions are omitted it will use `JSON.stringify()` and `JSON.parse()` respectfully.

Additionally, there are methods of the `Property` class that allows you to attach identifiers to these properties:

-   `.array()`: Makes the field an array of the preceeding property.
-   `.optional()`: Makes a field optional. It can now be omitted when a document is being created. The value in the resulting document will be undefined. This is functionally equivalent to doing `P.union([..., P.literal(undefined)])`, but with less overhead.
-   `.default([value])`: Same behavior as optional, but instead of being undefined the value will be filled in with the given default value.

### Relation

## Putting it all together

## Roadmap

-   [x] "Include" query field
    -   [x] Enforce that either "include" xor "select" is in the query object
    -   [x] modify the query object so that on relations it is recursive
-   [x] Make sure non-optional and non-array relations do not have the `SetNull` onDelete action on model compilation
-   [x] Complete update action
-   [x] Redo Mutation type. It should provide structurally no change:
    -   [x] Split `add` and `update` mutation until completely separate interfaces?
    -   [x] -Many or -All are only present on `ArrayRelation`'s,
    -   [x] Cannot use `delete` or `disconnect` on non-nullable (1-1) relations
-   [x] Add additional functions to the storeInterface
    -   [x] get([primaryKey], [include/select])
    -   [x] update([primaryKey], [updateMutation without where])
-   [x] Error Handling: Instead of needing to type `tx.abort(...)` just use the `throw new ...` syntax and catch the error and automatically abort the transaction. This will require actions to be wrapped in some kind of try-catch block.
-   [ ] Dump database to different formats:
    -   [x] JSON
    -   [ ] CSV
-   [ ] Make package to wrap Tanstack query for react application
-   [ ] Add extra object syntax to "where" clause (i.e. `in`/`ne`/`gt`/...)
-   [ ] Allow object types in where clauses
-   [x] Convert internal string unions to enums
-   [ ] Make subpackages for adapters for different validation languages
    -   [x] Zod
    -   [ ] Yup
    -   [ ] Joi
    -   [ ] schema.js
-   [ ] Migrate to vite instead of rollup

### Roadmap - Maybe

-   [ ] Optimize batch `add` editing with cursor functionality
-   [ ] Discriminated union models: Be able to differentiate subtypes of a model by a discriminator key

```

```
