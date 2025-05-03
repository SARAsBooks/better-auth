# Proposal: Flexible User Identity with Identifier Table Architecture

## Branch: `feat/identifier-table`

## Summary
This branch will implement a flexible identifier system using a dedicated Identifier table, allowing users to authenticate with email, username, phone number, or other identity types without requiring email as a mandatory field.

## Problem Statement
Currently, the Better Auth system requires email for all users. This limits flexibility for applications that want to support alternative login methods like phone numbers or usernames without requiring email.

## Proposed Solution
Implement the Identifier Table architecture using the Abstraction Layer approach to maintain backward compatibility while enabling new flexible authentication patterns.

## Implementation Strategy

1. **Abstraction Layer Approach**
   - Create a code-level abstraction that maps between existing API interface and new database structure
   - Maintain backward compatibility through virtual fields and query transformation
   - Avoid dual-schema synchronization in favor of a cleaner implementation
  
   ```
   ┌────────────────────┐      ┌─────────────────────┐      ┌─────────────────┐
   │                    │      │                     │      │                 │
   │   Legacy API       │─────▶│  Abstraction Layer  │─────▶│  New Database   │
   │   Interface        │      │  (Virtual Fields)   │      │     Schema      │
   │                    │◀─────│                     │◀─────│                 │
   └────────────────────┘      └─────────────────────┘      └─────────────────┘
   ```


1. **Schema Changes**
   - Add new Identifier table with fields for type, value, verification status, and authentication data
   - Keep existing fields on User table initially but make them virtual/computed
   - Implement appropriate indices for efficient lookup

2. **API Evolution**
   - Maintain backwards compatibility with existing API endpoints
   - Add new endpoints that embrace flexible identifier concepts
   - Document clear migration paths for developers

3. **Recovery Strategy**
   - Implement a recovery classification system (Full, Partial, Minimal, Pseudonymous)
   - Provide clear UX patterns for proactive recovery setup
   - Allow developers to configure minimum recovery requirements

4. **Performance Configuration**
   - Provide configuration options to control the data structure mode
   - Allow developers to optimize for performance or compatibility based on their needs

## Technical Implementation

### 1. Database Schema

```typescript
// New Identifier table
model Identifier {
  id              String    @id @default(uuid())
  userId          String
  type            String    // "email", "phone", "username", "passkey", "oauth"
  value           String
  verified        Boolean   @default(false)
  passwordHash    String?   // For credential-based identifiers
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  metadata        Json?     // For provider-specific details
  
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([type, value])  // Ensure identifiers are unique by type+value
  @@index([userId])         // For efficient lookup of all user identifiers
}

// Update Invitation model to reference identifiers
model Invitation {
  // Existing fields...
  identifierId    String?   // New field, replaces email
  identifierType  String?   // New field
  email           String?   // Keep for backward compatibility
  // Other fields...
}
```

### 2. Abstraction Layer

```typescript
// Virtual fields in User model
{
  // Real fields in database
  id: string,
  name: string,
  // ...
  
  // Virtual fields (computed from identifiers)
  get email() {
    return this._identifiers?.find(i => i.type === 'email')?.value;
  },
  
  get emailVerified() {
    return this._identifiers?.find(i => i.type === 'email')?.verified || false;
  },
  
  // Methods to modify virtual fields
  async setEmail(newEmail: string) {
    // Implementation that updates or creates email identifier
  }
}

// Query transformation for backward compatibility
function transformQuery(model: string, query: any) {
  if (model !== "user") return query;
  
  const newQuery = { ...query };
  
  // Transform email queries to identifier queries
  if (newQuery.where?.email) {
    const emailValue = newQuery.where.email;
    delete newQuery.where.email;
    
    newQuery.where.identifiers = {
      some: {
        type: "email",
        value: emailValue
      }
    };
  }
  
  return newQuery;
}
```

### 3. Recovery Classification

```typescript
enum RecoveryLevel {
  FULL = "full",         // Has verified email/phone
  PARTIAL = "partial",   // Has social logins
  PSEUDONYMOUS = "pseudonymous", // Password/Passkey/credential only
  ANONYMOUS = "anonymous" // Anonymous account
}

// Virtual property on user model
get recoveryStatus(): RecoveryLevel {
  const identifiers = this._identifiers || [];
  
  // Check for verified email or phone
  const hasVerifiedContactPoint = identifiers.some(
    id => (id.type === "email" || id.type === "phone") && id.verified
  );
  if (hasVerifiedContactPoint) return RecoveryLevel.FULL;
  
  // Additional classification logic...
}
```

### 4. Performance Configuration

```typescript
// In auth config
{
  identifierTable: {
    mode: "virtual" | "direct" | "legacy",
    // virtual = abstraction layer (default)
    // direct = new structure only (best performance)
    // legacy = old structure only (backward compatibility)
    
    migrateExistingData: boolean, // whether to migrate data on mode change
    warnOnLegacyUsage: boolean // emit warnings when using deprecated patterns
  }
}
```

This configuration gives developers full control over performance tradeoffs:
- Applications that prioritize backward compatibility can use "virtual" mode
- Applications that prioritize performance can use "direct" mode
- Legacy applications can stay on "legacy" mode temporarily

## Test Strategy

1. Extend existing tests to verify both traditional and new patterns
2. Add new tests specifically for flexible identifier scenarios
3. Create migration tests to verify data integrity during transitions

Key test files to update:
- `/packages/better-auth/src/api/routes/sign-up.test.ts`
- `/packages/better-auth/src/api/routes/sign-in.test.ts`
- `/packages/better-auth/src/api/routes/email-verification.test.ts`
- `/packages/better-auth/src/plugins/magic-link/magic-link.test.ts`
- `/packages/better-auth/src/test-utils/test-instance.ts`

## Benefits

1. **Greater Authentication Flexibility**
   - Support for email-less registration
   - Multiple authentication methods per user
   - Better support for international users who prefer phone-based authentication

2. **Improved User Experience**
   - Allow users to choose their preferred authentication method
   - Support progressive identity building
   - Provide clear recovery options based on available identifiers

3. **Future-Proof Architecture**
   - Easily add new identifier types
   - Better support for passwordless authentication
   - Simplified plugin architecture for authentication methods

4. **Performance and Compatibility Control**
   - Configuration options to balance performance and compatibility
   - Documented benchmarks for making informed decisions
   - Smooth migration path for existing applications

## Risks and Mitigations

1. **Risk**: Breaking changes for existing applications 
   
   **Mitigation**: Abstraction layer maintains backward compatibility

2. **Risk**: Performance impact from abstraction layer 
   
   **Mitigation**: 
   - Optimize queries and use appropriate indices
   - Provide configuration options to control data structure mode
   - Allow direct mode for best performance when compatibility isn't needed

3. **Risk**: Account recovery challenges 
   
   **Mitigation**: Implement recovery classification and clear UX recommendations

## Next Steps

1. Create feature branch
2. Create test suite
3. Implement Identifier table schema
4. Build abstraction layer
5. Update core authentication flows
6. Document migration path