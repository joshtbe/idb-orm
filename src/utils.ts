export async function handleRequest<T>(req: IDBRequest<T>) {
    return await new Promise<T>((res, rej) => {
        req.onsuccess = () => {
            res(req.result);
        };
        req.onerror = () => rej();
    });
}
