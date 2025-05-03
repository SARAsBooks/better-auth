import { auth } from '../test-utils/test-instance';
import { configureAuthInstance } from '../test-utils/identifier-helpers';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

describe('Email to Identifier Migration', () => {
  let legacyAuth;
  let migrationAuth;
  
  beforeEach(async () => {
    // Create legacy auth instance
    legacyAuth = await configureAuthInstance({ mode: 'legacy' });
    
    // Create migration auth instance
    migrationAuth = await configureAuthInstance({ 
      mode: 'virtual', 
      migrateExistingData: true 
    });
  });
  
  afterEach(async () => {
    // Clean up any users created during tests
    const adapter = auth.adapter;
    if (adapter.clearDatabase) {
      await adapter.clearDatabase();
    }
  });
  
  it('should migrate existing users from email-only to identifier model', async () => {
    // Create users in legacy mode
    const email1 = 'migrate1@example.com';
    const email2 = 'migrate2@example.com';
    
    const user1 = await legacyAuth.api.signUpEmail({
      email: email1,
      password: 'password123'
    });
    
    const user2 = await legacyAuth.api.signUpEmail({
      email: email2,
      password: 'password123'
    });
    
    // Verify email for one user but not the other
    await legacyAuth.adapter.updateUser({
      id: user1.user.id,
      emailVerified: true
    });
    
    // Run migration script
    await migrationAuth.api.migrateToIdentifierTable();
    
    // Verify users have identifiers
    const user1Identifiers = await migrationAuth.adapter.getUserIdentifiers({
      userId: user1.user.id
    });
    
    const user2Identifiers = await migrationAuth.adapter.getUserIdentifiers({
      userId: user2.user.id
    });
    
    // Check identifiers were created correctly
    expect(user1Identifiers).toHaveLength(1);
    expect(user1Identifiers[0]).toMatchObject({
      type: 'email',
      value: email1,
      verified: true
    });
    
    expect(user2Identifiers).toHaveLength(1);
    expect(user2Identifiers[0]).toMatchObject({
      type: 'email',
      value: email2,
      verified: false
    });
    
    // Test login with migrated users
    const loginResult = await migrationAuth.api.signInWithIdentifier({
      identifier: email1,
      identifierType: 'email',
      password: 'password123'
    });
    
    expect(loginResult.user.id).toBe(user1.user.id);
  });
  
  it('should handle migration for users with multiple accounts', async () => {
    // Create user with account
    const email = 'withaccount@example.com';
    const user = await legacyAuth.api.signUpEmail({
      email,
      password: 'password123'
    });
    
    // Add account
    await legacyAuth.adapter.linkAccount({
      userId: user.user.id,
      provider: 'github',
      providerAccountId: '12345',
      type: 'oauth',
      access_token: 'token'
    });
    
    // Run migration
    await migrationAuth.api.migrateToIdentifierTable();
    
    // Check identifiers
    const identifiers = await migrationAuth.adapter.getUserIdentifiers({
      userId: user.user.id
    });
    
    // Should have email identifier and oauth identifier
    expect(identifiers).toHaveLength(2);
    expect(identifiers.map(i => i.type)).toContain('email');
    expect(identifiers.map(i => i.type)).toContain('oauth');
    
    // Check oauth identifier
    const oauthIdentifier = identifiers.find(i => i.type === 'oauth');
    expect(oauthIdentifier.value).toBe('github|12345');
    expect(oauthIdentifier.verified).toBe(true);
    expect(oauthIdentifier.metadata).toMatchObject({
      provider: 'github',
      access_token: 'token'
    });
  });
  
  it('should preserve user data during migration', async () => {
    // Create user with additional data
    const email = 'userdata@example.com';
    const userData = {
      name: 'User Data Test',
      role: 'admin',
      customData: {
        preferences: {
          theme: 'dark',
          notifications: true
        }
      }
    };
    
    const user = await legacyAuth.api.signUpEmail({
      email,
      password: 'password123',
      ...userData
    });
    
    // Run migration
    await migrationAuth.api.migrateToIdentifierTable();
    
    // Get migrated user
    const migratedUser = await migrationAuth.api.getUser({ id: user.user.id });
    
    // Check user data was preserved
    expect(migratedUser.name).toBe(userData.name);
    expect(migratedUser.role).toBe(userData.role);
    expect(migratedUser.customData).toEqual(userData.customData);
  });
  
  it('should handle incremental migration of new users', async () => {
    // Create some initial users
    const email1 = 'initial1@example.com';
    const user1 = await legacyAuth.api.signUpEmail({
      email: email1,
      password: 'password123'
    });
    
    // Run first migration
    await migrationAuth.api.migrateToIdentifierTable();
    
    // Create more users after initial migration
    const email2 = 'after-migration@example.com';
    const user2 = await legacyAuth.api.signUpEmail({
      email: email2,
      password: 'password123'
    });
    
    // Run second migration
    await migrationAuth.api.migrateToIdentifierTable();
    
    // Both users should have identifiers
    const user1Identifiers = await migrationAuth.adapter.getUserIdentifiers({
      userId: user1.user.id
    });
    
    const user2Identifiers = await migrationAuth.adapter.getUserIdentifiers({
      userId: user2.user.id
    });
    
    expect(user1Identifiers).toHaveLength(1);
    expect(user1Identifiers[0].value).toBe(email1);
    
    expect(user2Identifiers).toHaveLength(1);
    expect(user2Identifiers[0].value).toBe(email2);
  });
  
  it('should handle auto-migration when accessing users', async () => {
    // Create user in legacy mode
    const email = 'auto-migrate@example.com';
    const user = await legacyAuth.api.signUpEmail({
      email,
      password: 'password123'
    });
    
    // Configure auth with auto-migration
    const autoMigrateAuth = await configureAuthInstance({ 
      mode: 'virtual',
      migrateExistingData: true
    });
    
    // Access user - should trigger auto-migration
    const migratedUser = await autoMigrateAuth.api.getUser({ id: user.user.id });
    
    // Check that identifiers were created
    const identifiers = await autoMigrateAuth.adapter.getUserIdentifiers({
      userId: user.user.id
    });
    
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0].type).toBe('email');
    expect(identifiers[0].value).toBe(email);
  });
  
  it('should support both legacy and new APIs during migration period', async () => {
    // Create user with migration auth
    const email = 'hybrid@example.com';
    const user = await migrationAuth.api.signUpEmail({
      email,
      password: 'password123'
    });
    
    // Get user with legacy method
    const legacyGetUser = await migrationAuth.api.getUserByEmail(email);
    expect(legacyGetUser.id).toBe(user.user.id);
    
    // Get user with new method
    const newGetUser = await migrationAuth.api.getUserByIdentifier({
      identifier: email,
      identifierType: 'email'
    });
    expect(newGetUser.id).toBe(user.user.id);
    
    // Sign in with legacy method
    const legacySignIn = await migrationAuth.api.signInEmail({
      email,
      password: 'password123'
    });
    expect(legacySignIn.user.id).toBe(user.user.id);
    
    // Sign in with new method
    const newSignIn = await migrationAuth.api.signInWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password: 'password123'
    });
    expect(newSignIn.user.id).toBe(user.user.id);
  });
  
  it('should handle password migration correctly', async () => {
    // Create user in legacy mode
    const email = 'password-migrate@example.com';
    const password = 'password123';
    const user = await legacyAuth.api.signUpEmail({
      email,
      password
    });
    
    // Run migration
    await migrationAuth.api.migrateToIdentifierTable();
    
    // Get migrated user's identifier
    const identifiers = await migrationAuth.adapter.getUserIdentifiers({
      userId: user.user.id
    });
    
    // Password hash should be transferred to the identifier
    expect(identifiers[0].passwordHash).toBeDefined();
    
    // Should be able to sign in with the password
    const signInResult = await migrationAuth.api.signInWithIdentifier({
      identifier: email,
      identifierType: 'email',
      password
    });
    
    expect(signInResult.user.id).toBe(user.user.id);
  });
});