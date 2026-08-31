// An in-memory stand-in for AsyncStorage.
//
// `src/lib/supabase.ts` hands AsyncStorage to supabase-js as its session
// store. That module is React Native only — importing it in Node throws — so
// the integration test cannot load the real client without this.
//
// Both a default AND named exports, deliberately. Depending on how the
// importing module was transpiled, supabase-js receives either the default or
// the module namespace, and a namespace with only a default on it produces
// `storage.getItem is not a function` at the first session read. Exporting
// both makes the stub work under either interop path.
const store = new Map();

export const getItem = async (key) => (store.has(key) ? store.get(key) : null);
export const setItem = async (key, value) => void store.set(key, value);
export const removeItem = async (key) => void store.delete(key);
export const clear = async () => void store.clear();

export default { getItem, setItem, removeItem, clear };
