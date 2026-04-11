/**
 * Compute the activity weight for a newbie using diminishing returns.
 *
 * Formula: ln(1 + postCommentCount) / ln(1 + cap)
 *
 * Produces values from ~0.29 (1 post) to 1.0 (cap+ posts).
 * Every eligible newbie has at least 1 (their intro post).
 */
export function activityWeight(postCommentCount: number, cap: number): number {
  if (postCommentCount <= 0) return 0;
  const clamped = Math.min(postCommentCount, cap);
  return Math.log(1 + clamped) / Math.log(1 + cap);
}
