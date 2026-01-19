import {
    createContext,
    PropsWithChildren,
    ReactNode,
    useContext,
    useEffect,
    useState,
    Context,
} from "react";
import { core } from "@idb-orm/core";

export interface ClientProviderProps<
    Name extends string,
    ModelNames extends string,
    Models extends core.CollectionObject<ModelNames>,
> {
    /**
     * `CompiledDb` object
     */
    db: core.CompiledDb<Name, ModelNames, Models>;
    /**
     * React node to render while the client is being built
     * @default undefined
     */
    fallback?: ReactNode;
    /**
     * Version of the IDB Database
     * @default 1
     */
    version?: number;
}

export interface ClientProviderFactoryReturn<
    Name extends string,
    ModelNames extends string,
    Models extends core.CollectionObject<ModelNames>,
> {
    Context: Context<core.DbClient<Name, ModelNames, Models> | null>;
    useDbClient: () => core.DbClient<Name, ModelNames, Models>;
    DbClientProvider: (
        props: PropsWithChildren<ClientProviderProps<Name, ModelNames, Models>>,
    ) => ReactNode;
}

export function clientProviderFactory<
    Name extends string,
    ModelNames extends string,
    Models extends core.CollectionObject<ModelNames>,
>(
    db: core.CompiledDb<Name, ModelNames, Models>,
): ClientProviderFactoryReturn<Name, ModelNames, Models> {
    const Context = createContext<core.DbClient<
        Name,
        ModelNames,
        Models
    > | null>(null);

    return {
        Context,
        useDbClient: () => {
            const cli = useContext(Context);
            if (!cli) {
                throw new Error(
                    `Client Context not found. Please ensure this component is wrapped in a <DbClientProvider /> component.`,
                );
            }
            return cli;
        },
        DbClientProvider: ({
            fallback = undefined,
            children,
            version,
        }): ReactNode => {
            const [client, setClient] = useState<core.DbClient<
                Name,
                ModelNames,
                Models
            > | null>(null);

            useEffect(() => {
                db.createClientAsync(version)
                    .then((cli) => {
                        setClient(cli);
                    })
                    .catch((err) => {
                        throw new Error(
                            `@idb-orm Client Creation Failed: ${err}`,
                        );
                    });
                return;
            }, [version]);

            if (!client) return fallback;
            return (
                <Context.Provider value={client}>{children}</Context.Provider>
            );
        },
    };
}
