/**
 * Input Validation Utilities
 * Security layer for user input sanitization and validation
 */

// Email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Minimum password length (security best practice: 8+)
const MIN_PASSWORD_LENGTH = 8;

// Maximum input lengths to prevent overflow attacks
const MAX_EMAIL_LENGTH = 254; // RFC 5321
const MAX_PASSWORD_LENGTH = 128;

// Dangerous characters that could indicate injection attempts
const DANGEROUS_CHARS_REGEX = /[<>'"`;\\]/;

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Normalizes email address (trim + lowercase)
 * Use this before sending email to Supabase Auth to prevent duplicate accounts
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validates email format and security
 */
export function validateEmail(email: string): ValidationResult {
  // Check if empty
  if (!email || email.trim().length === 0) {
    return {
      isValid: false,
      error: 'Email is required'
    };
  }

  const normalizedEmail = normalizeEmail(email);

  // Check length
  if (normalizedEmail.length > MAX_EMAIL_LENGTH) {
    return {
      isValid: false,
      error: 'Email is too long'
    };
  }

  // Check format
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return {
      isValid: false,
      error: 'Invalid email format'
    };
  }

  // Check for dangerous characters (additional security layer)
  if (DANGEROUS_CHARS_REGEX.test(normalizedEmail)) {
    return {
      isValid: false,
      error: 'Email contains invalid characters'
    };
  }

  return { isValid: true };
}

/**
 * Validates password strength and security
 */
export function validatePassword(password: string, fieldName: string = 'Password'): ValidationResult {
  // Check if empty
  if (!password || password.length === 0) {
    return {
      isValid: false,
      error: `${fieldName} is required`
    };
  }

  // Check minimum length
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: `${fieldName} must be at least ${MIN_PASSWORD_LENGTH} characters`
    };
  }

  // Check maximum length (prevent overflow)
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: `${fieldName} is too long`
    };
  }

  return { isValid: true };
}

/**
 * Sanitizes string input by removing potentially dangerous characters
 * Use this for text fields where special chars aren't needed
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(DANGEROUS_CHARS_REGEX, '') // Remove dangerous chars
    .slice(0, 1000); // Limit length
}

/**
 * Validates general text input
 */
export function validateTextInput(
  input: string,
  fieldName: string,
  options: { minLength?: number; maxLength?: number; required?: boolean } = {}
): ValidationResult {
  const { minLength = 0, maxLength = 1000, required = true } = options;

  if (required && (!input || input.trim().length === 0)) {
    return {
      isValid: false,
      error: `${fieldName} is required`
    };
  }

  const trimmed = input.trim();

  if (trimmed.length < minLength) {
    return {
      isValid: false,
      error: `${fieldName} must be at least ${minLength} characters`
    };
  }

  if (trimmed.length > maxLength) {
    return {
      isValid: false,
      error: `${fieldName} is too long (max ${maxLength} characters)`
    };
  }

  return { isValid: true };
}

/**
 * Check if input contains SQL injection patterns (additional safety layer)
 * Note: Supabase SDK already protects against SQL injection,
 * but this adds an extra validation layer for defense in depth
 */
export function containsSQLInjectionPattern(input: string): boolean {
  const sqlPatterns = [
    /(\bOR\b|\bAND\b)\s*['"]?\d+['"]?\s*=\s*['"]?\d+/i, // OR 1=1, AND 1=1
    /UNION\s+SELECT/i,
    /DROP\s+TABLE/i,
    /INSERT\s+INTO/i,
    /DELETE\s+FROM/i,
    /UPDATE\s+\w+\s+SET/i,
    /--\s*$/m, // SQL comments
    /\/\*.*\*\//s, // Multi-line comments
    /;\s*DROP/i,
    /'\s*OR\s*'/i,
    /admin'\s*--/i
  ];

  return sqlPatterns.some(pattern => pattern.test(input));
}

/**
 * Comprehensive validation for login credentials
 */
export function validateLoginCredentials(
  email: string,
  password: string
): { isValid: boolean; emailError?: string; passwordError?: string } {
  const emailValidation = validateEmail(email);
  const passwordValidation = validatePassword(password);

  // Additional SQL injection check
  if (containsSQLInjectionPattern(email) || containsSQLInjectionPattern(password)) {
    return {
      isValid: false,
      emailError: 'Invalid characters detected',
      passwordError: 'Invalid characters detected'
    };
  }

  return {
    isValid: emailValidation.isValid && passwordValidation.isValid,
    emailError: emailValidation.error,
    passwordError: passwordValidation.error
  };
}
