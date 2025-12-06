# @idb-orm/react-query

> ## THIS PACKAGE IS BRAND-NEW AND UNSTABLE. DO NOT USE

A React adapter for [Tanstack's Query library](https://tanstack.com/query/latest) for @idb-orm. It essentially offers easy to use shortcuts to manage querying idb-orm data and caching.

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

Define your @idb-orm schema in any file. Then, create the provider and client object like so:

```tsx
// idb-query.ts

import { createIDBClient } from "@idb-orm/react-query";

// File that creates the @idb-orm database client
import { client } from "./db-client";

const { queryClient, Provider, stores } = createIDBQueryClient(client);
export { queryClient, Provider, stores };
```

Then, in your project's root, wrap your application in the provider:

```tsx
// App.tsx

import { Provider, queryClient } from "./idb-query";

function App(){
    return (
        <Provider client={queryClient}>
            {/* Appliation */}
        <Provider>
    )
}

```

Some things to note:

-   The `stores` field should be exported for use throughout your app. That is what provides the shortcut functions for each store.
-   The provider component already has the Tanstack `QueryClientProvider` included!

## Disclaimer

This project is still in the **very** early stages. Bugs will occur as I work on this package. Sorry in advance.
