export const ROLES = Object.freeze({
  ADMIN: "ADMIN",
  STAFF: "STAFF",
  AUDITOR: "AUDITOR",
});

export const isAdmin = (user) => user?.role === ROLES.ADMIN;

/** Can raise memos and act on the ones routed to them. Auditors only read and comment. */
export const canRaiseMemos = (user) => [ROLES.ADMIN, ROLES.STAFF].includes(user?.role);

/** Sees every submitted memo, not only their own and those routed to them. */
export const hasOversight = (user) => [ROLES.ADMIN, ROLES.AUDITOR].includes(user?.role);
