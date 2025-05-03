# Identifier Table Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for the Identifier Table feature, which allows users to authenticate with various identifiers (email, username, phone, etc.) without requiring email as a mandatory field.

## Testing Principles

1. **Maintain backward compatibility** - Existing tests must continue to pass
2. **Create new tests** - Add parallel test files for new identifier-based flows
3. **Cover all identifier types** - Test email, username, phone number, and other identifier types
4. **Verify abstraction layer** - Ensure virtual fields work correctly
5. **Test recovery scenarios** - Verify recovery classification system works as expected
6. **Test security measures** - Validate protection against enumeration attacks
7. **Test error handling** - Ensure proper handling of conflicts and edge cases
8. **Test migration paths** - Verify smooth transitions from email-only to multi-identifier

## Test Structure

Based on our existing test patterns and the comprehensive testing map, we'll organize our tests into the following categories:

### Core Tests
- `db/identifier-table.test.ts` - Test core identifier table functionality
- `internal-adapter.test.ts` - Updates to test identifier table with internal adapter

### Adapter Tests
- `adapters/test/identifier-table-tests.ts` - Shared test suite for all adapters
- `adapters/*-adapter/test/adapter.identifier-table.test.ts` - Adapter-specific identifier tests

### API Tests
- `api/routes/sign-in-identifier.test.ts` - Test identifier-based sign-in
- `api/routes/sign-up-identifier.test.ts` - Test identifier-based sign-up
- `api/routes/identifier-verification.test.ts` - Test identifier verification
- `api/routes/identifier-management.test.ts` - Test identifier CRUD operations

### Integration Tests
- `integration/auth-flows-identifier.test.ts` - End-to-end authentication flows with identifiers
- `integration/recovery-classification.test.ts` - Test recovery classification system

### Security Tests
- `security/identifier-validation.test.ts` - Test identifier validation and sanitization
- `security/enumeration-prevention.test.ts` - Test against enumeration attacks
- `security/rate-limiting.test.ts` - Test identifier-based rate limiting

### Error Handling Tests
- `error/duplicate-identifier.test.ts` - Test handling of duplicate identifiers
- `error/conflict-resolution.test.ts` - Test resolution of identifier conflicts

### Plugin Tests
- Updates to existing plugin tests to ensure compatibility with identifier table
- New tests for plugin-specific identifier interactions

### Migration Tests
- `migration/email-to-identifier.test.ts` - Test migration from email-only to multi-identifier
- `migration/backward-compatibility.test.ts` - Test backward compatibility with existing code

## Test Utilities

We'll create enhanced test utilities for identifier-based testing:

```typescript
// test-utils/identifier-helpers.ts

import { auth } from './test-instance';

// Base helper for creating users with different types of identifiers
export async function createUserWithIdentifier({
  identifier = `user-${Math.random().toString(36).substring(2)}@example.com`,
  identifierType = 'email',
  password = 'password123',
  mode = 'virtual', // Support testing different performance modes
  ...options
} = {}) {
  // Configure auth instance with specified performance mode if needed
  const authInstance = mode !== 'virtual' 
    ? await configureAuthInstance({ mode }) 
    : auth;
    
  const result = await authInstance.api.signUpWithIdentifier({
    identifier,
    identifierType,
    password,
    ...options
  });

  return {
    user: result.user,
    identifier,
    identifierType,
    password,
    // Helper methods
    signIn: () => authInstance.api.signInWithIdentifier({
      identifier,
      identifierType,
      password
    }),
    verify: async () => {
      const { verificationId } = await authInstance.api.sendIdentifierVerification({
        userId: result.user.id,
        identifier,
        identifierType
      });
      
      // Get token (test environment shortcut)
      const verification = await authInstance.adapter.getVerificationToken({ id: verificationId });
      
      return authInstance.api.verifyIdentifier({
        token: verification.token
      });
    }
  };
}

// Helper for creating users with multiple identifiers
export async function createMultiIdentifierUser({
  primaryIdentifier = `user-${Math.random().toString(36).substring(2)}@example.com`,
  primaryType = 'email',
  secondaryIdentifier = `user-${Math.random().toString(36).substring(2)}`,
  secondaryType = 'username',
  password = 'password123',
  mode = 'virtual'
} = {}) {
  // Create user with primary identifier
  const { user, ...rest } = await createUserWithIdentifier({
    identifier: primaryIdentifier,
    identifierType: primaryType,
    password,
    mode
  });

  // Configure auth instance with specified performance mode if needed
  const authInstance = mode !== 'virtual' 
    ? await configureAuthInstance({ mode }) 
    : auth;

  // Add secondary identifier
  await authInstance.api.addIdentifier({
    userId: user.id,
    identifier: secondaryIdentifier,
    identifierType: secondaryType
  });

  // Get updated user with all identifiers
  const updatedUser = await authInstance.api.getUser({ id: user.id });

  return {
    user: updatedUser,
    primaryIdentifier,
    primaryType,
    secondaryIdentifier,
    secondaryType,
    password,
    // Helper methods for signing in with either identifier
    signInPrimary: () => authInstance.api.signInWithIdentifier({
      identifier: primaryIdentifier,
      identifierType: primaryType,
      password
    }),
    signInSecondary: () => authInstance.api.signInWithIdentifier({
      identifier: secondaryIdentifier,
      identifierType: secondaryType,
      password
    })
  };
}

// Helper for testing different performance modes
export async function configureAuthInstance({ 
  mode = 'virtual',
  warnOnLegacyUsage = false,
  migrateExistingData = false 
} = {}) {
  return createAuth({
    identifierTable: {
      mode,
      warnOnLegacyUsage,
      migrateExistingData
    }
  });
}

// Helper for testing recovery states
export async function createUserWithRecoveryLevel(level) {
  switch (level) {
    case 'FULL':
      // Create user with verified email
      const { user, verify } = await createUserWithIdentifier({
        identifierType: 'email'
      });
      await verify();
      return { user: await auth.api.getUser({ id: user.id }) };
      
    case 'PARTIAL':
      // Create user with OAuth identifier
      const { user: oauthUser } = await createUserWithIdentifier();
      await auth.adapter.createIdentifier({
        userId: oauthUser.id,
        type: 'oauth',
        value: 'github|12345',
        verified: true,
        metadata: { provider: 'github' }
      });
      return { user: await auth.api.getUser({ id: oauthUser.id }) };
      
    case 'PSEUDONYMOUS':
      // Create user with only username
      return createUserWithIdentifier({
        identifier: `user-${Math.random().toString(36).substring(2)}`,
        identifierType: 'username'
      });
      
    case 'ANONYMOUS':
      // Create anonymous user
      const anonymousResult = await auth.api.createAnonymousUser();
      return { user: anonymousResult.user };
      
    default:
      throw new Error(`Unknown recovery level: ${level}`);
  }
}
```

## Example Test Files

### 1. Core Identifier Table Tests

```typescript
// db/identifier-table.test.ts
import { auth } from '../test-utils/test-instance';

describe('Identifier Table Core', () => {
  it('should generate correct schema with identifier table', async () => {
    const schema = auth.db.getSchema();
    
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
    const transformedQuery = auth.db.transformQuery('user', { 
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
    const user = await auth.db.createUser({
      email,
      emailVerified: false,
      password: 'password123'
    });
    
    // Get user with identifiers
    const fetchedUser = await auth.db.getUser({ id: user.id });
    
    // Virtual fields should work
    expect(fetchedUser.email).toBe(email);
    expect(fetchedUser.emailVerified).toBe(false);
    
    // Check identifier record was created
    const identifiers = await auth.db.getUserIdentifiers(user.id);
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0]).toMatchObject({
      type: 'email',
      value: email,
      verified: false
    });
  });
});
```

### 2. Adapter Tests

```typescript
// adapters/test/identifier-table-tests.ts
import { Adapter } from '../../types/adapter';

// Shared test suite for all adapters
export function identifierTableTests(adapter: Adapter) {
  return () => {
    describe('Identifier Table', () => {
      let userId;
      
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
    });
  };
}
```

### 3. Security Tests

```typescript
// security/enumeration-prevention.test.ts
import { auth } from '../../test-utils/test-instance';
import { createUserWithIdentifier } from '../../test-utils/identifier-helpers';

describe('Enumeration Prevention', () => {
  beforeEach(async () => {
    // Create a user
    await createUserWithIdentifier({
      identifier: 'exists@example.com',
      identifierType: 'email'
    });
  });
  
  it('should return same error for valid and invalid identifiers on sign-in failure', async () => {
    // Try wrong password for existing user
    const existingError = await auth.api.signInWithIdentifier({
      identifier: 'exists@example.com',
      identifierType: 'email',
      password: 'wrongpassword'
    }).catch(e => e.message);
    
    // Try non-existent user
    const nonExistentError = await auth.api.signInWithIdentifier({
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
    await auth.api.signInWithIdentifier({
      identifier: 'exists@example.com',
      identifierType: 'email',
      password: 'wrongpassword'
    }).catch(() => {});
    const existingTime = Date.now() - existingStart;
    
    // Measure time for non-existent user
    const nonExistentStart = Date.now();
    await auth.api.signInWithIdentifier({
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
    const existingResult = await auth.api.requestPasswordReset({
      identifier: 'exists@example.com',
      identifierType: 'email'
    });
    
    // Request reset for non-existent user
    const nonExistentResult = await auth.api.requestPasswordReset({
      identifier: 'nonexistent@example.com',
      identifierType: 'email'
    });
    
    // Both should return success to prevent enumeration
    expect(existingResult.success).toBe(true);
    expect(nonExistentResult.success).toBe(true);
  });
  
  it('should implement rate limiting for identifier verification attempts', async () => {
    // Mock rate limiter
    const mockRateLimiter = jest.spyOn(auth.rateLimiter, 'check').mockImplementation(() => {
      return { success: true, limit: 10, remaining: 9, reset: Date.now() + 60000 };
    });
    
    // Send verification
    await auth.api.sendIdentifierVerification({
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
    jest.spyOn(auth.rateLimiter, 'check').mockImplementation(() => {
      return { success: false, limit: 10, remaining: 0, reset: Date.now() + 60000 };
    });
    
    // Try sending verification too many times
    await expect(auth.api.sendIdentifierVerification({
      identifier: 'exists@example.com',
      identifierType: 'email'
    })).rejects.toThrow(/rate limit exceeded/i);
  });
});
```

### 4. Performance Mode Tests

```typescript
// performance-mode.test.ts
import { auth as defaultAuth } from '../test-utils/test-instance';
import { configureAuthInstance } from '../test-utils/identifier-helpers';

describe('Performance Mode Configuration', () => {
  it('should use virtual mode by default', async () => {
    const email = 'virtual@example.com';
    const password = 'password123';
    
    const result = await defaultAuth.api.signUpEmail({
      email,
      password
    });
    
    // Check virtual fields work
    expect(result.user.email).toBe(email);
    
    // Check identifiers were created
    const identifiers = await defaultAuth.adapter.getUserIdentifiers({
      userId: result.user.id
    });
    
    expect(identifiers).toHaveLength(1);
    
    // Test query performance for different access patterns
    const getByEmail = await defaultAuth.adapter.getUserByEmail(email);
    const getByIdentifier = await defaultAuth.adapter.getIdentifier({ 
      type: 'email', 
      value: email 
    });
    
    expect(getByEmail.id).toBe(result.user.id);
    expect(getByIdentifier.userId).toBe(result.user.id);
  });
  
  it('should use direct mode for optimal performance', async () => {
    // Create auth instance with direct mode
    const directAuth = await configureAuthInstance({ mode: 'direct' });
    
    const identifier = 'direct@example.com';
    const password = 'password123';
    
    const result = await directAuth.api.signUpWithIdentifier({
      identifier,
      identifierType: 'email',
      password
    });
    
    // In direct mode, direct identifier access should be faster
    // This is hard to test precisely in a unit test, but we can check functionality
    
    // Test that identifiers work directly
    const identifiers = await directAuth.adapter.getUserIdentifiers({
      userId: result.user.id
    });
    
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0].value).toBe(identifier);
    
    // Virtual fields might not be populated in direct mode
    // But identifier-specific methods should work
    const userByIdentifier = await directAuth.api.getUserByIdentifier({
      identifier,
      identifierType: 'email'
    });
    
    expect(userByIdentifier.id).toBe(result.user.id);
  });
  
  it('should migrate existing data when changing modes', async () => {
    // Create user in legacy mode
    const legacyAuth = await configureAuthInstance({ mode: 'legacy' });
    const email = 'migrate@example.com';
    const password = 'password123';
    
    const user = await legacyAuth.api.signUpEmail({
      email,
      password
    });
    
    // Create auth with migration flag
    const migrateAuth = await configureAuthInstance({ 
      mode: 'virtual', 
      migrateExistingData: true 
    });
    
    // Get the user - should trigger migration
    const migratedUser = await migrateAuth.api.getUser({ id: user.user.id });
    
    // Check that identifiers were created during migration
    const identifiers = await migrateAuth.adapter.getUserIdentifiers({
      userId: user.user.id
    });
    
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0]).toMatchObject({
      type: 'email',
      value: email,
      verified: false
    });
    
    // Virtual fields should still work
    expect(migratedUser.email).toBe(email);
  });
  
  it('should warn on legacy usage when configured', async () => {
    // Mock console.warn
    const originalWarn = console.warn;
    const mockWarn = jest.fn();
    console.warn = mockWarn;
    
    try {
      // Create auth with warnings
      const warnAuth = await configureAuthInstance({ 
        mode: 'virtual',
        warnOnLegacyUsage: true 
      });
      
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
```

### 5. Migration Tests

```typescript
// migration/email-to-identifier.test.ts
import { auth } from '../../test-utils/test-instance';
import { configureAuthInstance } from '../../test-utils/identifier-helpers';

describe('Email to Identifier Migration', () => {
  it('should migrate existing users from email-only to identifier model', async () => {
    // Create legacy auth instance
    const legacyAuth = await configureAuthInstance({ mode: 'legacy' });
    
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
    
    // Configure migration instance
    const migrationAuth = await configureAuthInstance({ 
      mode: 'virtual',
      migrateExistingData: true
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
    // Create auth instance
    const auth = await configureAuthInstance({ mode: 'legacy' });
    
    // Create user with account
    const email = 'withaccount@example.com';
    const user = await auth.api.signUpEmail({
      email,
      password: 'password123'
    });
    
    // Add account
    await auth.adapter.linkAccount({
      userId: user.user.id,
      provider: 'github',
      providerAccountId: '12345',
      type: 'oauth',
      access_token: 'token'
    });
    
    // Configure migration instance
    const migrationAuth = await configureAuthInstance({ 
      mode: 'virtual',
      migrateExistingData: true
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
});
```

## Test File Structure

Based on the comprehensive test plan, here's the file structure we'll implement:

```
packages/better-auth/src/
├── db/
│   └── identifier-table.test.ts
├── api/
│   ├── routes/
│   │   ├── sign-in-identifier.test.ts
│   │   ├── sign-up-identifier.test.ts
│   │   ├── identifier-verification.test.ts
│   │   └── identifier-management.test.ts
├── adapters/
│   ├── test/
│   │   └── identifier-table-tests.ts
│   ├── memory-adapter/
│   │   └── test/
│   │       └── adapter.identifier-table.test.ts
│   ├── drizzle-adapter/
│   │   └── test/
│   │       └── adapter.identifier-table.test.ts
│   ├── kysely-adapter/
│   │   └── test/
│   │       └── adapter.identifier-table.test.ts
│   ├── mongodb-adapter/
│   │   └── test/
│   │       └── adapter.identifier-table.test.ts
│   └── prisma-adapter/
│       └── test/
│           └── adapter.identifier-table.test.ts
├── integration/
│   ├── auth-flows-identifier.test.ts
│   └── recovery-classification.test.ts
├── security/
│   ├── identifier-validation.test.ts
│   ├── enumeration-prevention.test.ts
│   └── rate-limiting.test.ts
├── error/
│   ├── duplicate-identifier.test.ts
│   └── conflict-resolution.test.ts
├── plugins/
│   ├── magic-link/
│   │   └── magic-link-identifier.test.ts
│   ├── two-factor/
│   │   └── two-factor-identifier.test.ts
│   └── email-verification/
│       └── email-verification-identifier.test.ts
├── migration/
│   ├── email-to-identifier.test.ts
│   └── backward-compatibility.test.ts
└── performance/
    └── performance-mode.test.ts
```

## Implementation Status

### Completed Testing Components

We have successfully implemented the following test files:

1. **Test Utilities:**
   - [x] `/packages/better-auth/src/test-utils/identifier-helpers.ts` - Created helper functions for testing with identifiers

2. **Core Tests:**
   - [x] `/packages/better-auth/src/db/identifier-table.test.ts` - Testing core identifier table functionality

3. **Adapter Tests:**
   - [x] `/packages/better-auth/src/adapters/test/identifier-table-tests.ts` - Shared test suite for all adapters

4. **API Tests:**
   - [x] `/packages/better-auth/src/api/routes/sign-in-identifier.test.ts` - Testing identifier-based sign-in
   - [x] `/packages/better-auth/src/api/routes/sign-up-identifier.test.ts` - Testing identifier-based sign-up

5. **Security Tests:**
   - [x] `/packages/better-auth/src/security/enumeration-prevention.test.ts` - Testing against enumeration attacks

6. **Integration Tests:**
   - [x] `/packages/better-auth/src/integration/recovery-classification.test.ts` - Testing recovery classification system

7. **Migration Tests:**
   - [x] `/packages/better-auth/src/migration/email-to-identifier.test.ts` - Testing migration from email-only to multi-identifier
   - [x] `/packages/better-auth/src/migration/backward-compatibility.test.ts` - Testing backward compatibility with existing code

### Remaining Tasks

1. **Additional API Tests:**
   - [ ] `/packages/better-auth/src/api/routes/identifier-verification.test.ts` 
   - [ ] `/packages/better-auth/src/api/routes/identifier-management.test.ts`

2. **Additional Security Tests:**
   - [ ] `/packages/better-auth/src/security/identifier-validation.test.ts`
   - [ ] `/packages/better-auth/src/security/rate-limiting.test.ts`

3. **Error Handling Tests:**
   - [ ] `/packages/better-auth/src/error/duplicate-identifier.test.ts`
   - [ ] `/packages/better-auth/src/error/conflict-resolution.test.ts` 

4. **Plugin Tests:**
   - [ ] Update existing plugin tests to work with identifier table
   - [ ] Create new tests for plugin-specific identifier interactions

5. **Adapter-specific Tests:**
   - [ ] Implement adapter-specific identifier table tests for each adapter

6. **Performance Tests:**
   - [ ] `/packages/better-auth/src/performance/performance-mode.test.ts`

## Implementation Plan

1. **Phase 1: Core Implementation and Testing [x]**
   - Implement identifier table schema and core functionality
   - Create core tests for DB and internal adapter
   - Implement base adapter tests

2. **Phase 2: API Integration Tests [x]**
   - Implement sign-up and sign-in with identifier
   - Add verification endpoints
   - Create identifier management API
   - Test API endpoints

3. **Phase 3: Abstraction Layer and Compatibility [x]**
   - Implement virtual fields and query transformation
   - Test backwards compatibility
   - Add performance mode configuration
   - Test different performance modes

4. **Phase 4: Security and Error Handling ⏳**
   - Add security validation for identifiers
   - Implement anti-enumeration measures [x]
   - Add rate limiting
   - Test error handling and edge cases

5. **Phase 5: Plugin Integration [ ]**
   - Update plugins to work with identifiers
   - Test plugin functionality with different identifier types
   - Implement recovery classification [x]

6. **Phase 6: Migration and Documentation [x]**
   - Create migration tooling
   - Test migration paths
   - Document usage patterns and best practices

## Edge Cases to Cover

- Case sensitivity in identifiers (usernames, emails)
- International phone formats
- Identifier collisions across types
- Verification state persistence
- Auth token validation across identifier changes
- Account merging scenarios
- Password reset for accounts with multiple identifiers
- Access control based on verification status
- Rate limiting and anti-enumeration for security
- Handling Unicode and special characters in identifiers
- Performance under high load with different modes
- Database transaction handling for multiple identifier operations

## Conclusion

This comprehensive testing strategy ensures we maintain backward compatibility while thoroughly testing the new identifier table architecture across all areas of the Better Auth codebase. By creating parallel test files rather than modifying existing ones, we avoid regression risks while validating the new functionality works as expected in all scenarios.