# Better Auth Identifier Table Primer

This document provides a high-level overview of the core structures we'll be modifying for the identifier table feature, focusing on the existing authentication model and the changes we'll need to make.

## Current User Identity Model

Currently, Better Auth implements a traditional auth system where:

1. **Users are identified primarily by email**
   - The `User` table has an `email` field that serves as the primary identifier
   - The `emailVerified` field indicates verification status
   - Email is a *required field* for all users

2. **Authentication methods are stored in the Account table**
   - The `Account` table stores provider connections (OAuth, credentials) 
   - For credential-based auth, passwords are stored in this table
   - Users can have multiple accounts linked to their profile, but always need an email

3. **All authentication flows require email**
   - Sign-up requires providing an email
   - Password reset uses email verification
   - Account recovery is primarily email-based

## Identifier Table Architecture Overview

Our new architecture will implement a flexible authentication system through an "Identifier Table" approach:

1. **What is the Identifier Table?**
   - A dedicated table for storing *any* type of user identifier (email, username, phone number, etc.)
   - Each user can have multiple identifiers of different types
   - Identifiers include metadata like verification status and can store credentials

2. **Core Schema Changes**
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
   ```

3. **Abstraction Layer**
   - We're implementing a code-level abstraction layer that maps between:
     - Legacy API interface (email-based) 
     - New database structure (identifier-based)
   - This maintains backward compatibility through virtual fields
   - Example: `user.email` becomes a virtual field that returns the first email identifier's value

## Key Components We're Modifying

### 1. Database Schema Layer

- **Current structure**: `/packages/better-auth/src/db/schema.ts`
  - Defines the core database schemas (user, account, session, verification)
  - Contains the Zod validation schemas

- **Our changes**:
  - Add new `identifierSchema` definition
  - Modify `userSchema` to make email optional
  - Implement virtual fields on User model

### 2. Database Adapter Interface

- **Current structure**: `/packages/better-auth/src/types/adapter.ts`
  - Defines the interface that all database adapters implement
  - Handles CRUD operations for all core models

- **Our changes**:
  - Add new methods for identifier management
  - Update existing methods to handle the new relationship
  - Ensure backward compatibility for legacy adapters

### 3. Authentication Flows

- **Current structure**: `/packages/better-auth/src/api/routes/*`
  - Implements core auth flows like sign-up, sign-in, verification
  - Currently all tied to email as primary identifier

- **Our changes**:
  - Add parallel flows that accept any identifier type
  - Make email optional in sign-up process
  - Update verification to work with any identifier type

### 4. Recovery Classification System

- **Current implementation**: None (new feature)

- **Our addition**:
  - Implement a recovery classification system with 4 levels:
    - **Full**: User has verified email/phone
    - **Partial**: User has OAuth accounts
    - **Pseudonymous**: User has only username/password
    - **Anonymous**: User has an anonymous account

### 5. Query Transformation

- **Current implementation**: None (new feature)

- **Our addition**:
  - Implement a query transformation layer that:
    - Converts email-based queries to identifier queries
    - Ensures backward compatibility for existing code
    - Example: `{where: {email: "test@example.com"}}` → `{where: {identifiers: {some: {type: "email", value: "test@example.com"}}}}`

## Performance Configuration Options

We're implementing three modes to allow developers to choose their performance/compatibility tradeoff:

1. **Virtual mode** (default)
   - Full abstraction layer with virtual fields
   - Maintains backward compatibility
   - Moderate performance impact

2. **Direct mode**
   - New structure only with minimal abstraction
   - Best performance
   - Requires updated client code

3. **Legacy mode**
   - Maintains old structure for maximum compatibility
   - Limited new features

## Implementation Approach

We'll be using an abstraction layer approach:

```
┌────────────────────┐      ┌─────────────────────┐      ┌─────────────────┐
│                    │      │                     │      │                 │
│   Legacy API       │─────▶│  Abstraction Layer  │─────▶│  New Database   │
│   Interface        │      │  (Virtual Fields)   │      │     Schema      │
│                    │◀─────│                     │◀─────│                 │
└────────────────────┘      └─────────────────────┘      └─────────────────┘
```

This provides:
- Backward compatibility for existing users
- A clean implementation without dual-schema complexity
- Flexibility for future identity types

## Key Areas of Focus for Testing

1. **Core functionality**
   - Database operations with the identifier table
   - Virtual field behavior and performance

2. **Authentication flows**
   - Sign-up/sign-in with different identifier types
   - Verification of different identifier types
   - Backwards compatibility with email-only flows

3. **Security aspects**
   - Prevention of identifier enumeration attacks
   - Rate limiting for different identifier types
   - Verification state management

4. **Migration testing**
   - Migrating existing users to the new structure
   - Data consistency during transitions
   - API compatibility across modes

## Getting Started

To begin working on this feature:

1. Familiarize yourself with:
   - The existing auth flow in `/packages/better-auth/src/api/routes/`
   - The database schema in `/packages/better-auth/src/db/schema.ts`
   - The adapter interface in `/packages/better-auth/src/types/adapter.ts`

2. Review the full proposal document in [`feat/identifier-table/proposal.md`](proposal.md)

3. Consult the testing strategy in `feat/identifier-table/testing-strategy.md`