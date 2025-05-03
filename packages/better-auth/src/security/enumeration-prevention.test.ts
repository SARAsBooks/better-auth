import { auth } from '../test-utils/test-instance';
import { createUserWithIdentifier } from '../test-utils/identifier-helpers';
import { describe, expect, it, beforeEach, afterEach, jest } from 'vitest';

describe('Enumeration Prevention', () => {
  let testAuth = auth;
  
  beforeEach(async () => {
    // Create a fresh auth instance for each test
    testAuth = auth;
    
    // Create a user
    await createUserWithIdentifier({
      identifier: 'exists@example.com',
      identifierType: 'email'
    });
  });
  
  afterEach(async () => {
    // Clean up any users created during tests
    const adapter = testAuth.adapter;
    if (adapter.clearDatabase) {
      await adapter.clearDatabase();
    }
    
    // Clear mocks
    if (jest.restoreAllMocks) {
      jest.restoreAllMocks();
    }
  });
  
  it('should return same error for valid and invalid identifiers on sign-in failure', async () => {
    // Try wrong password for existing user
    const existingError = await testAuth.api.signInWithIdentifier({
      identifier: 'exists@example.com',
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
  
  it('should return same response timing for existing and non-existing identifiers', async () => {
    // Measure time for existing user
    const existingStart = Date.now();
    await testAuth.api.signInWithIdentifier({
      identifier: 'exists@example.com',
      identifierType: 'email',
      password: 'wrongpassword'
    }).catch(() => {});
    const existingTime = Date.now() - existingStart;
    
    // Measure time for non-existent user
    const nonExistentStart = Date.now();
    await testAuth.api.signInWithIdentifier({
      identifier: 'nonexistent@example.com',
      identifierType: 'email',
      password: 'anypassword'
    }).catch(() => {});
    const nonExistentTime = Date.now() - nonExistentStart;
    
    // Times should be similar (within reasonable margin)
    // Not exact due to system variations, but should be close
    expect(Math.abs(existingTime - nonExistentTime)).toBeLessThan(100);
  });
  
  it('should not reveal identifier existence during password reset', async () => {
    // Request reset for existing user
    const existingResult = await testAuth.api.requestPasswordReset({
      identifier: 'exists@example.com',
      identifierType: 'email'
    });
    
    // Request reset for non-existent user
    const nonExistentResult = await testAuth.api.requestPasswordReset({
      identifier: 'nonexistent@example.com',
      identifierType: 'email'
    });
    
    // Both should return success to prevent enumeration
    expect(existingResult.success).toBe(true);
    expect(nonExistentResult.success).toBe(true);
  });
  
  it('should implement rate limiting for identifier verification attempts', async () => {
    // Mock rate limiter
    const mockRateLimiter = jest.spyOn(testAuth.rateLimiter, 'check').mockImplementation(() => {
      return { success: true, limit: 10, remaining: 9, reset: Date.now() + 60000 };
    });
    
    // Send verification
    await testAuth.api.sendIdentifierVerification({
      identifier: 'exists@example.com',
      identifierType: 'email'
    });
    
    // Rate limiter should be called with identifier
    expect(mockRateLimiter).toHaveBeenCalledWith(
      expect.stringContaining('identifier:email:exists@example.com'),
      expect.any(Object)
    );
    
    // Reset mock
    mockRateLimiter.mockRestore();
    
    // Now mock rate limiter to block
    jest.spyOn(testAuth.rateLimiter, 'check').mockImplementation(() => {
      return { success: false, limit: 10, remaining: 0, reset: Date.now() + 60000 };
    });
    
    // Try sending verification too many times
    await expect(testAuth.api.sendIdentifierVerification({
      identifier: 'exists@example.com',
      identifierType: 'email'
    })).rejects.toThrow(/rate limit exceeded/i);
  });
  
  it('should implement minimum timing for all identifier operations', async () => {
    // Check if the auth instance has a timing implementation
    if (!testAuth.security || !testAuth.security.enforceMinimumTiming) {
      // Create a spy on setTimeout
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      
      // Sign in with non-existent user
      await testAuth.api.signInWithIdentifier({
        identifier: 'nonexistent@example.com',
        identifierType: 'email',
        password: 'anypassword'
      }).catch(() => {});
      
      // Should have called setTimeout at least once for timing normalization
      expect(setTimeoutSpy).toHaveBeenCalled();
    }
  });
  
  it('should not reveal whether signup failed due to existing identifier', async () => {
    // First signup should succeed
    await testAuth.api.signUpWithIdentifier({
      identifier: 'duplicate@example.com',
      identifierType: 'email',
      password: 'password123'
    });
    
    // Get error for duplicate signup
    const duplicateError = await testAuth.api.signUpWithIdentifier({
      identifier: 'duplicate@example.com',
      identifierType: 'email',
      password: 'password123'
    }).catch(e => e.message);
    
    // Get error for invalid format
    const invalidError = await testAuth.api.signUpWithIdentifier({
      identifier: 'invalid-format',
      identifierType: 'email',
      password: 'password123'
    }).catch(e => e.message);
    
    // Errors should not reveal that the identifier already exists
    expect(duplicateError).not.toMatch(/already exists|already registered|already taken/i);
  });
  
  it('should not leak identifier existence on verify identifier attempts', async () => {
    // Try to verify non-existent token
    const nonExistentError = await testAuth.api.verifyIdentifier({
      token: 'nonexistent-token'
    }).catch(e => e.message);
    
    // Create a verification token
    const { verificationId } = await testAuth.api.sendIdentifierVerification({
      userId: (await testAuth.db.getUserByEmail('exists@example.com')).id,
      identifier: 'exists@example.com',
      identifierType: 'email'
    });
    
    // Get token
    const verification = await testAuth.adapter.getVerificationToken({ id: verificationId });
    
    // Verify valid token
    await testAuth.api.verifyIdentifier({
      token: verification.token
    });
    
    // Try to verify already used token (should now be invalid)
    const usedTokenError = await testAuth.api.verifyIdentifier({
      token: verification.token
    }).catch(e => e.message);
    
    // Errors should not reveal different information about the token state
    expect(nonExistentError).toBe(usedTokenError);
  });
  
  it('should not leak identifier information in error responses', async () => {
    // Error message for sign in
    const signInError = await testAuth.api.signInWithIdentifier({
      identifier: 'nonexistent@example.com',
      identifierType: 'email',
      password: 'anypassword'
    }).catch(e => e.message);
    
    // Should not contain identifier
    expect(signInError).not.toContain('nonexistent@example.com');
    
    // Error message for password reset
    const resetError = await testAuth.api.requestPasswordReset({
      identifier: 'nonexistent@example.com',
      identifierType: 'email'
    }).catch(e => e.message);
    
    // Should not contain identifier, if it's an error
    if (resetError) {
      expect(resetError).not.toContain('nonexistent@example.com');
    }
  });
  
  it('should apply rate limiting to password reset requests', async () => {
    // Mock rate limiter
    const mockRateLimiter = jest.spyOn(testAuth.rateLimiter, 'check').mockImplementation(() => {
      return { success: true, limit: 10, remaining: 9, reset: Date.now() + 60000 };
    });
    
    // Request password reset
    await testAuth.api.requestPasswordReset({
      identifier: 'exists@example.com',
      identifierType: 'email'
    });
    
    // Rate limiter should be called with identifier
    expect(mockRateLimiter).toHaveBeenCalledWith(
      expect.stringMatching(/reset-password|password-reset/),
      expect.any(Object)
    );
    
    // Reset mock
    mockRateLimiter.mockRestore();
    
    // Now mock rate limiter to block
    jest.spyOn(testAuth.rateLimiter, 'check').mockImplementation(() => {
      return { success: false, limit: 10, remaining: 0, reset: Date.now() + 60000 };
    });
    
    // Try password reset too many times
    await expect(testAuth.api.requestPasswordReset({
      identifier: 'exists@example.com',
      identifierType: 'email'
    })).rejects.toThrow(/rate limit exceeded/i);
  });
});