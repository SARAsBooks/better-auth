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
  // Import createAuth dynamically to avoid circular dependencies
  const { createAuth } = await import('../auth');
  
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