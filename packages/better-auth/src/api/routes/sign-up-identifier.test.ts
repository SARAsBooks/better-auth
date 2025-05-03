import { auth } from '../../test-utils/test-instance';
import { configureAuthInstance } from '../../test-utils/identifier-helpers';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

describe('Sign Up with Identifier API', () => {
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
  
  it('should sign up a user with email identifier', async () => {
    const email = `test-${Math.random().toString(36).substring(2)}@example.com`;
    const password = 'password123';
    
    const result = await testAuth.api.signUpWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.session).toBeDefined();
    
    // Check that the identifier was created
    const identifiers = await testAuth.db.getUserIdentifiers(result.user.id);
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0].type).toBe('email');
    expect(identifiers[0].value).toBe(email);
    expect(identifiers[0].verified).toBe(false);
  });
  
  it('should sign up a user with username identifier', async () => {
    const username = `user-${Math.random().toString(36).substring(2)}`;
    const password = 'password123';
    
    const result = await testAuth.api.signUpWithIdentifier({
      identifier: username,
      identifierType: 'username',
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.session).toBeDefined();
    
    // Check that the identifier was created
    const identifiers = await testAuth.db.getUserIdentifiers(result.user.id);
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0].type).toBe('username');
    expect(identifiers[0].value).toBe(username);
    expect(identifiers[0].verified).toBe(true); // Usernames are typically pre-verified
  });
  
  it('should sign up a user with phone identifier', async () => {
    const phone = '+1555' + Math.floor(1000000 + Math.random() * 9000000);
    const password = 'password123';
    
    const result = await testAuth.api.signUpWithIdentifier({
      identifier: phone,
      identifierType: 'phone',
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.session).toBeDefined();
    
    // Check that the identifier was created
    const identifiers = await testAuth.db.getUserIdentifiers(result.user.id);
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0].type).toBe('phone');
    expect(identifiers[0].value).toBe(phone);
    expect(identifiers[0].verified).toBe(false);
  });
  
  it('should maintain backward compatibility with signUpEmail', async () => {
    const email = `legacy-${Math.random().toString(36).substring(2)}@example.com`;
    const password = 'password123';
    
    // Use legacy signUpEmail method
    const result = await testAuth.api.signUpEmail({
      email,
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.session).toBeDefined();
    
    // Check that the identifier was created
    const identifiers = await testAuth.db.getUserIdentifiers(result.user.id);
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0].type).toBe('email');
    expect(identifiers[0].value).toBe(email);
  });
  
  it('should prevent duplicate identifiers', async () => {
    const email = `duplicate-${Math.random().toString(36).substring(2)}@example.com`;
    const password = 'password123';
    
    // First signup should succeed
    await testAuth.api.signUpWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password
    });
    
    // Second signup with same email should fail
    await expect(testAuth.api.signUpWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password: 'different-password'
    })).rejects.toThrow();
  });
  
  it('should handle case insensitive email identifiers', async () => {
    const email = `CASE-${Math.random().toString(36).substring(2)}@example.com`;
    const password = 'password123';
    
    // Sign up with uppercase email
    await testAuth.api.signUpWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password
    });
    
    // Try signing up with lowercase version, should fail
    await expect(testAuth.api.signUpWithIdentifier({
      identifier: email.toLowerCase(),
      identifierType: 'email',
      password
    })).rejects.toThrow();
  });
  
  it('should sign up with additional user data', async () => {
    const email = `additional-${Math.random().toString(36).substring(2)}@example.com`;
    const password = 'password123';
    const userData = {
      name: 'Test User',
      role: 'user',
      customData: {
        favoriteColor: 'blue',
        agreeToTerms: true
      }
    };
    
    const result = await testAuth.api.signUpWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password,
      ...userData
    });
    
    expect(result.user.name).toBe(userData.name);
    expect(result.user.role).toBe(userData.role);
    expect(result.user.customData).toEqual(userData.customData);
  });
  
  it('should verify email identifier', async () => {
    const email = `verify-${Math.random().toString(36).substring(2)}@example.com`;
    const password = 'password123';
    
    // Sign up user
    const { user } = await testAuth.api.signUpWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password
    });
    
    // Get identifier
    let identifiers = await testAuth.db.getUserIdentifiers(user.id);
    expect(identifiers[0].verified).toBe(false);
    
    // Send verification
    const { verificationId } = await testAuth.api.sendIdentifierVerification({
      userId: user.id,
      identifier: email,
      identifierType: 'email'
    });
    
    // Get token (test environment shortcut)
    const verification = await testAuth.adapter.getVerificationToken({ id: verificationId });
    
    // Verify identifier
    await testAuth.api.verifyIdentifier({
      token: verification.token
    });
    
    // Check identifier is verified
    identifiers = await testAuth.db.getUserIdentifiers(user.id);
    expect(identifiers[0].verified).toBe(true);
  });
  
  it('should support signing up without any provided data besides the identifier', async () => {
    const email = `minimal-${Math.random().toString(36).substring(2)}@example.com`;
    const password = 'password123';
    
    // Minimal signup with just identifier
    const result = await testAuth.api.signUpWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.user.id).toBeDefined();
    
    // Check that defaults were applied
    expect(result.user.role).toBe('user'); // Default role
    expect(result.user.createdAt).toBeInstanceOf(Date);
  });
  
  it('should create user with multiple identifiers in one request', async () => {
    const email = `multi-${Math.random().toString(36).substring(2)}@example.com`;
    const username = `user-${Math.random().toString(36).substring(2)}`;
    const password = 'password123';
    
    // Sign up with multiple identifiers
    const result = await testAuth.api.signUpWithIdentifiers({
      identifiers: [
        { type: 'email', value: email, verified: false },
        { type: 'username', value: username, verified: true }
      ],
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.session).toBeDefined();
    
    // Check that both identifiers were created
    const identifiers = await testAuth.db.getUserIdentifiers(result.user.id);
    expect(identifiers).toHaveLength(2);
    
    // Check email identifier
    const emailIdentifier = identifiers.find(i => i.type === 'email');
    expect(emailIdentifier.value).toBe(email);
    expect(emailIdentifier.verified).toBe(false);
    
    // Check username identifier
    const usernameIdentifier = identifiers.find(i => i.type === 'username');
    expect(usernameIdentifier.value).toBe(username);
    expect(usernameIdentifier.verified).toBe(true);
  });
  
  it('should sign up a user when email is not required', async () => {
    // Configure auth without requiring email
    const customAuth = await configureAuthInstance({
      mode: 'direct' // Direct mode won't enforce email requirement
    });
    
    const username = `nomail-${Math.random().toString(36).substring(2)}`;
    const password = 'password123';
    
    // Sign up with just username
    const result = await customAuth.api.signUpWithIdentifier({
      identifier: username,
      identifierType: 'username',
      password
    });
    
    expect(result.user).toBeDefined();
    expect(result.session).toBeDefined();
    
    // User should have only username identifier
    const identifiers = await customAuth.db.getUserIdentifiers(result.user.id);
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0].type).toBe('username');
  });
  
  it('should normalize identifiers during signup', async () => {
    const email = `  Normalized-${Math.random().toString(36).substring(2)}@Example.com  `;
    const password = 'password123';
    
    const result = await testAuth.api.signUpWithIdentifier({
      identifier: email, // With spaces and mixed case
      identifierType: 'email',
      password
    });
    
    // Get the normalized identifier from storage
    const identifiers = await testAuth.db.getUserIdentifiers(result.user.id);
    const storedEmail = identifiers[0].value;
    
    // Email should be normalized (trimmed and lowercased)
    const expectedEmail = email.trim().toLowerCase();
    expect(storedEmail).toBe(expectedEmail);
    
    // Should be able to sign in with the normalized version
    const signInResult = await testAuth.api.signInWithIdentifier({
      identifier: expectedEmail,
      identifierType: 'email',
      password
    });
    
    expect(signInResult.user.id).toBe(result.user.id);
  });
  
  it('should support custom validation for identifiers', async () => {
    // Configure auth with custom validation
    const customAuth = await createAuthWithValidation();
    
    // Invalid email format should fail
    const invalidEmail = 'not-an-email';
    await expect(customAuth.api.signUpWithIdentifier({
      identifier: invalidEmail,
      identifierType: 'email',
      password: 'password123'
    })).rejects.toThrow(/invalid email format/i);
    
    // Invalid username (too short) should fail
    const shortUsername = 'a';
    await expect(customAuth.api.signUpWithIdentifier({
      identifier: shortUsername,
      identifierType: 'username',
      password: 'password123'
    })).rejects.toThrow(/username too short/i);
    
    // Valid identifiers should pass
    const validEmail = `valid-${Math.random().toString(36).substring(2)}@example.com`;
    const validResult = await customAuth.api.signUpWithIdentifier({
      identifier: validEmail,
      identifierType: 'email',
      password: 'password123'
    });
    
    expect(validResult.user).toBeDefined();
  });
});

// Helper to create auth instance with custom validation
async function createAuthWithValidation() {
  const { createAuth } = await import('../../auth');
  
  return createAuth({
    identifierTable: {
      mode: 'virtual'
    },
    identifierValidation: {
      email: (value) => {
        if (!value.includes('@')) {
          throw new Error('Invalid email format');
        }
        return value;
      },
      username: (value) => {
        if (value.length < 3) {
          throw new Error('Username too short');
        }
        return value;
      }
    }
  });
}