import { auth } from '../test-utils/test-instance';
import { createUserWithIdentifier, createUserWithRecoveryLevel, configureAuthInstance } from '../test-utils/identifier-helpers';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

describe('Recovery Classification System', () => {
  let testAuth = auth;
  
  beforeEach(async () => {
    // Create a fresh auth instance for each test
    testAuth = auth;
  });
  
  afterEach(async () => {
    // Clean up any users created during tests
    const adapter = testAuth.adapter;
    if (adapter.clearDatabase) {
      await adapter.clearDatabase();
    }
  });
  
  it('should classify users with verified email as FULL recovery', async () => {
    // Create user with verified email
    const { user } = await createUserWithRecoveryLevel('FULL');
    
    // Get recovery level
    const recoveryLevel = user.recoveryLevel;
    
    expect(recoveryLevel).toBe('FULL');
  });
  
  it('should classify users with OAuth accounts as PARTIAL recovery', async () => {
    // Create user with OAuth account
    const { user } = await createUserWithRecoveryLevel('PARTIAL');
    
    // Get recovery level
    const recoveryLevel = user.recoveryLevel;
    
    expect(recoveryLevel).toBe('PARTIAL');
  });
  
  it('should classify users with only username as PSEUDONYMOUS recovery', async () => {
    // Create user with only username
    const { user } = await createUserWithRecoveryLevel('PSEUDONYMOUS');
    
    // Get recovery level
    const recoveryLevel = user.recoveryLevel;
    
    expect(recoveryLevel).toBe('PSEUDONYMOUS');
  });
  
  it('should classify anonymous users as ANONYMOUS recovery', async () => {
    // Create anonymous user
    const { user } = await createUserWithRecoveryLevel('ANONYMOUS');
    
    // Get recovery level
    const recoveryLevel = user.recoveryLevel;
    
    expect(recoveryLevel).toBe('ANONYMOUS');
  });
  
  it('should upgrade recovery level when verifying identifiers', async () => {
    // Create user with unverified email (PSEUDONYMOUS)
    const { user, identifier, verify } = await createUserWithIdentifier({
      identifierType: 'email'
    });
    
    // Check initial recovery level
    expect(user.recoveryLevel).toBe('PSEUDONYMOUS');
    
    // Verify email
    await verify();
    
    // Get updated user
    const updatedUser = await testAuth.api.getUser({ id: user.id });
    
    // Recovery level should be upgraded to FULL
    expect(updatedUser.recoveryLevel).toBe('FULL');
  });
  
  it('should downgrade recovery level when removing verified identifiers', async () => {
    // Create user with verified email (FULL)
    const { user } = await createUserWithRecoveryLevel('FULL');
    
    // Check initial recovery level
    expect(user.recoveryLevel).toBe('FULL');
    
    // Remove all email identifiers
    const identifiers = await testAuth.db.getUserIdentifiers(user.id);
    const emailIdentifier = identifiers.find(i => i.type === 'email');
    await testAuth.db.deleteIdentifier({ id: emailIdentifier.id });
    
    // Add username identifier
    await testAuth.db.createIdentifier({
      userId: user.id,
      type: 'username',
      value: 'recovery-test-user',
      verified: true
    });
    
    // Get updated user
    const updatedUser = await testAuth.api.getUser({ id: user.id });
    
    // Recovery level should be downgraded to PSEUDONYMOUS
    expect(updatedUser.recoveryLevel).toBe('PSEUDONYMOUS');
  });
  
  it('should enforce minimum recovery level requirements when configured', async () => {
    // Create auth instance with minimum recovery level
    const secureAuth = await createAuthWithRecoveryLevel('FULL');
    
    // Create user with unverified email (PSEUDONYMOUS)
    const { user, identifier, password } = await createUserWithIdentifier({
      identifierType: 'email'
    });
    
    // Try to sign in - should be blocked due to recovery level
    await expect(secureAuth.api.signInWithIdentifier({
      identifier,
      identifierType: 'email',
      password
    })).rejects.toThrow(/account recovery level insufficient/i);
    
    // Verify email to upgrade to FULL
    await testAuth.adapter.updateIdentifier({
      type: 'email',
      value: identifier,
      verified: true
    });
    
    // Now sign in should work
    const result = await secureAuth.api.signInWithIdentifier({
      identifier,
      identifierType: 'email',
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.user.id).toBe(user.id);
  });
  
  it('should suggest appropriate account recovery actions based on recovery level', async () => {
    // Create users with different recovery levels
    const { user: fullUser } = await createUserWithRecoveryLevel('FULL');
    const { user: partialUser } = await createUserWithRecoveryLevel('PARTIAL');
    const { user: pseudonymousUser } = await createUserWithRecoveryLevel('PSEUDONYMOUS');
    const { user: anonymousUser } = await createUserWithRecoveryLevel('ANONYMOUS');
    
    // Get recovery actions for each user
    const fullActions = await testAuth.api.getRecoveryActions({ userId: fullUser.id });
    const partialActions = await testAuth.api.getRecoveryActions({ userId: partialUser.id });
    const pseudonymousActions = await testAuth.api.getRecoveryActions({ userId: pseudonymousUser.id });
    const anonymousActions = await testAuth.api.getRecoveryActions({ userId: anonymousUser.id });
    
    // FULL recovery users should have standard reset methods
    expect(fullActions).toContain('RESET_PASSWORD');
    
    // PARTIAL recovery users should have OAuth options
    expect(partialActions).toContain('OAUTH_RECOVERY');
    
    // PSEUDONYMOUS users should have limited options
    expect(pseudonymousActions).toContain('ADD_RECOVERY_EMAIL');
    
    // ANONYMOUS users should have very limited options
    expect(anonymousActions).toContain('ACCOUNT_UPGRADE');
  });
  
  it('should link multiple identifiers and increase recovery level', async () => {
    // Create user with username only (PSEUDONYMOUS)
    const { user } = await createUserWithIdentifier({
      identifier: 'recovery-user',
      identifierType: 'username'
    });
    
    // Initial recovery level
    expect(user.recoveryLevel).toBe('PSEUDONYMOUS');
    
    // Add unverified email
    await testAuth.api.addIdentifier({
      userId: user.id,
      identifier: 'recovery@example.com',
      identifierType: 'email'
    });
    
    // Get user - still PSEUDONYMOUS because email not verified
    const userWithEmail = await testAuth.api.getUser({ id: user.id });
    expect(userWithEmail.recoveryLevel).toBe('PSEUDONYMOUS');
    
    // Verify email
    await testAuth.adapter.updateIdentifier({
      userId: user.id,
      type: 'email',
      value: 'recovery@example.com',
      verified: true
    });
    
    // Get user again - now FULL recovery
    const userWithVerifiedEmail = await testAuth.api.getUser({ id: user.id });
    expect(userWithVerifiedEmail.recoveryLevel).toBe('FULL');
  });
  
  it('should properly calculate recovery level with multiple identifiers', async () => {
    // Create user with multiple identifiers
    const user = await testAuth.api.createUser();
    
    // Add unverified email (not sufficient for FULL)
    await testAuth.api.addIdentifier({
      userId: user.id,
      identifier: 'multi-recovery@example.com',
      identifierType: 'email',
      verified: false
    });
    
    // Add OAuth account (sufficient for PARTIAL)
    await testAuth.api.addIdentifier({
      userId: user.id,
      identifier: 'github|67890',
      identifierType: 'oauth',
      verified: true,
      metadata: { provider: 'github' }
    });
    
    // Get user - should be PARTIAL due to OAuth
    const userWithOAuth = await testAuth.api.getUser({ id: user.id });
    expect(userWithOAuth.recoveryLevel).toBe('PARTIAL');
    
    // Verify email
    await testAuth.adapter.updateIdentifier({
      userId: user.id,
      type: 'email',
      value: 'multi-recovery@example.com',
      verified: true
    });
    
    // Get user again - now FULL recovery
    const userWithVerifiedEmail = await testAuth.api.getUser({ id: user.id });
    expect(userWithVerifiedEmail.recoveryLevel).toBe('FULL');
    
    // Remove all identifiers
    const identifiers = await testAuth.db.getUserIdentifiers(user.id);
    for (const identifier of identifiers) {
      await testAuth.db.deleteIdentifier({ id: identifier.id });
    }
    
    // Get user again - now ANONYMOUS recovery
    const userWithNoIdentifiers = await testAuth.api.getUser({ id: user.id });
    expect(userWithNoIdentifiers.recoveryLevel).toBe('ANONYMOUS');
  });
});

// Helper to create auth instance with minimum recovery level
async function createAuthWithRecoveryLevel(level) {
  const { createAuth } = await import('../auth');
  
  return createAuth({
    identifierTable: {
      mode: 'virtual'
    },
    security: {
      minimumRecoveryLevel: level
    }
  });
}