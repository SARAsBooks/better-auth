import { auth } from '../../test-utils/test-instance';
import { createUserWithIdentifier, createMultiIdentifierUser } from '../../test-utils/identifier-helpers';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

describe('Sign In with Identifier API', () => {
  let testAuth = auth;
  
  beforeEach(async () => {
    // Create a fresh auth instance for each test
    testAuth = auth;
  });
  
  afterEach(async () => {
    // Clean up any users created during tests
    // This is test environment specific and might need to be adjusted
    const adapter = testAuth.adapter;
    if (adapter.clearDatabase) {
      await adapter.clearDatabase();
    }
  });
  
  it('should sign in a user with email identifier', async () => {
    const { user, identifier, password } = await createUserWithIdentifier({
      identifierType: 'email'
    });
    
    const result = await testAuth.api.signInWithIdentifier({
      identifier,
      identifierType: 'email',
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.user.id).toBe(user.id);
    expect(result.session).toBeDefined();
  });
  
  it('should sign in a user with username identifier', async () => {
    const { user, identifier, password } = await createUserWithIdentifier({
      identifier: 'testuser',
      identifierType: 'username'
    });
    
    const result = await testAuth.api.signInWithIdentifier({
      identifier,
      identifierType: 'username',
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.user.id).toBe(user.id);
    expect(result.session).toBeDefined();
  });
  
  it('should sign in a user with phone identifier', async () => {
    const { user, identifier, password } = await createUserWithIdentifier({
      identifier: '+15551234567',
      identifierType: 'phone'
    });
    
    const result = await testAuth.api.signInWithIdentifier({
      identifier,
      identifierType: 'phone',
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.user.id).toBe(user.id);
    expect(result.session).toBeDefined();
  });
  
  it('should maintain backward compatibility with signInEmail', async () => {
    // Create user with email identifier
    const { user, identifier, password } = await createUserWithIdentifier({
      identifierType: 'email'
    });
    
    // Use legacy signInEmail method
    const result = await testAuth.api.signInEmail({
      email: identifier,
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.user.id).toBe(user.id);
    expect(result.session).toBeDefined();
  });
  
  it('should fail with incorrect password', async () => {
    const { identifier } = await createUserWithIdentifier({
      identifierType: 'email'
    });
    
    await expect(testAuth.api.signInWithIdentifier({
      identifier,
      identifierType: 'email',
      password: 'wrongpassword'
    })).rejects.toThrow();
  });
  
  it('should fail with non-existent identifier', async () => {
    await expect(testAuth.api.signInWithIdentifier({
      identifier: 'nonexistent@example.com',
      identifierType: 'email',
      password: 'anypassword'
    })).rejects.toThrow();
  });
  
  it('should handle case insensitive email identifiers', async () => {
    const { user, identifier, password } = await createUserWithIdentifier({
      identifier: 'case-test@example.com',
      identifierType: 'email'
    });
    
    // Sign in with uppercase email
    const result = await testAuth.api.signInWithIdentifier({
      identifier: 'CASE-TEST@example.com',
      identifierType: 'email',
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.user.id).toBe(user.id);
  });
  
  it('should handle case sensitive username identifiers', async () => {
    const { user, identifier, password } = await createUserWithIdentifier({
      identifier: 'CaseSensitiveUser',
      identifierType: 'username'
    });
    
    // Should fail with lowercase username
    await expect(testAuth.api.signInWithIdentifier({
      identifier: 'casesensitiveuser',
      identifierType: 'username',
      password
    })).rejects.toThrow();
    
    // Should succeed with exact case
    const result = await testAuth.api.signInWithIdentifier({
      identifier: 'CaseSensitiveUser',
      identifierType: 'username',
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.user.id).toBe(user.id);
  });
  
  it('should support signing in with multiple identifiers for the same user', async () => {
    // Create user with email and username
    const { 
      user, 
      primaryIdentifier, 
      secondaryIdentifier, 
      password,
      signInPrimary,
      signInSecondary
    } = await createMultiIdentifierUser();
    
    // Sign in with primary identifier (email)
    const primaryResult = await signInPrimary();
    expect(primaryResult.user.id).toBe(user.id);
    
    // Sign in with secondary identifier (username)
    const secondaryResult = await signInSecondary();
    expect(secondaryResult.user.id).toBe(user.id);
    
    // Session IDs should be different for multiple logins
    expect(primaryResult.session.id).not.toBe(secondaryResult.session.id);
  });
  
  it('should block signin with unverified identifier when verification required', async () => {
    // Create user with unverified email
    const { user, identifier, password } = await createUserWithIdentifier({
      identifierType: 'email'
    });
    
    // Configure auth to require verification
    const secureAuth = await createAuthWithVerification();
    
    // Should fail because email is not verified
    await expect(secureAuth.api.signInWithIdentifier({
      identifier,
      identifierType: 'email',
      password
    })).rejects.toThrow(/verification required/i);
    
    // Verify the identifier
    await testAuth.db.updateIdentifier({
      userId: user.id,
      type: 'email',
      value: identifier,
      verified: true
    });
    
    // Now should succeed
    const result = await secureAuth.api.signInWithIdentifier({
      identifier,
      identifierType: 'email',
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.user.id).toBe(user.id);
  });
  
  it('should provide appropriate error messages that do not leak identifier existence', async () => {
    // Create a user
    await createUserWithIdentifier({
      identifier: 'secure@example.com',
      identifierType: 'email'
    });
    
    // Try wrong password for existing user
    const existingError = await testAuth.api.signInWithIdentifier({
      identifier: 'secure@example.com',
      identifierType: 'email',
      password: 'wrongpassword'
    }).catch(e => e.message);
    
    // Try non-existent user
    const nonExistentError = await testAuth.api.signInWithIdentifier({
      identifier: 'nonexistent@example.com',
      identifierType: 'email',
      password: 'anypassword'
    }).catch(e => e.message);
    
    // Errors should be identical to prevent enumeration
    expect(existingError).toBe(nonExistentError);
  });
});

// Helper to create auth instance requiring verification
async function createAuthWithVerification() {
  const { createAuth } = await import('../../auth');
  
  return createAuth({
    identifierTable: {
      mode: 'virtual'
    },
    verification: {
      requireVerification: true
    }
  });
}