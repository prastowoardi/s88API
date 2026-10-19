/**
 * Custom Error Classes
 * Standardized error handling across the application
 */

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

export class AuthenticationError extends Error {
  constructor(message = "Authentication failed") {
    super(message);
    this.name = "AuthenticationError";
    this.statusCode = 401;
  }
}

export class NotFoundError extends Error {
  constructor(resource = "Resource") {
    super(`${resource} not found`);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

export class ConflictError extends Error {
  constructor(message = "Resource already exists") {
    super(message);
    this.name = "ConflictError";
    this.statusCode = 409;
  }
}

export class ExternalAPIError extends Error {
  constructor(message, statusCode = 500, source = "Unknown") {
    super(`${source}: ${message}`);
    this.name = "ExternalAPIError";
    this.statusCode = statusCode;
    this.source = source;
  }
}

export class PaymentProcessingError extends Error {
  constructor(message, transactionId = null) {
    super(message);
    this.name = "PaymentProcessingError";
    this.statusCode = 402;
    this.transactionId = transactionId;
  }
}

export default {
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError,
  ExternalAPIError,
  PaymentProcessingError,
};
