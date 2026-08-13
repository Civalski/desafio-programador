export class ApplicationError extends Error {
  constructor(message, statusCode = 500) { super(message); this.statusCode = statusCode; }
}

export class ValidationError extends ApplicationError {
  constructor(message) { super(message, 400); }
}

export class NotFoundError extends ApplicationError {
  constructor(message = 'Transcrição não encontrada') { super(message, 404); }
}
