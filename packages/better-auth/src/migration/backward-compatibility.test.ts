import { auth } from '../test-utils/test-instance';
import { configureAuthInstance } from '../test-utils/identifier-helpers';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

describe('Backward Compatibility', () => {
  let virtualAuth;
  
  beforeEach(async () => {
    // Create auth instance with virtual mode (abstraction layer)
    virtualAuth = await configureAuthInstance({ mode: 'virtual' });
  });
  
  afterEach(async () => {
    // Clean up any users created during tests
    const adapter = auth.adapter;
    if (adapter.clearDatabase) {
      await adapter.clearDatabase();
    }
  });
  
  it('should maintain backward compatibility with existing user model API', async () => {
    // Create a user with the new identifier API
    const email = 'compatibility@example.com';
    const password = 'password123';
    
    const { user } = await virtualAuth.api.signUpWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password
    });
    
    // Try to get the user with legacy methods
    const userByEmail = await virtualAuth.api.getUserByEmail(email);
    
    // Should be the same user
    expect(userByEmail.id).toBe(user.id);
    
    // Check that virtual fields work
    expect(userByEmail.email).toBe(email);
    expect(userByEmail.emailVerified).toBe(false);
  });
  
  it('should handle legacy field updates correctly', async () => {
    // Create a user with the new API
    const initialEmail = 'initial@example.com';
    const password = 'password123';
    
    const { user } = await virtualAuth.api.signUpWithIdentifier({
      identifier: initialEmail,
      identifierType: 'email',
      password
    });
    
    // Update using legacy API
    const newEmail = 'updated@example.com';
    await virtualAuth.api.updateUser({
      id: user.id,
      email: newEmail,
      emailVerified: true
    });
    
    // Get updated user
    const updatedUser = await virtualAuth.api.getUser({ id: user.id });
    
    // Check virtual fields
    expect(updatedUser.email).toBe(newEmail);
    expect(updatedUser.emailVerified).toBe(true);
    
    // Check real identifiers
    const identifiers = await virtualAuth.adapter.getUserIdentifiers({
      userId: user.id
    });
    
    // Should have only the new email identifier (old one should be replaced)
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0].type).toBe('email');
    expect(identifiers[0].value).toBe(newEmail);
    expect(identifiers[0].verified).toBe(true);
  });
  
  it('should maintain backward compatibility with existing adapter API', async () => {
    // Create a user with the adapter createUser method
    const email = 'adapter-test@example.com';
    const user = await virtualAuth.adapter.createUser({
      email,
      emailVerified: false,
      password: 'password123'
    });
    
    // Get user with getUserByEmail
    const foundUser = await virtualAuth.adapter.getUserByEmail(email);
    
    // Should be the same user
    expect(foundUser.id).toBe(user.id);
    
    // Check that identifiers were created
    const identifiers = await virtualAuth.adapter.getUserIdentifiers({
      userId: user.id
    });
    
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0].type).toBe('email');
    expect(identifiers[0].value).toBe(email);
  });
  
  it('should support existing account linking API', async () => {
    // Create a user with the new API
    const email = 'linkaccount@example.com';
    const password = 'password123';
    
    const { user } = await virtualAuth.api.signUpWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password
    });
    
    // Link account with legacy API
    await virtualAuth.adapter.linkAccount({
      userId: user.id,
      provider: 'github',
      providerAccountId: '12345',
      type: 'oauth',
      access_token: 'token'
    });
    
    // Get accounts with legacy API
    const accounts = await virtualAuth.adapter.getUserAccounts({
      userId: user.id
    });
    
    // Should have the account
    expect(accounts).toHaveLength(1);
    expect(accounts[0].provider).toBe('github');
    expect(accounts[0].providerAccountId).toBe('12345');
    
    // Check identifiers - should have both email and oauth
    const identifiers = await virtualAuth.adapter.getUserIdentifiers({
      userId: user.id
    });
    
    expect(identifiers).toHaveLength(2);
    expect(identifiers.map(i => i.type)).toContain('email');
    expect(identifiers.map(i => i.type)).toContain('oauth');
  });
  
  it('should support existing verification API', async () => {
    // Create a user with the new API
    const email = 'verify@example.com';
    const password = 'password123';
    
    const { user } = await virtualAuth.api.signUpWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password
    });
    
    // Create verification token with legacy API
    const token = await virtualAuth.adapter.createVerificationToken({
      identifier: email,
      token: 'test-token',
      expires: new Date(Date.now() + 3600000)
    });
    
    // Get token with legacy API
    const foundToken = await virtualAuth.adapter.getVerificationToken({
      token: 'test-token'
    });
    
    // Should be the same token
    expect(foundToken.identifier).toBe(email);
    
    // Use token to verify email with legacy API
    await virtualAuth.api.verifyEmail({
      token: 'test-token'
    });
    
    // Check that identifier is verified
    const identifiers = await virtualAuth.adapter.getUserIdentifiers({
      userId: user.id
    });
    
    expect(identifiers[0].verified).toBe(true);
  });
  
  it('should support existing password reset API', async () => {
    // Create a user with the new API
    const email = 'reset@example.com';
    const password = 'password123';
    
    const { user } = await virtualAuth.api.signUpWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password
    });
    
    // Request password reset with legacy API
    await virtualAuth.api.requestPasswordResetEmail({
      email
    });
    
    // Token is created via email service in real app, we'll create manually for test
    const resetToken = await virtualAuth.adapter.createVerificationToken({
      identifier: email,
      token: 'reset-token',
      expires: new Date(Date.now() + 3600000)
    });
    
    // New password
    const newPassword = 'newpassword123';
    
    // Reset password with legacy API
    await virtualAuth.api.resetPassword({
      token: 'reset-token',
      password: newPassword
    });
    
    // Try to sign in with new password
    const signInResult = await virtualAuth.api.signInEmail({
      email,
      password: newPassword
    });
    
    expect(signInResult.user.id).toBe(user.id);
  });
  
  it('should support existing session API', async () => {
    // Create a user with the new API
    const email = 'session@example.com';
    const password = 'password123';
    
    const { user, session } = await virtualAuth.api.signUpWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password
    });
    
    // Get session with legacy API
    const foundSession = await virtualAuth.adapter.getSession({
      sessionId: session.id
    });
    
    // Should be the same session
    expect(foundSession.id).toBe(session.id);
    expect(foundSession.userId).toBe(user.id);
    
    // Update session with legacy API
    await virtualAuth.adapter.updateSession({
      sessionId: session.id,
      data: { customData: { lastPage: '/dashboard' } }
    });
    
    // Get updated session
    const updatedSession = await virtualAuth.adapter.getSession({
      sessionId: session.id
    });
    
    expect(updatedSession.data.customData.lastPage).toBe('/dashboard');
  });
  
  it('should support existing queries that filter on email', async () => {
    // Create multiple users
    const email1 = 'filter1@example.com';
    const email2 = 'filter2@example.com';
    
    await virtualAuth.api.signUpWithIdentifier({
      identifier: email1,
      identifierType: 'email',
      password: 'password123'
    });
    
    await virtualAuth.api.signUpWithIdentifier({
      identifier: email2,
      identifierType: 'email',
      password: 'password123'
    });
    
    // Use legacy API with email filter
    const users = await virtualAuth.adapter.getUsers({
      where: { email: email1 }
    });
    
    // Should return only the user with the matching email
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe(email1);
  });
  
  it('should warn on legacy usage when configured', async () => {
    // Create auth with warnings
    const warnAuth = await configureAuthInstance({ 
      mode: 'virtual',
      warnOnLegacyUsage: true 
    });
    
    // Mock console.warn
    const originalWarn = console.warn;
    const mockWarn = jest.fn();
    console.warn = mockWarn;
    
    try {
      // Use legacy method
      await warnAuth.api.signUpEmail({
        email: 'warn@example.com',
        password: 'password123'
      });
      
      // Should have logged warning
      expect(mockWarn).toHaveBeenCalled();
      expect(mockWarn.mock.calls[0][0]).toMatch(/deprecated/i);
    } finally {
      // Restore console.warn
      console.warn = originalWarn;
    }
  });
});