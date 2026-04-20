import { UpsertVersionPolicySchema } from '@acme/shared';
import { createZodDto } from 'nestjs-zod';

export class UpsertVersionPolicyDto extends createZodDto(UpsertVersionPolicySchema) {}
