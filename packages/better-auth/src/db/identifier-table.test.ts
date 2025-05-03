import { auth } from '../test-utils/test-instance';
import { configureAuthInstance } from '../test-utils/identifier-helpers';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

describe('Identifier Table Core', () => {
  let testAuth = auth;
  
  beforeEach(async () => {
    // Create a fresh auth instance for each test
    testAuth = await configureAuthInstance({ mode: 'virtual' });
  });
  
  afterEach(async () => {
    // Clean up any users created during tests
    // This is test environment specific and might need to be adjusted
    const adapter = testAuth.adapter;
    if (adapter.clearDatabase) {
      await adapter.clearDatabase();
    }
  });

  it('should generate correct schema with identifier table', async () => {
    const schema = testAuth.db.getSchema();
    
    // Check identifier table structure
    expect(schema.identifiers).toBeDefined();
    expect(schema.identifiers.fields).toMatchObject({
      id: { type: 'string', primaryKey: true },
      userId: { type: 'string' },
      type: { type: 'string' },
      value: { type: 'string' },
      verified: { type: 'boolean' },
      passwordHash: { type: 'string', optional: true },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
      metadata: { type: 'json', optional: true }
    });
    
    // Check indexes
    expect(schema.identifiers.indexes).toContainEqual({
      name: 'identifiers_type_value_idx',
      fields: ['type', 'value'],
      unique: true
    });
    
    expect(schema.identifiers.indexes).toContainEqual({
      name: 'identifiers_userId_idx',
      fields: ['userId']
    });
    
    // Confirm relation to users table
    expect(schema.identifiers.relations.user).toBeDefined();
  });
  
  it('should properly transform identifier queries', async () => {
    // Test the query transformation for backward compatibility
    const transformedQuery = testAuth.db.transformQuery('user', { 
      where: { email: 'test@example.com' } 
    });
    
    // Should transform to use identifiers
    expect(transformedQuery).toEqual({
      where: {
        identifiers: {
          some: {
            type: 'email',
            value: 'test@example.com'
          }
        }
      }
    });
  });
  
  it('should correctly implement virtual fields', async () => {
    // Create user with identifier
    const email = 'virtualfield@example.com';
    const user = await testAuth.db.createUser({
      email,
      emailVerified: false,
      password: 'password123'
    });
    
    // Get user with identifiers
    const fetchedUser = await testAuth.db.getUser({ id: user.id });
    
    // Virtual fields should work
    expect(fetchedUser.email).toBe(email);
    expect(fetchedUser.emailVerified).toBe(false);
    
    // Check identifier record was created
    const identifiers = await testAuth.db.getUserIdentifiers(user.id);
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0]).toMatchObject({
      type: 'email',
      value: email,
      verified: false
    });
  });
  
  it('should support updating virtual fields', async () => {
    // Create user with initial email
    const initialEmail = 'initial@example.com';
    const user = await testAuth.db.createUser({
      email: initialEmail,
      emailVerified: false,
      password: 'password123'
    });
    
    // Update virtual field
    const newEmail = 'updated@example.com';
    await testAuth.db.updateUser({
      id: user.id,
      email: newEmail,
      emailVerified: true
    });
    
    // Get updated user
    const updatedUser = await testAuth.db.getUser({ id: user.id });
    
    // Virtual fields should be updated
    expect(updatedUser.email).toBe(newEmail);
    expect(updatedUser.emailVerified).toBe(true);
    
    // Check identifiers reflect changes
    const identifiers = await testAuth.db.getUserIdentifiers(user.id);
    
    // Should have the new identifier
    const emailIdentifier = identifiers.find(i => i.type === 'email' && i.value === newEmail);
    expect(emailIdentifier).toBeDefined();
    expect(emailIdentifier.verified).toBe(true);
    
    // The old identifier should be removed or marked as deleted
    const oldIdentifier = identifiers.find(i => i.type === 'email' && i.value === initialEmail);
    expect(oldIdentifier).toBeUndefined();
  });
  
  it('should handle direct identifier operations', async () => {
    // Create user
    const user = await testAuth.db.createUser({
      name: 'Direct Identifier User'
    });
    
    // Add identifier directly
    const username = 'directuser';
    await testAuth.db.createIdentifier({
      userId: user.id,
      type: 'username',
      value: username,
      verified: true
    });
    
    // Get user by identifier
    const userByIdentifier = await testAuth.db.getUserByIdentifier({
      type: 'username',
      value: username
    });
    
    expect(userByIdentifier.id).toBe(user.id);
    
    // Get identifier
    const identifier = await testAuth.db.getIdentifier({
      type: 'username',
      value: username
    });
    
    expect(identifier).toBeDefined();
    expect(identifier.userId).toBe(user.id);
    expect(identifier.verified).toBe(true);
  });
  
  it('should support multiple identifiers per user', async () => {
    // Create user with email
    const email = 'multi@example.com';
    const user = await testAuth.db.createUser({
      email,
      emailVerified: true,
      password: 'password123'
    });
    
    // Add phone number
    const phone = '+15551234567';
    await testAuth.db.createIdentifier({
      userId: user.id,
      type: 'phone',
      value: phone,
      verified: false
    });
    
    // Add username
    const username = 'multiuser';
    await testAuth.db.createIdentifier({
      userId: user.id,
      type: 'username',
      value: username,
      verified: true
    });
    
    // Get all identifiers
    const identifiers = await testAuth.db.getUserIdentifiers(user.id);
    
    // Should have 3 identifiers
    expect(identifiers).toHaveLength(3);
    
    // Check types
    const types = identifiers.map(i => i.type);
    expect(types).toContain('email');
    expect(types).toContain('phone');
    expect(types).toContain('username');
    
    // Get user by each identifier
    const userByEmail = await testAuth.db.getUserByIdentifier({
      type: 'email',
      value: email
    });
    expect(userByEmail.id).toBe(user.id);
    
    const userByPhone = await testAuth.db.getUserByIdentifier({
      type: 'phone',
      value: phone
    });
    expect(userByPhone.id).toBe(user.id);
    
    const userByUsername = await testAuth.db.getUserByIdentifier({
      type: 'username',
      value: username
    });
    expect(userByUsername.id).toBe(user.id);
  });
  
  it('should enforce uniqueness constraints on identifiers', async () => {
    // Create first user with email
    const email = 'unique@example.com';
    const user1 = await testAuth.db.createUser({
      email,
      password: 'password123'
    });
    
    // Try to create second user with same email
    await expect(testAuth.db.createUser({
      email,
      password: 'differentpassword'
    })).rejects.toThrow();
    
    // Create user with different email but try to add duplicate identifier
    const user2 = await testAuth.db.createUser({
      email: 'different@example.com',
      password: 'password123'
    });
    
    // Try to add same email as identifier
    await expect(testAuth.db.createIdentifier({
      userId: user2.id,
      type: 'email',
      value: email,
      verified: false
    })).rejects.toThrow();
  });
  
  it('should support different performance modes', async () => {
    // Create auth instances with different modes
    const virtualAuth = await configureAuthInstance({ mode: 'virtual' });
    const directAuth = await configureAuthInstance({ mode: 'direct' });
    const legacyAuth = await configureAuthInstance({ mode: 'legacy' });
    
    // Test virtual mode
    const virtualUser = await virtualAuth.db.createUser({
      email: 'virtual@example.com',
      emailVerified: true,
      password: 'password123'
    });
    
    expect(virtualUser.email).toBe('virtual@example.com');
    expect(virtualUser.emailVerified).toBe(true);
    
    // Test direct mode 
    const directUser = await directAuth.db.createUser({
      name: 'Direct User'
    });
    
    await directAuth.db.createIdentifier({
      userId: directUser.id,
      type: 'email',
      value: 'direct@example.com',
      verified: true
    });
    
    const directUserIdentifiers = await directAuth.db.getUserIdentifiers(directUser.id);
    expect(directUserIdentifiers).toHaveLength(1);
    
    // Test legacy mode
    const legacyUser = await legacyAuth.db.createUser({
      email: 'legacy@example.com',
      emailVerified: false,
      password: 'password123'
    });
    
    expect(legacyUser.email).toBe('legacy@example.com');
    expect(legacyUser.emailVerified).toBe(false);
  });
});