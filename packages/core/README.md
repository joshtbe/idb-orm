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

Before you can define a model, you need to understand the different components of one. A model definition is made up of three different components.

-   One primary key definition
-   Zero or more Property definitions
-   Zero or more Relation definitions

Each component is slightly different in how it is instantiated and used when defining a model.

### Primary Key Definition

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

### Property Definition

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

### Relation Definition

Relation definitions are how you define relations between models/stores. Relations can be between different stores or the same store. There are three types of relation definitions:

-   `P.relation([modelName], options?)`: The default, describing a relation from the current model to a `[modelName]` document.
-   `P.relation([modelName], options?).optional()`: Describes a relation from the current model to a `[modelName]` document, where it's possible that the value on this not defined (null).
-   `P.relation([modelName], options?).array()`: Describes a relation from the current model to several different documents in model `[modelName]`.

```ts
interface RelationOptions {
    name?: string;
    onDelete?: "SetNull" | "None" | "Restrict" | "Cascade";
}
```

All relations must be bidirectional, so for every relation on some model X to model Y, there must be a corresponding relation object on model Y that points to model X. If you omit it, the builder will throw an error. You can pass in additional options to the relation, such as a name. Giving a relation a name is highly recommended to ensure the builder correctly relates model fields. Under the hood, this relation field is storing the primary keys of the documents you are relating to.

Additionally, you can attach actions to be performed when a document is deleted:

-   `SetNull`: Only usable when the relation this one is pointing to is optional or an array. In which case it sets the corresponding field to null or removes the element respectively.
-   `None`: Performs no action when a delete occurs.
-   `Restrict`: This item essentially cannot be deleted. Attempted to delete it will throw an error.
-   `Cascade`: Deleting this document will try to delete the pointed to document(s).

## Putting it all together

```ts
import { Builder, Property as P } from "@idb-orm/core";

const builder = new Builder("test_db", ["users", "posts", "comments"]);

const userStore = builder.defineModel("users", {
    id: P.primaryKey().uuid(),
    name: P.string(),
    email: P.string(),
    password: P.string(),
    accountCreated: P.date().default(() => new Date()),
    posts: P.relation("posts", { name: "postsToUsers" }).array({
        // If this user account gets deleted, delete all their posts
        onDelete: "Cascade",
    }),
    comments: P.relation("comments", { name: "commentsToUsers" }).array(),
});

const postStore = builder.defineModel("posts", {
    id: P.primaryKey().autoIncrement(),
    created: P.date().default(() => new Date()),
    title: P.string(),
    body: P.string().array(),
    likes: P.number().default(0),
    dislikes: P.number().default(0),
    author: P.relation("users", { name: "postsToUsers" }),
    comments: P.relation("comments", { name: "postToComments" }).array({
        onDelete: "Cascade",
    }),
});

const commentStore = builder.defineModel("comments", {
    id: P.primaryKey().autoIncrement(),
    created: P.date().default(() => new Date()),
    modified: P.date().default(() => new Date()),
    content: P.string(),
    likes: P.number().default(0),
    dislikes: P.number().default(0),
    author: P.relation("users", { name: "commentsToUsers" }),
    post: P.relation("posts", { name: "postToComments" }),
});
```

Then once you have all of your model definitions, call the `compile` function. This steps performs sanity checks on your model definitions and will throw errors if anything goes wrong. Once the model is compiled, you can create the client.

```ts
const compiledDb = builder.compile({
    users: userStore,
    posts: postStore,
    comments: commentStore,
});

const client = await compiledDb.createClient();
```

_To be continued..._

## Roadmap
-   [ ] Restore database to different formats
    -   [ ] JSON
    -   [ ] CSV
-   [ ] Change array relations to internally use sets
-   [ ] Add extra object syntax to "where" clause (i.e. `in`/`ne`/`gt`/...)
-   [ ] Allow object types in where clauses
-   [ ] Make subpackages for adapters for different validation languages
    -   [x] Zod
    -   [ ] Yup
    -   [ ] Joi
    -   [ ] schema.js

### Roadmap - Maybe

-   [ ] Optimize batch `add` editing with cursor functionality
-   [ ] Discriminated union models: Be able to differentiate subtypes of a model by a discriminator key

