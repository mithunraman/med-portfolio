import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(
    message: string,
    public readonly code: string,
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
  ) {
    super({ message, code, statusCode: status }, status);
  }
}

export class NotFoundException extends AppException {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}

export class BadRequestException extends AppException {
  constructor(message: string) {
    super(message, 'BAD_REQUEST', HttpStatus.BAD_REQUEST);
  }
}

export class ConflictException extends AppException {
  constructor(message: string) {
    super(message, 'CONFLICT', HttpStatus.CONFLICT);
  }
}
