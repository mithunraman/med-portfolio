import type {
  AcknowledgementResponse,
  CreateAcknowledgementRequest,
} from '@acme/shared';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { isErr } from '../common/utils/result.util';
import { AcknowledgementsRepository } from './acknowledgements.repository';
import { NOTICE_REGISTRY } from './registry';
import type { Acknowledgement } from './schemas/acknowledgement.schema';

@Injectable()
export class AcknowledgementsService {
  constructor(private readonly repository: AcknowledgementsRepository) {}

  async create(
    userId: string,
    dto: CreateAcknowledgementRequest,
    ip: string | null,
    userAgent: string | null
  ): Promise<AcknowledgementResponse> {
    const noticeEntry = NOTICE_REGISTRY.all.find((v) => v.version === dto.noticeVersion);
    if (!noticeEntry) {
      throw new BadRequestException(`Unknown noticeVersion: ${dto.noticeVersion}`);
    }

    const requiredIds = noticeEntry.acknowledgements.filter((a) => a.required).map((a) => a.id);
    const givenMap = new Map(dto.acknowledgements.map((a) => [a.id, a.given]));
    for (const requiredId of requiredIds) {
      const given = givenMap.get(requiredId);
      if (given !== true) {
        throw new BadRequestException(`Required acknowledgement missing or not given: ${requiredId}`);
      }
    }

    const existingResult = await this.repository.findByUserAndVersion(userId, dto.noticeVersion);
    if (isErr(existingResult)) {
      throw new InternalServerErrorException(existingResult.error.message);
    }
    if (existingResult.value) {
      // Idempotent by (userId, noticeVersion): we return the persisted row,
      // not the caller's body. Under the current schema every valid body is
      // equivalent up to array order (the only ack ids are required and must
      // be `given: true`), so the loser of a race sees no observable
      // difference. Revisit this contract if a future notice version
      // introduces optional ack ids — at that point a later POST whose
      // optional booleans differ would silently lose its input.
      return toResponse(existingResult.value);
    }

    const createResult = await this.repository.create({
      userId,
      noticeVersion: dto.noticeVersion,
      acknowledgements: dto.acknowledgements,
      ip,
      userAgent,
    });

    if (isErr(createResult)) {
      if (createResult.error.code === 'DUPLICATE_KEY') {
        // Concurrent insert won the race — re-read and return that row. Same
        // first-write-wins contract as the short-circuit above: the response
        // reflects persisted state, not the loser's request body.
        const reread = await this.repository.findByUserAndVersion(userId, dto.noticeVersion);
        if (isErr(reread) || !reread.value) {
          throw new InternalServerErrorException('Failed to resolve duplicate acknowledgement');
        }
        return toResponse(reread.value);
      }
      throw new InternalServerErrorException(createResult.error.message);
    }

    return toResponse(createResult.value);
  }
}

function toResponse(doc: Acknowledgement): AcknowledgementResponse {
  return {
    xid: doc.xid,
    noticeVersion: doc.noticeVersion,
    recordedAt: doc.recordedAt.toISOString(),
    acknowledgements: doc.acknowledgements.map((a) => ({ id: a.id, given: a.given })),
  };
}
