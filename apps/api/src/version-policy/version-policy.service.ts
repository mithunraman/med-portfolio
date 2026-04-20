import type { UpdatePolicy, UpsertVersionPolicyDto, VersionPolicyResponse } from '@acme/shared';
import { Platform, UpdateStatus } from '@acme/shared';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as semver from 'semver';
import { VersionPolicyRepository } from './version-policy.repository';

@Injectable()
export class VersionPolicyService {
  constructor(private readonly repository: VersionPolicyRepository) {}

  async evaluate(platform: string | undefined, clientVersion: string | undefined): Promise<UpdatePolicy | null> {
    if (!platform || !clientVersion) return null;

    const validPlatform = Object.values(Platform).find((p) => p === platform);
    if (!validPlatform) return null;

    const parsed = semver.valid(clientVersion);
    if (!parsed) return null;

    const result = await this.repository.findByPlatform(validPlatform);
    if (!result.ok || !result.value) return null;

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
    if (!result.ok) return [];

    return result.value.map((doc) => ({
      id: doc._id.toString(),
      platform: doc.platform,
      minimumVersion: doc.minimumVersion,
      recommendedVersion: doc.recommendedVersion,
      latestVersion: doc.latestVersion,
      storeUrl: doc.storeUrl,
      message: doc.message ?? undefined,
    }));
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

    if (!result.ok) {
      throw new InternalServerErrorException('Failed to upsert version policy');
    }

    const doc = result.value;
    return {
      id: doc._id.toString(),
      platform: doc.platform,
      minimumVersion: doc.minimumVersion,
      recommendedVersion: doc.recommendedVersion,
      latestVersion: doc.latestVersion,
      storeUrl: doc.storeUrl,
      message: doc.message ?? undefined,
    };
  }
}
