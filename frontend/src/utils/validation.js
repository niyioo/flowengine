/*
 * Client-side mirrors of the API's input rules, for instant feedback. The
 * limits come from the live platform config (GET /api/config/); the API
 * remains the authority.
 */

export function validateMemo(form, limits) {
  const errors = {};
  if (!form.title.trim()) errors.title = "Give the memo a title.";
  if (!form.body.trim()) errors.body = "Write the memo.";
  else if (limits && form.body.length > limits.memo_body_max_length)
    errors.body = `Keep the memo under ${limits.memo_body_max_length} characters.`;
  if (!form.route) errors.route = "Choose who the memo goes to.";
  return errors;
}

/** Returning or rejecting a memo needs a reason the originator can act on. */
export function validateComment(comment, limits, { required }) {
  const text = comment.trim();
  if (!required && !text) return "";
  if (!text) return "Add a comment explaining your decision.";
  if (limits && text.length < limits.comment_min_length)
    return `Write at least ${limits.comment_min_length} characters.`;
  if (limits && text.length > limits.comment_max_length)
    return `Keep it under ${limits.comment_max_length} characters.`;
  return "";
}

export function validateRoute(form, limits) {
  const errors = {};
  if (!form.name.trim()) errors.name = "Name the route.";
  if (!form.steps.length) errors.steps = "Add at least one approval step.";
  else if (limits && form.steps.length > limits.max_route_steps)
    errors.steps = `A route can have at most ${limits.max_route_steps} steps.`;
  else if (form.steps.some((s) => !s.title.trim() || !s.approver)) errors.steps = "Every step needs a title and an approver.";
  else if (new Set(form.steps.map((s) => s.approver)).size !== form.steps.length)
    errors.steps = "Each approver can appear only once on a route.";
  return errors;
}
