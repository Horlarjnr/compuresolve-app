// The API returns lists either as a bare array (categories, invitations) or as { items } with meta.
// useFetch exposes `data` as the unwrapped `data` field, which is an array in some endpoints and { items } in others.
export const asList = (d: any): any[] => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : []);
