# @idb-orm/react-query

> ## THIS PACKAGE IS BRAND-NEW AND UNSTABLE. DO NOT USE

A React adapter for [Tanstack's Query library](https://tanstack.com/query/latest) for @idb-orm. It essentially offers easy to use shortcuts to manage querying idb-orm data and caching. This package is an extension of `@idb-orm/react`.

## Example

Here's an example comparison on how to do a `find` query on a `users` document collection in traditional Tanstack-query and with this package.

```tsx
// How to do it in vanilla Tanstack-query
useQuery({
    queryKey: ["users", "find", userId],
    queryFn: () => client.stores.users.find({ where: { id: userId } }),
});

// How to do it in this package
stores.users.useFind({ where: { id: userId } });

// Or
stores.users.useFind({ where: { id: userId } }, [
    /* Any additional dependences */
]);
```

The package manages the internal query keys to ensure there is no overlap, and you can state an optional dependency array similar to traditional react hooks like `useMemo` and `useEffect`.

## Installation

This package does not come bundled with Tanstack-query or react, they are both expected to already be installed. To install the adapter package, use:

```
npm i @idb-orm/react-query
```

## Getting Started

Define your @idb-orm schema in any file. Then, call the factory function. This function will create a React Context, a Provider component for the context, and a series of hooks used to access the context's value.

```tsx
// idb-query.ts

import { queryClientProviderFactory } from "@idb-orm/react-query";

// File that creates the @idb-orm database
import { db } from "./db";

export const {
    // Primitive React Context object
    Context,
    // Hook to acquire the IDB-ORM client object
    useDbClient,
    // Hook to acquire the Tanstack-Query QueryClient object
    useQueryClient,
    // Hook to acquire the auto-generated query functions.
    useQueryInterface,
    // Hook to acquire the contents of the 3 hooks above in one.
    useIDBQuery,
    // Provider that will allow the above hooks to function and populate the context.
    DbClientProvider,
} = queryClientProviderFactory(db);
```

Then, in your project's root, wrap your application in the provider:

```tsx
// App.tsx

import { DbClientProvider } from "./idb-query";

function App(){
    return (
        <DbClientProvider version={2} fallback={<>Waiting for client creation...</>}>
            {/* Appliation */}
        <DbClientProvider>
    )
}
```

The fallback prop is an optional prop you can give to the provider to render while the client is building. Building the `@idb-orm` client is an asynchronous operation, so while that is being done its children are not rendered. This may be changed in a future update.

## Usage

Anywhere inside a component, you can call one of three hooks for each store:

```ts
import { useQueryInterface } from "./idb-query";

function MyComponent(){
    const stores = useQueryInterface();

    // Will find all documents that matches the filter/selector
    stores.users.useFind({
        query: {
            /* Selector Object */
        },
        /* Additional options */
    });

    // Will find the first document that matches the filter/selector
    stores.users.useFindFirst({
        query: {
            /* Selector Object */
        },
        /* Additional options */
    });

    // Will find the first document that matches the filter/selector
    stores.users.useGet({
        key: /* Primary Key */
        /* Additional options */
    });

    return <>My Favorite Component</>
}

```

These hooks return the same type as the result of the Tanstack [useQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery) hook. Check out their documentation for more information as well as additional options.

Some things to note:

- Fields passed into the `query` key of a hook input will be used to determine query invalidation. These query objects are serialized into JSON by Tanstack, so any TS/JS types that are not serializable into JSON (functions, files, undefined) will be omitted from the serialized representation. So if any of these types of values change, the query will **NOT** be automatically invalidated.
- The `DbClientProvider` component already has the Tanstack `QueryClientProvider` included, you do not need to add another!

## Disclaimer

This project is still in the **very** early stages. Bugs will occur as I work on this package. Sorry in advance.
