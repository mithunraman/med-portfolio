import type { UpdatePolicy, UpsertVersionPolicyDto, VersionPolicyResponse } from '@acme/shared';
import { Platform, UpdateStatus } from '@acme/shared';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as semver from 'semver';
import { z } from 'zod';
import { isErr } from '../common/utils/result.util';
import { VersionPolicy } from './schemas/version-policy.schema';
import { VersionPolicyRepository } from './version-policy.repository';

const platformSchema = z.nativeEnum(Platform);

function toResponse(doc: VersionPolicy): VersionPolicyResponse {
  return {
    xid: doc.xid,
    platform: doc.platform,
    minimumVersion: doc.minimumVersion,
    recommendedVersion: doc.recommendedVersion,
    latestVersion: doc.latestVersion,
    storeUrl: doc.storeUrl,
    message: doc.message ?? undefined,
  };
}

@Injectable()
export class VersionPolicyService {
  constructor(private readonly repository: VersionPolicyRepository) {}

  async evaluate(
    platform: string | undefined,
    clientVersion: string | undefined
  ): Promise<UpdatePolicy | null> {
    if (!platform || !clientVersion) return null;

    const platformResult = platformSchema.safeParse(platform);
    if (!platformResult.success) return null;

    const parsed = semver.valid(clientVersion);
    if (!parsed) return null;

    const result = await this.repository.findByPlatform(platformResult.data);
    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    if (!result.value) return null;

    const policy = result.value;

    if (semver.lt(parsed, policy.minimumVersion)) {
      return {
        status: UpdateStatus.MANDATORY,
        storeUrl: policy.storeUrl,
        latestVersion: policy.latestVersion,
        message: policy.message ?? undefined,
      };
    }

    if (semver.lt(parsed, policy.recommendedVersion)) {
      return {
        status: UpdateStatus.RECOMMENDED,
        storeUrl: policy.storeUrl,
        latestVersion: policy.latestVersion,
        message: policy.message ?? undefined,
      };
    }

    return null;
  }

  async getAll(): Promise<VersionPolicyResponse[]> {
    const result = await this.repository.findAll();
    if (isErr(result)) throw new InternalServerErrorException(result.error.message);

    return result.value.map(toResponse);
  }

  async upsert(dto: UpsertVersionPolicyDto): Promise<VersionPolicyResponse> {
    const result = await this.repository.upsert({
      platform: dto.platform,
      minimumVersion: dto.minimumVersion,
      recommendedVersion: dto.recommendedVersion,
      latestVersion: dto.latestVersion,
      storeUrl: dto.storeUrl,
      message: dto.message,
    });

    if (isErr(result)) throw new InternalServerErrorException(result.error.message);

    return toResponse(result.value);
  }
}
