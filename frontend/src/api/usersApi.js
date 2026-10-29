import api from "./axios";

export const usersApi = {
  list: (params, config) => api.get("/users/", { ...config, params: { page_size: 100, ...params } }).then((r) => r.data),
  create: (payload) => api.post("/users/", payload).then((r) => r.data),
  update: (id, patch) => api.patch(`/users/${id}/`, patch).then((r) => r.data),
  /** Deactivates (users are never hard-deleted) and revokes their sessions. */
  deactivate: (id) => api.delete(`/users/${id}/`),
};
