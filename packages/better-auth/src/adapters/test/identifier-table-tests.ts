import { Adapter } from '../../types/adapter';
import { describe, expect, it, beforeEach } from 'vitest';

// Shared test suite for all adapters
export function identifierTableTests(adapter: Adapter) {
  return () => {
    describe('Identifier Table', () => {
      let userId: string;
      
      beforeEach(async () => {
        // Create a user for testing
        const user = await adapter.createUser({
          email: 'adapter-test@example.com',
          emailVerified: false,
          password: 'password123'
        });
        userId = user.id;
      });
      
      it('should create identifier', async () => {
        const identifier = await adapter.createIdentifier({
          userId,
          type: 'username',
          value: 'adapteruser',
          verified: true
        });
        
        expect(identifier.id).toBeDefined();
        expect(identifier.userId).toBe(userId);
        expect(identifier.type).toBe('username');
        expect(identifier.value).toBe('adapteruser');
        expect(identifier.verified).toBe(true);
      });
      
      it('should get identifier by type and value', async () => {
        // Get the email identifier that was created with the user
        const identifier = await adapter.getIdentifier({
          type: 'email',
          value: 'adapter-test@example.com'
        });
        
        expect(identifier).toBeDefined();
        expect(identifier.userId).toBe(userId);
        expect(identifier.verified).toBe(false);
      });
      
      it('should update identifier', async () => {
        // Get the email identifier
        const identifier = await adapter.getIdentifier({
          type: 'email',
          value: 'adapter-test@example.com'
        });
        
        // Update verification status
        await adapter.updateIdentifier({
          id: identifier.id,
          verified: true
        });
        
        // Get updated identifier
        const updated = await adapter.getIdentifier({
          id: identifier.id
        });
        
        expect(updated.verified).toBe(true);
      });
      
      it('should delete identifier', async () => {
        // Create a secondary identifier
        const identifier = await adapter.createIdentifier({
          userId,
          type: 'phone',
          value: '+15551234567',
          verified: false
        });
        
        // Delete it
        await adapter.deleteIdentifier({
          id: identifier.id
        });
        
        // Try to get it
        const deleted = await adapter.getIdentifier({
          id: identifier.id
        });
        
        expect(deleted).toBeNull();
      });
      
      it('should get all user identifiers', async () => {
        // Add a second identifier
        await adapter.createIdentifier({
          userId,
          type: 'username',
          value: 'adapteruser',
          verified: true
        });
        
        // Get all identifiers
        const identifiers = await adapter.getUserIdentifiers({
          userId
        });
        
        expect(identifiers).toHaveLength(2);
        expect(identifiers.map(i => i.type)).toContain('email');
        expect(identifiers.map(i => i.type)).toContain('username');
      });
      
      it('should handle unique constraint violations', async () => {
        // Try to create duplicate email
        await expect(adapter.createIdentifier({
          userId,
          type: 'email',
          value: 'adapter-test@example.com',
          verified: false
        })).rejects.toThrow(); // Each adapter might have different error types
      });
      
      it('should update user with new primary identifier', async () => {
        // Get the current email identifier
        const emailIdentifier = await adapter.getIdentifier({
          type: 'email',
          value: 'adapter-test@example.com'
        });
        
        // Create a new email
        const newEmail = 'new-email@example.com';
        
        // Update user's email - this should update the primary identifier
        await adapter.updateUser({
          id: userId,
          email: newEmail
        });
        
        // The old identifier should be replaced or updated
        const oldIdentifier = await adapter.getIdentifier({
          type: 'email',
          value: 'adapter-test@example.com'
        });
        
        // The new identifier should exist
        const newIdentifier = await adapter.getIdentifier({
          type: 'email',
          value: newEmail
        });
        
        expect(oldIdentifier).toBeNull();
        expect(newIdentifier).toBeDefined();
        expect(newIdentifier.userId).toBe(userId);
      });
      
      it('should maintain verification status when updating identifier', async () => {
        // Get the email identifier
        const identifier = await adapter.getIdentifier({
          type: 'email',
          value: 'adapter-test@example.com'
        });
        
        // Verify it
        await adapter.updateIdentifier({
          id: identifier.id,
          verified: true
        });
        
        // Update user with same email but different format
        await adapter.updateUser({
          id: userId,
          email: 'ADAPTER-TEST@example.com' // Same email but uppercase
        });
        
        // Get the updated identifier
        const updatedIdentifier = await adapter.getIdentifier({
          type: 'email',
          value: 'ADAPTER-TEST@example.com'
        });
        
        // Verification status should be preserved
        expect(updatedIdentifier.verified).toBe(true);
      });
      
      it('should create user with multiple identifiers', async () => {
        // Create new user with multiple identifiers
        const newUser = await adapter.createUser({
          email: 'multi-identifier@example.com',
          emailVerified: true,
          name: 'Multi Identifier User',
          password: 'password123'
        });
        
        // Add username
        await adapter.createIdentifier({
          userId: newUser.id,
          type: 'username',
          value: 'multiuser',
          verified: true
        });
        
        // Add phone
        await adapter.createIdentifier({
          userId: newUser.id,
          type: 'phone',
          value: '+15557654321',
          verified: false
        });
        
        // Get all identifiers
        const identifiers = await adapter.getUserIdentifiers({
          userId: newUser.id
        });
        
        expect(identifiers).toHaveLength(3);
        
        // Check all types are present
        const types = identifiers.map(i => i.type);
        expect(types).toContain('email');
        expect(types).toContain('username');
        expect(types).toContain('phone');
        
        // Check verification status
        const email = identifiers.find(i => i.type === 'email');
        const username = identifiers.find(i => i.type === 'username');
        const phone = identifiers.find(i => i.type === 'phone');
        
        expect(email.verified).toBe(true);
        expect(username.verified).toBe(true);
        expect(phone.verified).toBe(false);
      });
      
      it('should link oauth account to user via identifiers', async () => {
        // Create oauth identifier
        await adapter.createIdentifier({
          userId,
          type: 'oauth',
          value: 'github|12345',
          verified: true,
          metadata: {
            provider: 'github',
            access_token: 'token123',
            token_type: 'bearer'
          }
        });
        
        // Get all identifiers
        const identifiers = await adapter.getUserIdentifiers({
          userId
        });
        
        // Should have email and oauth identifiers
        expect(identifiers).toHaveLength(2);
        
        // Check oauth identifier
        const oauthIdentifier = identifiers.find(i => i.type === 'oauth');
        expect(oauthIdentifier).toBeDefined();
        expect(oauthIdentifier.value).toBe('github|12345');
        expect(oauthIdentifier.verified).toBe(true);
        expect(oauthIdentifier.metadata).toMatchObject({
          provider: 'github',
          access_token: 'token123'
        });
        
        // Get user by oauth identifier
        const user = await adapter.getUserByIdentifier({
          type: 'oauth',
          value: 'github|12345'
        });
        
        expect(user.id).toBe(userId);
      });
      
      it('should handle password updates via identifiers', async () => {
        // Get the email identifier
        const identifier = await adapter.getIdentifier({
          type: 'email',
          value: 'adapter-test@example.com'
        });
        
        // Original password hash should be set
        expect(identifier.passwordHash).toBeDefined();
        const originalHash = identifier.passwordHash;
        
        // Update password
        await adapter.updateUser({
          id: userId,
          password: 'newpassword123'
        });
        
        // Get updated identifier
        const updatedIdentifier = await adapter.getIdentifier({
          type: 'email',
          value: 'adapter-test@example.com'
        });
        
        // Password hash should be different
        expect(updatedIdentifier.passwordHash).toBeDefined();
        expect(updatedIdentifier.passwordHash).not.toBe(originalHash);
      });
    });
  };
}