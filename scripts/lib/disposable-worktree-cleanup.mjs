export function cleanupDisposableWorktree({
  nodeModulesLinked,
  worktreeAdded,
  targetWorktree,
  unlinkOwnedNodeModules,
  removeOwnedWorktree
}) {
  const errors = [];
  let linkCleanupPassed = !nodeModulesLinked;
  if (nodeModulesLinked) {
    try {
      unlinkOwnedNodeModules();
      linkCleanupPassed = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(new Error(`Owned node_modules cleanup failed; preserved worktree ${targetWorktree}: ${message}`, { cause: error }));
    }
  }
  if (worktreeAdded && linkCleanupPassed) {
    try { removeOwnedWorktree(); }
    catch (error) { errors.push(error instanceof Error ? error : new Error(String(error))); }
  }
  return errors;
}
