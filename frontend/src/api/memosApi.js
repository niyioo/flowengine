import api from "./axios";

export const memosApi = {
  /** box: "inbox" (waiting on me) | "mine" (raised by me) | "all" (everything I can see). */
  list: (params, config) => api.get("/memos/", { ...config, params }).then((r) => r.data),
  get: (id, config) => api.get(`/memos/${id}/`, config).then((r) => r.data),
  create: (payload) => api.post("/memos/", payload).then((r) => r.data),
  update: (id, patch) => api.patch(`/memos/${id}/`, patch).then((r) => r.data),
  /** verb: submit | approve | return | reject | withdraw | comment */
  act: (id, verb, comment) => api.post(`/memos/${id}/${verb}/`, comment ? { comment } : {}).then((r) => r.data),
  dashboard: (config) => api.get("/dashboard/", config).then((r) => r.data),
  getConfig: () => api.get("/config/").then((r) => r.data),
};

export const routesApi = {
  list: (params, config) => api.get("/routes/", { ...config, params }).then((r) => r.data),
  create: (payload) => api.post("/routes/", payload).then((r) => r.data),
  update: (id, payload) => api.put(`/routes/${id}/`, payload).then((r) => r.data),
};
